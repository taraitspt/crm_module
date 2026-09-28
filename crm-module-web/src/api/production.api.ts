import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { ProductionPlateRow } from '@/types/production';

/** 생산계획현황 — 제판 탭 (TPS, 계획일 기준, 최대 31일). */
export const getProductionPlatePlan = (params: { startDate: string; endDate: string }) =>
  apiClient.get<ApiResponse<ProductionPlateRow[]>>('/production/plan/plate', { params });
