import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { AdminUser, MenuPermissionMatrix, MyAccess, ResourceScopeMatrix } from '@/types/permission';

export const permissionApi = {
  matrix: async () => {
    const res = await apiClient.get<ApiResponse<MenuPermissionMatrix>>('/menu-permissions');
    return res.data.data;
  },
  save: async (cells: { menuKey: string; role: string; canView: boolean }[]) => {
    await apiClient.put('/menu-permissions', { cells });
  },
  scopeMatrix: async () => {
    const res = await apiClient.get<ApiResponse<ResourceScopeMatrix>>('/menu-permissions/scopes');
    return res.data.data;
  },
  saveScopes: async (cells: { resource: string; role: string; scope: string }[]) => {
    await apiClient.put('/menu-permissions/scopes', { cells });
  },
  /** 로그인 사용자의 접근 가능 메뉴 + 리소스별 데이터 범위. 사이드바/상단 메뉴가 이걸로 구성된다. */
  myAccess: async () => {
    const res = await apiClient.get<ApiResponse<MyAccess>>('/menu-permissions/me');
    return res.data.data;
  },
};

export const userAdminApi = {
  list: async (params: { keyword?: string; deptCd?: number; role?: string }) => {
    const res = await apiClient.get<ApiResponse<AdminUser[]>>('/admin/users', {
      params: {
        keyword: params.keyword || undefined,
        deptCd: params.deptCd ?? undefined,
        role: params.role || undefined,
      },
    });
    return res.data.data ?? [];
  },
  update: async (userId: string, payload: { role: string; deptCd?: number | null; status?: string }) => {
    await apiClient.put(`/admin/users/${encodeURIComponent(userId)}`, payload);
  },
};
