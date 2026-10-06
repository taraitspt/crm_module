import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { LeftoverRow } from '@/types/stockLeftover';
import type { SoCcRow } from '@/types/soCcCheck';
import type { TransportRow } from '@/types/transportCheck';
import type {
  SalesTrendDto,
  DashboardSummaryDto,
  IntegratedDashboardDto,
  TeamForecastDto,
  TeamGoalActualDto,
  PartGoalYoyDto,
  AmDashboardDto,
  AmGoalYoyDto,
  ItemPerformanceDto,
  ItemPartPerformanceDto,
  VendorMarginDto,
  OrderMarginDto,
  CustomerYearlySalesDto,
  CustomerYearlySalesDetailDto,
  PodProductionRow,
  PodProductionDetail,
  PodProductionSpecRow,
} from '@/types/stats';

/** 대시보드 - KPI 요약 */
export const getDashboardSummary = () =>
  apiClient.get<ApiResponse<DashboardSummaryDto>>('/dashboard/summary');

/** 대시보드 - 최근 12개월 매출 추이 */
export const getSalesTrend = () =>
  apiClient.get<ApiResponse<SalesTrendDto>>('/dashboard/sales-trend');

/** 통합 실적 대시보드 (20·21·22번 통합) */
export const getIntegratedDashboard = (
  startDate: string,
  endDate: string,
  divisionCd?: string,
  teamCd?: string,
  partCd?: string,
  allDepts?: boolean,
) =>
  apiClient.get<ApiResponse<IntegratedDashboardDto>>('/stats/integrated-dashboard', {
    params: { startDate, endDate, divisionCd, teamCd, partCd, allDepts },
  });

/** 통합 실적 연간 목표 카드 전용 경량 조회 */
export const getIntegratedAnnualGoal = (
  year: number,
  divisionCd?: string,
  teamCd?: string,
  partCd?: string,
  allDepts?: boolean,
) => apiClient.get<ApiResponse<number>>('/stats/integrated-annual-goal', {
  params: { year, divisionCd, teamCd, partCd, allDepts },
});

/** 대시보드 '전체목표' 카드 전용 — role 스코프 연간(1~12월) 목표 합계만 (무거운 매출집계 없이 goal_mst만). */
export const getDashboardAnnualGoal = (year: number) =>
  apiClient.get<ApiResponse<number>>('/dashboard/annual-goal', {
    params: { year },
  });

/** 본부 및 팀 예상매출 (하위호환) */
export const getTeamForecast = (year: number, month: number) =>
  apiClient.get<ApiResponse<TeamForecastDto>>('/stats/team-forecast', {
    params: { year, month },
  });

/** 본부 및 팀 매출목표 및 실적 (하위호환) */
export const getTeamGoalActual = (year: number) =>
  apiClient.get<ApiResponse<TeamGoalActualDto>>('/stats/team-goal-actual', {
    params: { year },
  });

/** 파트별 전년대비 (하위호환) */
export const getPartGoalActualYoy = (year: number) =>
  apiClient.get<ApiResponse<PartGoalYoyDto>>('/stats/part-goal-actual-yoy', {
    params: { year },
  });

/** AM별 매출목표/실적 (통합) */
export const getAmDashboard = (
  startDate: string,
  endDate: string,
  deptCds?: string[],
  salesEmpNos?: string[],
) => {
  const params = new URLSearchParams();
  params.append('startDate', startDate);
  params.append('endDate', endDate);
  deptCds?.forEach((v) => params.append('deptCds', v));
  salesEmpNos?.forEach((v) => params.append('salesEmpNos', v));
  return apiClient.get<ApiResponse<AmDashboardDto>>('/stats/am-dashboard', {
    params,
  });
};

/** AM 전년대비 (하위호환) */
export const getAmGoalActualYoy = (year: number) =>
  apiClient.get<ApiResponse<AmGoalYoyDto>>('/stats/am-goal-actual-yoy', {
    params: { year },
  });

/** 품목별 실적 */
export const getItemPerformance = (
  startDate: string,
  endDate: string,
  categoryType?: string,
  itemKeyword?: string,
  teamCd?: string,
  partCd?: string,
) =>
  apiClient.get<ApiResponse<ItemPerformanceDto>>('/stats/item-performance', {
    params: { startDate, endDate, categoryType, itemKeyword, teamCd, partCd },
  });

/** 영업부서별 파트 실적 */
export const getItemPartPerformance = (
  startDate: string,
  endDate: string,
  teamCd?: string,
  partCd?: string,
) =>
  apiClient.get<ApiResponse<ItemPartPerformanceDto>>('/stats/item-part-performance', {
    params: { startDate, endDate, teamCd, partCd },
  });

/** 거래처별 외주 마진율 */
export const getVendorMargin = (
  startDate: string,
  endDate: string,
  vendorKeyword?: string,
  teamCd?: string,
  partCd?: string,
  marginRange?: string,
  vatIncluded?: boolean,
) =>
  apiClient.get<ApiResponse<VendorMarginDto>>('/stats/vendor-margin', {
    params: { startDate, endDate, vendorKeyword, teamCd, partCd, marginRange, vatIncluded },
  });

/** 주문건별 외주 마진율 */
export const getOrderMargin = (
  startDate: string,
  endDate: string,
  orderKeyword?: string,
  teamCd?: string,
  partCd?: string,
  marginRange?: string,
  vatIncluded?: boolean,
) =>
  apiClient.get<ApiResponse<OrderMarginDto>>('/stats/order-margin', {
    params: { startDate, endDate, orderKeyword, teamCd, partCd, marginRange, vatIncluded },
  });

/** GRP 매출과 상품매입·외주·센터/POD 내부생산 원가 대응 */
export const getGrpProfit = (startDate: string, endDate: string, keyword?: string) =>
  apiClient.get<ApiResponse<import('@/types/stats').GrpProfitDto>>('/stats/grp-profit', {
    params: { startDate, endDate, keyword },
  });

export const getCustomerYearlySales = (
  year: number,
  departmentCd?: string,
  partnerCd?: string,
) =>
  apiClient.get<ApiResponse<CustomerYearlySalesDto>>('/stats/customer-yearly-sales', {
    params: { year, departmentCd, partnerCd },
  });

export const getCustomerYearlySalesDetail = (
  startDate: string,
  endDate: string,
  departmentCd?: string,
  partnerCd?: string,
  salesEmpNo?: string,
) => apiClient.get<ApiResponse<CustomerYearlySalesDetailDto>>('/stats/customer-yearly-sales-detail', {
  params: { startDate, endDate, departmentCd, partnerCd, salesEmpNo },
});

export const getPodProductionRows = (params: {
  startDate: string;
  endDate: string;
  workPlaceCd?: string;
  itemType?: string;
  salesDepartmentCd?: string;
  salesEmployee?: string;
  keyword?: string;
}) => apiClient.get<ApiResponse<PodProductionRow[]>>('/stats/pod-production', { params });

export const getPodProductionDetails = (orderNo: string, orderSq: number) =>
  apiClient.get<ApiResponse<PodProductionDetail[]>>('/stats/pod-production/details', {
    params: { orderNo, orderSq },
  });

/** POD 전체 작업사양 (주문일 기준 flat) — G0500. */
export const getPodProductionSpecs = (params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<PodProductionSpecRow[]>>('/stats/pod-production/specs', { params });

/** 디자인매출통계 — 거래처별 월 집계. designType: I(내부)/O(외부)/undefined(전체). */
export const getDesignSales = (params: {
  startDate: string; endDate: string; teamCd?: string; partCd?: string; designType?: 'I' | 'O';
}) => apiClient.get<ApiResponse<import('@/types/stats').DesignSalesDto>>('/stats/design-sales', { params });

/** 디자인매출통계 — 거래처 클릭 드릴다운(주문 순번 명세). */
export const getDesignSalesDetail = (params: {
  startDate: string; endDate: string; partnerCd: string; partCd?: string; salesEmpNo?: string; designType?: 'I' | 'O';
}) => apiClient.get<ApiResponse<import('@/types/stats').DesignSalesDetailRow[]>>('/stats/design-sales/details', { params });

/** 채권연령분석 — baseDate(YYYY-MM-DD) 기준 미반제 잔액·연령버킷. pcCds 생략 시 1000,9000,8000 전부. */
export const getReceivableAging = (baseDate: string) =>
  apiClient.get<ApiResponse<import('@/types/stats').ReceivableAgingDto>>('/stats/receivable-aging', {
    params: { baseDate },
  });

/** 매출 후 잔여재고 — 매출 등록된 배치(주문번호-순번) 중 오늘 기준 재고 > 0. billFrom/billTo 는 마지막 매출일 범위(선택). 행은 Map(camelCase). */
export const getStockLeftover = (params: { billFrom?: string; billTo?: string }) =>
  apiClient.get<ApiResponse<LeftoverRow[]>>('/stats/stock-leftover', { params, timeout: 120_000 });

/** 수주 담당팀 점검 — 수주일 기간(최대 93일), 수주마다 비용센터 vs 담당자 소속 판정(ccMatch). 행은 Map(camelCase). */
export const getSoCcCheck = (params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<SoCcRow[]>>('/stats/so-cc-check', { params, timeout: 120_000 });
/** 운송정보 부서 점검 — 운송정보 등록일 기간(최대 93일), 행마다 부서 비용센터 vs 수주 라인 비용센터 판정(deptMatch). */
export const getTransportDeptCheck = (params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<TransportRow[]>>('/stats/transport-dept-check', { params, timeout: 120_000 });
