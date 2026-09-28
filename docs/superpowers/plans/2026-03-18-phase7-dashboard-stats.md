# Phase 7: 대시보드 + 통계 구현 계획서

> **Updated:** 2026-04-07 — 실제 구현 상태 및 신규 요구사항 반영
>
> **주요 변경 이력:**
> - 대시보드: 구현 완료 (실제 DB 연동)
> - 프로세스 흐름도: 구현 완료
> - 통계 7개 메뉴: 모두 "화면 추후 프로토타입 생성 예정" (미구현)
> - 각 통계에 엑셀다운로드 필요할 수 있음
> - goal_mst 테이블로 통합되어 목표 데이터 조회 가능
> - 추가 메뉴 가능성: 거래명세서, 견적서 기능 (메뉴 위치 미정)
> - N개 메뉴를 1개로 합칠 수 있음

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 대시보드(매출 추이 차트), 프로세스 흐름도, 7개 통계 화면 구현

**Architecture:** stats 도메인. QueryDSL 기반 집계 쿼리. Recharts로 차트 렌더링. goal_mst (복합PK) 기반 목표 데이터.

**Tech Stack:** Spring Boot 3.x, QueryDSL | React 18, Recharts, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-sm-module-design.md` Section 5.8, 5.9, 6.3, 6.8, 12.14

**구현 상태:** 대시보드/프로세스 흐름도 완료. 통계 7개 메뉴 미구현 (프로토타입 미정).

> **Oracle 연동 확정 (2026-04-07):**
> - 대시보드 데이터: OracleStatsRepository로 Oracle 직접 조회
>   - 월별매출합계: SD_BILL_MST.SPLY_AMT SUM (BILL_ST IN('C','D'))
>   - 신규주문수: SD_ORDER_MST_X20329 COUNT (월별)
>   - 활성고객수: SD_ORDER_MST_X20329 DISTINCT PARTNER_CD
>   - 최근주문: SD_ORDER_MST_X20329 + 금액 서브쿼리 (최신 N건)
>   - 월별추이: SD_BILL_MST SUBSTR(BILL_DT) GROUP BY 월별 집계
> - 통계 쿼리 (구현됨, 화면 미구현):
>   - 품목별실적: SD_ORDER_DTL.ITEM_FG 기준 SUM/COUNT
>   - 팀예상매출: SD_ORDER_MST.WRK_FG 기준 부서별 집계
>   - 부서별실적: SD_BILL_MST.SALESORGN_CD 기준 월별 SUM
> - goal_mst 테이블: 목표 데이터 MySQL 관리 (Oracle 연동 없음)
>
> **코드 분석 결과 (2026-04-07) — 전체 완성:**
> - 대시보드: FE/BE 완성 (Recharts 라인차트, 실제 DB 연동) → **완료**
> - 프로세스 흐름도: FE 완성 → **완료**
> - 통계 7개: **전부 FE/BE 완성** (TeamForecast/TeamGoalActual/PartGoalActualYoy/AmGoalActualYoy/ItemPerf/VendorMargin/OrderMargin)
>   - BarChart, PieChart, Table 모두 구현. @PreAuthorize("hasAnyRole('ADMIN','MANAGER')") 적용.
>   - OracleStatsRepository로 Oracle 직접 조회 + MySQL Fallback.
> - ※ 기존 "프로토타입 미정"으로 분류했으나 **실제 코드 분석 결과 전부 구현 완료됨**

---

## Task 1: 대시보드 Backend - StatsService: getSalesTrend — **구현됨**

- [ ] **1.1** `sm-module-api/src/main/java/com/tara/sm/stats/dto/SalesTrendDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesTrendDto {
    private List<MonthlyAmount> monthlySales;
    private List<MonthlyAmount> trendLine;  // 추세선 데이터

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MonthlyAmount {
        private String month;   // "2025-04", "2025-05", ...
        private Long amount;    // 매출 합계 (원)
    }
}
```

- [ ] **1.2** `sm-module-api/src/main/java/com/tara/sm/stats/service/StatsService.java` 생성 (대시보드 부분)

```java
package com.tara.sm.stats.service;

import com.tara.sm.stats.dto.*;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// import static com.tara.sm.sales.entity.QSales.sales;
// import static com.tara.sm.order.entity.QOrder.order;
// import static com.tara.sm.purchase.entity.QOutsourcingPo.outsourcingPo;
// import static com.tara.sm.auth.entity.QDepartment.department;
// import static com.tara.sm.info.entity.QPartGoal.partGoal;
// import static com.tara.sm.info.entity.QAmGoal.amGoal;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class StatsService {

    private final JPAQueryFactory queryFactory;

    /**
     * 최근 12개월 매출 추이 (대시보드)
     * - 월별 매출 합계 + 선형 추세선
     */
    public SalesTrendDto getSalesTrend() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusMonths(11).withDayOfMonth(1);

        // QueryDSL 집계 - 월별 매출 합계
        /*
        List<Tuple> results = queryFactory
            .select(
                Expressions.stringTemplate(
                    "DATE_FORMAT({0}, '%Y-%m')", sales.salesDate
                ),
                sales.amount.sum()
            )
            .from(sales)
            .where(
                sales.salesDate.goe(startDate),
                sales.salesDate.loe(endDate),
                sales.confirmed.isTrue()
            )
            .groupBy(Expressions.stringTemplate(
                "DATE_FORMAT({0}, '%Y-%m')", sales.salesDate
            ))
            .orderBy(Expressions.stringTemplate(
                "DATE_FORMAT({0}, '%Y-%m')", sales.salesDate
            ).asc())
            .fetch();
        */

        // 12개월 초기화 (데이터 없는 월은 0으로)
        Map<String, Long> monthlyMap = new LinkedHashMap<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM");
        for (int i = 0; i < 12; i++) {
            String key = YearMonth.from(startDate.plusMonths(i)).format(fmt);
            monthlyMap.put(key, 0L);
        }

        // DB 결과 반영
        /*
        for (Tuple tuple : results) {
            String month = tuple.get(0, String.class);
            Long amount = tuple.get(1, Long.class);
            if (monthlyMap.containsKey(month)) {
                monthlyMap.put(month, amount != null ? amount : 0L);
            }
        }
        */

        List<SalesTrendDto.MonthlyAmount> monthlySales = new ArrayList<>();
        for (Map.Entry<String, Long> entry : monthlyMap.entrySet()) {
            monthlySales.add(SalesTrendDto.MonthlyAmount.builder()
                .month(entry.getKey())
                .amount(entry.getValue())
                .build());
        }

        // 선형 추세선 계산 (최소제곱법)
        List<SalesTrendDto.MonthlyAmount> trendLine = calculateTrendLine(monthlySales);

        return SalesTrendDto.builder()
            .monthlySales(monthlySales)
            .trendLine(trendLine)
            .build();
    }

    /**
     * 선형 추세선 계산 (최소제곱법 / Linear Regression)
     * y = a + bx
     * b = (n * sum(xy) - sum(x) * sum(y)) / (n * sum(x^2) - (sum(x))^2)
     * a = (sum(y) - b * sum(x)) / n
     */
    private List<SalesTrendDto.MonthlyAmount> calculateTrendLine(
            List<SalesTrendDto.MonthlyAmount> data) {
        int n = data.size();
        if (n == 0) return List.of();

        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++) {
            double x = i;
            double y = data.get(i).getAmount();
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        double denominator = n * sumX2 - sumX * sumX;
        double b = denominator != 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        double a = (sumY - b * sumX) / n;

        List<SalesTrendDto.MonthlyAmount> trend = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            long trendValue = Math.round(a + b * i);
            trend.add(SalesTrendDto.MonthlyAmount.builder()
                .month(data.get(i).getMonth())
                .amount(Math.max(0, trendValue))
                .build());
        }

        return trend;
    }
}
```

- [ ] **1.3** `sm-module-api/src/main/java/com/tara/sm/stats/controller/StatsController.java` 생성 (대시보드 엔드포인트)

```java
package com.tara.sm.stats.controller;

import com.tara.sm.common.dto.ApiResponse;
import com.tara.sm.stats.dto.*;
import com.tara.sm.stats.service.StatsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "통계/대시보드", description = "통계 및 대시보드 API")
public class StatsController {

    private final StatsService statsService;

    @GetMapping("/dashboard/sales-trend")
    @Operation(summary = "매출 추이", description = "최근 12개월 매출 추이 + 추세선 데이터를 반환합니다.")
    public ResponseEntity<ApiResponse<SalesTrendDto>> getSalesTrend() {
        return ResponseEntity.ok(ApiResponse.success(statsService.getSalesTrend()));
    }

    @GetMapping("/stats/team-forecast")
    @Operation(summary = "본부 및 팀 예상매출")
    public ResponseEntity<ApiResponse<TeamForecastDto>> getTeamForecast(
            @RequestParam int year, @RequestParam int month) {
        return ResponseEntity.ok(ApiResponse.success(statsService.getTeamForecast(year, month)));
    }

    @GetMapping("/stats/team-goal-actual")
    @Operation(summary = "본부 및 팀 매출목표 및 실적")
    public ResponseEntity<ApiResponse<TeamGoalActualDto>> getTeamGoalActual(
            @RequestParam int year) {
        return ResponseEntity.ok(ApiResponse.success(statsService.getTeamGoalActual(year)));
    }

    @GetMapping("/stats/part-goal-actual-yoy")
    @Operation(summary = "파트별 전년대비 매출목표 및 실적")
    public ResponseEntity<ApiResponse<PartGoalYoyDto>> getPartGoalActualYoy(
            @RequestParam int year) {
        return ResponseEntity.ok(ApiResponse.success(statsService.getPartGoalActualYoy(year)));
    }

    @GetMapping("/stats/am-goal-actual-yoy")
    @Operation(summary = "AM 전년대비 매출목표 및 실적")
    public ResponseEntity<ApiResponse<AmGoalYoyDto>> getAmGoalActualYoy(
            @RequestParam int year) {
        return ResponseEntity.ok(ApiResponse.success(statsService.getAmGoalActualYoy(year)));
    }

    @GetMapping("/stats/item-performance")
    @Operation(summary = "품목별 실적조회")
    public ResponseEntity<ApiResponse<ItemPerformanceDto>> getItemPerformance(
            @RequestParam String startDate, @RequestParam String endDate) {
        return ResponseEntity.ok(ApiResponse.success(
            statsService.getItemPerformance(startDate, endDate)));
    }

    @GetMapping("/stats/vendor-margin")
    @Operation(summary = "거래처별 외주 마진율")
    public ResponseEntity<ApiResponse<VendorMarginDto>> getVendorMargin(
            @RequestParam String startDate, @RequestParam String endDate) {
        return ResponseEntity.ok(ApiResponse.success(
            statsService.getVendorMargin(startDate, endDate)));
    }

    @GetMapping("/stats/order-margin")
    @Operation(summary = "주문건별 외주 마진율")
    public ResponseEntity<ApiResponse<OrderMarginDto>> getOrderMargin(
            @RequestParam String startDate, @RequestParam String endDate) {
        return ResponseEntity.ok(ApiResponse.success(
            statsService.getOrderMargin(startDate, endDate)));
    }
}
```

---

## Task 2: 통계 Backend - 7개 집계 쿼리 (StatsService 확장) — 미구현 (프로토타입 예정)

### 2.1 DTO 정의

- [ ] **2.1.1** `sm-module-api/src/main/java/com/tara/sm/stats/dto/TeamForecastDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeamForecastDto {
    private int year;
    private int month;
    private List<DivisionForecast> divisions;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DivisionForecast {
        private String divisionName;       // 사업본부명 (그래픽스/PM/국내/해외)
        private Long forecastAmount;       // 예상매출
        private List<TeamDetail> teams;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TeamDetail {
        private String teamName;           // 팀/파트명
        private Long pendingAmount;        // 접수중 금액
        private Long inProgressAmount;     // 진행중 금액
        private Long forecastAmount;       // 예상 합계
    }
}
```

- [ ] **2.1.2** `sm-module-api/src/main/java/com/tara/sm/stats/dto/TeamGoalActualDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeamGoalActualDto {
    private int year;
    private List<DivisionGoalActual> divisions;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DivisionGoalActual {
        private String divisionName;
        private List<MonthlyGoalActual> monthly;
        private Long yearlyGoal;
        private Long yearlyActual;
        private Double yearlyRate;          // 달성률 %
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MonthlyGoalActual {
        private int month;
        private Long goal;
        private Long actual;
        private Double rate;                // 달성률 %
    }
}
```

- [ ] **2.1.3** `sm-module-api/src/main/java/com/tara/sm/stats/dto/PartGoalYoyDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PartGoalYoyDto {
    private int year;
    private List<PartYoyRow> parts;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PartYoyRow {
        private String partName;
        private Long prevYearActual;       // 전년 실적
        private Long currentGoal;          // 금년 목표
        private Long currentActual;        // 금년 실적
        private Double goalRate;           // 목표 달성률 %
        private Double yoyRate;            // 전년대비 증감률 %
    }
}
```

- [ ] **2.1.4** `sm-module-api/src/main/java/com/tara/sm/stats/dto/AmGoalYoyDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AmGoalYoyDto {
    private int year;
    private List<AmYoyRow> managers;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AmYoyRow {
        private String managerName;
        private String partName;
        private Long prevYearActual;
        private Long currentGoal;
        private Long currentActual;
        private Double goalRate;
        private Double yoyRate;
    }
}
```

- [ ] **2.1.5** `sm-module-api/src/main/java/com/tara/sm/stats/dto/ItemPerformanceDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ItemPerformanceDto {
    private List<CategoryPerformance> categories;
    private Long grandTotal;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CategoryPerformance {
        private String category;           // PAPER, PRINT, FINISHING, BINDING
        private String categoryLabel;      // 용지, 인쇄, 후가공, 제본
        private Long totalAmount;
        private Integer orderCount;
        private Double shareRate;          // 비중 %
    }
}
```

- [ ] **2.1.6** `sm-module-api/src/main/java/com/tara/sm/stats/dto/VendorMarginDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VendorMarginDto {
    private List<VendorMarginRow> vendors;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class VendorMarginRow {
        private String vendorName;
        private Long orderAmount;          // 수주금액 합계
        private Long outsourcingAmount;    // 외주금액 합계
        private Long marginAmount;         // 마진 = 수주 - 외주
        private Double marginRate;         // 마진율 % = margin / order * 100
        private Integer orderCount;        // 건수
    }
}
```

- [ ] **2.1.7** `sm-module-api/src/main/java/com/tara/sm/stats/dto/OrderMarginDto.java` 생성

```java
package com.tara.sm.stats.dto;

import lombok.*;

import java.util.List;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderMarginDto {
    private List<OrderMarginRow> orders;

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class OrderMarginRow {
        private String orderNo;
        private String orderTitle;
        private String vendorName;
        private Long orderAmount;          // 수주금액
        private Long outsourcingAmount;    // 외주금액
        private Long marginAmount;         // 마진
        private Double marginRate;         // 마진율 %
        private String salesDate;
    }
}
```

### 2.2 Service 구현 (7개 통계 메서드)

- [ ] **2.2.1** `StatsService.java`에 7개 통계 메서드 추가

```java
// StatsService.java 에 아래 메서드들을 추가

    // ── 1. 본부 및 팀 예상매출 ──

    /**
     * 접수중(PENDING), 진행중(OUTSOURCE_PO) 주문 기반 예상 매출 집계
     * 사업본부별 > 팀/파트별 금액 합산
     */
    public TeamForecastDto getTeamForecast(int year, int month) {
        LocalDate startOfMonth = LocalDate.of(year, month, 1);
        LocalDate endOfMonth = startOfMonth.withDayOfMonth(startOfMonth.lengthOfMonth());

        /*
        // QueryDSL: 부서별 + 상태별 주문금액 집계
        List<Tuple> results = queryFactory
            .select(
                department.division,
                department.name,
                order.status,
                order.totalAmount.sum()
            )
            .from(order)
            .join(department).on(order.departmentId.eq(department.id))
            .where(
                order.receivedDate.between(startOfMonth, endOfMonth),
                order.status.in(OrderStatus.PENDING, OrderStatus.OUTSOURCE_PO),
                order.deleted.isFalse()
            )
            .groupBy(department.division, department.name, order.status)
            .fetch();

        // 결과를 사업본부 > 팀 구조로 변환
        Map<String, Map<String, TeamForecastDto.TeamDetail>> grouped = new LinkedHashMap<>();
        for (Tuple t : results) {
            String division = t.get(department.division);
            String team = t.get(department.name);
            String status = t.get(order.status).name();
            Long amount = t.get(order.totalAmount.sum());

            grouped.computeIfAbsent(division, k -> new LinkedHashMap<>())
                .computeIfAbsent(team, k -> TeamForecastDto.TeamDetail.builder()
                    .teamName(k).pendingAmount(0L).inProgressAmount(0L).forecastAmount(0L).build());

            TeamForecastDto.TeamDetail detail = grouped.get(division).get(team);
            if ("PENDING".equals(status)) {
                detail.setPendingAmount(amount);
            } else {
                detail.setInProgressAmount(amount);
            }
            detail.setForecastAmount(detail.getPendingAmount() + detail.getInProgressAmount());
        }
        */

        return TeamForecastDto.builder()
            .year(year)
            .month(month)
            .divisions(new ArrayList<>()) // TODO: grouped 데이터로 빌드
            .build();
    }

    // ── 2. 본부 및 팀 매출목표 및 실적 ──

    /**
     * 연간 월별 목표 vs 실적 비교
     * part_goals 목표 + sales 실적 JOIN
     */
    public TeamGoalActualDto getTeamGoalActual(int year) {
        /*
        // 목표 조회: part_goals (해당 연도)
        List<Tuple> goals = queryFactory
            .select(department.division, partGoal.month, partGoal.targetAmount.sum())
            .from(partGoal)
            .join(department).on(partGoal.departmentId.eq(department.id))
            .where(partGoal.year.eq(year))
            .groupBy(department.division, partGoal.month)
            .fetch();

        // 실적 조회: sales (해당 연도, 확정건)
        List<Tuple> actuals = queryFactory
            .select(
                department.division,
                Expressions.numberTemplate(Integer.class, "MONTH({0})", sales.salesDate),
                sales.amount.sum()
            )
            .from(sales)
            .join(department).on(sales.departmentId.eq(department.id))
            .where(
                Expressions.numberTemplate(Integer.class, "YEAR({0})", sales.salesDate).eq(year),
                sales.confirmed.isTrue()
            )
            .groupBy(
                department.division,
                Expressions.numberTemplate(Integer.class, "MONTH({0})", sales.salesDate)
            )
            .fetch();
        */

        return TeamGoalActualDto.builder()
            .year(year)
            .divisions(new ArrayList<>())
            .build();
    }

    // ── 3. 파트별 전년대비 ──

    public PartGoalYoyDto getPartGoalActualYoy(int year) {
        /*
        // 금년 목표
        List<Tuple> currentGoals = queryFactory
            .select(department.name, partGoal.targetAmount.sum())
            .from(partGoal)
            .join(department).on(partGoal.departmentId.eq(department.id))
            .where(partGoal.year.eq(year))
            .groupBy(department.name)
            .fetch();

        // 금년 실적
        List<Tuple> currentActuals = queryFactory
            .select(department.name, sales.amount.sum())
            .from(sales)
            .join(department).on(sales.departmentId.eq(department.id))
            .where(
                Expressions.numberTemplate(Integer.class, "YEAR({0})", sales.salesDate).eq(year),
                sales.confirmed.isTrue()
            )
            .groupBy(department.name)
            .fetch();

        // 전년 실적
        List<Tuple> prevActuals = queryFactory
            .select(department.name, sales.amount.sum())
            .from(sales)
            .join(department).on(sales.departmentId.eq(department.id))
            .where(
                Expressions.numberTemplate(Integer.class, "YEAR({0})", sales.salesDate).eq(year - 1),
                sales.confirmed.isTrue()
            )
            .groupBy(department.name)
            .fetch();

        // 3개 결과 병합하여 PartYoyRow 리스트 구성
        // goalRate = currentActual / currentGoal * 100
        // yoyRate = (currentActual - prevActual) / prevActual * 100
        */

        return PartGoalYoyDto.builder()
            .year(year)
            .parts(new ArrayList<>())
            .build();
    }

    // ── 4. AM 전년대비 ──

    public AmGoalYoyDto getAmGoalActualYoy(int year) {
        /*
        // am_goals 목표 + sales (영업담당자별) 실적 집계
        // 전년 vs 금년 비교
        List<Tuple> currentGoals = queryFactory
            .select(user.name, department.name, amGoal.targetAmount.sum())
            .from(amGoal)
            .join(user).on(amGoal.userId.eq(user.id))
            .join(department).on(user.departmentId.eq(department.id))
            .where(amGoal.year.eq(year))
            .groupBy(user.name, department.name)
            .fetch();

        // 금년 매출 실적 (영업담당자별)
        List<Tuple> currentActuals = queryFactory
            .select(user.name, sales.amount.sum())
            .from(sales)
            .join(order).on(sales.orderId.eq(order.id))
            .join(user).on(order.salesManagerId.eq(user.id))
            .where(
                Expressions.numberTemplate(Integer.class, "YEAR({0})", sales.salesDate).eq(year),
                sales.confirmed.isTrue()
            )
            .groupBy(user.name)
            .fetch();

        // 전년 매출 실적
        List<Tuple> prevActuals = queryFactory
            .select(user.name, sales.amount.sum())
            .from(sales)
            .join(order).on(sales.orderId.eq(order.id))
            .join(user).on(order.salesManagerId.eq(user.id))
            .where(
                Expressions.numberTemplate(Integer.class, "YEAR({0})", sales.salesDate).eq(year - 1),
                sales.confirmed.isTrue()
            )
            .groupBy(user.name)
            .fetch();
        */

        return AmGoalYoyDto.builder()
            .year(year)
            .managers(new ArrayList<>())
            .build();
    }

    // ── 5. 품목별 실적 ──

    public ItemPerformanceDto getItemPerformance(String startDateStr, String endDateStr) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);

        /*
        // order_items 카테고리별 소계 집계
        List<Tuple> results = queryFactory
            .select(orderItem.category, orderItem.subtotal.sum(), order.id.countDistinct())
            .from(orderItem)
            .join(orderWork).on(orderItem.orderWorkId.eq(orderWork.id))
            .join(order).on(orderWork.orderId.eq(order.id))
            .where(
                order.receivedDate.between(startDate, endDate),
                order.deleted.isFalse()
            )
            .groupBy(orderItem.category)
            .fetch();

        long grandTotal = results.stream()
            .mapToLong(t -> t.get(orderItem.subtotal.sum()))
            .sum();

        List<ItemPerformanceDto.CategoryPerformance> categories = results.stream()
            .map(t -> {
                Long amount = t.get(orderItem.subtotal.sum());
                return ItemPerformanceDto.CategoryPerformance.builder()
                    .category(t.get(orderItem.category).name())
                    .categoryLabel(getCategoryLabel(t.get(orderItem.category)))
                    .totalAmount(amount)
                    .orderCount(t.get(order.id.countDistinct()).intValue())
                    .shareRate(grandTotal > 0 ? amount * 100.0 / grandTotal : 0)
                    .build();
            })
            .toList();
        */

        return ItemPerformanceDto.builder()
            .categories(new ArrayList<>())
            .grandTotal(0L)
            .build();
    }

    // ── 6. 거래처별 외주 마진율 ──

    public VendorMarginDto getVendorMargin(String startDateStr, String endDateStr) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);

        /*
        // outsourcing_pos 기반 거래처별 수주/외주 집계
        // 마진율 = (수주금액 - 외주금액) / 수주금액 * 100
        List<Tuple> results = queryFactory
            .select(
                businessOwner.companyName,
                outsourcingPo.orderAmount.sum(),
                outsourcingPo.outsourcingAmount.sum(),
                outsourcingPo.id.count()
            )
            .from(outsourcingPo)
            .join(businessOwner).on(outsourcingPo.businessOwnerId.eq(businessOwner.id))
            .where(
                outsourcingPo.deliveryDate.between(startDate, endDate)
            )
            .groupBy(businessOwner.companyName)
            .orderBy(outsourcingPo.orderAmount.sum().desc())
            .fetch();

        List<VendorMarginDto.VendorMarginRow> vendors = results.stream()
            .map(t -> {
                Long orderAmt = t.get(outsourcingPo.orderAmount.sum());
                Long outsrcAmt = t.get(outsourcingPo.outsourcingAmount.sum());
                Long margin = orderAmt - outsrcAmt;
                return VendorMarginDto.VendorMarginRow.builder()
                    .vendorName(t.get(businessOwner.companyName))
                    .orderAmount(orderAmt)
                    .outsourcingAmount(outsrcAmt)
                    .marginAmount(margin)
                    .marginRate(orderAmt > 0 ? margin * 100.0 / orderAmt : 0)
                    .orderCount(t.get(outsourcingPo.id.count()).intValue())
                    .build();
            })
            .toList();
        */

        return VendorMarginDto.builder()
            .vendors(new ArrayList<>())
            .build();
    }

    // ── 7. 주문건별 외주 마진율 ──

    public OrderMarginDto getOrderMargin(String startDateStr, String endDateStr) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);

        /*
        // 주문건별 수주/외주 금액 조회
        List<Tuple> results = queryFactory
            .select(
                order.orderNo,
                order.title,
                businessOwner.companyName,
                outsourcingPo.orderAmount,
                outsourcingPo.outsourcingAmount,
                order.receivedDate
            )
            .from(outsourcingPo)
            .join(order).on(outsourcingPo.orderId.eq(order.id))
            .join(businessOwner).on(outsourcingPo.businessOwnerId.eq(businessOwner.id))
            .where(
                outsourcingPo.deliveryDate.between(startDate, endDate)
            )
            .orderBy(order.receivedDate.desc())
            .fetch();

        List<OrderMarginDto.OrderMarginRow> orders = results.stream()
            .map(t -> {
                Long orderAmt = t.get(outsourcingPo.orderAmount);
                Long outsrcAmt = t.get(outsourcingPo.outsourcingAmount);
                Long margin = orderAmt - outsrcAmt;
                return OrderMarginDto.OrderMarginRow.builder()
                    .orderNo(t.get(order.orderNo))
                    .orderTitle(t.get(order.title))
                    .vendorName(t.get(businessOwner.companyName))
                    .orderAmount(orderAmt)
                    .outsourcingAmount(outsrcAmt)
                    .marginAmount(margin)
                    .marginRate(orderAmt > 0 ? margin * 100.0 / orderAmt : 0)
                    .salesDate(t.get(order.receivedDate).toString())
                    .build();
            })
            .toList();
        */

        return OrderMarginDto.builder()
            .orders(new ArrayList<>())
            .build();
    }
```

---

## Task 3: 대시보드 Frontend (DashboardPage.tsx) — **구현됨**

- [ ] **3.1** `sm-module-web/src/api/stats.api.ts` 생성

```typescript
import { apiClient } from './client';
import type { ApiResponse } from '../types/common';
import type {
  SalesTrendDto,
  TeamForecastDto,
  TeamGoalActualDto,
  PartGoalYoyDto,
  AmGoalYoyDto,
  ItemPerformanceDto,
  VendorMarginDto,
  OrderMarginDto,
} from '../types/stats';

/** 대시보드 - 최근 12개월 매출 추이 */
export const getSalesTrend = () =>
  apiClient.get<ApiResponse<SalesTrendDto>>('/api/dashboard/sales-trend');

/** 본부 및 팀 예상매출 */
export const getTeamForecast = (year: number, month: number) =>
  apiClient.get<ApiResponse<TeamForecastDto>>('/api/stats/team-forecast', {
    params: { year, month },
  });

/** 본부 및 팀 매출목표 및 실적 */
export const getTeamGoalActual = (year: number) =>
  apiClient.get<ApiResponse<TeamGoalActualDto>>('/api/stats/team-goal-actual', {
    params: { year },
  });

/** 파트별 전년대비 */
export const getPartGoalActualYoy = (year: number) =>
  apiClient.get<ApiResponse<PartGoalYoyDto>>('/api/stats/part-goal-actual-yoy', {
    params: { year },
  });

/** AM 전년대비 */
export const getAmGoalActualYoy = (year: number) =>
  apiClient.get<ApiResponse<AmGoalYoyDto>>('/api/stats/am-goal-actual-yoy', {
    params: { year },
  });

/** 품목별 실적 */
export const getItemPerformance = (startDate: string, endDate: string) =>
  apiClient.get<ApiResponse<ItemPerformanceDto>>('/api/stats/item-performance', {
    params: { startDate, endDate },
  });

/** 거래처별 외주 마진율 */
export const getVendorMargin = (startDate: string, endDate: string) =>
  apiClient.get<ApiResponse<VendorMarginDto>>('/api/stats/vendor-margin', {
    params: { startDate, endDate },
  });

/** 주문건별 외주 마진율 */
export const getOrderMargin = (startDate: string, endDate: string) =>
  apiClient.get<ApiResponse<OrderMarginDto>>('/api/stats/order-margin', {
    params: { startDate, endDate },
  });
```

- [ ] **3.2** `sm-module-web/src/types/stats.ts` 생성

```typescript
// ── Dashboard ──

export interface SalesTrendDto {
  monthlySales: MonthlyAmount[];
  trendLine: MonthlyAmount[];
}

export interface MonthlyAmount {
  month: string;   // "2025-04"
  amount: number;
}

// ── 1. 본부/팀 예상매출 ──

export interface TeamForecastDto {
  year: number;
  month: number;
  divisions: DivisionForecast[];
}

export interface DivisionForecast {
  divisionName: string;
  forecastAmount: number;
  teams: TeamDetail[];
}

export interface TeamDetail {
  teamName: string;
  pendingAmount: number;
  inProgressAmount: number;
  forecastAmount: number;
}

// ── 2. 본부/팀 목표 및 실적 ──

export interface TeamGoalActualDto {
  year: number;
  divisions: DivisionGoalActual[];
}

export interface DivisionGoalActual {
  divisionName: string;
  monthly: MonthlyGoalActual[];
  yearlyGoal: number;
  yearlyActual: number;
  yearlyRate: number;
}

export interface MonthlyGoalActual {
  month: number;
  goal: number;
  actual: number;
  rate: number;
}

// ── 3. 파트별 전년대비 ──

export interface PartGoalYoyDto {
  year: number;
  parts: PartYoyRow[];
}

export interface PartYoyRow {
  partName: string;
  prevYearActual: number;
  currentGoal: number;
  currentActual: number;
  goalRate: number;
  yoyRate: number;
}

// ── 4. AM 전년대비 ──

export interface AmGoalYoyDto {
  year: number;
  managers: AmYoyRow[];
}

export interface AmYoyRow {
  managerName: string;
  partName: string;
  prevYearActual: number;
  currentGoal: number;
  currentActual: number;
  goalRate: number;
  yoyRate: number;
}

// ── 5. 품목별 실적 ──

export interface ItemPerformanceDto {
  categories: CategoryPerformance[];
  grandTotal: number;
}

export interface CategoryPerformance {
  category: string;
  categoryLabel: string;
  totalAmount: number;
  orderCount: number;
  shareRate: number;
}

// ── 6. 거래처별 마진 ──

export interface VendorMarginDto {
  vendors: VendorMarginRow[];
}

export interface VendorMarginRow {
  vendorName: string;
  orderAmount: number;
  outsourcingAmount: number;
  marginAmount: number;
  marginRate: number;
  orderCount: number;
}

// ── 7. 주문건별 마진 ──

export interface OrderMarginDto {
  orders: OrderMarginRow[];
}

export interface OrderMarginRow {
  orderNo: string;
  orderTitle: string;
  vendorName: string;
  orderAmount: number;
  outsourcingAmount: number;
  marginAmount: number;
  marginRate: number;
  salesDate: string;
}
```

- [ ] **3.3** `sm-module-web/src/pages/home/DashboardPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, Button, Spin, message, Typography } from 'antd';
import { BarChartOutlined, ApartmentOutlined } from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { getSalesTrend } from '../../api/stats.api';
import type { SalesTrendDto, MonthlyAmount } from '../../types/stats';

const { Title } = Typography;

interface ChartDataPoint {
  month: string;
  sales: number;
  trend: number;
}

const formatAmount = (value: number): string => {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return value.toLocaleString();
};

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<SalesTrendDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTrend = async () => {
      setLoading(true);
      try {
        const { data: res } = await getSalesTrend();
        if (res.success) {
          setData(res.data);
        }
      } catch (error) {
        message.error('매출 추이 데이터를 불러오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchTrend();
  }, []);

  // 차트 데이터 변환
  const chartData: ChartDataPoint[] =
    data?.monthlySales.map((item: MonthlyAmount, index: number) => ({
      month: item.month.substring(5),  // "2025-04" -> "04"
      sales: item.amount,
      trend: data.trendLine[index]?.amount ?? 0,
    })) ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <BarChartOutlined style={{ marginRight: 8 }} />
          대시보드
        </Title>
        <Button
          type="primary"
          icon={<ApartmentOutlined />}
          onClick={() => navigate('/process')}
          size="large"
        >
          프로세스 보기
        </Button>
      </div>

      <Card title="매출 추이 (최근 12개월)" bordered>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tickFormatter={(val: string) => `${val}월`}
                tick={{ fontSize: 13 }}
              />
              <YAxis
                tickFormatter={formatAmount}
                tick={{ fontSize: 12 }}
                width={80}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()}원`,
                  name === 'sales' ? '매출' : '추세선',
                ]}
                labelFormatter={(label: string) => `${label}월`}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'sales' ? '매출' : '추세선'
                }
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#1677ff"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name="sales"
              />
              <Line
                type="monotone"
                dataKey="trend"
                stroke="#ff7a45"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                name="trend"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;
```

---

## Task 4: 프로세스 흐름도 Frontend (ProcessFlowPage.tsx) — **구현됨**

- [ ] **4.1** `sm-module-web/src/pages/process/ProcessFlowPage.tsx` 생성

```tsx
import React from 'react';
import { Card, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

/** 프로세스 단계 정의 */
interface ProcessStep {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  link?: string;
  color: string;
}

interface ProcessLine {
  name: string;
  color: string;
  y: number;
  steps: ProcessStep[];
}

const PROCESS_LINES: ProcessLine[] = [
  {
    name: '외주/패키지/P&D',
    color: '#1677ff',
    y: 60,
    steps: [
      { id: 'outsource-order',      label: '주문등록',       x: 40,  y: 40,  width: 100, height: 40, link: '/orders/create', color: '#e6f4ff' },
      { id: 'outsource-po',         label: '외주발주등록',   x: 180, y: 40,  width: 110, height: 40, link: '/purchase/outsourcing-po', color: '#e6f4ff' },
      { id: 'outsource-confirm',    label: '발주확정',       x: 330, y: 40,  width: 90,  height: 40, link: '/purchase/outsourcing-po', color: '#e6f4ff' },
      { id: 'outsource-settlement', label: '외주정산등록',   x: 460, y: 40,  width: 110, height: 40, link: '/purchase/outsourcing-settlement', color: '#e6f4ff' },
      { id: 'outsource-create',     label: '외주정산생성',   x: 610, y: 40,  width: 110, height: 40, link: '/purchase/outsourcing-settlement', color: '#e6f4ff' },
      { id: 'outsource-approval',   label: '매입정산\n(전자결재)', x: 760, y: 40, width: 110, height: 40, color: '#f0f5ff' },
      { id: 'outsource-sales',      label: '매출등록',       x: 910, y: 40,  width: 90,  height: 40, link: '/sales', color: '#e6f4ff' },
      { id: 'outsource-tax',        label: '세금계산서발행', x: 1040, y: 40, width: 120, height: 40, link: '/sales/tax/issue', color: '#fff7e6' },
    ],
  },
  {
    name: '구매',
    color: '#52c41a',
    y: 180,
    steps: [
      { id: 'purchase-order',    label: '주문등록',         x: 40,  y: 160, width: 100, height: 40, link: '/orders/create', color: '#f6ffed' },
      { id: 'purchase-po',       label: '발주서 작성\n확정처리', x: 180, y: 160, width: 120, height: 40, link: '/purchase/outsourcing-po', color: '#f6ffed' },
      { id: 'purchase-settle',   label: '구매정산등록',     x: 340, y: 160, width: 110, height: 40, link: '/purchase/outsourcing-settlement', color: '#f6ffed' },
      { id: 'purchase-approval', label: '매입정산\n(전자결재)', x: 490, y: 160, width: 110, height: 40, color: '#fcffe6' },
      { id: 'purchase-sales',    label: '매출등록',         x: 640, y: 160, width: 90,  height: 40, link: '/sales', color: '#f6ffed' },
      { id: 'purchase-tax',      label: '세금계산서발행',   x: 770, y: 160, width: 120, height: 40, link: '/sales/tax/issue', color: '#fff7e6' },
    ],
  },
  {
    name: '내부생산 (POD/센터)',
    color: '#fa8c16',
    y: 300,
    steps: [
      { id: 'pod-list',    label: '주문목록',       x: 40,  y: 280, width: 100, height: 40, link: '/orders', color: '#fff7e6' },
      { id: 'pod-shipped', label: '발송완료',       x: 180, y: 280, width: 90,  height: 40, color: '#fff2e8' },
      { id: 'pod-sales',   label: '매출등록',       x: 310, y: 280, width: 90,  height: 40, link: '/sales', color: '#fff7e6' },
      { id: 'pod-tax',     label: '세금계산서발행', x: 440, y: 280, width: 120, height: 40, link: '/sales/tax/issue', color: '#fff7e6' },
    ],
  },
];

const ProcessFlowPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStepClick = (link?: string) => {
    if (link) navigate(link);
  };

  const renderArrow = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    const midY = y1 + 20;
    return (
      <g key={`arrow-${x1}-${x2}`}>
        <line
          x1={x1} y1={midY}
          x2={x2 - 10} y2={midY}
          stroke={color}
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
        />
      </g>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>업무 프로세스 흐름도</Title>

      <Card bordered style={{ overflow: 'auto' }}>
        <svg
          viewBox="0 0 1200 360"
          width="100%"
          height="auto"
          style={{ minWidth: 900, maxHeight: 500 }}
        >
          {/* 화살표 마커 정의 */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
          </defs>

          {/* 프로세스 라인별 렌더링 */}
          {PROCESS_LINES.map((line) => (
            <g key={line.name}>
              {/* 라인 라벨 */}
              <text
                x={10}
                y={line.steps[0].y - 5}
                fill={line.color}
                fontWeight="bold"
                fontSize={13}
              >
                {line.name}
              </text>

              {/* 화살표 (단계 사이) */}
              {line.steps.slice(0, -1).map((step, idx) => {
                const next = line.steps[idx + 1];
                return renderArrow(
                  step.x + step.width,
                  step.y,
                  next.x,
                  next.y,
                  line.color
                );
              })}

              {/* 단계 박스 */}
              {line.steps.map((step) => (
                <g
                  key={step.id}
                  onClick={() => handleStepClick(step.link)}
                  style={{ cursor: step.link ? 'pointer' : 'default' }}
                >
                  <rect
                    x={step.x}
                    y={step.y}
                    width={step.width}
                    height={step.height}
                    rx={6}
                    ry={6}
                    fill={step.color}
                    stroke={line.color}
                    strokeWidth={1.5}
                  />
                  {step.label.split('\n').map((textLine, i) => (
                    <text
                      key={i}
                      x={step.x + step.width / 2}
                      y={step.y + step.height / 2 + (i - (step.label.split('\n').length - 1) / 2) * 14}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight={500}
                      fill="#333"
                    >
                      {textLine}
                    </text>
                  ))}
                  {step.link && (
                    <text
                      x={step.x + step.width - 4}
                      y={step.y + 10}
                      textAnchor="end"
                      fontSize={9}
                      fill={line.color}
                    >
                      &#x2197;
                    </text>
                  )}
                </g>
              ))}
            </g>
          ))}
        </svg>
      </Card>

      {/* 범례 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {PROCESS_LINES.map((line) => (
          <div key={line.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 16, height: 16, borderRadius: 3,
              backgroundColor: line.color, opacity: 0.7,
            }} />
            <span style={{ fontSize: 13 }}>{line.name}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#999' }}>
            * 단계를 클릭하면 해당 화면으로 이동합니다
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProcessFlowPage;
```

---

## Task 5: 통계 페이지 Frontend (7개) — 미구현 (프로토타입 예정)

### 5.1 본부 및 팀 예상매출

- [ ] **5.1.1** `sm-module-web/src/pages/stats/TeamForecastPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Table, message, Typography, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import { getTeamForecast } from '../../api/stats.api';
import type { TeamForecastDto, DivisionForecast, TeamDetail } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const { Title } = Typography;

const TeamForecastPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [data, setData] = useState<TeamForecastDto | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res } = await getTeamForecast(year, month);
      if (res.success) setData(res.data);
    } catch { message.error('데이터 조회 실패'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [year, month]);

  // 차트 데이터: 사업본부별 예상매출
  const chartData = data?.divisions.map((d: DivisionForecast) => ({
    name: d.divisionName,
    forecast: d.forecastAmount,
  })) ?? [];

  // 테이블: 팀 상세
  const tableData = data?.divisions.flatMap((d: DivisionForecast) =>
    d.teams.map((t: TeamDetail) => ({
      key: `${d.divisionName}-${t.teamName}`,
      division: d.divisionName,
      team: t.teamName,
      pending: t.pendingAmount,
      inProgress: t.inProgressAmount,
      forecast: t.forecastAmount,
    }))
  ) ?? [];

  const columns: ColumnsType<typeof tableData[number]> = [
    { title: '사업본부', dataIndex: 'division', width: 120 },
    { title: '팀/파트', dataIndex: 'team', width: 120 },
    { title: '접수중', dataIndex: 'pending', width: 120, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '진행중', dataIndex: 'inProgress', width: 120, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '예상매출', dataIndex: 'forecast', width: 120, align: 'right',
      render: (v: number) => <strong>{v?.toLocaleString()}</strong> },
  ];

  return (
    <PageLayout title="본부 및 팀 예상매출" breadcrumb={['통계', '본부 및 팀 예상매출']}>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={dayjs(`${year}-${String(month).padStart(2, '0')}`)}
          onChange={(d) => { if (d) { setYear(d.year()); setMonth(d.month() + 1); } }}
        />
      </Space>

      <Card title="사업본부별 예상매출" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`, '예상매출']} />
            <Legend />
            <Bar dataKey="forecast" fill="#1677ff" name="예상매출" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={tableData} loading={loading}
        pagination={false} bordered size="middle" />
    </PageLayout>
  );
};

export default TeamForecastPage;
```

### 5.2 본부 및 팀 매출목표 및 실적

- [ ] **5.2.1** `sm-module-web/src/pages/stats/TeamGoalActualPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import { getTeamGoalActual } from '../../api/stats.api';
import type { TeamGoalActualDto, DivisionGoalActual, MonthlyGoalActual } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const TeamGoalActualPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [data, setData] = useState<TeamGoalActualDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getTeamGoalActual(year);
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [year]);

  // 월별 목표 vs 실적 차트 (첫번째 사업본부 기준)
  const firstDivision = data?.divisions[0];
  const chartData = firstDivision?.monthly.map((m: MonthlyGoalActual) => ({
    month: `${m.month}월`,
    goal: m.goal,
    actual: m.actual,
  })) ?? [];

  // 테이블: 사업본부별 연간 요약
  const tableData = data?.divisions.map((d: DivisionGoalActual) => ({
    key: d.divisionName,
    division: d.divisionName,
    yearlyGoal: d.yearlyGoal,
    yearlyActual: d.yearlyActual,
    yearlyRate: d.yearlyRate,
  })) ?? [];

  const columns: ColumnsType<typeof tableData[number]> = [
    { title: '사업본부', dataIndex: 'division', width: 120 },
    { title: '연간 목표', dataIndex: 'yearlyGoal', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '연간 실적', dataIndex: 'yearlyActual', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '달성률', dataIndex: 'yearlyRate', width: 100, align: 'center',
      render: (v: number) => (
        <Tag color={v >= 100 ? 'green' : v >= 80 ? 'orange' : 'red'}>
          {v?.toFixed(1)}%
        </Tag>
      ),
    },
  ];

  return (
    <PageLayout title="본부 및 팀 매출목표 및 실적" breadcrumb={['통계', '매출목표 및 실적']}>
      <DatePicker picker="year" value={dayjs(`${year}`)} onChange={(d) => d && setYear(d.year())}
        style={{ marginBottom: 16 }} />

      <Card title={`${firstDivision?.divisionName ?? ''} 월별 목표 vs 실적`} style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
            <Legend />
            <Bar dataKey="goal" fill="#bae0ff" name="목표" />
            <Bar dataKey="actual" fill="#1677ff" name="실적" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={tableData} loading={loading}
        pagination={false} bordered size="middle" />
    </PageLayout>
  );
};

export default TeamGoalActualPage;
```

### 5.3 파트별 전년대비

- [ ] **5.3.1** `sm-module-web/src/pages/stats/PartGoalActualYoyPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import { getPartGoalActualYoy } from '../../api/stats.api';
import type { PartGoalYoyDto, PartYoyRow } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const PartGoalActualYoyPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [data, setData] = useState<PartGoalYoyDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getPartGoalActualYoy(year);
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [year]);

  const chartData = data?.parts.map((p: PartYoyRow) => ({
    name: p.partName,
    prevYear: p.prevYearActual,
    currentActual: p.currentActual,
    goal: p.currentGoal,
  })) ?? [];

  const columns: ColumnsType<PartYoyRow> = [
    { title: '파트', dataIndex: 'partName', width: 120 },
    { title: '전년 실적', dataIndex: 'prevYearActual', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '금년 목표', dataIndex: 'currentGoal', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '금년 실적', dataIndex: 'currentActual', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '목표 달성률', dataIndex: 'goalRate', width: 110, align: 'center',
      render: (v: number) => <Tag color={v >= 100 ? 'green' : v >= 80 ? 'orange' : 'red'}>{v?.toFixed(1)}%</Tag> },
    { title: '전년대비', dataIndex: 'yoyRate', width: 110, align: 'center',
      render: (v: number) => <Tag color={v >= 0 ? 'blue' : 'red'}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</Tag> },
  ];

  return (
    <PageLayout title="파트별 매출목표 및 실적 (전년대비)" breadcrumb={['통계', '파트별 전년대비']}>
      <DatePicker picker="year" value={dayjs(`${year}`)} onChange={(d) => d && setYear(d.year())}
        style={{ marginBottom: 16 }} />

      <Card title="파트별 전년 vs 금년 비교" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
            <Legend />
            <Bar dataKey="prevYear" fill="#d9d9d9" name="전년 실적" />
            <Bar dataKey="goal" fill="#bae0ff" name="금년 목표" />
            <Bar dataKey="currentActual" fill="#1677ff" name="금년 실적" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={data?.parts ?? []} rowKey="partName"
        loading={loading} pagination={false} bordered size="middle" />
    </PageLayout>
  );
};

export default PartGoalActualYoyPage;
```

### 5.4 AM 전년대비

- [ ] **5.4.1** `sm-module-web/src/pages/stats/AmGoalActualYoyPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import { getAmGoalActualYoy } from '../../api/stats.api';
import type { AmGoalYoyDto, AmYoyRow } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const AmGoalActualYoyPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [data, setData] = useState<AmGoalYoyDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getAmGoalActualYoy(year);
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [year]);

  const chartData = data?.managers.map((m: AmYoyRow) => ({
    name: m.managerName,
    prevYear: m.prevYearActual,
    currentActual: m.currentActual,
    goal: m.currentGoal,
  })) ?? [];

  const columns: ColumnsType<AmYoyRow> = [
    { title: 'AM 이름', dataIndex: 'managerName', width: 100 },
    { title: '소속 파트', dataIndex: 'partName', width: 120 },
    { title: '전년 실적', dataIndex: 'prevYearActual', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '금년 목표', dataIndex: 'currentGoal', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '금년 실적', dataIndex: 'currentActual', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '목표 달성률', dataIndex: 'goalRate', width: 110, align: 'center',
      render: (v: number) => <Tag color={v >= 100 ? 'green' : v >= 80 ? 'orange' : 'red'}>{v?.toFixed(1)}%</Tag> },
    { title: '전년대비', dataIndex: 'yoyRate', width: 110, align: 'center',
      render: (v: number) => <Tag color={v >= 0 ? 'blue' : 'red'}>{v >= 0 ? '+' : ''}{v?.toFixed(1)}%</Tag> },
  ];

  return (
    <PageLayout title="AM 매출목표 및 실적 (전년대비)" breadcrumb={['통계', 'AM 전년대비']}>
      <DatePicker picker="year" value={dayjs(`${year}`)} onChange={(d) => d && setYear(d.year())}
        style={{ marginBottom: 16 }} />

      <Card title="AM별 전년 vs 금년 비교" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
            <Legend />
            <Bar dataKey="prevYear" fill="#d9d9d9" name="전년 실적" />
            <Bar dataKey="goal" fill="#bae0ff" name="금년 목표" />
            <Bar dataKey="currentActual" fill="#52c41a" name="금년 실적" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={data?.managers ?? []} rowKey="managerName"
        loading={loading} pagination={false} bordered size="middle" />
    </PageLayout>
  );
};

export default AmGoalActualYoyPage;
```

### 5.5 품목별 실적조회

- [ ] **5.5.1** `sm-module-web/src/pages/stats/ItemPerfPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs, { Dayjs } from 'dayjs';
import { getItemPerformance } from '../../api/stats.api';
import type { ItemPerformanceDto, CategoryPerformance } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96'];

const ItemPerfPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('year'), dayjs(),
  ]);
  const [data, setData] = useState<ItemPerformanceDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getItemPerformance(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
        );
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [dateRange]);

  const pieData = data?.categories.map((c: CategoryPerformance) => ({
    name: c.categoryLabel,
    value: c.totalAmount,
  })) ?? [];

  const columns: ColumnsType<CategoryPerformance> = [
    { title: '품목', dataIndex: 'categoryLabel', width: 120 },
    { title: '매출 합계', dataIndex: 'totalAmount', width: 150, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '주문 건수', dataIndex: 'orderCount', width: 100, align: 'right' },
    { title: '비중', dataIndex: 'shareRate', width: 100, align: 'center',
      render: (v: number) => `${v?.toFixed(1)}%` },
  ];

  return (
    <PageLayout title="품목별 실적조회" breadcrumb={['통계', '품목별 실적조회']}>
      <RangePicker value={dateRange}
        onChange={(d) => d && setDateRange(d as [Dayjs, Dayjs])}
        style={{ marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card title="품목별 비중" style={{ flex: 1, minWidth: 350 }}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={100} label>
                {pieData.map((_: unknown, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toLocaleString()}원`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="상세 내역" style={{ flex: 1, minWidth: 400 }}>
          <Table columns={columns} dataSource={data?.categories ?? []}
            rowKey="category" loading={loading} pagination={false} bordered size="small"
            summary={() => data ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>합계</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong>{data.grandTotal?.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="center"><Text strong>100%</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null}
          />
        </Card>
      </div>
    </PageLayout>
  );
};

export default ItemPerfPage;
```

### 5.6 거래처별 외주 마진율

- [ ] **5.6.1** `sm-module-web/src/pages/stats/VendorMarginPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs, { Dayjs } from 'dayjs';
import { getVendorMargin } from '../../api/stats.api';
import type { VendorMarginDto, VendorMarginRow } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const { RangePicker } = DatePicker;

const VendorMarginPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('year'), dayjs(),
  ]);
  const [data, setData] = useState<VendorMarginDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getVendorMargin(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
        );
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [dateRange]);

  const chartData = data?.vendors.slice(0, 10).map((v: VendorMarginRow) => ({
    name: v.vendorName.length > 8 ? v.vendorName.substring(0, 8) + '...' : v.vendorName,
    orderAmount: v.orderAmount,
    outsourcingAmount: v.outsourcingAmount,
    marginRate: v.marginRate,
  })) ?? [];

  const columns: ColumnsType<VendorMarginRow> = [
    { title: '거래처명', dataIndex: 'vendorName', width: 150 },
    { title: '수주금액', dataIndex: 'orderAmount', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '외주금액', dataIndex: 'outsourcingAmount', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '마진', dataIndex: 'marginAmount', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{v?.toLocaleString()}</span> },
    { title: '마진율', dataIndex: 'marginRate', width: 100, align: 'center',
      render: (v: number) => <Tag color={v >= 30 ? 'green' : v >= 15 ? 'orange' : 'red'}>{v?.toFixed(1)}%</Tag> },
    { title: '건수', dataIndex: 'orderCount', width: 80, align: 'right' },
  ];

  return (
    <PageLayout title="거래처별 외주 마진율" breadcrumb={['통계', '거래처별 외주 마진율']}>
      <RangePicker value={dateRange}
        onChange={(d) => d && setDateRange(d as [Dayjs, Dayjs])}
        style={{ marginBottom: 16 }} />

      <Card title="상위 10 거래처 수주 vs 외주 비교" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
            <Legend />
            <Bar dataKey="orderAmount" fill="#1677ff" name="수주금액" />
            <Bar dataKey="outsourcingAmount" fill="#ff7a45" name="외주금액" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={data?.vendors ?? []} rowKey="vendorName"
        loading={loading} pagination={{ pageSize: 20 }} bordered size="middle" />
    </PageLayout>
  );
};

export default VendorMarginPage;
```

### 5.7 주문건별 외주 마진율

- [ ] **5.7.1** `sm-module-web/src/pages/stats/OrderMarginPage.tsx` 생성

```tsx
import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { getOrderMargin } from '../../api/stats.api';
import type { OrderMarginDto, OrderMarginRow } from '../../types/stats';
import PageLayout from '../../components/layout/PageLayout';

const { RangePicker } = DatePicker;

const OrderMarginPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);
  const [data, setData] = useState<OrderMarginDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getOrderMargin(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
        );
        if (res.success) setData(res.data);
      } catch { message.error('데이터 조회 실패'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [dateRange]);

  const columns: ColumnsType<OrderMarginRow> = [
    { title: '주문번호', dataIndex: 'orderNo', width: 150 },
    { title: '주문명', dataIndex: 'orderTitle', width: 200, ellipsis: true },
    { title: '거래처', dataIndex: 'vendorName', width: 130 },
    { title: '수주금액', dataIndex: 'orderAmount', width: 120, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '외주금액', dataIndex: 'outsourcingAmount', width: 120, align: 'right',
      render: (v: number) => v?.toLocaleString() },
    { title: '마진', dataIndex: 'marginAmount', width: 120, align: 'right',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
          {v?.toLocaleString()}
        </span>
      ),
    },
    { title: '마진율', dataIndex: 'marginRate', width: 90, align: 'center',
      render: (v: number) => (
        <Tag color={v >= 30 ? 'green' : v >= 15 ? 'orange' : v >= 0 ? 'default' : 'red'}>
          {v?.toFixed(1)}%
        </Tag>
      ),
    },
    { title: '매출일', dataIndex: 'salesDate', width: 100 },
  ];

  return (
    <PageLayout title="주문건별 외주 마진율" breadcrumb={['통계', '주문건별 외주 마진율']}>
      <RangePicker value={dateRange}
        onChange={(d) => d && setDateRange(d as [Dayjs, Dayjs])}
        style={{ marginBottom: 16 }} />

      <Table
        columns={columns}
        dataSource={data?.orders ?? []}
        rowKey="orderNo"
        loading={loading}
        bordered
        size="middle"
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `총 ${t}건` }}
      />
    </PageLayout>
  );
};

export default OrderMarginPage;
```

---

## Task 6: 라우팅 + 메뉴 — 부분 구현 (대시보드/프로세스만)

- [ ] **6.1** `sm-module-web/src/routes/index.tsx` 에 라우트 추가

```tsx
// 기존 라우트 설정에 아래 추가

import DashboardPage from '../pages/home/DashboardPage';
import ProcessFlowPage from '../pages/process/ProcessFlowPage';
import TeamForecastPage from '../pages/stats/TeamForecastPage';
import TeamGoalActualPage from '../pages/stats/TeamGoalActualPage';
import PartGoalActualYoyPage from '../pages/stats/PartGoalActualYoyPage';
import AmGoalActualYoyPage from '../pages/stats/AmGoalActualYoyPage';
import ItemPerfPage from '../pages/stats/ItemPerfPage';
import VendorMarginPage from '../pages/stats/VendorMarginPage';
import OrderMarginPage from '../pages/stats/OrderMarginPage';

// routes 배열에 추가:
{
  path: '/',
  element: <ProtectedRoute><DashboardPage /></ProtectedRoute>,
},
{
  path: '/process',
  element: <ProtectedRoute><ProcessFlowPage /></ProtectedRoute>,
},
{
  path: '/stats/team-forecast',
  element: <ProtectedRoute><TeamForecastPage /></ProtectedRoute>,
},
{
  path: '/stats/team-goal-actual',
  element: <ProtectedRoute><TeamGoalActualPage /></ProtectedRoute>,
},
{
  path: '/stats/part-goal-yoy',
  element: <ProtectedRoute><PartGoalActualYoyPage /></ProtectedRoute>,
},
{
  path: '/stats/am-goal-yoy',
  element: <ProtectedRoute><AmGoalActualYoyPage /></ProtectedRoute>,
},
{
  path: '/stats/item-perf',
  element: <ProtectedRoute><ItemPerfPage /></ProtectedRoute>,
},
{
  path: '/stats/vendor-margin',
  element: <ProtectedRoute><VendorMarginPage /></ProtectedRoute>,
},
{
  path: '/stats/order-margin',
  element: <ProtectedRoute><OrderMarginPage /></ProtectedRoute>,
},
```

- [ ] **6.2** `sm-module-web/src/components/layout/AppHeader.tsx` (또는 `AppSidebar.tsx`) 메뉴 항목 추가

```tsx
// GNB 메뉴 정의에 추가:

// 통계 메뉴 (서브메뉴)
{
  key: 'stats',
  label: '통계',
  children: [
    { key: '/stats/team-forecast',   label: '본부 및 팀 예상매출' },
    { key: '/stats/team-goal-actual', label: '본부 및 팀 매출목표 및 실적' },
    { key: '/stats/part-goal-yoy',    label: '파트별 전년대비' },
    { key: '/stats/am-goal-yoy',      label: 'AM 전년대비' },
    { key: '/stats/item-perf',        label: '품목별 실적조회' },
    { key: '/stats/vendor-margin',    label: '거래처별 외주 마진율' },
    { key: '/stats/order-margin',     label: '주문건별 외주 마진율' },
  ],
},
```

- [ ] **6.3** Recharts 의존성 확인: `package.json`에 `recharts` 포함 여부 확인

```bash
cd sm-module-web && npm install recharts @types/recharts
```

- [ ] **6.4** 통합 테스트: 대시보드 차트 렌더링, 프로세스 흐름도 클릭 이동, 7개 통계 화면 접근 E2E 확인

---

## 완료 기준

| 항목 | 검증 방법 |
|------|-----------|
| 대시보드 매출 추이 | GET /api/dashboard/sales-trend -> 12개월 데이터 + 추세선 |
| 7개 통계 API | 각 엔드포인트 호출 시 정상 응답 (빈 데이터라도 구조 정상) |
| DashboardPage | Recharts 라인차트 렌더링, 프로세스 보기 버튼 동작 |
| ProcessFlowPage | SVG 흐름도 3개 라인, 단계 클릭 시 해당 화면 이동 |
| TeamForecastPage | 월 선택 -> 막대차트 + 테이블 렌더링 |
| TeamGoalActualPage | 연도 선택 -> 목표 vs 실적 차트 + 달성률 태그 |
| PartGoalActualYoyPage | 연도 선택 -> 전년 vs 금년 비교 차트 + 테이블 |
| AmGoalActualYoyPage | 연도 선택 -> AM별 비교 차트 + 테이블 |
| ItemPerfPage | 기간 선택 -> 파이차트 + 비중 테이블 |
| VendorMarginPage | 기간 선택 -> 상위 10 막대차트 + 마진율 테이블 |
| OrderMarginPage | 기간 선택 -> 주문건별 마진 테이블 (색상 태그) |
| 라우팅 | /, /process, /stats/* 전체 9개 경로 접근 가능 |
