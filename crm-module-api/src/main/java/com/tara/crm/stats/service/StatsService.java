package com.tara.crm.stats.service;

import com.tara.crm.common.code.CommonCodeService;
import com.tara.crm.integration.erp.repository.ErpCodeRepository;
import com.tara.crm.integration.erp.repository.ErpEmployeeRepository;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import com.tara.crm.stats.dto.*;
import com.tara.crm.stats.repository.OracleStatsRepository;
import com.tara.crm.stats.repository.OraclePodProductionRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class StatsService {

    private final EntityManager entityManager;
    private final Optional<OracleStatsRepository> oracleStatsRepository;
    private final Optional<OraclePodProductionRepository> oraclePodProductionRepository;
    private final Optional<ErpEmployeeRepository> erpEmployeeRepository;
    private final Optional<ErpCodeRepository> erpCodeRepository;
    private final Optional<ErpPartnerRepository> erpPartnerRepository;
    private final CommonCodeService commonCodeService;
    private final com.tara.crm.common.util.RoleFilterHelper roleFilterHelper;

    private static final int DEFAULT_COMPANY_CD = 1000;
    private static final int DEFAULT_PLANT_CD = 2000;

    // ══════════════════════════════════════════════════════════════════
    //  매출 ↔ 주문 연결 판정 (2026-09-01) — FIND_IN_SET 제거
    //
    //  기존:  EXISTS (SELECT 1 FROM order_mst o
    //                 WHERE ... AND FIND_IN_SET(o.order_no, s.order_no) > 0)
    //         → sales_mst.order_no 가 주문번호를 콤마로 이어붙인 값(1정규형 위반)이라
    //           o.order_no 가 함수 인자로 들어가 인덱스를 원리적으로 못 쓴다.
    //           매출 행마다 order_mst 를 통째로 훑어 통합대시보드가 20초씩 걸렸다.
    //
    //  해법:  sales_dtl 에 이미 order_no 가 '행별로' 정규화되어 있다 → 이걸 경유한다.
    //         sales_dtl 은 PK(sales_no)로, order_mst 는 PK(order_no)로 찾으므로 둘 다 인덱스를 탄다.
    //         ※ 적용 전 확인함: sales_mst.order_no 가 있는데 sales_dtl 행이 없는 매출 = 0건.
    //           (그런 매출이 생기면 이 판정에서 빠지므로, 데이터 정합성이 깨지면 재검토 필요)
    // ══════════════════════════════════════════════════════════════════

    /** 이 매출이 plan_plant_cd=:planPlantCd 주문에 연결됐는가 (주문 없는 엑셀 적재 매출도 포함). */
    private static final String PLAN_PLANT_FILTER =
            " AND (EXISTS (SELECT 1 FROM sales_dtl sd_pp" +
            " JOIN order_mst o ON o.company_cd = sd_pp.company_cd AND o.plant_cd = sd_pp.plant_cd" +
            " AND o.order_no = sd_pp.order_no" +
            " WHERE sd_pp.company_cd = s.company_cd AND sd_pp.plant_cd = s.plant_cd" +
            " AND sd_pp.sales_no = s.sales_no" +
            " AND o.plan_plant_cd = :planPlantCd)" +
            " OR s.order_no IS NULL OR s.order_no = '')";

    /** 위와 같으나 'OR 주문없음' 없이 반드시 주문 연결을 요구하는 버전(거래처별 월매출 계열). */
    private static final String PLAN_PLANT_FILTER_STRICT =
            " AND EXISTS (SELECT 1 FROM sales_dtl sd_pp" +
            " JOIN order_mst o ON o.company_cd = sd_pp.company_cd AND o.plant_cd = sd_pp.plant_cd" +
            " AND o.order_no = sd_pp.order_no" +
            " WHERE sd_pp.company_cd = s.company_cd AND sd_pp.plant_cd = s.plant_cd" +
            " AND sd_pp.sales_no = s.sales_no" +
            " AND o.plan_plant_cd = :planPlantCd)";

    /** 매출 ↔ 외주정산(po_settle_mst) 연결 — 같은 이유로 sales_dtl 경유로 바꾼다. */
    private static final String SETTLE_JOIN_ON =
            " AND EXISTS (SELECT 1 FROM sales_dtl sd_ps" +
            " WHERE sd_ps.company_cd = s.company_cd AND sd_ps.plant_cd = s.plant_cd" +
            " AND sd_ps.sales_no = s.sales_no AND sd_ps.order_no = ps.order_no)";

    private static final Map<String, String> STATUS_LABEL_MAP = Map.of(
        "PENDING", "접수대기",
        "OUTSOURCE_PO", "외주발주",
        "SHIPPED", "발송완료",
        "SALES_REGISTERED", "매출등록"
    );

    // ============================================================
    // 遺???꾪꽣 ?ы띁
    // ============================================================

    private String buildDeptFilter(String alias, String column, List<Integer> deptCds) {
        if (deptCds == null || deptCds.isEmpty()) return "";
        String inClause = deptCds.stream().map(String::valueOf).collect(Collectors.joining(","));
        return " AND " + alias + "." + column + " IN (" + inClause + ")";
    }

    private String buildDeptExprFilter(String deptExpr, List<Integer> deptCds) {
        if (deptCds == null || deptCds.isEmpty()) return "";
        String inClause = deptCds.stream().map(String::valueOf).collect(Collectors.joining(","));
        return " AND " + deptExpr + " IN (" + inClause + ")";
    }

    private List<Integer> mergeAccessibleDeptFilter(List<Integer> accessibleDeptCds, List<String> selectedDeptCds) {
        if (selectedDeptCds == null || selectedDeptCds.isEmpty()) return accessibleDeptCds;
        List<Integer> selected = selectedDeptCds.stream()
            .map(v -> {
                try { return Integer.parseInt(v); }
                catch (NumberFormatException e) { return null; }
            })
            .filter(Objects::nonNull)
            .toList();
        if (selected.isEmpty()) return List.of(-1);
        if (accessibleDeptCds == null) return selected;
        List<Integer> merged = selected.stream().filter(accessibleDeptCds::contains).toList();
        return merged.isEmpty() ? List.of(-1) : merged;
    }

    /** 인라인 SQL 리터럴 안전화 — 백슬래시(MySQL 이스케이프 문자) 제거 후 따옴표 doubling.
     *  백슬래시를 지우면 '\'' 를 통한 문자열 리터럴 탈출(인젝션)이 불가능해진다(정상 검색어엔 백슬래시 없음). */
    private static String sqlLiteral(String s) {
        return s == null ? "" : s.replace("\\", "").replace("'", "''");
    }

    private String buildStringInFilter(String alias, String column, List<String> values) {
        if (values == null || values.isEmpty()) return "";
        String inClause = values.stream()
            .filter(v -> v != null && !v.isBlank())
            .map(v -> "'" + sqlLiteral(v) + "'")
            .collect(Collectors.joining(","));
        return inClause.isBlank() ? "" : " AND " + alias + "." + column + " IN (" + inClause + ")";
    }

    private String buildLikeFilter(String alias, String column, String keyword) {
        if (keyword == null || keyword.isBlank()) return "";
        return " AND " + alias + "." + column + " LIKE '%" + sqlLiteral(keyword) + "%'";
    }

    private String buildOrderMarginFilter(String keyword) {
        if (keyword == null || keyword.isBlank()) return "";
        String escaped = sqlLiteral(keyword.trim());
        int dashIndex = escaped.lastIndexOf('-');
        if (dashIndex > 0 && dashIndex < escaped.length() - 1) {
            String orderNo = escaped.substring(0, dashIndex);
            String orderSqText = escaped.substring(dashIndex + 1);
            try {
                int orderSq = Integer.parseInt(orderSqText);
                return " AND o.order_no LIKE '%" + orderNo + "%' AND od.order_sq = " + orderSq;
            } catch (NumberFormatException ignored) {
                // Fall through to order number search.
            }
        }
        return " AND o.order_no LIKE '%" + escaped + "%'";
    }

    /** 외주 마진율 공통 대상: 전체외주, 패키지, POD외주, P&D, VMD. */
    private String externalMarginWorkPredicate(String alias) {
        return "(" + alias + ".wrk_cd IN ('G0600','G0601','G0602','S001','S002')" +
                " OR " + alias + ".work_type IN ('G0600','G0601','G0602','S001','S002'," +
                "'전체외주','패키지','P&D','VMD','수작업','수작업(P&D)','POD외주')" +
                " OR " + alias + ".work_type LIKE '%전체외주%'" +
                " OR " + alias + ".work_type LIKE '%패키지%'" +
                " OR " + alias + ".work_type LIKE '%P&D%'" +
                " OR " + alias + ".work_type LIKE '%VMD%'" +
                " OR " + alias + ".work_type LIKE '%수작업%'" +
                " OR " + alias + ".work_type LIKE '%POD외주%')";
    }

    private String buildSingleDeptFilter(String alias, String column, String deptCd) {
        if (deptCd == null || deptCd.isBlank()) return "";
        try {
            return " AND " + alias + "." + column + " = " + Integer.parseInt(deptCd);
        } catch (NumberFormatException e) {
            return "";
        }
    }

    /** 팀(상위부서) 필터 — 팀 자신 + 그 팀을 up_dept_cd 로 가진 하위부서(파트)까지 포함. */
    private String buildTeamDeptFilter(String alias, String column, String teamCd) {
        if (teamCd == null || teamCd.isBlank()) return "";
        try {
            int t = Integer.parseInt(teamCd);
            return " AND (" + alias + "." + column + " = " + t
                + " OR " + alias + "." + column + " IN (SELECT dept_cd FROM departments WHERE up_dept_cd = " + t + "))";
        } catch (NumberFormatException e) {
            return "";
        }
    }

    private String buildSingleDeptExprFilter(String deptExpr, String deptCd) {
        if (deptCd == null || deptCd.isBlank()) return "";
        try {
            return " AND " + deptExpr + " = " + Integer.parseInt(deptCd);
        } catch (NumberFormatException e) {
            return "";
        }
    }

    /** 팀 필터를 dept 표현식 기준으로 — 팀 본인 dept 또는 그 팀을 상위로 둔 파트(up_dept_cd)까지 포함. */
    private String buildTeamDeptExprFilter(String deptExpr, String teamCd) {
        if (teamCd == null || teamCd.isBlank()) return "";
        try {
            int t = Integer.parseInt(teamCd);
            return " AND (" + deptExpr + " = " + t
                + " OR " + deptExpr + " IN (SELECT dept_cd FROM departments WHERE up_dept_cd = " + t + "))";
        } catch (NumberFormatException e) {
            return "";
        }
    }

    private String buildMarginHaving(String marginRange) {
        if (marginRange == null || marginRange.isBlank()) return "";
        return switch (marginRange) {
            case "high" -> " HAVING margin_rate >= 30";
            case "mid" -> " HAVING margin_rate >= 15 AND margin_rate < 30";
            case "low" -> " HAVING margin_rate >= 0 AND margin_rate < 15";
            case "loss" -> " HAVING margin_rate < 0";
            default -> "";
        };
    }

    private double safeRate(long actual, long goal) {
        return goal > 0 ? Math.round(actual * 1000.0 / goal) / 10.0 : 0;
    }

    private double safeYoy(long current, long prev) {
        return prev > 0 ? Math.round(current * 1000.0 / prev) / 10.0 : 0;
    }

    // ============================================================
    // ??쒕낫?? KPI ?붿빟
    // ============================================================

    public DashboardSummaryDto getDashboardSummary() {
        // 대시보드는 미처리건수(unprocessedSalesCount) 하나만 사용(DashboardPage 전용) →
        //   매출/신규주문/고객수/마진율/확정매출/미정산건수 계산은 스킵(불필요 MySQL 쿼리 3~6개 + Oracle 3콜 제거).
        //   미처리건수 쿼리는 기존 두 브랜치가 동일했다: plan_plant_cd=2000, status != SALES_REGISTERED, 부서 스코프.
        List<Integer> deptCds = roleFilterHelper.getDashboardAccessibleDepartmentCds();
        String unprocessedSql = "SELECT COUNT(*) FROM order_mst o " +
                "WHERE o.company_cd = :companyCd AND o.plan_plant_cd = 2000 " +
                "AND o.status_cd != 'SALES_REGISTERED'" +
                buildDeptFilter("o", "sales_dept_cd", deptCds);
        Object unprocessedResult = entityManager.createNativeQuery(unprocessedSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .getSingleResult();
        int unprocessedSalesCount = ((Number) unprocessedResult).intValue();

        return DashboardSummaryDto.builder()
            .unprocessedSalesCount(unprocessedSalesCount)
            .build();
    }

    // ============================================================
    // ??쒕낫?? 理쒓렐 二쇰Ц 紐⑸줉
    // ============================================================

    public List<RecentOrderDto> getRecentOrders(int limit) {
        // 최근 주문현황 = CRM 주문관리(MySQL order_mst) 기준 — ERP Oracle 라이브가 아니라
        // 주문목록과 동일 소스로 통일. 부서 스코프(전체=null / MANAGER·STAFF=본인부서+하위) 적용.
        List<Integer> deptCds = roleFilterHelper.getDashboardAccessibleDepartmentCds();

        String sql = "SELECT o.order_no, o.order_title, o.partner_nm, o.total_amt, o.status_cd, o.created_at " +
                "FROM order_mst o " +
                "WHERE o.company_cd = :companyCd AND o.plant_cd = :plantCd" +
                buildDeptFilter("o", "sales_dept_cd", deptCds) +
                " ORDER BY o.created_at DESC";

        @SuppressWarnings("unchecked")
        List<Object[]> results = entityManager.createNativeQuery(sql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", DEFAULT_PLANT_CD)
            .setMaxResults(limit)
            .getResultList();

        List<RecentOrderDto> orders = new ArrayList<>();
        for (Object[] row : results) {
            String status = (String) row[4];
            orders.add(RecentOrderDto.builder()
                .orderNo((String) row[0])
                .customerName((String) row[2])
                .totalAmount(row[3] != null ? ((Number) row[3]).longValue() : 0L)
                .status(status)
                .statusLabel(STATUS_LABEL_MAP.getOrDefault(status, status))
                .createdAt(row[5] != null ? ((java.sql.Timestamp) row[5]).toLocalDateTime() : null)
                .build());
        }
        return orders;
    }

    // ============================================================
    // ??쒕낫?? 理쒓렐 12媛쒖썡 留ㅼ텧 異붿씠
    // ============================================================

    public SalesTrendDto getSalesTrend() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusMonths(11).withDayOfMonth(1);

        Map<String, Long> monthlyMap = new LinkedHashMap<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM");
        for (int i = 0; i < 12; i++) {
            String key = YearMonth.from(startDate.plusMonths(i)).format(fmt);
            monthlyMap.put(key, 0L);
        }

        if (oracleStatsRepository.isPresent()) {
            List<SalesTrendDto.MonthlyAmount> oracleData = oracleStatsRepository.get()
                    .getMonthlySalesTrend(startDate, endDate);
            for (SalesTrendDto.MonthlyAmount ma : oracleData) {
                if (monthlyMap.containsKey(ma.getMonth())) {
                    monthlyMap.put(ma.getMonth(), ma.getAmount());
                }
            }
            List<SalesTrendDto.MonthlyAmount> monthlySales = new ArrayList<>();
            for (Map.Entry<String, Long> entry : monthlyMap.entrySet()) {
                monthlySales.add(SalesTrendDto.MonthlyAmount.builder()
                    .month(entry.getKey()).amount(entry.getValue()).build());
            }
            return SalesTrendDto.builder()
                .monthlySales(monthlySales)
                .trendLine(calculateTrendLine(monthlySales))
                .build();
        }

        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;

        String sql = "SELECT DATE_FORMAT(s.sales_dt, '%Y-%m') AS month_key, SUM(s.total_amt) AS total " +
                "FROM sales_mst s " +
                "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND s.sales_dt >= :startDate AND s.sales_dt <= :endDate " +
                "AND s.confirmed = true " +
                // #409 — 매출리스트 기준 통일: 선매출·선매출취소 제외.
                "AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +
                buildDeptFilter("s", "dept_cd", deptCds) +
                " GROUP BY DATE_FORMAT(s.sales_dt, '%Y-%m') ORDER BY month_key ASC";

        @SuppressWarnings("unchecked")
        List<Object[]> results = entityManager.createNativeQuery(sql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();

        for (Object[] row : results) {
            String monthKey = (String) row[0];
            long amount = row[1] != null ? ((Number) row[1]).longValue() : 0L;
            if (monthlyMap.containsKey(monthKey)) {
                monthlyMap.put(monthKey, amount);
            }
        }

        List<SalesTrendDto.MonthlyAmount> monthlySales = new ArrayList<>();
        for (Map.Entry<String, Long> entry : monthlyMap.entrySet()) {
            monthlySales.add(SalesTrendDto.MonthlyAmount.builder()
                .month(entry.getKey()).amount(entry.getValue()).build());
        }

        return SalesTrendDto.builder()
            .monthlySales(monthlySales)
            .trendLine(calculateTrendLine(monthlySales))
            .build();
    }

    private List<SalesTrendDto.MonthlyAmount> calculateTrendLine(List<SalesTrendDto.MonthlyAmount> data) {
        int n = data.size();
        if (n == 0) return List.of();
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < n; i++) {
            double x = i;
            double y = data.get(i).getAmount();
            sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
        }
        double denominator = n * sumX2 - sumX * sumX;
        double b = denominator != 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        double a = (sumY - b * sumX) / n;
        List<SalesTrendDto.MonthlyAmount> trend = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            long trendValue = Math.round(a + b * i);
            trend.add(SalesTrendDto.MonthlyAmount.builder()
                .month(data.get(i).getMonth()).amount(Math.max(0, trendValue)).build());
        }
        return trend;
    }

    // ============================================================
    // ?듯빀 ?ㅼ쟻 ??쒕낫??(20쨌21쨌22踰??듯빀)
    // ============================================================

    /**
     * 홈 대시보드 '전체목표' 카드 전용 — role 부서 스코프의 연간(1~12월) 목표 합계만.
     *
     * getIntegratedDashboard(1/1~12/31) 의 hq.cumulativeGoal 과 동일한 값을 반환하되,
     * 무거운 매출 집계(FIND_IN_SET 상관 서브쿼리를 쓰는 실적/전년/내외부 쿼리 6개)를 돌리지 않고
     * goal_mst 만 SUM 한다 → 대시보드 로드 시 풀-이어 매출스캔 6개 제거(체감 속도 개선).
     * prorateMonthlyGoals 는 걸친 달을 '그 달 전체'로 합산하므로 연간=Σ(1~12월 goal_amt) 로 정확히 일치.
     */
    public long getDashboardAnnualGoal(int year) {
        List<Integer> deptCds = roleFilterHelper.getDashboardAccessibleDepartmentCds();
        String sql = "SELECT COALESCE(SUM(g.goal_amt), 0) " +
                "FROM goal_mst g JOIN departments d ON d.dept_cd = CAST(SUBSTRING(g.sales_emp_id, 6) AS UNSIGNED) AND d.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) BETWEEN 1 AND 12 AND g.field_cd = 'AM' " +
                "AND g.sales_emp_id LIKE 'DEPT_%'" +
                buildDeptFilter("d", "dept_cd", deptCds);
        Object result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("plantCd", 2000)
                .setParameter("planYy", String.valueOf(year))
                .getSingleResult();
        return result != null ? ((Number) result).longValue() : 0L;
    }

    /** 통합실적 연간 목표 카드 전용 경량 조회. */
    public long getIntegratedAnnualGoal(int year, String divisionCd, String teamCd, String partCd,
            boolean allDepts) {
        List<Integer> deptCds = allDepts ? null : roleFilterHelper.getDashboardAccessibleDepartmentCds();
        String extraDeptFilter = "";
        if (partCd != null && !partCd.isBlank()) {
            extraDeptFilter = " AND d.dept_cd = " + Integer.parseInt(partCd);
        } else if (teamCd != null && !teamCd.isBlank()) {
            int team = Integer.parseInt(teamCd);
            extraDeptFilter = " AND (d.dept_cd = " + team + " OR d.up_dept_cd = " + team + ")";
        } else if (divisionCd != null && !divisionCd.isBlank()) {
            int division = Integer.parseInt(divisionCd);
            extraDeptFilter = " AND (d.dept_cd = " + division
                    + " OR d.up_dept_cd = " + division
                    + " OR EXISTS (SELECT 1 FROM departments pd WHERE pd.company_cd = d.company_cd"
                    + " AND pd.dept_cd = d.up_dept_cd AND pd.up_dept_cd = " + division + "))";
        }
        String sql = "SELECT COALESCE(SUM(g.goal_amt), 0) "
                + "FROM goal_mst g JOIN departments d ON d.dept_cd = CAST(SUBSTRING(g.sales_emp_id, 6) AS UNSIGNED) AND d.company_cd = g.company_cd "
                + "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd "
                + "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) BETWEEN 1 AND 12 "
                + "AND g.field_cd = 'AM' AND g.sales_emp_id LIKE 'DEPT_%'"
                + buildDeptFilter("d", "dept_cd", deptCds) + extraDeptFilter;
        Object result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("plantCd", 2000)
                .setParameter("planYy", String.valueOf(year))
                .getSingleResult();
        return result != null ? ((Number) result).longValue() : 0L;
    }

    public IntegratedDashboardDto getIntegratedDashboard(java.time.LocalDate startDate, java.time.LocalDate endDate,
            String divisionCd, String teamCd, String partCd, boolean allDepts) {

        // 조회기간(startDate~endDate) 기반. 목표(월단위)는 걸친 월을 일수 안분(prorate)해 비교.
        int year = startDate.getYear();
        int startMonth = startDate.getMonthValue();
        int endMonth = endDate.getMonthValue();
        java.time.LocalDate yearStart = java.time.LocalDate.of(year, 1, 1);
        java.time.LocalDate prevStart = startDate.minusYears(1);   // 전년 동기간 시작
        java.time.LocalDate prevEnd = endDate.minusYears(1);       // 전년 동기간 종료
        java.time.LocalDate prevYearStart = java.time.LocalDate.of(year - 1, 1, 1);

        // Oracle?먯꽌 ?ㅼ쟻 ?곗씠?곕? 媛?몄삤??寃쎌슦, 紐⑺몴??MySQL goal_mst?먯꽌 議고쉶
        // ?ㅼ쟻? Oracle SD_BILL_MST?먯꽌 議고쉶 (getMonthlySalesActualByDept ?ы솢??
        int goalPlantCd = 2000;
        int planPlantCd = 2000;
        // 대시보드 부서 스코프 — ADMIN/EXECUTIVE/FINANCE/SALES_SPT/TEAM_LEADER=전체(null),
        // 나머지(MANAGER/STAFF/PART_LEADER)=본인 부서+하위. (당월목표/전체목표/실적 모두 이 필터 적용)
        // allDepts=true(차트/비교표 전용)면 role 스코프 무시하고 전체.
        List<Integer> deptCds = allDepts ? null : roleFilterHelper.getDashboardAccessibleDepartmentCds();

        // 異붽? ?꾪꽣 (?꾨줎?몄뿉???좏깮??蹂몃?/?/?뚰듃)
        String extraDeptFilter = "";
        if (partCd != null && !partCd.isBlank()) {
            extraDeptFilter = " AND d.dept_cd = " + Integer.parseInt(partCd);
        } else if (teamCd != null && !teamCd.isBlank()) {
            extraDeptFilter = " AND (d.dept_cd = " + Integer.parseInt(teamCd) + " OR d.up_dept_cd = " + Integer.parseInt(teamCd) + ")";
        } else if (divisionCd != null && !divisionCd.isBlank()) {
            int division = Integer.parseInt(divisionCd);
            extraDeptFilter = " AND (d.dept_cd = " + division
                    + " OR d.up_dept_cd = " + division
                    + " OR EXISTS (SELECT 1 FROM departments pd WHERE pd.company_cd = d.company_cd"
                    + " AND pd.dept_cd = d.up_dept_cd AND pd.up_dept_cd = " + division + "))";
        }

        // ?뱀썡 紐⑺몴
        String goalSql = "SELECT d.dept_nm, CAST(g.plan_mm AS SIGNED) AS mm, SUM(g.goal_amt) AS total, " +
                "SUM(COALESCE(g.inner_amt, 0)) AS inner_total, SUM(COALESCE(g.outer_amt, 0)) AS outer_total " +
                "FROM goal_mst g JOIN departments d ON d.dept_cd = CAST(SUBSTRING(g.sales_emp_id, 6) AS UNSIGNED) AND d.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) BETWEEN :startMonth AND :endMonth AND g.field_cd = 'AM' " +
                "AND g.sales_emp_id LIKE 'DEPT_%'" +
                buildDeptFilter("d", "dept_cd", deptCds) + extraDeptFilter +
                " GROUP BY d.dept_nm, CAST(g.plan_mm AS SIGNED)";

        @SuppressWarnings("unchecked")
        List<Object[]> goalResults = entityManager.createNativeQuery(goalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", goalPlantCd)
            .setParameter("planYy", String.valueOf(year))
            .setParameter("startMonth", startMonth)
            .setParameter("endMonth", endMonth)
            .getResultList();

        // ?꾩쟻 紐⑺몴 (1???대떦??
        String cumGoalSql = "SELECT d.dept_nm, CAST(g.plan_mm AS SIGNED) AS mm, SUM(g.goal_amt) AS total, " +
                "SUM(COALESCE(g.inner_amt, 0)) AS inner_total, SUM(COALESCE(g.outer_amt, 0)) AS outer_total " +
                "FROM goal_mst g JOIN departments d ON d.dept_cd = CAST(SUBSTRING(g.sales_emp_id, 6) AS UNSIGNED) AND d.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) <= :endMonth AND g.field_cd = 'AM' " +
                "AND g.sales_emp_id LIKE 'DEPT_%'" +
                buildDeptFilter("d", "dept_cd", deptCds) + extraDeptFilter +
                " GROUP BY d.dept_nm, CAST(g.plan_mm AS SIGNED)";

        @SuppressWarnings("unchecked")
        List<Object[]> cumGoalResults = entityManager.createNativeQuery(cumGoalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", goalPlantCd)
            .setParameter("planYy", String.valueOf(year))
            .setParameter("endMonth", endMonth)
            .getResultList();

        // ?뱀썡 ?ㅼ쟻
        String integratedSalesDeptExpr = "COALESCE(s.sales_dept_cd, s.dept_cd)";
        // 실적/누적/전년/전년누적 total — 기존 4개 개별 풀스캔을 조건부 SUM 1쿼리로 병합(sales_mst 스캔 4→1).
        //   sales_dtl 조인 없음(fan-out 없음). 필터(EXISTS·dept)·집계·기간 경계는 기존 4쿼리와 완전히 동일 → 숫자 불변.
        //   스캔 범위 = 전년1/1(prevYearStart) ~ 당월말(endDate). 각 기간은 CASE 로 독립 합산.
        String totAmt = "COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0)";
        String totalSql = "SELECT d.dept_nm, " +
                "SUM(CASE WHEN s.sales_dt >= :startDate AND s.sales_dt <= :endDate THEN " + totAmt + " ELSE 0 END) AS m_total, " +
                "SUM(CASE WHEN s.sales_dt >= :yearStart AND s.sales_dt <= :endDate THEN " + totAmt + " ELSE 0 END) AS cum_total, " +
                "SUM(CASE WHEN s.sales_dt >= :prevStart AND s.sales_dt <= :prevEnd THEN " + totAmt + " ELSE 0 END) AS prev_total, " +
                "SUM(CASE WHEN s.sales_dt >= :prevYearStart AND s.sales_dt <= :prevEnd THEN " + totAmt + " ELSE 0 END) AS prevcum_total " +
                "FROM sales_mst s JOIN departments d ON " + integratedSalesDeptExpr + " = d.dept_cd AND d.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd " +
                "AND s.sales_dt >= :prevYearStart AND s.sales_dt <= :endDate AND s.confirmed = true" +
                " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 net
                PLAN_PLANT_FILTER +
                buildDeptExprFilter(integratedSalesDeptExpr, deptCds) + extraDeptFilter +
                " GROUP BY d.dept_nm";

        @SuppressWarnings("unchecked")
        List<Object[]> totalResults = entityManager.createNativeQuery(totalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .setParameter("yearStart", yearStart)
            .setParameter("prevStart", prevStart)
            .setParameter("prevEnd", prevEnd)
            .setParameter("prevYearStart", prevYearStart)
            .getResultList();

        // 실적 외부(extLine) — sales_dtl.work_type 기준, 매출목록 외부규칙과 100% 동일.
        //   work_type='I'(내부 작업처): 외부=배송비+수작업비
        //   그 외(외부 작업처): 외부=supply-디자인비
        //   dtl 없는 매출(엑셀/레거시)은 외부=0.
        // 내부는 별도로 계산하지 않고 조립부에서 (총실적 − 외부)로 유도한다 → 내부+외부=총실적 보장.
        //   (intLine 은 디버깅/참고용 — 현재 합산엔 사용하지 않음)
        String intLine = "(CASE WHEN sd.sales_sq IS NULL THEN 0 " +
                "WHEN sd.work_type = 'I' THEN COALESCE(sd.supply_amt,0) - COALESCE(sd.delivery_fee,0) - COALESCE(sd.manual_work_fee,0) " +
                "ELSE COALESCE(sd.design_fee,0) END)";
        String extLine = "(CASE WHEN sd.sales_sq IS NULL THEN 0 " +
                "WHEN sd.work_type = 'I' THEN COALESCE(sd.delivery_fee,0) + COALESCE(sd.manual_work_fee,0) " +
                "ELSE COALESCE(sd.supply_amt,0) - COALESCE(sd.design_fee,0) END)";
        String pfS = PLAN_PLANT_FILTER;
        java.time.LocalDate iMonthStart = startDate;              // 선택기간 시작
        java.time.LocalDate iMonthEnd = endDate.plusDays(1);      // 선택기간 종료(exclusive)
        java.time.LocalDate iYearStart = yearStart;               // 누적 시작(1/1)
        java.time.LocalDate iPrevMonthStart = prevStart;          // 전년 동기간 시작
        java.time.LocalDate iPrevMonthEnd = prevEnd.plusDays(1);  // 전년 동기간 종료(exclusive)
        java.time.LocalDate iPrevYearStart = prevYearStart;       // 전년 누적 시작(전년 1/1)
        String splitSql = "SELECT d.dept_nm, " +
                "SUM(CASE WHEN s.sales_dt >= :mStart AND s.sales_dt < :mEnd THEN " + intLine + " ELSE 0 END) AS m_int, " +
                "SUM(CASE WHEN s.sales_dt >= :mStart AND s.sales_dt < :mEnd THEN " + extLine + " ELSE 0 END) AS m_ext, " +
                "SUM(CASE WHEN s.sales_dt >= :yStart AND s.sales_dt < :mEnd THEN " + intLine + " ELSE 0 END) AS c_int, " +
                "SUM(CASE WHEN s.sales_dt >= :yStart AND s.sales_dt < :mEnd THEN " + extLine + " ELSE 0 END) AS c_ext, " +
                "SUM(CASE WHEN s.sales_dt >= :pmStart AND s.sales_dt < :pmEnd THEN " + intLine + " ELSE 0 END) AS p_int, " +
                "SUM(CASE WHEN s.sales_dt >= :pmStart AND s.sales_dt < :pmEnd THEN " + extLine + " ELSE 0 END) AS p_ext, " +
                "SUM(CASE WHEN s.sales_dt >= :pyStart AND s.sales_dt < :pmEnd THEN " + intLine + " ELSE 0 END) AS pc_int, " +
                "SUM(CASE WHEN s.sales_dt >= :pyStart AND s.sales_dt < :pmEnd THEN " + extLine + " ELSE 0 END) AS pc_ext " +
                "FROM sales_mst s " +
                "LEFT JOIN sales_dtl sd ON sd.company_cd = s.company_cd AND sd.plant_cd = s.plant_cd AND sd.sales_no = s.sales_no " +
                "JOIN departments d ON " + integratedSalesDeptExpr + " = d.dept_cd AND d.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.confirmed = true " +
                "AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                "AND s.sales_dt >= :pyStart AND s.sales_dt < :mEnd" +
                pfS +
                buildDeptExprFilter(integratedSalesDeptExpr, deptCds) + extraDeptFilter +
                " GROUP BY d.dept_nm";

        @SuppressWarnings("unchecked")
        List<Object[]> splitResults = entityManager.createNativeQuery(splitSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("mStart", iMonthStart).setParameter("mEnd", iMonthEnd)
            .setParameter("yStart", iYearStart)
            .setParameter("pmStart", iPrevMonthStart).setParameter("pmEnd", iPrevMonthEnd)
            .setParameter("pyStart", iPrevYearStart)
            .getResultList();
        Map<String, long[]> splitMap = new HashMap<>();
        for (Object[] r : splitResults) {
            if (r[0] == null) continue;
            long[] v = new long[8];
            for (int i = 0; i < 8; i++) v[i] = r[i + 1] != null ? ((Number) r[i + 1]).longValue() : 0L;
            splitMap.put((String) r[0], v);
        }

        Map<String, GoalBreakdown> goalMap = prorateMonthlyGoals(goalResults, year, startDate, endDate);
        Map<String, GoalBreakdown> cumGoalMap = prorateMonthlyGoals(cumGoalResults, year, yearStart, endDate);
        // 병합 total 1결과 → 실적/누적/전년/전년누적 4개 맵. (GROUP BY dept_nm 이라 dept당 1행)
        Map<String, Long> actualMap = new HashMap<>();
        Map<String, Long> cumActualMap = new HashMap<>();
        Map<String, Long> prevMap = new HashMap<>();
        Map<String, Long> prevCumMap = new HashMap<>();
        for (Object[] r : totalResults) {
            if (r[0] == null) continue;
            String dept = (String) r[0];
            actualMap.merge(dept, r[1] != null ? ((Number) r[1]).longValue() : 0L, Long::sum);
            cumActualMap.merge(dept, r[2] != null ? ((Number) r[2]).longValue() : 0L, Long::sum);
            prevMap.merge(dept, r[3] != null ? ((Number) r[3]).longValue() : 0L, Long::sum);
            prevCumMap.merge(dept, r[4] != null ? ((Number) r[4]).longValue() : 0L, Long::sum);
        }

        Set<String> allParts = new LinkedHashSet<>();
        allParts.addAll(goalMap.keySet());
        allParts.addAll(actualMap.keySet());
        // 누적실적/전년/전년누적/내외부split 부서까지 모두 포함 —
        // 목표 미입력 + 당월매출 없이 '누적매출만' 있는 부서(예: 그래픽스사업본부_직속 9944)가
        // 누적실적 합계(totalCumActual)에서 누락되던 버그 수정.
        allParts.addAll(cumActualMap.keySet());
        allParts.addAll(prevMap.keySet());
        allParts.addAll(prevCumMap.keySet());
        allParts.addAll(splitMap.keySet());

        List<IntegratedDashboardDto.IntegratedRow> rows = new ArrayList<>();

        // ?뚰듃蹂???(item)
        long totalMonthGoal = 0, totalInnerMonthGoal = 0, totalOuterMonthGoal = 0;
        long totalMonthActual = 0, totalInnerMonthActual = 0, totalOuterMonthActual = 0;
        long totalCumGoal = 0, totalInnerCumGoal = 0, totalOuterCumGoal = 0;
        long totalCumActual = 0, totalInnerCumActual = 0, totalOuterCumActual = 0;
        long totalPrev = 0, totalInnerPrev = 0, totalOuterPrev = 0;
        long totalPrevCum = 0, totalInnerPrevCum = 0, totalOuterPrevCum = 0;
        for (String part : allParts) {
            GoalBreakdown monthGoal = goalMap.getOrDefault(part, GoalBreakdown.ZERO);
            GoalBreakdown cumulativeGoal = cumGoalMap.getOrDefault(part, GoalBreakdown.ZERO);
            long mGoal = monthGoal.total();
            long innerMGoal = monthGoal.inner();
            long outerMGoal = monthGoal.outer();
            long mActual = actualMap.getOrDefault(part, 0L);
            long cGoal = cumulativeGoal.total();
            long innerCGoal = cumulativeGoal.inner();
            long outerCGoal = cumulativeGoal.outer();
            long cActual = cumActualMap.getOrDefault(part, 0L);
            long prev = prevMap.getOrDefault(part, 0L);
            long prevCum = prevCumMap.getOrDefault(part, 0L);
            // 내부/외부 실적 split. 외부 = sales_dtl 기준(매출목록 외부규칙), [_,m_ext,_,c_ext,_,p_ext,_,pc_ext]
            // 내부 = 총실적 − 외부 로 유도한다 → 항상 (내부 + 외부 = 총실적) 보장.
            //   dtl 없는 매출(엑셀/레거시)은 외부=0 이므로 전액 내부로 귀속되어 합이 어긋나지 않는다.
            long[] sp = splitMap.getOrDefault(part, new long[8]);
            long mExt = sp[1], cExt = sp[3], pExt = sp[5], pcExt = sp[7];
            long mInt = Math.max(0L, mActual - mExt);
            long cInt = Math.max(0L, cActual - cExt);
            long pInt = Math.max(0L, prev - pExt);
            long pcInt = Math.max(0L, prevCum - pcExt);

            totalMonthGoal += mGoal;
            totalInnerMonthGoal += innerMGoal;
            totalOuterMonthGoal += outerMGoal;
            totalMonthActual += mActual;
            totalInnerMonthActual += mInt; totalOuterMonthActual += mExt;
            totalCumGoal += cGoal;
            totalInnerCumGoal += innerCGoal;
            totalOuterCumGoal += outerCGoal;
            totalCumActual += cActual;
            totalInnerCumActual += cInt; totalOuterCumActual += cExt;
            totalPrev += prev;
            totalInnerPrev += pInt; totalOuterPrev += pExt;
            totalPrevCum += prevCum;
            totalInnerPrevCum += pcInt; totalOuterPrevCum += pcExt;

            rows.add(IntegratedDashboardDto.IntegratedRow.builder()
                .orgName(part)
                .rowType("item")
                .monthGoal(mGoal).monthActual(mActual).monthRate(safeRate(mActual, mGoal))
                .cumulativeGoal(cGoal).cumulativeActual(cActual).cumulativeRate(safeRate(cActual, cGoal))
                .cumulativePrevYearActual(prevCum)
                .prevYearActual(prev).yoyRate(safeYoy(mActual, prev)).yoyDiff(mActual - prev)
                // 내부/외부 실적: sales_dtl work_type 기준 split (dtl 없으면 전액 내부)
                .innerMonthGoal(innerMGoal).innerMonthActual(mInt).innerMonthRate(safeRate(mInt, innerMGoal))
                .innerCumulativeGoal(innerCGoal).innerCumulativeActual(cInt).innerCumulativeRate(safeRate(cInt, innerCGoal))
                .innerCumulativePrevYearActual(pcInt)
                .innerPrevYearActual(pInt).innerYoyRate(safeYoy(mInt, pInt))
                .outerMonthGoal(outerMGoal).outerMonthActual(mExt).outerMonthRate(safeRate(mExt, outerMGoal))
                .outerCumulativeGoal(outerCGoal).outerCumulativeActual(cExt).outerCumulativeRate(safeRate(cExt, outerCGoal))
                .outerCumulativePrevYearActual(pcExt)
                .outerPrevYearActual(pExt).outerYoyRate(safeYoy(mExt, pExt))
                .build());
        }

        // 蹂몃? ?⑷퀎 ??(hq)
        rows.add(IntegratedDashboardDto.IntegratedRow.builder()
            .orgName("본부 합")
            .rowType("hq")
            .monthGoal(totalMonthGoal).monthActual(totalMonthActual).monthRate(safeRate(totalMonthActual, totalMonthGoal))
            .cumulativeGoal(totalCumGoal).cumulativeActual(totalCumActual).cumulativeRate(safeRate(totalCumActual, totalCumGoal))
            .cumulativePrevYearActual(totalPrevCum)
            .prevYearActual(totalPrev).yoyRate(safeYoy(totalMonthActual, totalPrev)).yoyDiff(totalMonthActual - totalPrev)
            .innerMonthGoal(totalInnerMonthGoal).innerMonthActual(totalInnerMonthActual).innerMonthRate(safeRate(totalInnerMonthActual, totalInnerMonthGoal))
            .innerCumulativeGoal(totalInnerCumGoal).innerCumulativeActual(totalInnerCumActual).innerCumulativeRate(safeRate(totalInnerCumActual, totalInnerCumGoal))
            .innerCumulativePrevYearActual(totalInnerPrevCum)
            .innerPrevYearActual(totalInnerPrev).innerYoyRate(safeYoy(totalInnerMonthActual, totalInnerPrev))
            .outerMonthGoal(totalOuterMonthGoal).outerMonthActual(totalOuterMonthActual).outerMonthRate(safeRate(totalOuterMonthActual, totalOuterMonthGoal))
            .outerCumulativeGoal(totalOuterCumGoal).outerCumulativeActual(totalOuterCumActual).outerCumulativeRate(safeRate(totalOuterCumActual, totalOuterCumGoal))
            .outerCumulativePrevYearActual(totalOuterPrevCum)
            .outerPrevYearActual(totalOuterPrev).outerYoyRate(safeYoy(totalOuterMonthActual, totalOuterPrev))
            .build());

        // 스코프가 이미 '전체'(role 무제한 + 본부/팀/파트 필터 없음)면 표시 — 프론트가 전체부서용 2번째 호출을 생략.
        boolean scopeAll = deptCds == null && extraDeptFilter.isEmpty();
        return IntegratedDashboardDto.builder().year(year).month(endMonth).rows(rows).scopeAll(scopeAll).build();
    }

    // ============================================================
    // AM蹂?留ㅼ텧紐⑺몴/?ㅼ쟻 (?좉퇋 ?듯빀)
    // ============================================================

    public AmDashboardDto getAmDashboard(java.time.LocalDate startDate, java.time.LocalDate endDate,
            List<String> selectedDeptCds, List<String> salesEmpNos) {

        // 조회기간(startDate~endDate) 기반. 목표(월단위)는 걸친 월을 일수 안분(prorate).
        int year = startDate.getYear();
        int startMonth = startDate.getMonthValue();
        int endMonth = endDate.getMonthValue();

        int goalPlantCd = 2000;
        int planPlantCd = 2000;
        // 데이터분석 AM실적 — MANAGER(영업매니저)만 본인부서(파트)로 제한, PART_LEADER 등은 전체(현행).
        List<Integer> deptCds = mergeAccessibleDeptFilter(roleFilterHelper.getAmDashboardAccessibleDepartmentCds(), selectedDeptCds);
        String salesEmpFilter = buildStringInFilter("u", "employee_no", salesEmpNos);
        String goalSalesEmpFilter = buildStringInFilter("g", "sales_emp_id", salesEmpNos);
        String salesDeptExpr = "COALESCE(s.sales_dept_cd, s.dept_cd)";
        String goalDeptExpr = "CASE WHEN g.dept_cd REGEXP '^[0-9]+$' THEN CAST(g.dept_cd AS UNSIGNED) ELSE NULL END";
        // 주문 연결(plan 2000) 매출 + 주문 없는(엑셀 적재) 매출 모두 포함.
        String planPlantFilter = PLAN_PLANT_FILTER;

        // sales_dt 를 YEAR()/MONTH() 함수로 감싸면 인덱스를 못 타므로 날짜 범위(sargable)로 비교한다.
        java.time.LocalDate monthStart = startDate;                          // 선택기간 시작
        java.time.LocalDate monthEnd = endDate.plusDays(1);                   // 선택기간 종료(exclusive)
        java.time.LocalDate yearStart = java.time.LocalDate.of(year, 1, 1);
        java.time.LocalDate prevMonthStart = startDate.minusYears(1);         // 전년 동기간 시작
        java.time.LocalDate prevMonthEnd = endDate.minusYears(1).plusDays(1); // 전년 동기간 종료(exclusive)

        // role=STAFF 인 영업담당자는 AM 목록에서 제외. (users 미매칭 행은 유지)
        String staffExcludeFilter = " AND (u.role IS NULL OR u.role <> 'STAFF')";

        // ?뱀썡 紐⑺몴
        String goalSql = "SELECT CONCAT(g.sales_emp_id, '@@', g.dept_cd) AS am_dept_key, CAST(g.plan_mm AS SIGNED) AS mm, SUM(g.goal_amt) AS total, " +
                "SUM(COALESCE(g.inner_amt, 0)) AS inner_total, SUM(COALESCE(g.outer_amt, 0)) AS outer_total " +
                "FROM goal_mst g " +
                "LEFT JOIN users u ON g.sales_emp_id = u.employee_no AND u.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) BETWEEN :startMonth AND :endMonth AND g.field_cd = 'AM' " +
                "AND g.sales_emp_id NOT LIKE 'DEPT%'" +
                buildDeptExprFilter(goalDeptExpr, deptCds) + goalSalesEmpFilter + staffExcludeFilter +
                " GROUP BY g.sales_emp_id, g.dept_cd, CAST(g.plan_mm AS SIGNED)";

        @SuppressWarnings("unchecked")
        List<Object[]> goalResults = entityManager.createNativeQuery(goalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", goalPlantCd)
            .setParameter("planYy", String.valueOf(year))
            .setParameter("startMonth", startMonth)
            .setParameter("endMonth", endMonth)
            .getResultList();

        // ?꾩쟻 紐⑺몴
        String cumGoalSql = "SELECT CONCAT(g.sales_emp_id, '@@', g.dept_cd) AS am_dept_key, CAST(g.plan_mm AS SIGNED) AS mm, SUM(g.goal_amt) AS total, " +
                "SUM(COALESCE(g.inner_amt, 0)) AS inner_total, SUM(COALESCE(g.outer_amt, 0)) AS outer_total " +
                "FROM goal_mst g " +
                "LEFT JOIN users u ON g.sales_emp_id = u.employee_no AND u.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND CAST(g.plan_mm AS SIGNED) <= :endMonth AND g.field_cd = 'AM' " +
                "AND g.sales_emp_id NOT LIKE 'DEPT%'" +
                buildDeptExprFilter(goalDeptExpr, deptCds) + goalSalesEmpFilter + staffExcludeFilter +
                " GROUP BY g.sales_emp_id, g.dept_cd, CAST(g.plan_mm AS SIGNED)";

        @SuppressWarnings("unchecked")
        List<Object[]> cumGoalResults = entityManager.createNativeQuery(cumGoalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", goalPlantCd)
            .setParameter("planYy", String.valueOf(year))
            .setParameter("endMonth", endMonth)
            .getResultList();

        // 당월/누적/전년동월 실적을 1개 쿼리로 합쳐 조회한다(조건부 집계).
        //   - 비싼 planPlantFilter(FIND_IN_SET EXISTS)가 3회→1회로 줄어든다.
        //   - 스캔 범위는 [전년동월, 당월말) 중 실제 필요한 두 구간(누적+전년)만 OR 로 한정.
        String salesAggSql = "SELECT CONCAT(s.sales_emp_no, '@@', " + salesDeptExpr + "), " +
                "SUM(CASE WHEN s.sales_dt >= :mStart AND s.sales_dt < :mEnd THEN COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0) ELSE 0 END) AS month_actual, " +
                "SUM(CASE WHEN s.sales_dt >= :yStart AND s.sales_dt < :mEnd THEN COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0) ELSE 0 END) AS cum_actual, " +
                "SUM(CASE WHEN s.sales_dt >= :pStart AND s.sales_dt < :pEnd THEN COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0) ELSE 0 END) AS prev_actual " +
                "FROM sales_mst s " +
                "JOIN users u ON s.sales_emp_no = u.employee_no AND u.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.confirmed = true " +
                "AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                "AND ((s.sales_dt >= :yStart AND s.sales_dt < :mEnd) OR (s.sales_dt >= :pStart AND s.sales_dt < :pEnd))" +
                planPlantFilter +
                buildDeptExprFilter(salesDeptExpr, deptCds) + salesEmpFilter + staffExcludeFilter +
                " GROUP BY s.sales_emp_no, " + salesDeptExpr;

        @SuppressWarnings("unchecked")
        List<Object[]> salesAggResults = entityManager.createNativeQuery(salesAggSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("mStart", monthStart)
            .setParameter("mEnd", monthEnd)
            .setParameter("yStart", yearStart)
            .setParameter("pStart", prevMonthStart)
            .setParameter("pEnd", prevMonthEnd)
            .getResultList();

        Map<String, GoalBreakdown> goalMap = prorateMonthlyGoals(goalResults, year, startDate, endDate);
        Map<String, GoalBreakdown> cumGoalMap = prorateMonthlyGoals(cumGoalResults, year, yearStart, endDate);
        Map<String, Long> actualMap = new HashMap<>();
        Map<String, Long> cumActualMap = new HashMap<>();
        Map<String, Long> prevMap = new HashMap<>();
        for (Object[] row : salesAggResults) {
            if (row[0] == null) continue;
            String amName = row[0].toString();
            actualMap.put(amName, row[1] != null ? ((Number) row[1]).longValue() : 0L);
            cumActualMap.put(amName, row[2] != null ? ((Number) row[2]).longValue() : 0L);
            prevMap.put(amName, row[3] != null ? ((Number) row[3]).longValue() : 0L);
        }

        String intLine = "(CASE WHEN sd.sales_sq IS NULL THEN 0 " +
                "WHEN sd.work_type = 'I' THEN COALESCE(sd.supply_amt,0) - COALESCE(sd.delivery_fee,0) - COALESCE(sd.manual_work_fee,0) " +
                "ELSE COALESCE(sd.design_fee,0) END)";
        String extLine = "(CASE WHEN sd.sales_sq IS NULL THEN 0 " +
                "WHEN sd.work_type = 'I' THEN COALESCE(sd.delivery_fee,0) + COALESCE(sd.manual_work_fee,0) " +
                "ELSE COALESCE(sd.supply_amt,0) - COALESCE(sd.design_fee,0) END)";
        String splitSql = "SELECT CONCAT(s.sales_emp_no, '@@', " + salesDeptExpr + "), " +
                "SUM(CASE WHEN s.sales_dt >= :mStart AND s.sales_dt < :mEnd THEN " + intLine + " ELSE 0 END) AS m_int, " +
                "SUM(CASE WHEN s.sales_dt >= :mStart AND s.sales_dt < :mEnd THEN " + extLine + " ELSE 0 END) AS m_ext, " +
                "SUM(CASE WHEN s.sales_dt >= :yStart AND s.sales_dt < :mEnd THEN " + intLine + " ELSE 0 END) AS c_int, " +
                "SUM(CASE WHEN s.sales_dt >= :yStart AND s.sales_dt < :mEnd THEN " + extLine + " ELSE 0 END) AS c_ext, " +
                "SUM(CASE WHEN s.sales_dt >= :pStart AND s.sales_dt < :pEnd THEN " + intLine + " ELSE 0 END) AS p_int, " +
                "SUM(CASE WHEN s.sales_dt >= :pStart AND s.sales_dt < :pEnd THEN " + extLine + " ELSE 0 END) AS p_ext " +
                "FROM sales_mst s " +
                "LEFT JOIN sales_dtl sd ON sd.company_cd = s.company_cd AND sd.plant_cd = s.plant_cd AND sd.sales_no = s.sales_no " +
                "JOIN users u ON s.sales_emp_no = u.employee_no AND u.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.confirmed = true " +
                "AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +
                "AND ((s.sales_dt >= :yStart AND s.sales_dt < :mEnd) OR (s.sales_dt >= :pStart AND s.sales_dt < :pEnd))" +
                planPlantFilter +
                buildDeptExprFilter(salesDeptExpr, deptCds) + salesEmpFilter + staffExcludeFilter +
                " GROUP BY s.sales_emp_no, " + salesDeptExpr;

        @SuppressWarnings("unchecked")
        List<Object[]> splitResults = entityManager.createNativeQuery(splitSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("mStart", monthStart)
            .setParameter("mEnd", monthEnd)
            .setParameter("yStart", yearStart)
            .setParameter("pStart", prevMonthStart)
            .setParameter("pEnd", prevMonthEnd)
            .getResultList();

        Map<String, long[]> splitMap = new HashMap<>();
        for (Object[] row : splitResults) {
            if (row[0] == null) continue;
            long[] values = new long[6];
            for (int i = 0; i < 6; i++) {
                values[i] = row[i + 1] != null ? ((Number) row[i + 1]).longValue() : 0L;
            }
            splitMap.put(row[0].toString(), values);
        }
        Map<String, String[]> deptHierarchyMap = loadDepartmentHierarchyMap();

        Set<String> allAms = new LinkedHashSet<>();
        allAms.addAll(goalMap.keySet());
        allAms.addAll(cumGoalMap.keySet());
        allAms.addAll(actualMap.keySet());
        // 누적실적/전년/내외부split AM 까지 포함 — 목표 미입력 + 당월매출 없이 '누적매출만' 있는
        // AM(직속 등)이 누적실적 합계(totalCA)에서 누락되던 버그 수정(통합실적과 동일).
        allAms.addAll(cumActualMap.keySet());
        allAms.addAll(prevMap.keySet());
        allAms.addAll(splitMap.keySet());

        List<AmDashboardDto.AmRow> rows = new ArrayList<>();
        long totalMG = 0, totalInnerMG = 0, totalOuterMG = 0;
        long totalMA = 0, totalInnerMA = 0, totalOuterMA = 0;
        long totalCG = 0, totalInnerCG = 0, totalOuterCG = 0;
        long totalCA = 0, totalInnerCA = 0, totalOuterCA = 0;
        long totalP = 0, totalInnerP = 0, totalOuterP = 0;

        for (String am : allAms) {
            GoalBreakdown mGoalBreakdown = goalMap.getOrDefault(am, GoalBreakdown.ZERO);
            GoalBreakdown cGoalBreakdown = cumGoalMap.getOrDefault(am, GoalBreakdown.ZERO);
            long mGoal = mGoalBreakdown.total();
            long innerMGoal = mGoalBreakdown.inner();
            long outerMGoal = mGoalBreakdown.outer();
            long mActual = actualMap.getOrDefault(am, 0L);
            long cGoal = cGoalBreakdown.total();
            long innerCGoal = cGoalBreakdown.inner();
            long outerCGoal = cGoalBreakdown.outer();
            long cActual = cumActualMap.getOrDefault(am, 0L);
            long prev = prevMap.getOrDefault(am, 0L);
            // 내부/외부 실적 split — 통합실적(getIntegratedDashboard)과 100% 동일 방식.
            //   총실적 = sales_mst 공급가(매출목록 기준), 외부 = sales_dtl 외부규칙(work_type='I'→배송+수작업 / 그 외→공급가−디자인비),
            //   내부 = 총실적 − 외부(역산) → 항상 (내부+외부=총실적) 보장. dtl 없는 매출은 외부=0 → 전액 내부.
            //   AM별실적 = 통합실적의 개인(AM) 단위 상세판.
            long[] split = splitMap.getOrDefault(am, new long[6]);
            long mExt = split[1];
            long cExt = split[3];
            long pExt = split[5];
            long mInt = Math.max(0L, mActual - mExt);
            long cInt = Math.max(0L, cActual - cExt);
            long pInt = Math.max(0L, prev - pExt);
            String deptCdKey = extractAmDeptCode(am);
            String[] deptInfo = deptHierarchyMap.getOrDefault(deptCdKey, new String[]{"", ""});
            totalMG += mGoal; totalInnerMG += innerMGoal; totalOuterMG += outerMGoal;
            totalMA += mActual; totalInnerMA += mInt; totalOuterMA += mExt;
            totalCG += cGoal; totalInnerCG += innerCGoal; totalOuterCG += outerCGoal;
            totalCA += cActual; totalInnerCA += cInt; totalOuterCA += cExt;
            totalP += prev; totalInnerP += pInt; totalOuterP += pExt;

            rows.add(AmDashboardDto.AmRow.builder()
                .amName(resolveAmDeptDisplayName(am)).teamName(deptInfo[0]).partName(deptInfo[1]).rowType("item")
                .monthGoal(mGoal).monthActual(mActual).monthRate(safeRate(mActual, mGoal))
                .cumulativeGoal(cGoal).cumulativeActual(cActual).cumulativeRate(safeRate(cActual, cGoal))
                .prevYearActual(prev).yoyRate(safeYoy(mActual, prev)).yoyDiff(mActual - prev)
                .innerMonthGoal(innerMGoal).innerMonthActual(mInt).innerMonthRate(safeRate(mInt, innerMGoal))
                .innerCumulativeGoal(innerCGoal).innerCumulativeActual(cInt).innerCumulativeRate(safeRate(cInt, innerCGoal))
                .innerPrevYearActual(pInt).innerYoyRate(safeYoy(mInt, pInt))
                .outerMonthGoal(outerMGoal).outerMonthActual(mExt).outerMonthRate(safeRate(mExt, outerMGoal))
                .outerCumulativeGoal(outerCGoal).outerCumulativeActual(cExt).outerCumulativeRate(safeRate(cExt, outerCGoal))
                .outerPrevYearActual(pExt).outerYoyRate(safeYoy(mExt, pExt))
                .build());
        }

        rows.add(AmDashboardDto.AmRow.builder()
            .amName("합계").teamName("").partName("").rowType("hq")
            .monthGoal(totalMG).monthActual(totalMA).monthRate(safeRate(totalMA, totalMG))
            .cumulativeGoal(totalCG).cumulativeActual(totalCA).cumulativeRate(safeRate(totalCA, totalCG))
            .prevYearActual(totalP).yoyRate(safeYoy(totalMA, totalP)).yoyDiff(totalMA - totalP)
            .innerMonthGoal(totalInnerMG).innerMonthActual(totalInnerMA).innerMonthRate(safeRate(totalInnerMA, totalInnerMG))
            .innerCumulativeGoal(totalInnerCG).innerCumulativeActual(totalInnerCA).innerCumulativeRate(safeRate(totalInnerCA, totalInnerCG))
            .innerPrevYearActual(totalInnerP).innerYoyRate(safeYoy(totalInnerMA, totalInnerP))
            .outerMonthGoal(totalOuterMG).outerMonthActual(totalOuterMA).outerMonthRate(safeRate(totalOuterMA, totalOuterMG))
            .outerCumulativeGoal(totalOuterCG).outerCumulativeActual(totalOuterCA).outerCumulativeRate(safeRate(totalOuterCA, totalOuterCG))
            .outerPrevYearActual(totalOuterP).outerYoyRate(safeYoy(totalOuterMA, totalOuterP))
            .build());

        return AmDashboardDto.builder().year(year).month(endMonth).rows(rows).build();
    }

    // ============================================================
    // 1. 蹂몃? 諛?? ?덉긽留ㅼ텧 (?섏쐞?명솚)
    // ============================================================

    public TeamForecastDto getTeamForecast(int year, int month) {
        if (oracleStatsRepository.isPresent()) {
            return getTeamForecastFromOracle(year, month);
        }
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String sql = "SELECT d.dept_nm, o.status_cd, SUM(o.total_amt) AS total " +
                "FROM order_mst o " +
                "JOIN departments d ON o.sales_dept_cd = d.dept_cd AND d.company_cd = :companyCd " +
                "WHERE o.company_cd = :companyCd AND o.plant_cd = :plantCd " +
                "AND YEAR(o.received_dt) = :year AND MONTH(o.received_dt) = :month" +
                buildDeptFilter("o", "sales_dept_cd", deptCds) +
                " GROUP BY d.dept_nm, o.status_cd ORDER BY d.dept_nm";

        @SuppressWarnings("unchecked")
        List<Object[]> results = entityManager.createNativeQuery(sql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("year", year)
            .setParameter("month", month)
            .getResultList();

        return buildTeamForecastFromRows(year, month, results, true);
    }

    private TeamForecastDto getTeamForecastFromOracle(int year, int month) {
        List<Object[]> rows = oracleStatsRepository.get().getTeamForecast(year, month);
        return buildTeamForecastFromRows(year, month, rows, false);
    }

    private TeamForecastDto buildTeamForecastFromRows(int year, int month, List<Object[]> rows, boolean isMysql) {
        Map<String, TeamForecastDto.TeamDetail> teamMap = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String deptNm = row[0] != null ? (String) row[0] : "미지정";
            String status = row[1] != null ? (String) row[1] : "";
            long amount = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            TeamForecastDto.TeamDetail detail = teamMap.computeIfAbsent(deptNm,
                k -> TeamForecastDto.TeamDetail.builder().teamName(k).pendingAmount(0L).inProgressAmount(0L).forecastAmount(0L).build());
            boolean isPending = isMysql ? "PENDING".equals(status) : "100".equals(status);
            if (isPending) detail.setPendingAmount(detail.getPendingAmount() + amount);
            else detail.setInProgressAmount(detail.getInProgressAmount() + amount);
            detail.setForecastAmount(detail.getPendingAmount() + detail.getInProgressAmount());
        }
        List<TeamForecastDto.DivisionForecast> divisions = new ArrayList<>();
        for (Map.Entry<String, TeamForecastDto.TeamDetail> entry : teamMap.entrySet()) {
            divisions.add(TeamForecastDto.DivisionForecast.builder()
                .divisionName(entry.getKey()).teams(List.of(entry.getValue())).forecastAmount(entry.getValue().getForecastAmount()).build());
        }
        return TeamForecastDto.builder().year(year).month(month).divisions(divisions).build();
    }

    // ============================================================
    // 2. 蹂몃? 諛?? 留ㅼ텧紐⑺몴/?ㅼ쟻 (?섏쐞?명솚)
    // ============================================================

    public TeamGoalActualDto getTeamGoalActual(int year) {
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String deptGoalFilter = buildDeptFilter("g", "dept_cd", deptCds);

        @SuppressWarnings("unchecked")
        List<Object[]> goalResults = entityManager.createNativeQuery(
                "SELECT d.dept_nm, CAST(g.plan_mm AS SIGNED) AS m, SUM(g.goal_amt) AS total " +
                "FROM goal_mst g JOIN departments d ON g.dept_cd = d.dept_cd AND d.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND g.field_cd = 'PART'" + deptGoalFilter +
                " GROUP BY d.dept_nm, g.plan_mm ORDER BY d.dept_nm, m")
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("planYy", String.valueOf(year))
            .getResultList();

        List<Object[]> actualResults;
        if (oracleStatsRepository.isPresent()) {
            actualResults = oracleStatsRepository.get().getMonthlySalesActualByDept(year);
        } else {
            String deptSalesFilter = buildDeptFilter("s", "dept_cd", deptCds);
            @SuppressWarnings("unchecked")
            List<Object[]> mysqlResults = entityManager.createNativeQuery(
                    "SELECT d.dept_nm, MONTH(s.sales_dt) AS m, SUM(s.total_amt) AS total " +
                    "FROM sales_mst s JOIN departments d ON s.dept_cd = d.dept_cd AND d.company_cd = s.company_cd " +
                    "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                    "AND YEAR(s.sales_dt) = :year AND s.confirmed = true" +
                    " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                    deptSalesFilter +
                    " GROUP BY d.dept_nm, MONTH(s.sales_dt) ORDER BY d.dept_nm, m")
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("year", year)
                .getResultList();
            actualResults = mysqlResults;
        }

        Map<String, long[]> goalMap = new LinkedHashMap<>();
        for (Object[] row : goalResults) {
            String deptNm = (String) row[0];
            int m = ((Number) row[1]).intValue();
            long amount = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            goalMap.computeIfAbsent(deptNm, k -> new long[12]);
            goalMap.get(deptNm)[m - 1] = amount;
        }
        Map<String, long[]> actualMap = new LinkedHashMap<>();
        for (Object[] row : actualResults) {
            String deptNm = (String) row[0];
            int m = ((Number) row[1]).intValue();
            long amount = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            actualMap.computeIfAbsent(deptNm, k -> new long[12]);
            actualMap.get(deptNm)[m - 1] = amount;
        }

        Set<String> allDepts = new LinkedHashSet<>();
        allDepts.addAll(goalMap.keySet());
        allDepts.addAll(actualMap.keySet());

        List<TeamGoalActualDto.DivisionGoalActual> divisionsList = new ArrayList<>();
        for (String deptNm : allDepts) {
            long[] goals = goalMap.getOrDefault(deptNm, new long[12]);
            long[] actuals = actualMap.getOrDefault(deptNm, new long[12]);
            List<TeamGoalActualDto.MonthlyGoalActual> monthly = new ArrayList<>();
            for (int m = 1; m <= 12; m++) {
                long g = goals[m - 1]; long a = actuals[m - 1];
                monthly.add(TeamGoalActualDto.MonthlyGoalActual.builder()
                    .month(m).goal(g).actual(a).rate(safeRate(a, g)).build());
            }
            long totalGoal = Arrays.stream(goals).sum();
            long totalActual = Arrays.stream(actuals).sum();
            divisionsList.add(TeamGoalActualDto.DivisionGoalActual.builder()
                .divisionName(deptNm).monthly(monthly)
                .yearlyGoal(totalGoal).yearlyActual(totalActual).yearlyRate(safeRate(totalActual, totalGoal)).build());
        }
        return TeamGoalActualDto.builder().year(year).divisions(divisionsList).build();
    }

    // ============================================================
    // 3. ?뚰듃蹂??꾨뀈?鍮?(?섏쐞?명솚)
    // ============================================================

    public PartGoalYoyDto getPartGoalActualYoy(int year) {
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String deptGoalFilter = buildDeptFilter("g", "dept_cd", deptCds);
        String deptSalesFilter = buildDeptFilter("s", "dept_cd", deptCds);

        @SuppressWarnings("unchecked")
        List<Object[]> goalResults = entityManager.createNativeQuery(
                "SELECT d.dept_nm, SUM(g.goal_amt) AS total " +
                "FROM goal_mst g JOIN departments d ON g.dept_cd = d.dept_cd AND d.company_cd = g.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND g.field_cd = 'PART'" + deptGoalFilter + " GROUP BY d.dept_nm")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("planYy", String.valueOf(year)).getResultList();

        @SuppressWarnings("unchecked")
        List<Object[]> currentActuals = entityManager.createNativeQuery(
                "SELECT d.dept_nm, SUM(s.total_amt) AS total " +
                "FROM sales_mst s JOIN departments d ON s.dept_cd = d.dept_cd AND d.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND YEAR(s.sales_dt) = :year AND s.confirmed = true" +
                " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                deptSalesFilter + " GROUP BY d.dept_nm")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("year", year).getResultList();

        @SuppressWarnings("unchecked")
        List<Object[]> prevActuals = entityManager.createNativeQuery(
                "SELECT d.dept_nm, SUM(s.total_amt) AS total " +
                "FROM sales_mst s JOIN departments d ON s.dept_cd = d.dept_cd AND d.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND YEAR(s.sales_dt) = :prevYear AND s.confirmed = true" +
                " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                deptSalesFilter + " GROUP BY d.dept_nm")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("prevYear", year - 1).getResultList();

        Map<String, Long> goalByName = toMap(goalResults);
        Map<String, Long> currentByName = toMap(currentActuals);
        Map<String, Long> prevByName = toMap(prevActuals);

        Set<String> allParts = new LinkedHashSet<>();
        allParts.addAll(goalByName.keySet());
        allParts.addAll(currentByName.keySet());

        List<PartGoalYoyDto.PartYoyRow> parts = new ArrayList<>();
        for (String part : allParts) {
            long goal = goalByName.getOrDefault(part, 0L);
            long current = currentByName.getOrDefault(part, 0L);
            long prev = prevByName.getOrDefault(part, 0L);
            parts.add(PartGoalYoyDto.PartYoyRow.builder()
                .partName(part).currentGoal(goal).currentActual(current).prevYearActual(prev)
                .goalRate(safeRate(current, goal))
                .yoyRate(prev > 0 ? Math.round((current - prev) * 1000.0 / prev) / 10.0 : 0)
                .build());
        }
        return PartGoalYoyDto.builder().year(year).parts(parts).build();
    }

    // ============================================================
    // 4. AM ?꾨뀈?鍮?(?섏쐞?명솚)
    // ============================================================

    public AmGoalYoyDto getAmGoalActualYoy(int year) {
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String deptFilter = buildDeptFilter("u", "dept_cd", deptCds);

        @SuppressWarnings("unchecked")
        List<Object[]> goalResults = entityManager.createNativeQuery(
                "SELECT u.name, d.dept_nm, SUM(g.goal_amt) AS total " +
                "FROM goal_mst g " +
                "JOIN users u ON g.sales_emp_id = u.id AND u.company_cd = g.company_cd " +
                "JOIN departments d ON u.dept_cd = d.dept_cd AND d.company_cd = u.company_cd " +
                "WHERE g.company_cd = :companyCd AND g.plant_cd = :plantCd " +
                "AND g.plan_yy = :planYy AND g.field_cd = 'AM'" + deptFilter +
                " GROUP BY u.name, d.dept_nm")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("planYy", String.valueOf(year)).getResultList();

        @SuppressWarnings("unchecked")
        List<Object[]> currentActuals = entityManager.createNativeQuery(
                "SELECT u.name, SUM(s.total_amt) AS total " +
                "FROM sales_mst s JOIN users u ON s.sales_emp_no = u.employee_no AND u.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND YEAR(s.sales_dt) = :year AND s.confirmed = true" +
                " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                deptFilter + " GROUP BY u.name")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("year", year).getResultList();

        @SuppressWarnings("unchecked")
        List<Object[]> prevActuals = entityManager.createNativeQuery(
                "SELECT u.name, SUM(s.total_amt) AS total " +
                "FROM sales_mst s JOIN users u ON s.sales_emp_no = u.employee_no AND u.company_cd = s.company_cd " +
                "WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND YEAR(s.sales_dt) = :prevYear AND s.confirmed = true" +
                " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')" +  // 선매출만 제외. 취소·환불은 음수 역분개라 합산 net
                deptFilter + " GROUP BY u.name")
            .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
            .setParameter("prevYear", year - 1).getResultList();

        Map<String, String> managerDept = new LinkedHashMap<>();
        Map<String, Long> goalMap = new LinkedHashMap<>();
        for (Object[] r : goalResults) {
            String name = (String) r[0];
            managerDept.put(name, (String) r[1]);
            goalMap.put(name, r[2] != null ? ((Number) r[2]).longValue() : 0L);
        }
        Map<String, Long> currentMap = toMap(currentActuals);
        Map<String, Long> prevMap = toMap(prevActuals);

        Set<String> allManagers = new LinkedHashSet<>();
        allManagers.addAll(goalMap.keySet());
        allManagers.addAll(currentMap.keySet());

        List<AmGoalYoyDto.AmYoyRow> managers = new ArrayList<>();
        for (String name : allManagers) {
            long goal = goalMap.getOrDefault(name, 0L);
            long current = currentMap.getOrDefault(name, 0L);
            long prev = prevMap.getOrDefault(name, 0L);
            managers.add(AmGoalYoyDto.AmYoyRow.builder()
                .managerName(name).partName(managerDept.getOrDefault(name, ""))
                .currentGoal(goal).currentActual(current).prevYearActual(prev)
                .goalRate(safeRate(current, goal))
                .yoyRate(prev > 0 ? Math.round((current - prev) * 1000.0 / prev) / 10.0 : 0)
                .build());
        }
        return AmGoalYoyDto.builder().year(year).managers(managers).build();
    }

    // ============================================================
    // 5. ?덈ぉ蹂??ㅼ쟻 (?뺤옣)
    // ============================================================

    public ItemPerformanceDto getItemPerformance(String startDateStr, String endDateStr,
            String categoryType, String itemKeyword, String teamCd, String partCd) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);

        Map<String, String> itemLabelMap = new HashMap<>();
        erpCodeRepository.ifPresent(repo -> {
            try {
                repo.findItemCategories().forEach(m -> itemLabelMap.put(m.get("value"), m.get("label")));
            } catch (Exception e) {
                log.warn("item category label lookup failed: {}", e.getMessage());
            }
        });
        commonCodeService.listActive("ITEM_TYPE")
                .forEach(item -> itemLabelMap.put(item.getCode(), item.getLabel()));

        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String categoryFilter = buildItemCategoryFilter("od", categoryType, itemKeyword, itemLabelMap);
        String salesDeptFilter = buildDeptFilter("sm", "dept_cd", deptCds)
                + buildTeamDeptFilter("sm", "dept_cd", teamCd)
                + buildSingleDeptFilter("sm", "dept_cd", partCd);
        String purchaseDeptFilter = buildDeptFilter("pm", "dept_cd", deptCds)
                + buildTeamDeptFilter("pm", "dept_cd", teamCd)
                + buildSingleDeptFilter("pm", "dept_cd", partCd);

        String salesSql = "SELECT od.work_type AS work_type, " +
                "SUM(CASE WHEN COALESCE(od.payment_amt,0) > 0 " +
                "THEN LEAST(line.sales_amount, od.payment_amt) ELSE line.sales_amount END) AS sales_amount, " +
                "COUNT(*) AS sales_count " +
                "FROM order_dtl od " +
                "JOIN ( " +
                "  SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq, " +
                "  SUM(COALESCE(sd.supply_amt,0)) AS sales_amount " +
                "  FROM sales_dtl sd " +
                "  JOIN sales_mst sm ON sd.company_cd = sm.company_cd AND sd.plant_cd = sm.plant_cd " +
                "  AND sd.sales_no = sm.sales_no " +
                "  WHERE sm.company_cd = :companyCd " +
                "  AND sm.confirmed = true " +
                "  AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL') " +  // 선매출만 제외. 취소(SALES_CANCEL)·환불은 음수 dtl 로 합산돼 net 상쇄됨
                "  AND sm.sales_dt BETWEEN :startDate AND :endDate " +
                salesDeptFilter +
                "  GROUP BY sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq " +
                ") line ON od.company_cd = line.company_cd AND od.plant_cd = line.plant_cd " +
                "AND od.order_no = line.order_no AND od.order_sq = line.order_sq " +
                "WHERE od.work_type IS NOT NULL AND od.work_type <> '' " +
                categoryFilter +
                " GROUP BY od.work_type";

        String purchaseSql = "SELECT od.work_type AS work_type, " +
                "SUM(COALESCE(psd.amt,0)) AS purchase_amount, " +
                "COUNT(DISTINCT psm.pos_no) AS purchase_count " +
                "FROM po_settle_dtl psd " +
                "JOIN po_settle_mst psm ON psd.company_cd = psm.company_cd AND psd.plant_cd = psm.plant_cd " +
                "AND psd.pos_no = psm.pos_no " +
                "JOIN po_mst pm ON psm.company_cd = pm.company_cd AND psm.plant_cd = pm.plant_cd " +
                "AND psm.po_no = pm.po_no " +
                "JOIN order_dtl od ON pm.company_cd = od.company_cd AND pm.plant_cd = od.plant_cd " +
                "AND pm.order_no = od.order_no AND pm.order_sq = od.order_sq " +
                "WHERE psm.company_cd = :companyCd " +
                "AND COALESCE(psm.status_cd,'') NOT IN ('DRAFT','UNSETTLED','CANCEL','CANCELED','CANCELLED') " +
                "AND COALESCE(psm.settled_dt, DATE(psm.created_at)) BETWEEN :startDate AND :endDate " +
                "AND od.work_type IS NOT NULL AND od.work_type <> '' " +
                purchaseDeptFilter + categoryFilter +
                " GROUP BY od.work_type";

        Map<String, ItemAgg> aggMap = new LinkedHashMap<>();
        @SuppressWarnings("unchecked")
        List<Object[]> salesRows = entityManager.createNativeQuery(salesSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();
        for (Object[] row : salesRows) {
            String code = row[0] != null ? row[0].toString() : "";
            ItemAgg agg = aggMap.computeIfAbsent(code, k -> new ItemAgg());
            agg.salesAmount = row[1] != null ? ((Number) row[1]).longValue() : 0L;
            agg.count += row[2] != null ? ((Number) row[2]).intValue() : 0;
        }

        @SuppressWarnings("unchecked")
        List<Object[]> purchaseRows = entityManager.createNativeQuery(purchaseSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();
        for (Object[] row : purchaseRows) {
            String code = row[0] != null ? row[0].toString() : "";
            ItemAgg agg = aggMap.get(code);
            if (agg == null) continue;
            agg.purchaseAmount = row[1] != null ? ((Number) row[1]).longValue() : 0L;
        }

        long grandTotal = aggMap.values().stream().mapToLong(a -> a.salesAmount).sum();
        List<ItemPerformanceDto.CategoryPerformance> categories = aggMap.entrySet().stream()
            .map(entry -> {
                String code = entry.getKey();
                ItemAgg agg = entry.getValue();
                long margin = agg.salesAmount - agg.purchaseAmount;
                double marginRate = agg.salesAmount > 0
                    ? Math.round(margin * 1000.0 / agg.salesAmount) / 10.0
                    : 0.0;
                return ItemPerformanceDto.CategoryPerformance.builder()
                    .category(code)
                    .categoryLabel(itemLabelMap.getOrDefault(code, code))
                    .categoryCode(code)
                    .classification("")
                    .totalAmount(agg.salesAmount)
                    .costAmount(agg.purchaseAmount)
                    .marginAmount(margin)
                    .marginRate(marginRate)
                    .orderCount(agg.count)
                    .shareRate(grandTotal > 0 ? Math.round(agg.salesAmount * 1000.0 / grandTotal) / 10.0 : 0.0)
                    .topVendor("")
                    .build();
            })
            .sorted(Comparator.comparing(ItemPerformanceDto.CategoryPerformance::getTotalAmount).reversed())
            .toList();

        return ItemPerformanceDto.builder().categories(categories).grandTotal(grandTotal).build();
    }

    private String buildItemCategoryFilter(String alias, String categoryType, String itemKeyword, Map<String, String> labelMap) {
        List<String> conditions = new ArrayList<>();
        if (categoryType != null && !categoryType.isBlank()) {
            conditions.add(alias + ".work_type = '" + categoryType.replace("'", "''") + "'");
        }
        if (itemKeyword != null && !itemKeyword.isBlank()) {
            String kw = itemKeyword.replace("'", "''").toLowerCase();
            List<String> matchedCodes = labelMap.entrySet().stream()
                .filter(e -> e.getKey().toLowerCase().contains(kw) || e.getValue().toLowerCase().contains(kw))
                .map(e -> "'" + e.getKey().replace("'", "''") + "'")
                .toList();
            if (matchedCodes.isEmpty()) {
                conditions.add("LOWER(" + alias + ".work_type) LIKE '%" + kw + "%' ");
            } else {
                conditions.add(alias + ".work_type IN (" + String.join(",", matchedCodes) + ")");
            }
        }
        return conditions.isEmpty() ? "" : " AND " + String.join(" AND ", conditions);
    }

    private static class ItemAgg {
        long salesAmount;
        long purchaseAmount;
        int count;
    }

    /**
     * 파트별 부대비용 실적.
     * 디자인(S003)·P&D(S001) 작업만 작업금액(소계-할인)을 해당 파트에 귀속하고,
     * 모든 작업의 배송비/디자인비/수작업비는 각각 배송/디자인/P&D 파트에 귀속한다.
     * 확정 매출의 실제 판매 비율만큼 안분하여 부분매출·취소를 중복 집계하지 않는다.
     */
    public ItemPartPerformanceDto getItemPartPerformance(String startDateStr, String endDateStr,
            String categoryType, String teamCd, String partCd) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);

        Map<String, String> itemLabelMap = new HashMap<>();
        erpCodeRepository.ifPresent(repo -> {
            try {
                repo.findItemCategories().forEach(m -> itemLabelMap.put(m.get("value"), m.get("label")));
            } catch (Exception e) {
                log.warn("item category label lookup failed: {}", e.getMessage());
            }
        });

        String categoryFilter = buildItemCategoryFilter("od", categoryType, null, itemLabelMap);
        String deptFilter = buildTeamDeptFilter("sm", "dept_cd", teamCd)
                + buildSingleDeptFilter("sm", "dept_cd", partCd);

        String sql = """
            SELECT x.work_type, x.part_code,
                   ROUND(SUM(x.amount * x.sold_ratio)) AS amount,
                   COUNT(DISTINCT CONCAT(x.order_no, '#', x.order_sq)) AS order_count
              FROM (
                    SELECT od.work_type, od.order_no, od.order_sq,
                           CASE WHEN od.wrk_cd = 'S003' THEN 'DESIGN' ELSE 'PND' END AS part_code,
                           GREATEST(COALESCE(od.work_amt,0) - COALESCE(od.discount,0), 0) AS amount,
                           line.sold_ratio
                      FROM order_dtl od
                      JOIN (
                            SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                                   CASE
                                     WHEN COALESCE(od2.payment_amt,0) > 0
                                       THEN LEAST(1.0, GREATEST(0.0,
                                            SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt))
                                     ELSE 1.0
                                   END AS sold_ratio
                              FROM sales_dtl sd
                              JOIN sales_mst sm
                                ON sd.company_cd = sm.company_cd
                               AND sd.plant_cd = sm.plant_cd
                               AND sd.sales_no = sm.sales_no
                              JOIN order_dtl od2
                                ON sd.company_cd = od2.company_cd
                               AND sd.plant_cd = od2.plant_cd
                               AND sd.order_no = od2.order_no
                               AND sd.order_sq = od2.order_sq
                             WHERE sm.company_cd = :companyCd
                               AND sm.confirmed = true
                               AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL')
                               AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
                             GROUP BY sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                                      od2.payment_amt
                           ) line
                        ON od.company_cd = line.company_cd
                       AND od.plant_cd = line.plant_cd
                       AND od.order_no = line.order_no
                       AND od.order_sq = line.order_sq
                     WHERE od.work_type IS NOT NULL AND od.work_type <> ''
                       AND od.wrk_cd IN ('S001','S003')
            """ + categoryFilter + """
                    UNION ALL
                    SELECT od.work_type, od.order_no, od.order_sq, 'DELIVERY',
                           COALESCE(od.delivery_fee,0), line.sold_ratio
                      FROM order_dtl od
                      JOIN (
                            SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                                   CASE WHEN COALESCE(od2.payment_amt,0) > 0
                                     THEN LEAST(1.0, GREATEST(0.0,
                                          SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt))
                                     ELSE 1.0 END AS sold_ratio
                              FROM sales_dtl sd
                              JOIN sales_mst sm ON sd.company_cd=sm.company_cd AND sd.plant_cd=sm.plant_cd AND sd.sales_no=sm.sales_no
                              JOIN order_dtl od2 ON sd.company_cd=od2.company_cd AND sd.plant_cd=od2.plant_cd
                               AND sd.order_no=od2.order_no AND sd.order_sq=od2.order_sq
                             WHERE sm.company_cd=:companyCd AND sm.confirmed=true
                               AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL')
                               AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
                             GROUP BY sd.company_cd,sd.plant_cd,sd.order_no,sd.order_sq,od2.payment_amt
                           ) line ON od.company_cd=line.company_cd AND od.plant_cd=line.plant_cd
                            AND od.order_no=line.order_no AND od.order_sq=line.order_sq
                     WHERE od.work_type IS NOT NULL AND od.work_type <> ''
                       AND COALESCE(od.delivery_fee,0) <> 0
            """ + categoryFilter + """
                    UNION ALL
                    SELECT od.work_type, od.order_no, od.order_sq, 'DESIGN',
                           COALESCE(od.design_fee,0), line.sold_ratio
                      FROM order_dtl od
                      JOIN (
                            SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                                   CASE WHEN COALESCE(od2.payment_amt,0) > 0
                                     THEN LEAST(1.0, GREATEST(0.0,
                                          SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt))
                                     ELSE 1.0 END AS sold_ratio
                              FROM sales_dtl sd
                              JOIN sales_mst sm ON sd.company_cd=sm.company_cd AND sd.plant_cd=sm.plant_cd AND sd.sales_no=sm.sales_no
                              JOIN order_dtl od2 ON sd.company_cd=od2.company_cd AND sd.plant_cd=od2.plant_cd
                               AND sd.order_no=od2.order_no AND sd.order_sq=od2.order_sq
                             WHERE sm.company_cd=:companyCd AND sm.confirmed=true
                               AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL')
                               AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
                             GROUP BY sd.company_cd,sd.plant_cd,sd.order_no,sd.order_sq,od2.payment_amt
                           ) line ON od.company_cd=line.company_cd AND od.plant_cd=line.plant_cd
                            AND od.order_no=line.order_no AND od.order_sq=line.order_sq
                     WHERE od.work_type IS NOT NULL AND od.work_type <> ''
                       AND COALESCE(od.design_fee,0) <> 0
            """ + categoryFilter + """
                    UNION ALL
                    SELECT od.work_type, od.order_no, od.order_sq, 'PND',
                           COALESCE(od.manual_work_fee,0), line.sold_ratio
                      FROM order_dtl od
                      JOIN (
                            SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                                   CASE WHEN COALESCE(od2.payment_amt,0) > 0
                                     THEN LEAST(1.0, GREATEST(0.0,
                                          SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt))
                                     ELSE 1.0 END AS sold_ratio
                              FROM sales_dtl sd
                              JOIN sales_mst sm ON sd.company_cd=sm.company_cd AND sd.plant_cd=sm.plant_cd AND sd.sales_no=sm.sales_no
                              JOIN order_dtl od2 ON sd.company_cd=od2.company_cd AND sd.plant_cd=od2.plant_cd
                               AND sd.order_no=od2.order_no AND sd.order_sq=od2.order_sq
                             WHERE sm.company_cd=:companyCd AND sm.confirmed=true
                               AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL')
                               AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
                             GROUP BY sd.company_cd,sd.plant_cd,sd.order_no,sd.order_sq,od2.payment_amt
                           ) line ON od.company_cd=line.company_cd AND od.plant_cd=line.plant_cd
                            AND od.order_no=line.order_no AND od.order_sq=line.order_sq
                     WHERE od.work_type IS NOT NULL AND od.work_type <> ''
                       AND COALESCE(od.manual_work_fee,0) <> 0
            """ + categoryFilter + """
                   ) x
             GROUP BY x.work_type, x.part_code
             ORDER BY amount DESC, x.work_type, x.part_code
            """;

        @SuppressWarnings("unchecked")
        List<Object[]> result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();

        long grandTotal = result.stream()
                .mapToLong(r -> r[2] != null ? ((Number) r[2]).longValue() : 0L)
                .sum();
        Map<String, String> partLabels = Map.of(
                "DESIGN", "디자인", "PND", "P&D", "DELIVERY", "배송비");
        List<ItemPartPerformanceDto.Row> rows = result.stream().map(r -> {
            String itemCode = r[0] != null ? r[0].toString() : "";
            String partCode = r[1] != null ? r[1].toString() : "";
            long amount = r[2] != null ? ((Number) r[2]).longValue() : 0L;
            return ItemPartPerformanceDto.Row.builder()
                    .itemCode(itemCode)
                    .itemLabel(itemLabelMap.getOrDefault(itemCode, itemCode))
                    .partCode(partCode)
                    .partLabel(partLabels.getOrDefault(partCode, partCode))
                    .amount(amount)
                    .orderCount(r[3] != null ? ((Number) r[3]).intValue() : 0)
                    .shareRate(grandTotal != 0
                            ? Math.round(amount * 1000.0 / grandTotal) / 10.0 : 0.0)
                    .build();
        }).toList();
        return ItemPartPerformanceDto.builder().rows(rows).grandTotal(grandTotal).build();
    }

    /**
     * 매출 영업부서별 디자인/수작업/배송 실적.
     * 디자인 = 디자인 작업처(S003)의 소계 + 전체 작업의 디자인비
     * 수작업 = P&D 작업처(S001)의 소계 + 전체 작업의 수작업비
     * 배송 = 전체 작업의 배송비
     * 그 밖의 작업처 소계는 집계하지 않는다.
     */
    public ItemPartPerformanceDto getDepartmentPartPerformance(String startDateStr, String endDateStr,
            String teamCd, String partCd) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);
        String deptFilter = buildTeamDeptFilter("sm", "dept_cd", teamCd)
                + buildSingleDeptFilter("sm", "dept_cd", partCd);

        String sql = """
            SELECT CAST(line.dept_cd AS CHAR) AS dept_cd,
                   ROUND(SUM((CASE WHEN od.wrk_cd = 'S003' THEN COALESCE(od.work_amt,0) ELSE 0 END
                              + COALESCE(od.design_fee,0)) * line.sold_ratio)) AS design_amount,
                   ROUND(SUM((CASE WHEN od.wrk_cd = 'S001' THEN COALESCE(od.work_amt,0) ELSE 0 END
                              + COALESCE(od.manual_work_fee,0)) * line.sold_ratio)) AS manual_amount,
                   ROUND(SUM(COALESCE(od.delivery_fee,0) * line.sold_ratio)) AS delivery_amount,
                   COUNT(DISTINCT CASE
                       WHEN (od.wrk_cd = 'S003' AND COALESCE(od.work_amt,0) <> 0)
                         OR COALESCE(od.design_fee,0) <> 0
                       THEN line.sales_no END) AS design_count,
                   COUNT(DISTINCT CASE
                       WHEN (od.wrk_cd = 'S001' AND COALESCE(od.work_amt,0) <> 0)
                         OR COALESCE(od.manual_work_fee,0) <> 0
                       THEN line.sales_no END) AS manual_count,
                   COUNT(DISTINCT CASE WHEN COALESCE(od.delivery_fee,0) <> 0
                       THEN line.sales_no END) AS delivery_count,
                   COUNT(DISTINCT CASE
                       WHEN (od.wrk_cd = 'S003' AND COALESCE(od.work_amt,0) <> 0)
                         OR (od.wrk_cd = 'S001' AND COALESCE(od.work_amt,0) <> 0)
                         OR COALESCE(od.design_fee,0) <> 0
                         OR COALESCE(od.manual_work_fee,0) <> 0
                         OR COALESCE(od.delivery_fee,0) <> 0
                       THEN line.sales_no END) AS extra_cost_sales_count
              FROM order_dtl od
              JOIN (
                    SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                           sm.sales_no, sm.dept_cd,
                           CASE
                             WHEN COALESCE(od2.payment_amt,0) > 0
                               THEN LEAST(1.0, SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt)
                             ELSE 1.0
                           END AS sold_ratio
                      FROM sales_dtl sd
                      JOIN sales_mst sm
                        ON sd.company_cd = sm.company_cd
                       AND sd.plant_cd = sm.plant_cd
                       AND sd.sales_no = sm.sales_no
                      JOIN order_dtl od2
                        ON sd.company_cd = od2.company_cd
                       AND sd.plant_cd = od2.plant_cd
                       AND sd.order_no = od2.order_no
                       AND sd.order_sq = od2.order_sq
                     WHERE sm.company_cd = :companyCd
                       AND sm.confirmed = true
                       AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                       AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
                     GROUP BY sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq,
                              sm.sales_no, sm.dept_cd, od2.payment_amt
                   ) line
                ON od.company_cd = line.company_cd
               AND od.plant_cd = line.plant_cd
               AND od.order_no = line.order_no
               AND od.order_sq = line.order_sq
             GROUP BY line.dept_cd
            """;

        @SuppressWarnings("unchecked")
        List<Object[]> componentRows = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();

        String totalCountSql = """
            SELECT CAST(sm.dept_cd AS CHAR) AS dept_cd,
                   COUNT(DISTINCT sm.sales_no) AS total_sales_count
              FROM sales_mst sm
             WHERE sm.company_cd = :companyCd
               AND sm.confirmed = true
               AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
               AND sm.sales_dt BETWEEN :startDate AND :endDate
            """ + deptFilter + """
             GROUP BY sm.dept_cd
            """;
        @SuppressWarnings("unchecked")
        List<Object[]> totalCountRows = entityManager.createNativeQuery(totalCountSql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();

        Map<String, ItemPartPerformanceDto.Row> byDept = new LinkedHashMap<>();
        for (Object[] r : totalCountRows) {
            String deptCd = r[0] != null ? r[0].toString() : "";
            byDept.put(deptCd, ItemPartPerformanceDto.Row.builder()
                    .departmentCd(deptCd)
                    .designAmount(0L)
                    .manualWorkAmount(0L)
                    .deliveryAmount(0L)
                    .totalAmount(0L)
                    .totalSalesCount(r[1] != null ? ((Number) r[1]).intValue() : 0)
                    .noExtraCostCount(r[1] != null ? ((Number) r[1]).intValue() : 0)
                    .designCount(0)
                    .manualWorkCount(0)
                    .deliveryCount(0)
                    .orderCount(0)
                    .build());
        }
        for (Object[] r : componentRows) {
            String deptCd = r[0] != null ? r[0].toString() : "";
            long design = r[1] != null ? ((Number) r[1]).longValue() : 0L;
            long manual = r[2] != null ? ((Number) r[2]).longValue() : 0L;
            long delivery = r[3] != null ? ((Number) r[3]).longValue() : 0L;
            ItemPartPerformanceDto.Row row = byDept.computeIfAbsent(deptCd,
                    k -> ItemPartPerformanceDto.Row.builder()
                            .departmentCd(k).totalSalesCount(0).build());
            row.setDesignAmount(design);
            row.setManualWorkAmount(manual);
            row.setDeliveryAmount(delivery);
            row.setTotalAmount(design + manual + delivery);
            row.setDesignCount(r[4] != null ? ((Number) r[4]).intValue() : 0);
            row.setManualWorkCount(r[5] != null ? ((Number) r[5]).intValue() : 0);
            row.setDeliveryCount(r[6] != null ? ((Number) r[6]).intValue() : 0);
            int extraCostSalesCount = r[7] != null ? ((Number) r[7]).intValue() : 0;
            row.setNoExtraCostCount(Math.max(0, row.getTotalSalesCount() - extraCostSalesCount));
            row.setOrderCount(row.getTotalSalesCount());
        }
        List<ItemPartPerformanceDto.Row> rows = byDept.values().stream()
                .sorted(Comparator.comparing(
                        (ItemPartPerformanceDto.Row r) ->
                                r.getTotalAmount() != null ? r.getTotalAmount() : 0L).reversed())
                .toList();
        long grandTotal = rows.stream()
                .mapToLong(r -> r.getTotalAmount() != null ? r.getTotalAmount() : 0L)
                .sum();
        return ItemPartPerformanceDto.builder().rows(rows).grandTotal(grandTotal).build();
    }

    private static final Map<String, String> CATEGORY_LABEL_MAP;
    static {
        CATEGORY_LABEL_MAP = new HashMap<>();
        // MySQL 臾몄옄??移댄뀒怨좊━ 肄붾뱶 (order_info.category)
        CATEGORY_LABEL_MAP.put("PAPER",     "종이");
        CATEGORY_LABEL_MAP.put("PRINT",     "인쇄");
        CATEGORY_LABEL_MAP.put("FINISHING", "후가공");
        CATEGORY_LABEL_MAP.put("BINDING",   "제본");
        CATEGORY_LABEL_MAP.put("SIGN",      "사인물");
        CATEGORY_LABEL_MAP.put("DISPLAY",   "디스플레이");
        CATEGORY_LABEL_MAP.put("DIGITAL",   "디지털");
        CATEGORY_LABEL_MAP.put("PROMOTION", "판촉물");
        CATEGORY_LABEL_MAP.put("DESIGN",    "디자인");
        // Oracle ITEM_FG 숫자 코드 → 품목명
        CATEGORY_LABEL_MAP.put("100", "인쇄물");
        CATEGORY_LABEL_MAP.put("102", "복사/출력");
        CATEGORY_LABEL_MAP.put("108", "명함");
        CATEGORY_LABEL_MAP.put("200", "일반인쇄");
        CATEGORY_LABEL_MAP.put("201", "디지털인쇄");
        CATEGORY_LABEL_MAP.put("300", "사인물");
        CATEGORY_LABEL_MAP.put("400", "디스플레이");
        CATEGORY_LABEL_MAP.put("401", "판촉물");
        CATEGORY_LABEL_MAP.put("500", "외주");
        CATEGORY_LABEL_MAP.put("900", "기타외주");
        CATEGORY_LABEL_MAP.put("930", "상품구매");
        CATEGORY_LABEL_MAP.put("999", "기타");
    }

    private String getCategoryLabel(String category) {
        if (category == null) return "기타";
        return CATEGORY_LABEL_MAP.getOrDefault(category, category);
    }

    // ============================================================
    // 6. 嫄곕옒泥섎퀎 ?몄＜ 留덉쭊??(?뺤옣)
    // ============================================================

    public VendorMarginDto getVendorMargin(String startDateStr, String endDateStr,
            String vendorKeyword, String teamCd, String partCd, String marginRange, Boolean vatIncluded) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);
        int planPlantCd = 2000;
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String vendorFilter = buildLikeFilter("s", "partner_nm", vendorKeyword);
        String salesDeptExpr = "COALESCE(s.dept_cd, CASE WHEN s.sales_dept_cd REGEXP '^[0-9]+$' THEN CAST(s.sales_dept_cd AS UNSIGNED) ELSE NULL END)";
        String salesDeptGroupExpr = "COALESCE(" + salesDeptExpr + ", 0)";
        String deptFilter = buildDeptExprFilter(salesDeptExpr, deptCds)
                + buildTeamDeptExprFilter(salesDeptExpr, teamCd)
                + buildSingleDeptExprFilter(salesDeptExpr, partCd);
        // VAT 포함: supply_amt + tax_amt (실제 부가세 반영), VAT 제외: supply_amt만
        String externalDetailAmountExpr = Boolean.FALSE.equals(vatIncluded)
                ? "COALESCE(NULLIF(sd_margin.supply_amt,0),sd_margin.total_amt,0)"
                : "COALESCE(NULLIF(sd_margin.total_amt,0),COALESCE(sd_margin.supply_amt,0)+COALESCE(sd_margin.tax_amt,0))";
        // 한 매출번호에 센터/POD 내부생산과 외주 작업이 섞여도 외주 대상 상세금액만 합산한다.
        String salesAmountExpr = "COALESCE((SELECT SUM(" + externalDetailAmountExpr + ") " +
                "FROM sales_dtl sd_margin JOIN order_dtl od_margin " +
                "ON od_margin.company_cd=sd_margin.company_cd AND od_margin.plant_cd=sd_margin.plant_cd " +
                "AND od_margin.order_no=sd_margin.order_no AND od_margin.order_sq=sd_margin.order_sq " +
                "WHERE sd_margin.company_cd=s.company_cd AND sd_margin.plant_cd=s.plant_cd " +
                "AND sd_margin.sales_no=s.sales_no AND " + externalMarginWorkPredicate("od_margin") + "),0)";
        // 외주원가: VAT 포함은 정산 마스터 합계, VAT 제외는 상세 공급가액 합계 기준.
        // po_settle_dtl.tax_amt는 마이그레이션 적용 전 DB에서 없을 수 있어 직접 참조하지 않는다.
        String costAmountExpr = Boolean.FALSE.equals(vatIncluded)
                ? "COALESCE(ps_amt.supply_amt, ps.total_amt, 0)"
                : "COALESCE(ps.total_amt, ps_amt.supply_amt, 0)";
        String psAmtSubquery = "SELECT company_cd, plant_cd, pos_no, " +
                "SUM(COALESCE(amt, 0)) AS supply_amt " +
                "FROM po_settle_dtl GROUP BY company_cd, plant_cd, pos_no";
        String externalSalesExists = " AND EXISTS (" +
                "SELECT 1 FROM sales_dtl sd_ext JOIN order_dtl od_ext " +
                "ON od_ext.company_cd=sd_ext.company_cd AND od_ext.plant_cd=sd_ext.plant_cd " +
                "AND od_ext.order_no=sd_ext.order_no AND od_ext.order_sq=sd_ext.order_sq " +
                "WHERE sd_ext.company_cd=s.company_cd AND sd_ext.plant_cd=s.plant_cd " +
                "AND sd_ext.sales_no=s.sales_no AND " + externalMarginWorkPredicate("od_ext") + ") ";

        // 留ㅼ텧 吏묎퀎 ??named parameter 以묐났 諛⑹?瑜??꾪빐 salesAggSql / costAggSql ??蹂꾨룄 荑쇰━濡??ㅽ뻾 ??Java ?먯꽌 蹂묓빀
        // ?좊ℓ異??먯옣(PRE_SALES)? ?ㅼ젣 留ㅼ텧???꾨땲誘濡??쒖쇅?쒕떎. ?좊ℓ異쒖감媛먯? ?ㅼ젣 留ㅼ텧?깅줉???ы븿.
        // sales_dt 媛 NULL ???덉퐫??誘명솗?????ы븿?섍린 ?꾪빐 created_at ?쇰줈 fallback.
        String salesBaseWhere = " WHERE s.company_cd = :companyCd " +
                // #409 — 매출리스트 기준 통일: 확정 매출만, 매출일자 기준(등록일 폴백 제거).
                "AND s.sales_dt BETWEEN :startDate AND :endDate AND s.confirmed = true " +
                // #405 — 취소(CANCELLED) 원본을 빼지 않는다. 취소 매출(RSL…, 음수)은 그대로 더해지므로 원본까지 빼면
                //   취소 건이 0 이 아니라 음수로 잡혀 매출리스트와 어긋났다(2026-08 시청 -245,000 / 서소문1 -1,079,400).
                //   원본(+)과 취소 매출(-)을 둘 다 세면 상쇄되어 매출리스트와 같은 기준이 된다. 강제취소(FORCE_CANCELLED)는 원래 안 뺐다.
                "AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +
                PLAN_PLANT_FILTER_STRICT + " " +
                externalSalesExists + deptFilter + vendorFilter;
        String salesAggSql =
                "SELECT COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)') AS partner_nm, " +
                salesDeptGroupExpr + " AS dept_cd, " +
                "COALESCE(s.sales_dept_nm, '') AS dept_nm, " +
                "SUM(" + salesAmountExpr + ") AS total_order, COUNT(DISTINCT s.sales_no) AS cnt " +
                "FROM sales_mst s" +
                salesBaseWhere +
                " GROUP BY COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)'), " + salesDeptGroupExpr + ", COALESCE(s.sales_dept_nm, '')";

        @SuppressWarnings("unchecked")
        List<Object[]> salesRows = entityManager.createNativeQuery(salesAggSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();

        // ?몄＜?먭? 吏묎퀎 ??sales 荑쇰━? 蹂꾨룄 ?ㅽ뻾?섏뿬 named parameter ?댁쨷 諛붿씤??諛⑹?
        String costAggSql =
                "SELECT x.partner_nm, x.dept_cd, SUM(x.cost_amt) AS total_outsrc FROM (" +
                "SELECT DISTINCT COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)') AS partner_nm, " +
                salesDeptGroupExpr + " AS dept_cd, ps.pos_no, " + costAmountExpr + " AS cost_amt " +
                "FROM sales_mst s " +
                "JOIN po_settle_mst ps ON ps.company_cd = s.company_cd AND ps.plant_cd = s.plant_cd " +
                "AND ps.order_no IS NOT NULL " + SETTLE_JOIN_ON + " " +
                "JOIN po_mst pm ON pm.company_cd=ps.company_cd AND pm.plant_cd=ps.plant_cd AND pm.po_no=ps.po_no " +
                "JOIN order_dtl od_cost ON od_cost.company_cd=pm.company_cd AND od_cost.plant_cd=pm.plant_cd " +
                "AND od_cost.order_no=pm.order_no AND od_cost.order_sq=pm.order_sq " +
                "LEFT JOIN (" +
                psAmtSubquery +
                ") ps_amt ON ps_amt.company_cd = ps.company_cd AND ps_amt.plant_cd = ps.plant_cd AND ps_amt.pos_no = ps.pos_no" +
                salesBaseWhere +
                " AND COALESCE(ps.status_cd, '') <> 'CANCELLED' AND " + externalMarginWorkPredicate("od_cost") +
                ") x GROUP BY x.partner_nm, x.dept_cd";

        @SuppressWarnings("unchecked")
        List<Object[]> costRows = entityManager.createNativeQuery(costAggSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();

        // (partner_nm + "|" + dept_cd) ??total_outsrc
        Map<String, Long> costMap = new LinkedHashMap<>();
        for (Object[] r : costRows) {
            String key = r[0] + "|" + r[1];
            costMap.put(key, r[2] != null ? ((Number) r[2]).longValue() : 0L);
        }

        // salesRows ? costMap ???⑹궛??理쒖쥌 寃곌낵 援ъ꽦 (ORDER BY total_order DESC)
        salesRows.sort((a, b) -> {
            long va = a[3] != null ? ((Number) a[3]).longValue() : 0L;
            long vb = b[3] != null ? ((Number) b[3]).longValue() : 0L;
            return Long.compare(vb, va);
        });

        // ?꾩썡 留덉쭊??議고쉶 ??留덉갔媛吏濡?sales / cost 荑쇰━ 遺꾨━
        LocalDate prevStart = startDate.minusMonths(1).withDayOfMonth(1);
        LocalDate prevEnd = startDate.minusMonths(1).withDayOfMonth(startDate.minusMonths(1).lengthOfMonth());
        String prevBaseWhere = " WHERE s.company_cd = :companyCd " +
                "AND s.sales_dt BETWEEN :prevStart AND :prevEnd AND s.confirmed = true " +
                "AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +
                PLAN_PLANT_FILTER_STRICT + " " +
                externalSalesExists + deptFilter + vendorFilter;
        String prevSalesAggSql =
                "SELECT COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)') AS partner_nm, " +
                salesDeptGroupExpr + " AS dept_cd, SUM(" + salesAmountExpr + ") AS total_order " +
                "FROM sales_mst s" + prevBaseWhere +
                " GROUP BY COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)'), " + salesDeptGroupExpr;
        String prevCostAggSql =
                "SELECT x.partner_nm, x.dept_cd, SUM(x.cost_amt) AS total_outsrc FROM (" +
                "SELECT DISTINCT COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)') AS partner_nm, " +
                salesDeptGroupExpr + " AS dept_cd, ps.pos_no, " + costAmountExpr + " AS cost_amt " +
                "FROM sales_mst s " +
                "JOIN po_settle_mst ps ON ps.company_cd = s.company_cd AND ps.plant_cd = s.plant_cd " +
                "AND ps.order_no IS NOT NULL " + SETTLE_JOIN_ON + " " +
                "JOIN po_mst pm ON pm.company_cd=ps.company_cd AND pm.plant_cd=ps.plant_cd AND pm.po_no=ps.po_no " +
                "JOIN order_dtl od_cost ON od_cost.company_cd=pm.company_cd AND od_cost.plant_cd=pm.plant_cd " +
                "AND od_cost.order_no=pm.order_no AND od_cost.order_sq=pm.order_sq " +
                "LEFT JOIN (" +
                psAmtSubquery +
                ") ps_amt ON ps_amt.company_cd = ps.company_cd AND ps_amt.plant_cd = ps.plant_cd AND ps_amt.pos_no = ps.pos_no" +
                prevBaseWhere +
                " AND COALESCE(ps.status_cd, '') <> 'CANCELLED' AND " + externalMarginWorkPredicate("od_cost") +
                ") x GROUP BY x.partner_nm, x.dept_cd";

        @SuppressWarnings("unchecked")
        List<Object[]> prevSalesRows = entityManager.createNativeQuery(prevSalesAggSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("prevStart", prevStart)
            .setParameter("prevEnd", prevEnd)
            .getResultList();

        @SuppressWarnings("unchecked")
        List<Object[]> prevCostRows = entityManager.createNativeQuery(prevCostAggSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("prevStart", prevStart)
            .setParameter("prevEnd", prevEnd)
            .getResultList();

        Map<String, Long> prevCostMap = new LinkedHashMap<>();
        for (Object[] r : prevCostRows) {
            prevCostMap.put(r[0] + "|" + r[1], r[2] != null ? ((Number) r[2]).longValue() : 0L);
        }
        // ?꾩썡 留덉쭊?? partner_nm ??margin_rate
        List<Object[]> prevResults = new ArrayList<>();
        for (Object[] r : prevSalesRows) {
            long pOrder = r[2] != null ? ((Number) r[2]).longValue() : 0L;
            long pCost = prevCostMap.getOrDefault(r[0] + "|" + r[1], 0L);
            double pRate = pOrder > 0 ? Math.round((pOrder - pCost) * 1000.0 / pOrder) / 10.0 : 0.0;
            prevResults.add(new Object[]{ r[0], pRate });
        }

        Map<String, Double> prevMarginMap = new LinkedHashMap<>();
        for (Object[] r : prevResults) {
            prevMarginMap.put((String) r[0], r[1] != null ? ((Number) r[1]).doubleValue() : 0.0);
        }

        List<VendorMarginDto.VendorMarginRow> vendors = new ArrayList<>();
        for (Object[] row : salesRows) {
            // salesRows: [0]=partner_nm, [1]=dept_cd(Integer), [2]=dept_nm, [3]=total_order, [4]=cnt
            String vendorName = (String) row[0];
            String deptName = row[2] != null ? (String) row[2] : "";
            long orderAmt = row[3] != null ? ((Number) row[3]).longValue() : 0L;
            String costKey = row[0] + "|" + row[1];
            long outsrcAmt = costMap.getOrDefault(costKey, 0L);
            long margin = orderAmt - outsrcAmt;
            double rate = orderAmt > 0 ? Math.round(margin * 1000.0 / orderAmt) / 10.0 : 0;
            if (marginRange != null && !marginRange.isBlank()) {
                boolean pass = switch (marginRange) {
                    case "high" -> rate >= 30;
                    case "mid" -> rate >= 15 && rate < 30;
                    case "low" -> rate >= 0 && rate < 15;
                    case "loss" -> rate < 0;
                    default -> true;
                };
                if (!pass) continue;
            }
            double prevRate = prevMarginMap.getOrDefault(vendorName, 0.0);
            double change = Math.round((rate - prevRate) * 10.0) / 10.0;

            vendors.add(VendorMarginDto.VendorMarginRow.builder()
                .vendorName(vendorName)
                .departmentName(deptName)
                .orderAmount(orderAmt)
                .outsourcingAmount(outsrcAmt)
                .marginAmount(margin)
                .marginRate(rate)
                .prevMonthMarginRate(prevRate)
                .marginRateChange(change)
                .orderCount(((Number) row[4]).intValue())
                .remark(margin < 0 ? "적자" : "")
                .build());
        }
        return VendorMarginDto.builder().vendors(vendors).build();
    }

    // ============================================================
    // 7. 二쇰Ц嫄대퀎 ?몄＜ 留덉쭊??(?뺤옣)
    // ============================================================

    public OrderMarginDto getOrderMargin(String startDateStr, String endDateStr,
            String orderKeyword, String teamCd, String partCd, String marginRange, Boolean vatIncluded) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);
        int planPlantCd = 2000;
        List<Integer> deptCds = /* 데이터분석은 권한 미적용(전체) */ null;
        String orderFilter = buildOrderMarginFilter(orderKeyword);
        // 담당자 → 팀/파트 필터로 교체 (다른 통계와 동일 형식). 팀=본인+하위파트, 파트=단일부서.
        String deptFilter = buildTeamDeptFilter("o", "sales_dept_cd", teamCd)
                + buildSingleDeptFilter("o", "sales_dept_cd", partCd);

        // 주문건별 화면은 매출일 기준으로 조회한다(매출등록된 주문만 대상). 외주금액은 주문번호별 PO 합계로 붙인다.
        // 매출일 = 해당 순번 매출들의 최초 매출일(MIN). 부분매출(여러 달에 걸쳐 팔림)이면 첫 매출월 기준으로 잡힌다.
        String orderAmtExpr = Boolean.FALSE.equals(vatIncluded)
                ? "COALESCE(sm_agg.supply_amt, od.payment_amt, 0)"
                : "COALESCE(sm_agg.vat_amt, od.payment_amt, 0)";

        // 외주원가도 매출쪽 비례배분(scaleSalesDetailsTo)과 동일 개념 적용:
        // 부분매출이면 판매비율(매출supply / 주문총액)만큼만 원가 반영 → 매출·원가 기준 일치.
        // 전액매출이면 ratio=1(외주원가 전액), 주문금액 0/없음이면 안전하게 ratio=1.
        String soldRatioExpr = "COALESCE(LEAST(1.0, COALESCE(sm_agg.supply_amt, 0) / NULLIF(od.payment_amt, 0)), 1.0)";
        String costBaseExpr = Boolean.FALSE.equals(vatIncluded) ? "p.supply_amt" : "p.vat_amt";
        String costAmtExpr = "ROUND(" + costBaseExpr + " * " + soldRatioExpr + ")";
        String outsourceWorkTypeFilter = " AND " + externalMarginWorkPredicate("od");

        String sql = "SELECT o.order_no, od.order_sq, COALESCE(sm_agg.partner_nm, o.partner_nm, p.partner_nm, '') AS partner_nm, d.dept_nm, u.name AS mgr_name, " +
                "COALESCE(od.work_name, oi.item_name, '') AS work_name, " +
                orderAmtExpr + " AS order_amt, " + costAmtExpr + " AS po_amt, sm_agg.sales_dt AS sales_dt " +
                "FROM order_dtl od " +
                "JOIN order_mst o ON o.company_cd = od.company_cd AND o.plant_cd = od.plant_cd AND o.order_no = od.order_no " +
                "LEFT JOIN (" +
                "SELECT pm.company_cd, pm.plant_cd, pm.order_no, pm.order_sq, " +
                "MAX(COALESCE(psm.partner_nm, pm.partner_nm)) AS partner_nm, " +
                "SUM(COALESCE(psd.amt, 0)) AS supply_amt, " +
                "SUM(COALESCE(psd.amt, 0) + COALESCE(psd.tax_amt, 0)) AS vat_amt " +
                "FROM po_settle_mst psm " +
                "JOIN po_mst pm ON pm.company_cd = psm.company_cd AND pm.plant_cd = psm.plant_cd AND pm.po_no = psm.po_no " +
                "LEFT JOIN po_settle_dtl psd ON psd.company_cd = psm.company_cd AND psd.plant_cd = psm.plant_cd AND psd.pos_no = psm.pos_no " +
                "WHERE psm.company_cd = :companyCd " +
                "AND COALESCE(psm.status_cd, '') IN ('SETTLED', 'CONFIRMED', 'GITGO_SENT', 'GITGO_APPROVED', 'VOUCHER_PENDING', 'VOUCHER_SENT') " +
                "GROUP BY pm.company_cd, pm.plant_cd, pm.order_no, pm.order_sq" +
                ") p ON p.company_cd = od.company_cd AND p.plant_cd = od.plant_cd AND p.order_no = od.order_no AND p.order_sq = od.order_sq " +
                // 매출이 등록된 주문만 노출 — sm_agg(매출 집계)를 INNER JOIN 으로 필수화.
                "JOIN (" +
                "SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq, " +
                "MIN(COALESCE(s.sales_dt, DATE(s.created_at))) AS sales_dt, " +
                "MAX(s.partner_nm) AS partner_nm, " +
                "SUM(COALESCE(NULLIF(sd.supply_amt, 0), sd.total_amt, 0)) AS supply_amt, " +
                "SUM(COALESCE(NULLIF(sd.total_amt, 0), COALESCE(sd.supply_amt, 0) + COALESCE(sd.tax_amt, 0))) AS vat_amt " +
                "FROM sales_dtl sd " +
                "JOIN sales_mst s ON s.company_cd = sd.company_cd AND s.plant_cd = sd.plant_cd AND s.sales_no = sd.sales_no " +
                "WHERE s.company_cd = :companyCd " +
                // #409 — 매출리스트 기준 통일: 확정 매출만.
                "AND s.confirmed = true " +
                // #405 — 취소(CANCELLED) 원본을 빼지 않는다. 취소 매출(RSL…, 음수)은 그대로 더해지므로 원본까지 빼면
                //   취소 건이 0 이 아니라 음수로 잡혀 매출리스트와 어긋났다(2026-08 시청 -245,000 / 서소문1 -1,079,400).
                //   원본(+)과 취소 매출(-)을 둘 다 세면 상쇄되어 매출리스트와 같은 기준이 된다. 강제취소(FORCE_CANCELLED)는 원래 안 뺐다.
                "AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " +
                "AND sd.order_no IS NOT NULL AND sd.order_sq IS NOT NULL " +
                "GROUP BY sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq" +
                ") sm_agg ON sm_agg.company_cd = od.company_cd AND sm_agg.plant_cd = od.plant_cd AND sm_agg.order_no = od.order_no AND sm_agg.order_sq = od.order_sq " +
                " LEFT JOIN departments d ON o.sales_dept_cd = d.dept_cd AND d.company_cd = o.company_cd " +
                "LEFT JOIN users u ON o.sales_emp_no = u.employee_no AND u.company_cd = o.company_cd " +
                "LEFT JOIN order_info oi ON od.order_no = oi.order_no AND od.company_cd = oi.company_cd AND od.plant_cd = oi.plant_cd AND od.order_sq = oi.order_sq AND oi.info_sq = 1 " +
                "WHERE o.company_cd = :companyCd AND o.plan_plant_cd = :planPlantCd " +
                "AND sm_agg.sales_dt BETWEEN :startDate AND :endDate" +
                outsourceWorkTypeFilter +
                buildDeptFilter("o", "sales_dept_cd", deptCds) + orderFilter + deptFilter +
                " ORDER BY sales_dt DESC, o.order_no DESC, od.order_sq ASC";

        @SuppressWarnings("unchecked")
        List<Object[]> results = entityManager.createNativeQuery(sql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .setParameter("planPlantCd", planPlantCd)
            .setParameter("startDate", startDate)
            .setParameter("endDate", endDate)
            .getResultList();

        List<OrderMarginDto.OrderMarginRow> orders = new ArrayList<>();
        for (Object[] row : results) {
            long orderAmt = row[6] != null ? ((Number) row[6]).longValue() : 0L;
            long outsrcAmt = row[7] != null ? ((Number) row[7]).longValue() : 0L;
            long margin = orderAmt - outsrcAmt;
            double rate = orderAmt > 0 ? Math.round(margin * 1000.0 / orderAmt) / 10.0 : 0;

            // 留덉쭊??援ш컙 ?꾪꽣
            if (marginRange != null && !marginRange.isBlank()) {
                boolean pass = switch (marginRange) {
                    case "high" -> rate >= 30;
                    case "mid" -> rate >= 15 && rate < 30;
                    case "low" -> rate >= 0 && rate < 15;
                    case "loss" -> rate < 0;
                    default -> true;
                };
                if (!pass) continue;
            }

            String remark = "";
            if (rate < 0) remark = "적자";
            else if (rate < 10) remark = "저마진";

            String orderNo = (String) row[0];
            Integer orderSq = row[1] != null ? ((Number) row[1]).intValue() : null;
            orders.add(OrderMarginDto.OrderMarginRow.builder()
                .orderNo(orderNo)
                .orderSq(orderSq)
                .orderKey(orderSq != null ? orderNo + "-" + orderSq : orderNo)
                .vendorName(row[2] != null ? (String) row[2] : "")
                .departmentName(row[3] != null ? (String) row[3] : "")
                .managerName(row[4] != null ? (String) row[4] : "")
                .workName(row[5] != null ? (String) row[5] : "")
                .orderAmount(orderAmt)
                .outsourcingAmount(outsrcAmt)
                .marginAmount(margin)
                .marginRate(rate)
                .salesDate(row[8] != null ? row[8].toString() : null)
                .remark(remark)
                .build());
        }
        return OrderMarginDto.builder().orders(orders).build();
    }

    /** GRP 매출과 상품매입/외주/자체 POD 생산비를 주문 작업 단위로 대응한다. */
    public GrpProfitDto getGrpProfit(String startDateStr, String endDateStr, String keyword) {
        LocalDate startDate = LocalDate.parse(startDateStr);
        LocalDate endDate = LocalDate.parse(endDateStr);
        String keywordFilter = buildOrderMarginFilter(keyword);

        String sql = "SELECT MIN(s.sales_dt), COALESCE(MAX(s.sales_dept_nm), MAX(d.dept_nm), ''), " +
                "COALESCE(MAX(u.name), ''), GROUP_CONCAT(DISTINCT sd.sales_no ORDER BY sd.sales_no SEPARATOR ', '), " +
                "COALESCE(MAX(s.sales_title), ''), COALESCE(MAX(s.partner_nm), ''), COALESCE(MAX(o.partner_nm), ''), " +
                // r[9] 작업처 = od.wrk_cd (od.work_type 은 품목구분(ITEM_CD 리졸버)이라 품목코드가 떠서 교체). 아래서 라벨로 변환.
                "sd.order_no, sd.order_sq, COALESCE(MAX(od.wrk_cd), ''), COALESCE(MAX(sd.work_type), ''), " +
                "COALESCE(MAX(oi.item_name), MAX(sd.item_nm), ''), COALESCE(MAX(sd.note), ''), " +
                "SUM(COALESCE(NULLIF(sd.supply_amt, 0), sd.total_amt, 0)), SUM(COALESCE(sd.tax_amt, 0)), " +
                "SUM(COALESCE(NULLIF(sd.total_amt, 0), COALESCE(sd.supply_amt, 0) + COALESCE(sd.tax_amt, 0))), " +
                // 매출타입 = sales_type ?? pay_type (카드/계좌이체/사내실적은 sales_type NULL, pay_type로 구분 — 화면 표시와 동일 기준).
                "COALESCE(NULLIF(MAX(s.sales_type),''), NULLIF(MAX(s.pay_type),''), ''), COALESCE(MAX(o.division), ''), " +
                "COALESCE(MAX(NULLIF(TRIM(od.erp_order_no),'')), MAX(TRIM(o.erp_order_no))), " +
                "COALESCE(MAX(od.erp_order_sq), MAX(od.order_sq)), " +
                // r[20] 취소가 아닌 매출 건수 — 0 이면 이 줄은 취소매출(R…)만 있는 줄.
                "SUM(CASE WHEN COALESCE(s.sales_type,'')='SALES_CANCEL' THEN 0 ELSE 1 END) " +
                "FROM sales_dtl sd " +
                "JOIN sales_mst s ON s.company_cd=sd.company_cd AND s.plant_cd=sd.plant_cd AND s.sales_no=sd.sales_no " +
                "JOIN order_mst o ON o.company_cd=sd.company_cd AND o.plant_cd=sd.plant_cd AND o.order_no=sd.order_no " +
                "JOIN order_dtl od ON od.company_cd=sd.company_cd AND od.plant_cd=sd.plant_cd AND od.order_no=sd.order_no AND od.order_sq=sd.order_sq " +
                "LEFT JOIN order_info oi ON oi.company_cd=od.company_cd AND oi.plant_cd=od.plant_cd AND oi.order_no=od.order_no AND oi.order_sq=od.order_sq AND oi.info_sq=1 " +
                "LEFT JOIN departments d ON d.company_cd=o.company_cd AND d.dept_cd=o.sales_dept_cd " +
                "LEFT JOIN users u ON u.company_cd=o.company_cd AND u.employee_no=o.sales_emp_no " +
                "WHERE s.company_cd=:companyCd AND s.sales_dt BETWEEN :startDate AND :endDate " +
                // #409 — 매출리스트 기준 통일: 확정 매출만.
                "AND s.confirmed = true " +
                // #405 — 취소(CANCELLED) 원본을 빼지 않는다. 취소 매출(RSL…, 음수)은 그대로 더해지므로 원본까지 빼면
                //   취소 건이 0 이 아니라 음수로 잡혀 매출리스트와 어긋났다(2026-08 시청 -245,000 / 서소문1 -1,079,400).
                //   원본(+)과 취소 매출(-)을 둘 다 세면 상쇄되어 매출리스트와 같은 기준이 된다. 강제취소(FORCE_CANCELLED)는 원래 안 뺐다.
                "AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL') " +
                "AND sd.order_no IS NOT NULL AND sd.order_sq IS NOT NULL " +
                // #406/#409 — 그래픽스 본부 한정 조건 제거(2026-09-09, 현업 요청). 전임개발자가 메뉴 신설 시 넣은 것으로
                //   기획 근거 없음. 타본부(지마켓·차이나·한솔 등) 주문도 매입·정산 구조가 같아 전 본부를 포함, 매출리스트 합계와 맞춘다.
                //   메뉴명 'GRP수익비용대응'은 현업 요청으로 유지.
                keywordFilter +
                " GROUP BY sd.order_no, sd.order_sq ORDER BY MIN(s.sales_dt) DESC, sd.order_no DESC, sd.order_sq";

        @SuppressWarnings("unchecked")
        List<Object[]> salesRows = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();

        Map<String, long[]> poCosts = loadGrpPoCosts();
        Map<String, String> accountingDates = loadGrpAccountingDates();
        Map<String, Long> podCosts = loadPodProductionCosts(startDate, endDate);
        // 작업처(od.wrk_cd) → 라벨 맵(ERP 작업처 코드맵 = OutsourcingPoPage workPlaceMap 과 동일 소스). Oracle 없으면 코드 그대로 표시.
        Map<String, String> wrkNmMap = new HashMap<>();
        erpCodeRepository.ifPresent(repo -> {
            try { repo.findWorkTypes(true).forEach(m -> wrkNmMap.put(m.get("value"), m.get("label"))); }
            catch (Exception e) { log.warn("작업처 라벨 조회 실패(코드 그대로 표시): {}", e.getMessage()); }
        });
        List<GrpProfitDto.Row> rows = new ArrayList<>();
        for (Object[] r : salesRows) {
            String orderNo = Objects.toString(r[7], "");
            int orderSq = r[8] == null ? 0 : ((Number) r[8]).intValue();
            long[] po = poCosts.getOrDefault(orderNo + "#" + orderSq, new long[2]);
            String erpOrderNo = Objects.toString(r[18], orderNo).trim();
            int erpOrderSq = r[19] == null ? orderSq : ((Number) r[19]).intValue();
            // 내부생산비는 이 줄의 작업처가 센터/POD(내부생산)일 때만 붙인다.
            //   복사주문(POD외주 G0602 / P&D S001 / 전체외주 G0600)도 원주문과 같은 ERP 번호·순번을 갖고 있어,
            //   ERP 키로만 찾으면 같은 내부생산비가 복사주문 줄마다 반복 가산됐다(2026-08 토스페이 건 53,200원 × 3줄).
            String lineWorkPlace = Objects.toString(r[9], "").trim().toUpperCase();
            long pod = GRP_INTERNAL_WORK_PLACES.contains(lineWorkPlace)
                    ? podCosts.getOrDefault(erpOrderNo + "#" + erpOrderSq, 0L) : 0L;
            // 취소매출(R…)만 있는 줄에는 매입을 붙이지 않는다 (2026-09-10, 백미연 요청).
            //   매입은 주문 순번에 붙어 있어, 원매출과 취소가 다른 달이면(8월 매출을 9월 날짜로 취소) 원매출 줄과
            //   취소 줄 양쪽에 같은 매입이 반복됐다. 원매출과 취소가 같은 조회기간에 있으면 한 줄로 합쳐져
            //   (취소 아닌 매출 건수 > 0) 종전대로 매입이 한 번 붙는다.
            boolean cancelOnly = number(r[20]) == 0;
            if (cancelOnly) { po = new long[2]; pod = 0L; }
            long supply = number(r[13]);
            long tax = number(r[14]);
            long total = number(r[15]);
            long purchaseTotal = po[0] + po[1] + pod;
            long grossProfit = supply - purchaseTotal;
            double marginRate = supply == 0 ? 0 : Math.round(grossProfit * 1000.0 / supply) / 10.0;
            // 작업처(od.wrk_cd) 라벨화, 사업본부매출구분(division) 은 공통코드 DIVISION 그룹으로 명칭 변환. 없으면 코드 그대로.
            String workPlaceLabel = wrkNmMap.getOrDefault(Objects.toString(r[9], ""), Objects.toString(r[9], ""));
            String divisionCode = Objects.toString(r[17], "");
            String divisionLabel = divisionCode.isBlank() ? ""
                    : Optional.ofNullable(commonCodeService.resolveLabel("DIVISION", divisionCode)).orElse(divisionCode);
            String accountingDate = cancelOnly ? "" : accountingDates.getOrDefault(orderNo + "#" + orderSq, "");
            rows.add(GrpProfitDto.Row.builder()
                    .salesDate(r[0] == null ? null : r[0].toString()).departmentName(Objects.toString(r[1], ""))
                    .salesEmployeeName(Objects.toString(r[2], "")).salesNo(Objects.toString(r[3], ""))
                    .salesTitle(Objects.toString(r[4], "")).salesPartnerName(Objects.toString(r[5], ""))
                    .orderPartnerName(Objects.toString(r[6], "")).orderNo(orderNo).orderSq(orderSq)
                    .workPlace(workPlaceLabel).itemCategory(Objects.toString(r[10], ""))
                    .detailItemName(Objects.toString(r[11], "")).breakdown(Objects.toString(r[12], ""))
                    .supplyAmount(supply).taxAmount(tax).totalAmount(total).salesType(Objects.toString(r[16], ""))
                    .division(divisionLabel).accountingDate(accountingDate)
                    .productPurchaseAmount(po[0]).outsourcingAmount(po[1])
                    .podProductionAmount(pod).purchaseTotalAmount(purchaseTotal).grossProfitAmount(grossProfit)
                    .marginRate(marginRate).remark(grossProfit < 0 ? "적자" : "").build());
        }
        return GrpProfitDto.builder().rows(rows).build();
    }

    /**
     * 상품매입/외주 금액을 주문번호-순번별로 조회한다 — 승인완료(GITGO_APPROVED) 이상 정산의 정산금액(po_settle_dtl.amt) 합.
     * #414(2026-09-10, 백미연) — 종전에는 발주(po_mst) 금액을 취소만 빼고 전부 더해, 정산이 없거나 승인 전인 건도
     *   금액이 뜨고 회계일은 빈칸으로 나왔다(2026-08 200줄 약 1.85억). 회계일({@link #loadGrpAccountingDates})·외주정산현황과
     *   같은 승인완료 기준으로 통일. 승인완료 건은 발주금액이 아니라 실제 정산금액으로 표시된다(2026-08 약 +1.4천만).
     * 상품구매/외주 구분은 종전과 같이 주문 순번의 작업처(od.wrk_cd/work_type) 기준.
     */
    private Map<String, long[]> loadGrpPoCosts() {
        String sql = "SELECT pm.order_no, pm.order_sq, " +
                "SUM(CASE WHEN COALESCE(od.wrk_cd, od.work_type)='G9999' OR od.work_type='상품구매' THEN COALESCE(st.amount,0) ELSE 0 END), " +
                "SUM(CASE WHEN COALESCE(od.wrk_cd, od.work_type) IN ('G0600','G0601','G0602','S001','S002') " +
                "OR od.work_type IN ('전체외주','패키지','P&D','VMD','POD외주','수작업','수작업(P&D)') THEN COALESCE(st.amount,0) ELSE 0 END) " +
                "FROM po_mst pm JOIN order_dtl od ON od.company_cd=pm.company_cd AND od.plant_cd=pm.plant_cd " +
                "AND od.order_no=pm.order_no AND od.order_sq=pm.order_sq " +
                "JOIN (SELECT psm.company_cd,psm.plant_cd,psm.po_no,SUM(COALESCE(psd.amt,0)) amount " +
                "FROM po_settle_mst psm JOIN po_settle_dtl psd ON psd.company_cd=psm.company_cd AND psd.plant_cd=psm.plant_cd " +
                "AND psd.pos_no=psm.pos_no " +
                "WHERE psm.status_cd IN ('GITGO_APPROVED','VOUCHER_PENDING','VOUCHER_SENT','CONFIRMED') " +
                "GROUP BY psm.company_cd,psm.plant_cd,psm.po_no) st ON st.company_cd=pm.company_cd " +
                "AND st.plant_cd=pm.plant_cd AND st.po_no=pm.po_no WHERE pm.company_cd=:companyCd " +
                "GROUP BY pm.order_no, pm.order_sq";
        @SuppressWarnings("unchecked") List<Object[]> result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD).getResultList();
        Map<String, long[]> costs = new HashMap<>();
        for (Object[] r : result) costs.put(r[0] + "#" + ((Number) r[1]).intValue(), new long[]{number(r[2]), number(r[3])});
        return costs;
    }

    /** 상품매입/외주 정산 중 승인완료 이상인 건의 회계일을 주문번호-순번별로 조회한다. 금액({@link #loadGrpPoCosts})과 같은 상태 기준. */
    private Map<String, String> loadGrpAccountingDates() {
        String sql = "SELECT pm.order_no, pm.order_sq, " +
                "GROUP_CONCAT(DISTINCT DATE_FORMAT(psm.settled_dt, '%Y-%m-%d') " +
                "ORDER BY psm.settled_dt SEPARATOR ', ') " +
                "FROM po_settle_mst psm " +
                "JOIN po_mst pm ON pm.company_cd=psm.company_cd AND pm.plant_cd=psm.plant_cd AND pm.po_no=psm.po_no " +
                "WHERE psm.company_cd=:companyCd AND psm.settled_dt IS NOT NULL " +
                "AND psm.status_cd IN ('GITGO_APPROVED','VOUCHER_PENDING','VOUCHER_SENT','CONFIRMED') " +
                "GROUP BY pm.order_no, pm.order_sq";
        @SuppressWarnings("unchecked")
        List<Object[]> result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD).getResultList();
        Map<String, String> dates = new HashMap<>();
        for (Object[] r : result) {
            if (r[0] == null || r[1] == null) continue;
            dates.put(r[0] + "#" + ((Number) r[1]).intValue(), Objects.toString(r[2], ""));
        }
        return dates;
    }

    /** 내부생산 작업처(센터 G0100~G0400, POD G0500) — 내부생산비 집계와 줄 단위 귀속 판정에 공용. */
    private static final Set<String> GRP_INTERNAL_WORK_PLACES = Set.of("G0100", "G0200", "G0300", "G0400", "G0500");

    private Map<String, Long> loadPodProductionCosts(LocalDate startDate, LocalDate endDate) {
        if (oraclePodProductionRepository.isEmpty()) return Map.of();
        try {
            Set<String> internalWorkPlaces = GRP_INTERNAL_WORK_PLACES;
            return oraclePodProductionRepository.get().findRows(startDate, endDate, null, null, null, null, null).stream()
                    // 센터(G0100~G0400)와 POD(G0500)만 내부생산비로 집계한다.
                    .filter(r -> r.getWorkPlaceCd() != null
                            && internalWorkPlaces.contains(r.getWorkPlaceCd().trim().toUpperCase()))
                    .collect(Collectors.groupingBy(r -> r.getOrderNo().trim() + "#" + r.getOrderSq(),
                            Collectors.summingLong(r -> r.getAmount() == null ? 0L : r.getAmount().longValue())));
        } catch (RuntimeException e) {
            log.warn("GRP 수익비용대응 POD 생산금액 조회 실패: {}", e.getMessage());
            return Map.of();
        }
    }

    private long number(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    // ============================================================
    // ?좏떥由ы떚
    // ============================================================

    private Map<String, Long> toMap(List<Object[]> results) {
        Map<String, Long> map = new LinkedHashMap<>();
        for (Object[] r : results) {
            map.put((String) r[0], r[1] != null ? ((Number) r[1]).longValue() : 0L);
        }
        return map;
    }

    private Map<String, String[]> loadAmDepartmentMap(List<Integer> deptCds, List<String> salesEmpNos) {
        String userSql = "SELECT u.employee_no, u.name, COALESCE(team.dept_nm, ''), COALESCE(part.dept_nm, '') " +
                "FROM users u " +
                "LEFT JOIN departments part ON u.company_cd = part.company_cd AND u.dept_cd = part.dept_cd " +
                "LEFT JOIN departments team ON part.company_cd = team.company_cd AND part.up_dept_cd = team.dept_cd " +
                "WHERE u.company_cd = :companyCd " +
                buildDeptFilter("u", "dept_cd", deptCds) +
                buildStringInFilter("u", "employee_no", salesEmpNos);

        @SuppressWarnings("unchecked")
        List<Object[]> userRows = entityManager.createNativeQuery(userSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .getResultList();

        Map<String, String[]> result = new HashMap<>();
        for (Object[] row : userRows) putAmDepartmentKeys(result, row[0], row[1], row[2], row[3]);

        String goalDeptExpr = "COALESCE(u.dept_cd, CASE WHEN g.dept_cd REGEXP '^[0-9]+$' THEN CAST(g.dept_cd AS UNSIGNED) ELSE NULL END)";
        String goalSql = "SELECT g.sales_emp_id, u.name, COALESCE(team.dept_nm, ''), COALESCE(part.dept_nm, '') " +
                "FROM goal_mst g " +
                "LEFT JOIN users u ON g.company_cd = u.company_cd AND g.sales_emp_id = u.employee_no " +
                "LEFT JOIN departments part ON g.company_cd = part.company_cd AND " + goalDeptExpr + " = part.dept_cd " +
                "LEFT JOIN departments team ON part.company_cd = team.company_cd AND part.up_dept_cd = team.dept_cd " +
                "WHERE g.company_cd = :companyCd AND g.field_cd = 'AM' AND g.sales_emp_id NOT LIKE 'DEPT%' " +
                buildDeptExprFilter(goalDeptExpr, deptCds) +
                buildStringInFilter("g", "sales_emp_id", salesEmpNos);

        @SuppressWarnings("unchecked")
        List<Object[]> goalRows = entityManager.createNativeQuery(goalSql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .getResultList();

        for (Object[] row : goalRows) putAmDepartmentKeys(result, row[0], row[1], row[2], row[3]);
        return result;
    }

    /** AM 실적의 부서는 현재 사용자 소속이 아니라 매출/목표에 저장된 부서코드를 사용한다. */
    private Map<String, String[]> loadDepartmentHierarchyMap() {
        String sql = "SELECT CAST(part.dept_cd AS CHAR), COALESCE(team.dept_nm, ''), COALESCE(part.dept_nm, '') " +
                "FROM departments part " +
                "LEFT JOIN departments team ON part.company_cd = team.company_cd AND part.up_dept_cd = team.dept_cd " +
                "WHERE part.company_cd = :companyCd";
        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery(sql)
            .setParameter("companyCd", DEFAULT_COMPANY_CD)
            .getResultList();
        Map<String, String[]> result = new HashMap<>();
        for (Object[] row : rows) {
            if (row[0] == null) continue;
            result.put(row[0].toString(), new String[]{
                row[1] != null ? row[1].toString() : "",
                row[2] != null ? row[2].toString() : ""
            });
        }
        return result;
    }

    private String extractAmDeptCode(String amDeptKey) {
        if (amDeptKey == null) return "";
        int separator = amDeptKey.lastIndexOf("@@");
        return separator >= 0 ? amDeptKey.substring(separator + 2) : "";
    }

    private String resolveAmDeptDisplayName(String amDeptKey) {
        if (amDeptKey == null) return null;
        int separator = amDeptKey.lastIndexOf("@@");
        String empNo = separator >= 0 ? amDeptKey.substring(0, separator) : amDeptKey;
        return resolveAmDisplayName(empNo);
    }

    private void putAmDepartmentKeys(Map<String, String[]> result, Object empNoObj, Object nameObj, Object teamObj, Object partObj) {
        String[] deptInfo = new String[]{
            teamObj != null ? teamObj.toString() : "",
            partObj != null ? partObj.toString() : ""
        };
        String empNo = empNoObj != null ? empNoObj.toString().trim() : "";
        String name = nameObj != null ? nameObj.toString().trim() : "";
        if (!name.isBlank()) result.put(name, deptInfo);
        if (!empNo.isBlank()) {
            result.put(empNo, deptInfo);
            String resolved = resolveAmDisplayName(empNo);
            if (resolved != null && !resolved.isBlank()) result.put(resolved.trim(), deptInfo);
        }
    }

    /** 월단위 goal_mst(월별 미집계, rows=[key, plan_mm, total, inner, outer]) 를
     *  기간 [start,end] 에 걸친 달들의 <b>월 전체 목표를 그대로 합산</b>한다(일할 안분 X). 같은 해(year) 기준.
     *  예) 8/1~8/6 이면 8월 목표 전체. 여러 달 걸치면 각 달 목표 전체를 합산. (사용자 요구: "목표는 그 달이 되어야")
     *  ※ 메서드명은 이력상 prorate 이나 실제 동작은 '월 전체 합산'(일할 안 함). */
    private Map<String, GoalBreakdown> prorateMonthlyGoals(List<Object[]> rows, int year,
            java.time.LocalDate start, java.time.LocalDate end) {
        Map<String, long[]> acc = new LinkedHashMap<>();
        Map<String, String> keyCache = new HashMap<>();   // distinct 원본키당 resolveAmDisplayName 1회(월별 행 반복 조회 방지)
        for (Object[] r : rows) {
            if (r[0] == null || r[1] == null) continue;
            String rawKey = (String) r[0];
            String key = rawKey != null && rawKey.contains("@@")
                ? rawKey
                : keyCache.computeIfAbsent(rawKey, this::resolveAmDisplayName);
            int mm = ((Number) r[1]).intValue();
            if (mm < 1 || mm > 12) continue;
            // ★목표는 일할 안분하지 않고 '그 달(월 전체) 목표'를 그대로 합산한다(사용자 요구: "목표는 그 달이 되어야").
            //   조회기간과 조금이라도 겹치는 달은 그 달 목표 전체를 더한다. (선택기간=걸친 달 전체, 누적=1~종료월 전체)
            java.time.LocalDate mFirst = java.time.LocalDate.of(year, mm, 1);
            java.time.LocalDate mLast = mFirst.withDayOfMonth(mFirst.lengthOfMonth());
            if (start.isAfter(mLast) || end.isBefore(mFirst)) continue;   // 이 달이 기간과 전혀 안 겹치면 제외
            long total = r[2] != null ? ((Number) r[2]).longValue() : 0L;
            long inner = r.length > 3 && r[3] != null ? ((Number) r[3]).longValue() : 0L;
            long outer = r.length > 4 && r[4] != null ? ((Number) r[4]).longValue() : Math.max(0L, total - inner);
            long[] v = acc.computeIfAbsent(key, k -> new long[3]);
            v[0] += total;
            v[1] += inner;
            v[2] += outer;
        }
        Map<String, GoalBreakdown> out = new LinkedHashMap<>();
        for (Map.Entry<String, long[]> e : acc.entrySet()) {
            long[] v = e.getValue();
            out.put(e.getKey(), new GoalBreakdown(v[0], v[1], v[2]));
        }
        return out;
    }

    private Map<String, GoalBreakdown> toGoalBreakdownMap(List<Object[]> results) {
        Map<String, GoalBreakdown> map = new LinkedHashMap<>();
        for (Object[] r : results) {
            String key = resolveAmDisplayName((String) r[0]);
            long total = r[1] != null ? ((Number) r[1]).longValue() : 0L;
            long inner = r.length > 2 && r[2] != null ? ((Number) r[2]).longValue() : 0L;
            long outer = r.length > 3 && r[3] != null ? ((Number) r[3]).longValue() : Math.max(0L, total - inner);
            GoalBreakdown prev = map.getOrDefault(key, GoalBreakdown.ZERO);
            map.put(key, new GoalBreakdown(prev.total() + total, prev.inner() + inner, prev.outer() + outer));
        }
        return map;
    }

    private String resolveAmDisplayName(String value) {
        if (value == null || value.isBlank() || value.startsWith("DEPT")) return value;
        return erpEmployeeRepository
            .map(repo -> repo.findNameByEmpNo(value))
            .filter(name -> name != null && !name.isBlank())
            .orElse(value);
    }

    public CustomerYearlySalesDto getCustomerYearlySales(int year, String departmentCd, String partnerCd) {
        if (year < 2000 || year > 2100) {
            throw new IllegalArgumentException("조회 연도가 올바르지 않습니다.");
        }

        LocalDate startDate = LocalDate.of(year, 1, 1);
        LocalDate endDate = startDate.plusYears(1);
        // #405 — 취소(CANCELLED) 원본을 빼지 않는다. 취소 매출(RSL…, 음수)은 그대로 더해지므로 원본까지 빼면
        //   취소 건이 0 이 아니라 음수로 잡혀 매출리스트와 어긋났다(2026-08 시청 -245,000 / 서소문1 -1,079,400).
        //   원본(+)과 취소 매출(-)을 둘 다 세면 상쇄되어 매출리스트와 같은 기준이 된다. 강제취소(FORCE_CANCELLED)는 원래 안 뺐다.
        StringBuilder salesSql = new StringBuilder("""
                SELECT COALESCE(NULLIF(s.partner_cd, ''), ''),
                       COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)'),
                       COALESCE(NULLIF(bo.biz_no, ''), NULLIF(sb.biz_no, ''), MAX(NULLIF(s.issuer_biz_no, '')), ''),
                       CAST(s.dept_cd AS CHAR),
                       COALESCE(NULLIF(d.dept_nm, ''), NULLIF(s.sales_dept_nm, ''), CAST(s.dept_cd AS CHAR), '(부서 미지정)'),
                       MONTH(s.sales_dt),
                       SUM(COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0))
                  FROM sales_mst s
                  LEFT JOIN (SELECT company_cd, partner_cd, MAX(biz_no) AS biz_no FROM business_owners GROUP BY company_cd, partner_cd) bo
                    ON bo.company_cd = s.company_cd AND bo.partner_cd = s.partner_cd
                  LEFT JOIN (SELECT company_cd, plant_cd, partner_cd, MAX(NULLIF(issuer_biz_no, '')) AS biz_no
                               FROM sales_mst
                              WHERE partner_cd IS NOT NULL AND partner_cd <> ''
                              GROUP BY company_cd, plant_cd, partner_cd) sb
                    ON sb.company_cd = s.company_cd AND sb.plant_cd = s.plant_cd AND sb.partner_cd = s.partner_cd
                  LEFT JOIN departments d
                    ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd
                 WHERE s.company_cd = :companyCd
                   AND s.plant_cd = :plantCd
                   AND s.sales_dt >= :startDate AND s.sales_dt < :endDate
                   AND s.confirmed = true
                   AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                """);
        if (departmentCd != null && !departmentCd.isBlank()) {
            salesSql.append(" AND CAST(s.dept_cd AS CHAR) = :departmentCd");
        }
        if (partnerCd != null && !partnerCd.isBlank()) {
            salesSql.append(" AND s.partner_cd = :partnerCd");
        }
        salesSql.append(" GROUP BY s.partner_cd, s.partner_nm, bo.biz_no, sb.biz_no, s.dept_cd, d.dept_nm, s.sales_dept_nm, MONTH(s.sales_dt)")
                .append(" ORDER BY s.partner_nm, d.dept_nm, MONTH(s.sales_dt)");

        jakarta.persistence.Query salesQuery = entityManager.createNativeQuery(salesSql.toString())
                .setParameter("companyCd", DEFAULT_COMPANY_CD)
                .setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate);
        if (departmentCd != null && !departmentCd.isBlank()) salesQuery.setParameter("departmentCd", departmentCd.trim());
        if (partnerCd != null && !partnerCd.isBlank()) salesQuery.setParameter("partnerCd", partnerCd.trim());

        @SuppressWarnings("unchecked")
        List<Object[]> salesRows = salesQuery.getResultList();
        Map<String, CustomerYearlySalesDto.Row> rowMap = new LinkedHashMap<>();
        for (Object[] r : salesRows) {
            String partnerCode = Objects.toString(r[0], "");
            String partnerName = Objects.toString(r[1], partnerCode);
            String businessNo = Objects.toString(r[2], "");
            String deptCode = Objects.toString(r[3], "");
            String deptName = Objects.toString(r[4], deptCode);
            int month = ((Number) r[5]).intValue();
            long amount = ((Number) r[6]).longValue();
            String key = partnerCode + "\u0000" + deptCode;
            CustomerYearlySalesDto.Row row = rowMap.computeIfAbsent(key, ignored -> {
                List<Long> months = new ArrayList<>(Collections.nCopies(12, 0L));
                return CustomerYearlySalesDto.Row.builder()
                        .partnerCd(partnerCode).partnerName(partnerName)
                        .businessNo(businessNo)
                        .departmentCd(deptCode).departmentName(deptName)
                        .monthlyAmounts(months).totalAmount(0L).build();
            });
            if (month >= 1 && month <= 12) {
                row.getMonthlyAmounts().set(month - 1, row.getMonthlyAmounts().get(month - 1) + amount);
                row.setTotalAmount(row.getTotalAmount() + amount);
            }
        }
        fillMissingBusinessNos(rowMap.values());

        @SuppressWarnings("unchecked")
        List<Object[]> departmentRows = entityManager.createNativeQuery("""
                SELECT DISTINCT CAST(s.dept_cd AS CHAR),
                       COALESCE(NULLIF(d.dept_nm, ''), NULLIF(s.sales_dept_nm, ''), CAST(s.dept_cd AS CHAR))
                  FROM sales_mst s
                  LEFT JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd
                 WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd
                   AND s.sales_dt >= :startDate AND s.sales_dt < :endDate
                   AND s.confirmed = true AND s.dept_cd IS NOT NULL
                   AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                 ORDER BY 2
                """).setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endDate).getResultList();
        List<CustomerYearlySalesDto.Option> departments = departmentRows.stream()
                .map(r -> CustomerYearlySalesDto.Option.builder()
                        .value(Objects.toString(r[0], "")).label(Objects.toString(r[1], Objects.toString(r[0], ""))).build())
                .toList();

        @SuppressWarnings("unchecked")
        List<Object[]> partnerRows = entityManager.createNativeQuery("""
                SELECT DISTINCT s.partner_cd, COALESCE(NULLIF(s.partner_nm, ''), s.partner_cd)
                  FROM sales_mst s
                 WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd
                   AND s.sales_dt >= :startDate AND s.sales_dt < :endDate
                   AND s.confirmed = true AND s.partner_cd IS NOT NULL AND s.partner_cd <> ''
                   AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                 ORDER BY 2
                """).setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endDate).getResultList();
        List<CustomerYearlySalesDto.Option> partners = partnerRows.stream()
                .map(r -> CustomerYearlySalesDto.Option.builder()
                        .value(Objects.toString(r[0], "")).label(Objects.toString(r[1], Objects.toString(r[0], ""))).build())
                .toList();

        return CustomerYearlySalesDto.builder()
                .rows(new ArrayList<>(rowMap.values()))
                .departments(departments)
                .partners(partners)
                .build();
    }

    public CustomerYearlySalesDetailDto getCustomerYearlySalesDetail(
            java.time.LocalDate startDate, java.time.LocalDate endDate, String departmentCd, String partnerCd, String salesEmpNo) {
        java.time.LocalDate endExclusive = endDate.plusDays(1);   // SQL 은 sales_dt < :endDate 라 종료일 다음날로 바인딩(종료일 포함).
        // 거래처별 매출증감 파트 권한 — MANAGER(영업매니저)만 본인부서(파트)로 제한, 그 외(파트장·관리자 등)는 전체.
        java.util.List<Integer> deptScope = roleFilterHelper.getAmDashboardAccessibleDepartmentCds();
        String deptScopeClause = (deptScope != null && !deptScope.isEmpty())
                ? " AND s.dept_cd IN (" + deptScope.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",")) + ") "
                : "";
        // #405 — 취소(CANCELLED) 원본을 빼지 않는다. 취소 매출(RSL…, 음수)은 그대로 더해지므로 원본까지 빼면
        //   취소 건이 0 이 아니라 음수로 잡혀 매출리스트와 어긋났다(2026-08 시청 -245,000 / 서소문1 -1,079,400).
        //   원본(+)과 취소 매출(-)을 둘 다 세면 상쇄되어 매출리스트와 같은 기준이 된다. 강제취소(FORCE_CANCELLED)는 원래 안 뺐다.
        StringBuilder sql = new StringBuilder("""
                SELECT COALESCE(NULLIF(s.partner_cd, ''), ''),
                       COALESCE(NULLIF(s.partner_nm, ''), '(거래처 미지정)'),
                       COALESCE(NULLIF(bo.biz_no, ''), NULLIF(sb.biz_no, ''), NULLIF(s.issuer_biz_no, ''), ''),
                       CAST(s.dept_cd AS CHAR),
                       COALESCE(NULLIF(d.dept_nm, ''), NULLIF(s.sales_dept_nm, ''), CAST(s.dept_cd AS CHAR), '(부서 미지정)'),
                       COALESCE(NULLIF(s.sales_emp_no, ''), ''),
                       COALESCE(NULLIF(u.name, ''), NULLIF(s.sales_emp_no, ''), '(담당자 미지정)'),
                       MONTH(s.sales_dt),
                       COALESCE(NULLIF(s.supply_amt, 0), s.total_amt, 0),
                       COALESCE(split.internal_amt, 0), COALESCE(split.external_amt, 0),
                       COALESCE(split.first_work_type, '')
                  FROM sales_mst s
                  LEFT JOIN (SELECT company_cd, partner_cd, MAX(biz_no) AS biz_no FROM business_owners GROUP BY company_cd, partner_cd) bo
                    ON bo.company_cd = s.company_cd AND bo.partner_cd = s.partner_cd
                  LEFT JOIN (SELECT company_cd, plant_cd, partner_cd, MAX(NULLIF(issuer_biz_no, '')) AS biz_no
                               FROM sales_mst
                              WHERE partner_cd IS NOT NULL AND partner_cd <> ''
                              GROUP BY company_cd, plant_cd, partner_cd) sb
                    ON sb.company_cd = s.company_cd AND sb.plant_cd = s.plant_cd AND sb.partner_cd = s.partner_cd
                  LEFT JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd
                  LEFT JOIN users u ON u.company_cd = s.company_cd AND u.employee_no = s.sales_emp_no
                  LEFT JOIN (
                        SELECT sd.company_cd, sd.plant_cd, sd.sales_no,
                               SUM(CASE WHEN sd.work_type = 'I'
                                        THEN COALESCE(sd.supply_amt, 0) - COALESCE(sd.delivery_fee, 0) - COALESCE(sd.manual_work_fee, 0)
                                        ELSE COALESCE(sd.design_fee, 0) END) AS internal_amt,
                               SUM(CASE WHEN sd.work_type = 'I'
                                        THEN COALESCE(sd.delivery_fee, 0) + COALESCE(sd.manual_work_fee, 0)
                                        ELSE COALESCE(sd.supply_amt, 0) - COALESCE(sd.design_fee, 0) END) AS external_amt,
                               MIN(sd.work_type) AS first_work_type
                          FROM sales_dtl sd
                         GROUP BY sd.company_cd, sd.plant_cd, sd.sales_no
                  ) split ON split.company_cd = s.company_cd AND split.plant_cd = s.plant_cd AND split.sales_no = s.sales_no
                 WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd
                   AND s.sales_dt >= :startDate AND s.sales_dt < :endDate
                   AND s.confirmed = true
                   AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                """);
        if (departmentCd != null && !departmentCd.isBlank()) sql.append(" AND CAST(s.dept_cd AS CHAR) = :departmentCd");
        if (partnerCd != null && !partnerCd.isBlank()) sql.append(" AND s.partner_cd = :partnerCd");
        if (salesEmpNo != null && !salesEmpNo.isBlank()) sql.append(" AND s.sales_emp_no = :salesEmpNo");
        sql.append(deptScopeClause);
        sql.append(" ORDER BY 2, 4, 6, s.sales_dt, s.sales_no");

        jakarta.persistence.Query query = entityManager.createNativeQuery(sql.toString())
                .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endExclusive);
        if (departmentCd != null && !departmentCd.isBlank()) query.setParameter("departmentCd", departmentCd.trim());
        if (partnerCd != null && !partnerCd.isBlank()) query.setParameter("partnerCd", partnerCd.trim());
        if (salesEmpNo != null && !salesEmpNo.isBlank()) query.setParameter("salesEmpNo", salesEmpNo.trim());

        @SuppressWarnings("unchecked")
        List<Object[]> sourceRows = query.getResultList();
        Map<DetailSalesKey, long[]> amounts = new LinkedHashMap<>();
        for (Object[] r : sourceRows) {
            String partnerCode = Objects.toString(r[0], "");
            String partnerName = Objects.toString(r[1], partnerCode);
            String businessNo = Objects.toString(r[2], "");
            String deptCode = Objects.toString(r[3], "");
            String deptName = Objects.toString(r[4], deptCode);
            String empNo = Objects.toString(r[5], "");
            String empName = Objects.toString(r[6], empNo);
            int month = ((Number) r[7]).intValue();
            long supply = ((Number) r[8]).longValue();
            long internal = ((Number) r[9]).longValue();
            long external = ((Number) r[10]).longValue();
            String firstWorkType = Objects.toString(r[11], "");
            if (internal == 0L && external == 0L && supply != 0L) {
                if ("O".equalsIgnoreCase(firstWorkType)) external = supply;
                else internal = supply;
            }
            if (internal != 0L) addDetailMonthly(amounts,
                    new DetailSalesKey(partnerCode, partnerName, businessNo, deptCode, deptName, empNo, empName, "I"), month, internal);
            if (external != 0L) addDetailMonthly(amounts,
                    new DetailSalesKey(partnerCode, partnerName, businessNo, deptCode, deptName, empNo, empName, "O"), month, external);
        }

        List<CustomerYearlySalesDetailDto.Row> rows = amounts.entrySet().stream().map(entry -> {
            DetailSalesKey k = entry.getKey();
            long[] values = entry.getValue();
            List<Long> months = Arrays.stream(values).boxed().toList();
            return CustomerYearlySalesDetailDto.Row.builder()
                    .partnerCd(k.partnerCd()).partnerName(k.partnerName())
                    .businessNo(k.businessNo())
                    .departmentCd(k.departmentCd()).departmentName(k.departmentName())
                    .salesEmpNo(k.salesEmpNo()).salesEmpName(k.salesEmpName())
                    .inOutType(k.inOutType()).inOutLabel("I".equals(k.inOutType()) ? "내부" : "외부")
                    .monthlyAmounts(months).totalAmount(Arrays.stream(values).sum()).build();
        }).toList();
        fillMissingDetailBusinessNos(rows);

        String optionWhere = " WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd " +
                "AND s.sales_dt >= :startDate AND s.sales_dt < :endDate AND s.confirmed = true " +
                "AND COALESCE(s.sales_type, '') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL') " + deptScopeClause;
        List<CustomerYearlySalesDetailDto.Option> departments = detailOptions(
                "SELECT DISTINCT CAST(s.dept_cd AS CHAR), COALESCE(NULLIF(d.dept_nm,''), NULLIF(s.sales_dept_nm,''), CAST(s.dept_cd AS CHAR)) " +
                "FROM sales_mst s LEFT JOIN departments d ON d.company_cd=s.company_cd AND d.dept_cd=s.dept_cd" + optionWhere +
                "AND s.dept_cd IS NOT NULL ORDER BY 2", startDate, endExclusive);
        List<CustomerYearlySalesDetailDto.Option> partners = detailOptions(
                "SELECT DISTINCT s.partner_cd, COALESCE(NULLIF(s.partner_nm,''), s.partner_cd) FROM sales_mst s" + optionWhere +
                "AND s.partner_cd IS NOT NULL AND s.partner_cd<>'' ORDER BY 2", startDate, endExclusive);
        List<CustomerYearlySalesDetailDto.Option> employees = detailOptions(
                "SELECT DISTINCT s.sales_emp_no, COALESCE(NULLIF(u.name,''), s.sales_emp_no) FROM sales_mst s " +
                "LEFT JOIN users u ON u.company_cd=s.company_cd AND u.employee_no=s.sales_emp_no" + optionWhere +
                "AND s.sales_emp_no IS NOT NULL AND s.sales_emp_no<>'' ORDER BY 2", startDate, endExclusive);

        return CustomerYearlySalesDetailDto.builder().rows(rows).departments(departments)
                .partners(partners).employees(employees).build();
    }

    private void addDetailMonthly(Map<DetailSalesKey, long[]> amounts, DetailSalesKey key, int month, long amount) {
        if (month >= 1 && month <= 12) amounts.computeIfAbsent(key, ignored -> new long[12])[month - 1] += amount;
    }

    /**
     * MariaDB의 거래처/매출 이력에 사업자번호가 없는 거래처만 Oracle 거래처 마스터에서 보완한다.
     * 동일 거래처가 부서·담당자별 여러 행이어도 Oracle 조회는 요청당 한 번만 수행한다.
     */
    /** [임시 진단] 특정 거래처의 사업자번호 해소 경로/데이터/Oracle 접속대상을 한 번에 반환. 검증 후 제거. */
    public Map<String, Object> diagnoseBizNo(String partnerCd) {
        if (erpPartnerRepository.isEmpty()) return Map.of("error", "Oracle disabled (oracle.enabled=false)");
        return erpPartnerRepository.get().diagnoseBizNo(partnerCd);
    }

    private Map<String, String> resolveMissingBusinessNos(Map<String, String> partners) {
        if (erpPartnerRepository.isEmpty()) return Map.of();
        Map<String, String> resolved = new HashMap<>();
        partners.forEach((rawCd, partnerName) -> {
                    if (rawCd == null || rawCd.isBlank()) return;
                    String cd = rawCd.trim();
                    try {
                        ErpPartnerRepository repo = erpPartnerRepository.get();
                        // findBizNoByPartnerCd 는 내부적으로 CI_PARTNER_MST 직접 + MA_PARTNERSA_INFO 조인(사업자관리 경로)까지 시도한다.
                        String bizNo = repo.findBizNoByPartnerCd(cd);
                        // 1.5) 사업자관리 목록과 '완전히 동일한' findByPartnerCd(MA조인→CI직접→LIKE 3단)의 사업자번호로도 시도.
                        //      → 사업자관리에 뜨는 거래처라면 여기서 반드시 잡힌다(로직 차이로 인한 누락 방지).
                        if (bizNo == null || bizNo.isBlank()) {
                            var dto = repo.findByPartnerCd(cd);
                            if (dto != null && dto.getBizrNo() != null && !dto.getBizrNo().isBlank()) {
                                bizNo = dto.getBizrNo().trim();
                            }
                        }
                        // 매출에 저장된 코드가 현재 Oracle 거래처 코드와 달라진 경우 거래처명 정확 일치로 재해소한다.
                        if ((bizNo == null || bizNo.isBlank()) && partnerName != null && !partnerName.isBlank()) {
                            String oraclePartnerCd = repo.findPartnerCdByName(partnerName.trim());
                            if (oraclePartnerCd != null && !oraclePartnerCd.isBlank()) {
                                bizNo = repo.findBizNoByPartnerCd(oraclePartnerCd);
                            }
                            // 정확 이름으로도 실패 → 상호 정규화(주식회사·(주)·㈜·공백 제거) 후 매칭
                            //   (예: 매출 "쿤데스튜디오" ↔ ERP "주식회사 쿤데스튜디오"). 코드도 이름도 어긋난 거래처 보완.
                            if (bizNo == null || bizNo.isBlank()) {
                                bizNo = repo.findBizNoByNormalizedName(partnerName.trim());
                            }
                        }
                        // [임시 진단] 이 마커가 로그에 있으면 = 신규코드 배포됨. resolved 가 실제 ERP 조회 결과.
                        log.info("[BIZNO-v2] cd=[{}] len={} name=[{}] resolved=[{}]",
                                cd, cd.length(), partnerName, bizNo);
                        if (bizNo != null && !bizNo.isBlank()) resolved.put(cd, bizNo.trim());
                        else log.warn("[거래처별 매출] 사업자번호 미해소 partnerCd={}, partnerName={} (ERP 전 경로 실패)", cd, partnerName);
                    } catch (Exception e) {
                        log.warn("[거래처별 매출] Oracle 사업자번호 조회 실패 partnerCd={}, partnerName={}: {}",
                                cd, partnerName, e.getMessage());
                    }
                });
        return resolved;
    }

    private void fillMissingBusinessNos(Collection<CustomerYearlySalesDto.Row> rows) {
        List<CustomerYearlySalesDto.Row> missing = rows.stream()
                .filter(row -> row.getBusinessNo() == null || row.getBusinessNo().isBlank())
                .toList();
        Map<String, String> resolved = resolveMissingBusinessNos(missing.stream().collect(Collectors.toMap(
                CustomerYearlySalesDto.Row::getPartnerCd,
                CustomerYearlySalesDto.Row::getPartnerName,
                (first, ignored) -> first,
                LinkedHashMap::new)));
        // ★적용 키도 trim — resolved 는 trim된 코드로 저장하므로, 원본(공백 포함 가능) 코드로 조회하면 어긋난다.
        missing.forEach(row -> {
            String key = row.getPartnerCd() != null ? row.getPartnerCd().trim() : "";
            String biz = resolved.get(key);
            if (biz != null && !biz.isBlank()) row.setBusinessNo(biz);
        });
    }

    private void fillMissingDetailBusinessNos(Collection<CustomerYearlySalesDetailDto.Row> rows) {
        List<CustomerYearlySalesDetailDto.Row> missing = rows.stream()
                .filter(row -> row.getBusinessNo() == null || row.getBusinessNo().isBlank())
                .toList();
        Map<String, String> resolved = resolveMissingBusinessNos(missing.stream().collect(Collectors.toMap(
                CustomerYearlySalesDetailDto.Row::getPartnerCd,
                CustomerYearlySalesDetailDto.Row::getPartnerName,
                (first, ignored) -> first,
                LinkedHashMap::new)));
        // ★적용 키도 trim — resolved 는 trim된 코드로 저장하므로, 원본(공백 포함 가능) 코드로 조회하면 어긋난다.
        missing.forEach(row -> {
            String key = row.getPartnerCd() != null ? row.getPartnerCd().trim() : "";
            String biz = resolved.get(key);
            if (biz != null && !biz.isBlank()) row.setBusinessNo(biz);
        });
    }

    @SuppressWarnings("unchecked")
    private List<CustomerYearlySalesDetailDto.Option> detailOptions(String sql, LocalDate startDate, LocalDate endDate) {
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endDate).getResultList();
        return rows.stream().map(r -> CustomerYearlySalesDetailDto.Option.builder()
                .value(Objects.toString(r[0], "")).label(Objects.toString(r[1], Objects.toString(r[0], ""))).build()).toList();
    }

    private record DetailSalesKey(String partnerCd, String partnerName, String businessNo, String departmentCd,
                                  String departmentName, String salesEmpNo, String salesEmpName, String inOutType) {}

    private record GoalBreakdown(long total, long inner, long outer) {
        private static final GoalBreakdown ZERO = new GoalBreakdown(0L, 0L, 0L);
    }

    // ============================================================
    // 디자인매출통계 (2026-09 신설) — 1차 스텁: 프론트 선배포·ADMIN 검수용 빈 응답.
    //   집계 정의(요청서): 내부 = 작업처 디자인(S003) 순번 + 일반 주문 design_fee,
    //                     외부 = 작업처 상품구매(G9999) + 품목구분 디자인(G10S001009)  ← 현업 확인 대기
    //   금액 기준(제안): 매출확정만, 선매출·취소 제외, 부분매출 비율 안분 = getDepartmentPartPerformance 와 동일.
    //   현업 확인 2건(외부 범위 / 디자인비 파트 귀속) 후 getDepartmentPartPerformance 의 디자인 계산을
    //   파트>담당자>거래처>월 단위로 쪼개 채운다. 명세는 design_fee 컬럼 기준으로 집계와 합을 맞출 것.
    // ============================================================

    /** 내부 디자인 = 작업처 디자인(S003) 순번의 작업금액 + 모든 순번의 디자인비(design_fee). (파트별 부대비용 실적과 동일) */
    private static final String DESIGN_INTERNAL_EXPR =
            "(CASE WHEN UPPER(TRIM(od.wrk_cd)) = 'S003' THEN COALESCE(od.work_amt,0) ELSE 0 END + COALESCE(od.design_fee,0))";
    /** 외부 디자인 = 작업처 상품구매(G9999) + 품목구분 디자인(G10S001009, 라벨 '디자인' 폴백) 순번의 작업금액. ← 현업 확인 전 기본값 */
    private static final String DESIGN_EXTERNAL_COND =
            "(UPPER(TRIM(od.wrk_cd)) = 'G9999' AND UPPER(TRIM(COALESCE(od.work_type,''))) IN ('G10S001009','디자인'))";
    private static final String DESIGN_EXTERNAL_EXPR =
            "(CASE WHEN " + DESIGN_EXTERNAL_COND + " THEN COALESCE(od.work_amt,0) ELSE 0 END)";
    /** 디자인 매출이 하나라도 있는 순번만. */
    private static final String DESIGN_ANY_COND =
            "((UPPER(TRIM(od.wrk_cd)) = 'S003' AND COALESCE(od.work_amt,0) <> 0) OR COALESCE(od.design_fee,0) <> 0"
            + " OR (" + DESIGN_EXTERNAL_COND + " AND COALESCE(od.work_amt,0) <> 0))";

    /**
     * 매출확정 라인(주문순번 × 매출번호) + 판매비율(sold_ratio). 파트별 부대비용 실적(getDepartmentPartPerformance)과 같은 정의:
     * 매출확정만, 선매출·선매출취소 제외, 부분매출은 (매출 공급가 / 주문 순번금액) 비율로 안분, 매출취소(음수)는 상계.
     * 파트 귀속 = 매출의 영업부서(sm.dept_cd) — 디자인비도 영업파트로(현업 확인 전 기본값).
     */
    private String designSalesLineSql(String deptFilter) {
        return """
                    SELECT sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq, sm.sales_no,
                           CASE WHEN COALESCE(od2.payment_amt,0) > 0
                                THEN LEAST(1.0, SUM(COALESCE(sd.supply_amt,0)) / od2.payment_amt)
                                ELSE 1.0 END AS sold_ratio
                      FROM sales_dtl sd
                      JOIN sales_mst sm ON sd.company_cd = sm.company_cd AND sd.plant_cd = sm.plant_cd AND sd.sales_no = sm.sales_no
                      JOIN order_dtl od2 ON sd.company_cd = od2.company_cd AND sd.plant_cd = od2.plant_cd
                       AND sd.order_no = od2.order_no AND sd.order_sq = od2.order_sq
                     WHERE sm.company_cd = :companyCd AND sm.plant_cd = :plantCd
                       AND sm.confirmed = true
                       AND COALESCE(sm.sales_type,'') NOT IN ('PRE_SALES', 'PRE_SALES_CANCEL')
                       AND sm.sales_dt BETWEEN :startDate AND :endDate
                """ + deptFilter + """
                     GROUP BY sd.company_cd, sd.plant_cd, sd.order_no, sd.order_sq, sm.sales_no, od2.payment_amt
                """;
    }

    public DesignSalesDto getDesignSales(LocalDate startDate, LocalDate endDate,
                                         String teamCd, String partCd, String designType) {
        // 역할별 부서 범위(#325, 요청자 결정 2026-09-09) — 거래처별 월매출(상세)와 동일 규칙(getAmDashboardAccessibleDepartmentCds):
        //   MANAGER(영업매니저)만 본인 파트, 그 외(팀장·지원매니저·파트장·사원·관리자 등)는 전체.
        //   화면의 팀/파트 드롭다운도 이 결과(rows)에서 만들어지므로 자동으로 같은 범위로 좁혀진다.
        List<Integer> scopeDeptCds = roleFilterHelper.getAmDashboardAccessibleDepartmentCds();
        String deptFilter = buildDeptFilter("sm", "dept_cd", scopeDeptCds)
                + buildTeamDeptFilter("sm", "dept_cd", teamCd) + buildSingleDeptFilter("sm", "dept_cd", partCd);
        String sql = """
                SELECT CAST(s.dept_cd AS CHAR) AS part_cd,
                       COALESCE(NULLIF(d.dept_nm,''), NULLIF(s.sales_dept_nm,''), CAST(s.dept_cd AS CHAR), '(부서 미지정)') AS part_nm,
                       COALESCE(CAST(d.up_dept_cd AS CHAR), '') AS team_cd,
                       COALESCE(NULLIF(td.dept_nm,''), '') AS team_nm,
                       COALESCE(NULLIF(s.sales_emp_no,''), '') AS emp_no,
                       COALESCE(NULLIF(u.name,''), NULLIF(s.sales_emp_no,''), '(담당자 미지정)') AS emp_nm,
                       COALESCE(NULLIF(s.partner_cd,''), '') AS partner_cd,
                       COALESCE(NULLIF(s.partner_nm,''), '(거래처 미지정)') AS partner_nm,
                       COALESCE(NULLIF(bo.biz_no,''), NULLIF(s.issuer_biz_no,''), '') AS biz_no,
                       MONTH(s.sales_dt) AS mm,
                       ROUND(SUM(""" + DESIGN_INTERNAL_EXPR + """
                        * line.sold_ratio)) AS internal_amt,
                       ROUND(SUM(""" + DESIGN_EXTERNAL_EXPR + """
                        * line.sold_ratio)) AS external_amt
                  FROM order_dtl od
                  JOIN (
                """ + designSalesLineSql(deptFilter) + """
                       ) line ON od.company_cd = line.company_cd AND od.plant_cd = line.plant_cd
                             AND od.order_no = line.order_no AND od.order_sq = line.order_sq
                  JOIN sales_mst s ON s.company_cd = line.company_cd AND s.plant_cd = line.plant_cd AND s.sales_no = line.sales_no
                  LEFT JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd
                  LEFT JOIN departments td ON td.company_cd = d.company_cd AND td.dept_cd = d.up_dept_cd
                  LEFT JOIN users u ON u.company_cd = s.company_cd AND u.employee_no = s.sales_emp_no
                  LEFT JOIN (SELECT company_cd, partner_cd, MAX(biz_no) AS biz_no FROM business_owners GROUP BY company_cd, partner_cd) bo
                    ON bo.company_cd = s.company_cd AND bo.partner_cd = s.partner_cd
                 WHERE """ + DESIGN_ANY_COND + """
                 GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
                 ORDER BY 4, 2, 6, 8, 10
                """;
        @SuppressWarnings("unchecked")
        List<Object[]> result = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endDate)
                .getResultList();

        // (파트, 담당자, 거래처) → [내부 12칸, 외부 12칸]
        Map<DesignSalesKey, long[][]> amounts = new LinkedHashMap<>();
        for (Object[] r : result) {
            DesignSalesKey key = new DesignSalesKey(
                    Objects.toString(r[0], ""), Objects.toString(r[1], ""), Objects.toString(r[2], ""), Objects.toString(r[3], ""),
                    Objects.toString(r[4], ""), Objects.toString(r[5], ""), Objects.toString(r[6], ""), Objects.toString(r[7], ""),
                    Objects.toString(r[8], ""));
            int month = r[9] != null ? ((Number) r[9]).intValue() : 0;
            if (month < 1 || month > 12) continue;
            long[][] bucket = amounts.computeIfAbsent(key, k -> new long[2][12]);
            bucket[0][month - 1] += r[10] != null ? ((Number) r[10]).longValue() : 0L;
            bucket[1][month - 1] += r[11] != null ? ((Number) r[11]).longValue() : 0L;
        }
        boolean wantInternal = designType == null || designType.isBlank() || "I".equalsIgnoreCase(designType);
        boolean wantExternal = designType == null || designType.isBlank() || "O".equalsIgnoreCase(designType);
        List<DesignSalesDto.Row> rows = new ArrayList<>();
        amounts.forEach((k, bucket) -> {
            if (wantInternal && Arrays.stream(bucket[0]).anyMatch(v -> v != 0L)) rows.add(designSalesRow(k, "I", bucket[0]));
            if (wantExternal && Arrays.stream(bucket[1]).anyMatch(v -> v != 0L)) rows.add(designSalesRow(k, "O", bucket[1]));
        });

        // 필터 옵션 — 기간 내 매출이 있는 팀/파트 (파트는 선택한 팀 하위만)
        LocalDate endExclusive = endDate.plusDays(1);
        String optionWhere = " WHERE s.company_cd = :companyCd AND s.plant_cd = :plantCd"
                + " AND s.sales_dt >= :startDate AND s.sales_dt < :endDate AND s.confirmed = true"
                + " AND COALESCE(s.sales_type,'') NOT IN ('PRE_SALES','PRE_SALES_CANCEL')";
        List<CustomerYearlySalesDetailDto.Option> teams = detailOptions(
                "SELECT DISTINCT CAST(td.dept_cd AS CHAR), td.dept_nm FROM sales_mst s"
                + " JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd"
                + " JOIN departments td ON td.company_cd = d.company_cd AND td.dept_cd = d.up_dept_cd"
                + optionWhere + " ORDER BY 2", startDate, endExclusive);
        List<CustomerYearlySalesDetailDto.Option> parts = detailOptions(
                "SELECT DISTINCT CAST(d.dept_cd AS CHAR), d.dept_nm FROM sales_mst s"
                + " JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd"
                + optionWhere + buildSingleDeptFilter("d", "up_dept_cd", teamCd) + " ORDER BY 2", startDate, endExclusive);
        return DesignSalesDto.builder().rows(rows).teams(teams).parts(parts).build();
    }

    private DesignSalesDto.Row designSalesRow(DesignSalesKey k, String type, long[] months) {
        return DesignSalesDto.Row.builder()
                .partCd(k.partCd()).partName(k.partName()).teamCd(k.teamCd()).teamName(k.teamName())
                .salesEmpNo(k.salesEmpNo()).salesEmpName(k.salesEmpName())
                .partnerCd(k.partnerCd()).partnerName(k.partnerName()).businessNo(k.businessNo())
                .designType(type).designTypeLabel("I".equals(type) ? "내부" : "외부")
                .monthlyAmounts(Arrays.stream(months).boxed().toList())
                .totalAmount(Arrays.stream(months).sum())
                .build();
    }

    private record DesignSalesKey(String partCd, String partName, String teamCd, String teamName,
                                  String salesEmpNo, String salesEmpName,
                                  String partnerCd, String partnerName, String businessNo) {}

    /** 거래처 드릴다운 — 주문 순번 × 매출 단위 명세. 집계와 같은 라인·같은 식(내부=S003 작업금액+디자인비, 외부=G9999 디자인)이라 합이 맞는다. */
    public List<DesignSalesDto.DetailRow> getDesignSalesDetails(LocalDate startDate, LocalDate endDate,
                                                                String partnerCd, String partCd,
                                                                String salesEmpNo, String designType) {
        // 명세도 같은 역할별 부서 범위를 적용 — URL 로 다른 파트 코드를 넣어도 본인 범위 밖은 비어 온다.
        String deptFilter = buildDeptFilter("sm", "dept_cd", roleFilterHelper.getAmDashboardAccessibleDepartmentCds())
                + buildSingleDeptFilter("sm", "dept_cd", partCd);
        boolean partnerBlank = partnerCd == null || partnerCd.isBlank();
        boolean empGiven = salesEmpNo != null && !salesEmpNo.isBlank();
        String sql = """
                SELECT om.received_dt, od.order_no, od.order_sq, om.order_title, od.work_name,
                       COALESCE(NULLIF(cc.label,''), od.wrk_cd, '') AS wrk_nm,
                       COALESCE(NULLIF(s.partner_nm,''), '(거래처 미지정)') AS partner_nm,
                       COALESCE(NULLIF(d.dept_nm,''), NULLIF(s.sales_dept_nm,''), CAST(s.dept_cd AS CHAR), '') AS dept_nm,
                       COALESCE(NULLIF(u.name,''), NULLIF(s.sales_emp_no,''), '') AS emp_nm,
                       ROUND(""" + DESIGN_INTERNAL_EXPR + """
                        * line.sold_ratio) AS internal_amt,
                       ROUND(""" + DESIGN_EXTERNAL_EXPR + """
                        * line.sold_ratio) AS external_amt
                  FROM order_dtl od
                  JOIN (
                """ + designSalesLineSql(deptFilter) + """
                       ) line ON od.company_cd = line.company_cd AND od.plant_cd = line.plant_cd
                             AND od.order_no = line.order_no AND od.order_sq = line.order_sq
                  JOIN sales_mst s ON s.company_cd = line.company_cd AND s.plant_cd = line.plant_cd AND s.sales_no = line.sales_no
                  JOIN order_mst om ON om.company_cd = od.company_cd AND om.plant_cd = od.plant_cd AND om.order_no = od.order_no
                  LEFT JOIN common_code cc ON cc.company_cd = od.company_cd AND cc.group_cd = 'JOB_TYPE' AND cc.code = od.wrk_cd
                  LEFT JOIN departments d ON d.company_cd = s.company_cd AND d.dept_cd = s.dept_cd
                  LEFT JOIN users u ON u.company_cd = s.company_cd AND u.employee_no = s.sales_emp_no
                 WHERE """ + DESIGN_ANY_COND
                + (partnerBlank ? " AND (s.partner_cd IS NULL OR s.partner_cd = '')" : " AND s.partner_cd = :partnerCd")
                + (empGiven ? " AND s.sales_emp_no = :salesEmpNo" : "") + """
                 ORDER BY om.received_dt, od.order_no, od.order_sq, s.sales_no
                """;
        jakarta.persistence.Query query = entityManager.createNativeQuery(sql)
                .setParameter("companyCd", DEFAULT_COMPANY_CD).setParameter("plantCd", DEFAULT_PLANT_CD)
                .setParameter("startDate", startDate).setParameter("endDate", endDate);
        if (!partnerBlank) query.setParameter("partnerCd", partnerCd.trim());
        if (empGiven) query.setParameter("salesEmpNo", salesEmpNo.trim());
        @SuppressWarnings("unchecked")
        List<Object[]> result = query.getResultList();

        boolean wantInternal = designType == null || designType.isBlank() || "I".equalsIgnoreCase(designType);
        boolean wantExternal = designType == null || designType.isBlank() || "O".equalsIgnoreCase(designType);
        List<DesignSalesDto.DetailRow> rows = new ArrayList<>();
        for (Object[] r : result) {
            String orderDate = r[0] != null ? Objects.toString(r[0]) : "";
            if (orderDate.length() > 10) orderDate = orderDate.substring(0, 10);
            long internal = r[9] != null ? ((Number) r[9]).longValue() : 0L;
            long external = r[10] != null ? ((Number) r[10]).longValue() : 0L;
            DesignSalesDto.DetailRow.DetailRowBuilder base = DesignSalesDto.DetailRow.builder()
                    .orderDate(orderDate)
                    .orderNo(Objects.toString(r[1], ""))
                    .orderSq(r[2] != null ? ((Number) r[2]).intValue() : null)
                    .orderTitle(Objects.toString(r[3], ""))
                    .itemName(Objects.toString(r[4], ""))
                    .workPlaceName(Objects.toString(r[5], ""))
                    .partnerName(Objects.toString(r[6], ""))
                    .departmentName(Objects.toString(r[7], ""))
                    .salesEmpName(Objects.toString(r[8], ""));
            if (wantInternal && internal != 0L) rows.add(base.designType("I").designTypeLabel("내부").amount(internal).build());
            if (wantExternal && external != 0L) rows.add(base.designType("O").designTypeLabel("외부").amount(external).build());
        }
        return rows;
    }
}
