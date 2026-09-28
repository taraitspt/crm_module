import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type {
  SalesPlanRow,
  SalesPlanSaveRequest,
  SalesPlanUserOption,
  SalesStatusResponse,
} from '@/types/salesPlan';

const BASE = '/info/sales-plan';

export const salesPlanApi = {
  getUsers: async (deptCd?: number) => {
    const res = await apiClient.get<ApiResponse<SalesPlanUserOption[]>>(`${BASE}/users`, {
      params: deptCd != null ? { deptCd } : {},
    });
    return res.data.data ?? [];
  },

  getPlans: async (planYy: string, deptCd?: number, salesEmpId?: string) => {
    const res = await apiClient.get<ApiResponse<SalesPlanRow[]>>(BASE, {
      params: { planYy, deptCd: deptCd ?? undefined, salesEmpId: salesEmpId || undefined },
    });
    return res.data.data ?? [];
  },

  save: async (payload: SalesPlanSaveRequest) => {
    await apiClient.put(BASE, payload);
  },

  getStatus: async (planYy: string, deptCd?: number, salesEmpId?: string, plantCd?: string) => {
    const res = await apiClient.get<ApiResponse<SalesStatusResponse>>(`${BASE}/status`, {
      params: {
        planYy,
        deptCd: deptCd ?? undefined,
        salesEmpId: salesEmpId || undefined,
        // 빈 문자열은 '전체 사업부문'. undefined 면 서버 기본값(1000)이 적용된다.
        plantCd: plantCd ?? undefined,
      },
      timeout: 3 * 60 * 1000,
    });
    return res.data.data;
  },
};
