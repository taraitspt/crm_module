import apiClient from './client';
import type { ApiResponse } from '@/types/common';

export interface CommonCodeItem {
  groupCd: string;
  code: string;
  label: string;
  sortOrder: number;
  useYn: string;
  /** 내부/외부 구분 (작업처 JOB_TYPE 용): 'I'(내부)/'O'(외부) */
  wrkDiv?: string;
}

export const codeApi = {
  /** 드롭다운용 — 그룹별 사용중 코드 */
  getCodes: async (group: string) => {
    const res = await apiClient.get<ApiResponse<CommonCodeItem[]>>('/lookup/codes', { params: { group } });
    return res.data.data ?? [];
  },

  // ── 관리자 ──
  getGroups: async () => {
    const res = await apiClient.get<ApiResponse<string[]>>('/admin/common-codes/groups');
    return res.data.data ?? [];
  },

  /** 그룹별 전체(미사용 포함) */
  listAll: async (group: string) => {
    const res = await apiClient.get<ApiResponse<CommonCodeItem[]>>('/admin/common-codes', { params: { group } });
    return res.data.data ?? [];
  },

  save: async (item: CommonCodeItem) => {
    const res = await apiClient.post<ApiResponse<void>>('/admin/common-codes', item);
    return res.data;
  },

  remove: async (group: string, code: string) => {
    const res = await apiClient.delete<ApiResponse<void>>('/admin/common-codes', { params: { group, code } });
    return res.data;
  },
};
