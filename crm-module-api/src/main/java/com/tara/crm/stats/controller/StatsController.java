package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.dto.*;
import com.tara.crm.stats.service.StatsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "통계/대시보드", description = "통계 및 대시보드 API")
public class StatsController {

    private final StatsService statsService;

    // ── 대시보드 ──

    @GetMapping("/dashboard/summary")
    @Operation(summary = "대시보드 KPI 요약")
    public ApiResponse<DashboardSummaryDto> getDashboardSummary() {
        return ApiResponse.ok(statsService.getDashboardSummary());
    }

    @GetMapping("/dashboard/recent-orders")
    @Operation(summary = "최근 주문 목록")
    public ApiResponse<List<RecentOrderDto>> getRecentOrders() {
        return ApiResponse.ok(statsService.getRecentOrders(8));
    }

    @GetMapping("/dashboard/sales-trend")
    @Operation(summary = "매출 추이")
    public ApiResponse<SalesTrendDto> getSalesTrend() {
        return ApiResponse.ok(statsService.getSalesTrend());
    }

    // ── 통합 실적 대시보드 (신규) ──

    @GetMapping("/stats/integrated-dashboard")
    @Operation(summary = "통합 실적 대시보드", description = "20·21·22번 통합. 조직별 목표/실적/전년대비를 종합/실적 뷰로 제공")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<IntegratedDashboardDto> getIntegratedDashboard(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String divisionCd,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd,
            // allDepts=true 면 role 부서 스코프 무시하고 전체 조회(차트/비교표 전용). 기본은 role 스코프 적용.
            @RequestParam(required = false, defaultValue = "false") boolean allDepts) {
        return ApiResponse.ok(statsService.getIntegratedDashboard(
                java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate), divisionCd, teamCd, partCd, allDepts));
    }

    @GetMapping("/stats/integrated-annual-goal")
    @Operation(summary = "통합 실적 연간 목표", description = "통합실적 연간 목표 카드용 경량 조회")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<Long> getIntegratedAnnualGoal(
            @RequestParam int year,
            @RequestParam(required = false) String divisionCd,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd,
            @RequestParam(required = false, defaultValue = "false") boolean allDepts) {
        return ApiResponse.ok(statsService.getIntegratedAnnualGoal(year, divisionCd, teamCd, partCd, allDepts));
    }

    @GetMapping("/dashboard/annual-goal")
    @Operation(summary = "대시보드 연간 전체목표", description = "홈 대시보드 '전체목표' 카드 전용 — role 부서 스코프의 연간(1~12월) 목표 합계만 조회(무거운 매출집계 제외).")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<Long> getDashboardAnnualGoal(@RequestParam int year) {
        return ApiResponse.ok(statsService.getDashboardAnnualGoal(year));
    }

    // ── AM별 매출목표/실적 (신규) ──

    @GetMapping("/stats/am-dashboard")
    @Operation(summary = "AM별 매출목표 및 실적", description = "AM 개인 단위 종합/실적 뷰 제공")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<AmDashboardDto> getAmDashboard(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) List<String> deptCds,
            @RequestParam(required = false) List<String> salesEmpNos) {
        return ApiResponse.ok(statsService.getAmDashboard(
                java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate), deptCds, salesEmpNos));
    }

    // ── 기존 호환 엔드포인트 (리다이렉트 대상이지만 유지) ──

    @GetMapping("/stats/team-forecast")
    @Operation(summary = "본부 및 팀 예상매출 (하위호환)")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<TeamForecastDto> getTeamForecast(
            @RequestParam int year, @RequestParam int month) {
        return ApiResponse.ok(statsService.getTeamForecast(year, month));
    }

    @GetMapping("/stats/team-goal-actual")
    @Operation(summary = "본부 및 팀 매출목표/실적 (하위호환)")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<TeamGoalActualDto> getTeamGoalActual(@RequestParam int year) {
        return ApiResponse.ok(statsService.getTeamGoalActual(year));
    }

    @GetMapping("/stats/part-goal-actual-yoy")
    @Operation(summary = "파트별 전년대비 (하위호환)")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<PartGoalYoyDto> getPartGoalActualYoy(@RequestParam int year) {
        return ApiResponse.ok(statsService.getPartGoalActualYoy(year));
    }

    @GetMapping("/stats/am-goal-actual-yoy")
    @Operation(summary = "AM 전년대비 (하위호환)")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<AmGoalYoyDto> getAmGoalActualYoy(@RequestParam int year) {
        return ApiResponse.ok(statsService.getAmGoalActualYoy(year));
    }

    // ── 품목별 실적 ──

    @GetMapping("/stats/item-performance")
    @Operation(summary = "품목별 실적조회")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<ItemPerformanceDto> getItemPerformance(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String categoryType,
            @RequestParam(required = false) String itemKeyword,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd) {
        return ApiResponse.ok(statsService.getItemPerformance(startDate, endDate, categoryType, itemKeyword, teamCd, partCd));
    }

    @GetMapping("/stats/item-part-performance")
    @Operation(summary = "영업부서별 파트 실적조회")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<ItemPartPerformanceDto> getItemPartPerformance(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd) {
        return ApiResponse.ok(statsService.getDepartmentPartPerformance(
                startDate, endDate, teamCd, partCd));
    }

    // ── 거래처별 외주 마진율 ──

    @GetMapping("/stats/vendor-margin")
    @Operation(summary = "거래처별 외주 마진율")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<VendorMarginDto> getVendorMargin(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String vendorKeyword,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd,
            @RequestParam(required = false) String marginRange,
            @RequestParam(required = false) Boolean vatIncluded) {
        return ApiResponse.ok(statsService.getVendorMargin(startDate, endDate, vendorKeyword, teamCd, partCd, marginRange, vatIncluded));
    }

    // ── 주문건별 외주 마진율 ──

    @GetMapping("/stats/order-margin")
    @Operation(summary = "주문건별 외주 마진율")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<OrderMarginDto> getOrderMargin(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String orderKeyword,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd,
            @RequestParam(required = false) String marginRange,
            @RequestParam(required = false) Boolean vatIncluded) {
        return ApiResponse.ok(statsService.getOrderMargin(startDate, endDate, orderKeyword, teamCd, partCd, marginRange, vatIncluded));
    }

    @GetMapping("/stats/grp-profit")
    @Operation(summary = "GRP 수익비용대응")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<GrpProfitDto> getGrpProfit(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(statsService.getGrpProfit(startDate, endDate, keyword));
    }

    @GetMapping("/stats/customer-yearly-sales")
    @Operation(summary = "연도별 거래처별 월매출", description = "ERP 매출을 거래처·영업담당부서별로 1~12월 집계합니다.")
    public ApiResponse<CustomerYearlySalesDto> customerYearlySales(
            @RequestParam int year,
            @RequestParam(required = false) String departmentCd,
            @RequestParam(required = false) String partnerCd) {
        return ApiResponse.ok(statsService.getCustomerYearlySales(year, departmentCd, partnerCd));
    }

    @GetMapping("/stats/customer-yearly-sales-detail")
    @Operation(summary = "거래처별 월매출 상세", description = "MariaDB 매출을 거래처·부서·영업담당자·내외부별로 월 집계합니다.")
    public ApiResponse<CustomerYearlySalesDetailDto> customerYearlySalesDetail(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String departmentCd,
            @RequestParam(required = false) String partnerCd,
            @RequestParam(required = false) String salesEmpNo) {
        return ApiResponse.ok(statsService.getCustomerYearlySalesDetail(
                java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate), departmentCd, partnerCd, salesEmpNo));
    }

    // ── 디자인매출통계 (2026-09 신설) — 요청자 결정(09-09)으로 다른 통계와 같이 전 역할 개방. 금액 검증 후 권한 조정 가능 ──

    @GetMapping("/stats/design-sales")
    @Operation(summary = "디자인매출통계 집계", description = "파트·영업담당자·거래처·내외부별 월 집계. designType=I(내부)/O(외부)/생략(전체)")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<DesignSalesDto> designSales(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String teamCd,
            @RequestParam(required = false) String partCd,
            @RequestParam(required = false) String designType) {
        return ApiResponse.ok(statsService.getDesignSales(
                java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate), teamCd, partCd, designType));
    }

    @GetMapping("/stats/design-sales/details")
    @Operation(summary = "디자인매출통계 거래처 명세", description = "거래처 클릭 드릴다운 — 주문 순번 단위 디자인 매출 명세")
    @PreAuthorize("hasAnyRole('ADMIN','EXECUTIVE','MANAGER','TEAM_LEADER','PART_LEADER','FINANCE','STAFF','SALES_SPT','CENTER_LEADER')")
    public ApiResponse<List<DesignSalesDto.DetailRow>> designSalesDetails(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam String partnerCd,
            @RequestParam(required = false) String partCd,
            @RequestParam(required = false) String salesEmpNo,
            @RequestParam(required = false) String designType) {
        return ApiResponse.ok(statsService.getDesignSalesDetails(
                java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate), partnerCd, partCd, salesEmpNo, designType));
    }
}
