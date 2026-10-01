import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { ProductionPlanRow, ProductionPlanTab } from '@/types/production';

/**
 * 생산계획현황 — 탭별 행 (TPS, 계획일 기준, 최대 31일).
 * 한 달치는 ERP 응답이 수 초~십수 초라 기본 타임아웃(30초)보다 넉넉히 둔다.
 */
export const getProductionPlan = (tab: ProductionPlanTab, params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<ProductionPlanRow[]>>(`/production/plan/${tab}`, { params, timeout: 120_000 });
