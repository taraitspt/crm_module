import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { SalesYoyResponse } from '@/types/salesYoy';

/** 전년 매출 비교 — year 와 year-1 의 거래처·영업부서별 월 매출(타라티피에스). ERP 두 해를 읽어 넉넉히 기다린다. */
export const getSalesYoy = async (year: number) =>
  (await apiClient.get<ApiResponse<SalesYoyResponse>>('/stats/sales-yoy', { params: { year }, timeout: 120_000 })).data.data;
