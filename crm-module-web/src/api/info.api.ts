import apiClient from './client';
import type { ApiResponse, PageResponse } from '@/types/common';
import type {
  BizOwnerListItem, BizOwnerDetail, BizOwnerForm,
  PartGoalItem, AmGoalItem, AmGoalYearlyItem,
} from '@/types/info';

const BASE = '/info';

// --- 사업자 ---
export const bizOwnerApi = {
  list: async (params: { plantCd?: number; deptCd?: number; keyword?: string; page?: number; size?: number }) => {
    const response = await apiClient.get<ApiResponse<PageResponse<BizOwnerListItem>>>(`${BASE}/biz-owners`, { params });
    return response.data;
  },

  detail: async (id: number | string) => {
    const response = await apiClient.get<ApiResponse<BizOwnerDetail>>(`${BASE}/biz-owners/${id}`);
    return response.data.data;
  },

  create: async (data: BizOwnerForm) => {
    const response = await apiClient.post<ApiResponse<BizOwnerDetail>>(`${BASE}/biz-owners`, data);
    return response.data.data;
  },

  update: async (id: number | string, data: BizOwnerForm) => {
    const response = await apiClient.put<ApiResponse<BizOwnerDetail>>(`${BASE}/biz-owners/${id}`, data);
    return response.data.data;
  },

  updateDept: async (id: number | string, deptCd: number) => {
    await apiClient.patch(`${BASE}/biz-owners/${id}/dept`, { deptCd });
  },

  searchBizTypes: async (keyword: string) => {
    const response = await apiClient.get<ApiResponse<string[]>>(`${BASE}/biz-owners/biz-types`, { params: { keyword } });
    return response.data.data;
  },

  searchBizItems: async (keyword: string) => {
    const response = await apiClient.get<ApiResponse<string[]>>(`${BASE}/biz-owners/biz-items`, { params: { keyword } });
    return response.data.data;
  },
};

// --- 고객 ---
export interface CustomerListItem {
  id: number;
  partnerCd: string;
  companyName: string;
  contactName: string;
  contactDept: string;
  contactPosition: string;
  contactEmail: string;
  contactPhone: string;
}

export interface CustomerDetail extends CustomerListItem {
  note: string;
}

export interface CustomerSaveRequest {
  partnerCd?: string;
  companyName: string;
  contactName?: string;
  contactDept?: string;
  contactPosition?: string;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
}

export const customerApi = {
  list: async (params: { keyword?: string; partnerCd?: string; page?: number; size?: number }) => {
    const response = await apiClient.get<ApiResponse<PageResponse<CustomerListItem>>>(`${BASE}/customers`, { params });
    return response.data;
  },

  detail: async (id: number | string) => {
    const response = await apiClient.get<ApiResponse<CustomerDetail>>(`${BASE}/customers/${id}`);
    return response.data.data;
  },

  create: async (data: CustomerSaveRequest) => {
    const response = await apiClient.post<ApiResponse<CustomerDetail>>(`${BASE}/customers`, data);
    return response.data.data;
  },

  update: async (id: number, data: CustomerSaveRequest) => {
    const response = await apiClient.put<ApiResponse<CustomerDetail>>(`${BASE}/customers/${id}`, data);
    return response.data.data;
  },

  remove: async (id: number) => {
    await apiClient.delete(`${BASE}/customers/${id}`);
  },
};

// --- 거래처별 담당자(ERP SD_PARTNERFN_INFO) ---
export interface PartnerFunctionListItem {
  companyCd: string;
  partnerCd: string;
  partnerNm: string;
  salesorgnCd: string;
  dischCd: string;
  prductgrpCd: string;
  prtnrFnCd: string;
  prtnrCd: string;
  partnerBpName: string;
  partnerBpDeptCd: string;
  partnerBpDeptName: string;
  defaultYn: string;
}

export const partnerFunctionApi = {
  list: async (params: { keyword?: string; partnerCd?: string; employeeNo?: string; page?: number; size?: number }) => {
    const response = await apiClient.get<ApiResponse<PageResponse<PartnerFunctionListItem>>>(
      `${BASE}/partner-functions`,
      { params },
    );
    return response.data;
  },
};

// --- Lookup ---
export const lookupApi = {
  searchPartners: async (keyword: string) => {
    const response = await apiClient.get<ApiResponse<{ partnerCd: string; partnerNm: string; bizrNo: string; ceoNm: string; bizType: string; bizItem: string }[]>>(
      '/lookup/partners', { params: { keyword } }
    );
    return [...(response.data.data ?? [])].sort((a, b) =>
      (a.partnerNm ?? '').localeCompare(b.partnerNm ?? '', 'ko', { sensitivity: 'base' })
    );
  },

  getDepartments: async () => {
    const response = await apiClient.get<ApiResponse<{ deptCd: number; deptNm: string }[]>>(
      '/lookup/departments'
    );
    return response.data.data;
  },

  /** 부서 트리 (팀/파트 계층용) — deptCd/deptNm/upDeptCd */
  getDeptTree: async () => {
    const response = await apiClient.get<ApiResponse<{ deptCd: number; deptNm: string; upDeptCd: number | null }[]>>(
      '/lookup/dept-tree'
    );
    return response.data.data ?? [];
  },

  getPlants: async () => {
    const response = await apiClient.get<ApiResponse<{ plantCd: number; plantNm: string }[]>>(
      '/lookup/plants'
    );
    return response.data.data ?? [];
  },

  searchEmployees: async (keyword: string) => {
    const response = await apiClient.get<ApiResponse<{ id: string; employeeNo: string; name: string; departmentName: string; deptCd?: number }[]>>(
      '/lookup/employees', { params: { keyword } }
    );
    return response.data.data ?? [];
  },

  getWorkTypes: async () => {
    const response = await apiClient.get<ApiResponse<{ value: string; label: string }[]>>(
      '/lookup/work-types'
    );
    return response.data.data ?? [];
  },

  getItemCategories: async () => {
    const response = await apiClient.get<ApiResponse<{ value: string; label: string }[]>>(
      '/lookup/item-categories'
    );
    return response.data.data ?? [];
  },
};

// --- 목표 ---
export const goalApi = {
  getPartGoals: async (year: number, month: number) => {
    const planYy = String(year);
    const planMm = String(month).padStart(2, '0');
    const response = await apiClient.get<ApiResponse<PartGoalItem[]>>(`${BASE}/part-goals`, { params: { year: planYy, month: planMm } });
    return response.data.data;
  },

  savePartGoals: async (data: { year: number; month: number; goals: PartGoalItem[] }) => {
    const payload = {
      planYy: String(data.year),
      planMm: String(data.month).padStart(2, '0'),
      goals: data.goals,
    };
    await apiClient.put<ApiResponse<void>>(`${BASE}/part-goals`, payload);
  },

  getAmGoals: async (year: number, month: number) => {
    const planYy = String(year);
    const planMm = String(month).padStart(2, '0');
    const response = await apiClient.get<ApiResponse<AmGoalItem[]>>(`${BASE}/am-goals`, { params: { year: planYy, month: planMm } });
    return response.data.data;
  },

  saveAmGoals: async (data: { year: number; month: number; goals: AmGoalItem[] }) => {
    const payload = {
      planYy: String(data.year),
      planMm: String(data.month).padStart(2, '0'),
      goals: data.goals,
    };
    await apiClient.put<ApiResponse<void>>(`${BASE}/am-goals`, payload);
  },

  /** deptCds: 영업부서 N개 (시트 #5). 단일 deptCd 도 호환 유지. */
  getAmGoalsYearly: async (planYy: string, deptCd?: string, plantCd?: number, salesEmpId?: string, deptCds?: string[]) => {
    const params: Record<string, unknown> = {
      year: planYy,
      plantCd: plantCd || undefined,
      salesEmpId: salesEmpId || undefined,
    };
    if (deptCds && deptCds.length > 0) params.deptCds = deptCds;
    else if (deptCd) params.deptCd = deptCd;
    const response = await apiClient.get<ApiResponse<AmGoalYearlyItem[]>>(`${BASE}/am-goals-yearly`, { params });
    return response.data.data ?? [];
  },

  saveAmGoalsYearly: async (data: { planYy: string; plantCd?: number; goals: AmGoalYearlyItem[] }) => {
    await apiClient.put<ApiResponse<void>>(`${BASE}/am-goals-yearly`, data);
  },
};
