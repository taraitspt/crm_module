import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { SalesListResponse } from '@/types/salesList';

/** 매출리스트 — 기간(최대 92일)·사업부문(1000/2000/3000/ALL). */
export const getSalesList = (params: { startDate: string; endDate: string; plantCd: string }) =>
  apiClient.get<ApiResponse<SalesListResponse>>('/stats/sales-list', { params });
