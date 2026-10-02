import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { ProductionPlanRow, ProductionPlanTab } from '@/types/production';
import type { EquipmentPerfRow } from '@/types/equipmentPerf';
import type { OrderProgressRow } from '@/types/orderProgress';
import type { PlanMode, PlanRow, PlanTab, WorkOrderData } from '@/types/planRegister';

/**
 * 생산계획현황 — 탭별 행 (TPS, 계획일 기준, 최대 31일).
 * 한 달치는 ERP 응답이 수 초~십수 초라 기본 타임아웃(30초)보다 넉넉히 둔다.
 */
export const getProductionPlan = (tab: ProductionPlanTab, params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<ProductionPlanRow[]>>(`/production/plan/${tab}`, { params, timeout: 120_000 });

/** 설비별 작업실적 — 작업일 기준, 작업장(WC20 인쇄), 최대 31일. 행은 컬럼명(camelCase) → 값. */
export const getEquipmentPerf = (params: { startDate: string; endDate: string; workCenter?: string }) =>
  apiClient.get<ApiResponse<EquipmentPerfRow[]>>('/production/equipment-perf', { params, timeout: 120_000 });

/** 주문진행현황 — 주문일 기간(최대 92일). 행은 컬럼명(camelCase) → 값, progNm/progDt 가 진행상태·처리일자. */
export const getOrderProgress = (params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<OrderProgressRow[]>>('/production/order-progress', { params, timeout: 120_000 });

/** 작업장의 설비 목록 — 가동 현황 보드가 실적 없는 설비도 "대기"로 보여주기 위해. */
export const getEquipments = (workCenter = 'WC20') =>
  apiClient.get<ApiResponse<{ eqpCd: string; eqpNm: string | null }[]>>('/production/equipment-perf/equipments', { params: { workCenter } });

// ── 생산계획조회 (ERP 생산계획등록 조회 이식) ──
/** 주문리스트 — 주문일 기간(최대 31일). 계획번호·계획상태(미작성/작성중/작성 완료)·탭별 확정여부 포함. */
export const getPlanOrders = (params: { startDate: string; endDate: string; mode: PlanMode }) =>
  apiClient.get<ApiResponse<PlanRow[]>>('/production/plan-register/orders', { params, timeout: 120_000 });

/** 주문상세 — 주문 라인(계획이 있으면 계획값). planNo 없으면 주문값만. */
export const getPlanOrderDetail = (orderNo: string, planNo?: string | null, mode: PlanMode = 'order') =>
  apiClient.get<ApiResponse<PlanRow[]>>(`/production/plan-register/orders/${encodeURIComponent(orderNo)}/detail`, { params: { planNo: planNo ?? undefined, mode } });

/** 계획 공정 탭 행 — 계획번호 1건. */
export const getPlanTabRows = (planNo: string, tab: PlanTab, orderNo?: string | null) =>
  apiClient.get<ApiResponse<PlanRow[]>>(`/production/plan-register/plans/${encodeURIComponent(planNo)}/${tab}`, { params: { orderNo: orderNo ?? undefined } });

/** 작업지시서 — 주문 머리 + 라인 + 인쇄 계획 행. sq(주문순번)를 주면 그 라인 한 장. */
export const getWorkOrder = (orderNo: string, sq?: number | string | null, mode?: PlanMode | null) =>
  apiClient.get<ApiResponse<WorkOrderData>>(`/production/plan-register/work-order/${encodeURIComponent(orderNo)}`, { params: { sq: sq ?? undefined, mode: mode ?? undefined } });
