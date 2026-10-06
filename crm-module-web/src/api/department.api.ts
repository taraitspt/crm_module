import apiClient from './client';
import type { ApiResponse } from '@/types/common';

/** 부서 관리(관리자) — 백엔드 /api/departments (DepartmentController) */
export interface AdminDepartment {
  deptCd: number;
  deptNm: string;
  upDeptCd: number | null;
  upDeptNm: string | null;
  headcount: number;
  /** 부서장(본부장·팀장 등) — 관리자 지정, ERP 동기화가 건드리지 않음 */
  headEmployeeNo: string | null;
  headName: string | null;
  /** false = 미사용 — 트리·부서 선택에서 숨김 */
  inUse: boolean;
  /** true = 부서 관리에서 직접 추가한 부서(ERP 에 없음, 90001~) — 이름 변경·삭제 가능 */
  manual: boolean;
  /** 소속 재직자 — 직책 높은 순 → 이름순 */
  members: DeptMember[];
  /** 같은 상위 부서 안 표시 순서 — 작을수록 위, null 이면 부서 코드 순(뒤쪽) */
  sortOrder: number | null;
}

export interface DeptMember {
  employeeNo: string;
  name: string;
  jobTitle: string;
}

export interface UseResult {
  changed: number;
  /** 건너뛴 부서와 사유 — "부서명: 사유" */
  skipped: string[];
}

export const departmentAdminApi = {
  list: async () => {
    const res = await apiClient.get<ApiResponse<AdminDepartment[]>>('/departments/admin');
    return res.data.data ?? [];
  },
  /** 상위 부서 지정 — null 이면 최상위 */
  setParent: async (deptCd: number, upDeptCd: number | null) => {
    await apiClient.put(`/departments/${deptCd}/parent`, { upDeptCd });
  },
  /** 부서장 지정 — null 이면 해제 */
  setHead: async (deptCd: number, employeeNo: string | null) => {
    await apiClient.put(`/departments/${deptCd}/head`, { employeeNo });
  },
  /** 부서 직접 추가 — ERP 에 없는 묶음. 새 부서 코드를 돌려준다 */
  create: async (body: { deptNm: string; upDeptCd: number | null; headEmployeeNo: string | null }) => {
    const res = await apiClient.post<ApiResponse<{ deptCd: number }>>('/departments', body);
    return res.data.data?.deptCd;
  },
  /** 이름 변경 — 직접 추가한 부서만 */
  rename: async (deptCd: number, deptNm: string) => {
    await apiClient.put(`/departments/${deptCd}/name`, { deptNm });
  },
  /** 사용 / 미사용 — 여러 부서 한 번에 */
  setInUse: async (deptCds: number[], inUse: boolean) => {
    const res = await apiClient.post<ApiResponse<UseResult>>('/departments/use', { deptCds, inUse });
    return res.data.data ?? { changed: 0, skipped: [] };
  },
  /** 여러 부서를 한 상위 부서 아래로 — null 이면 최상위. 막힌 부서는 건너뛰고 사유를 돌려준다 */
  move: async (deptCds: number[], upDeptCd: number | null) => {
    const res = await apiClient.post<ApiResponse<UseResult>>('/departments/move', { deptCds, upDeptCd });
    return res.data.data ?? { changed: 0, skipped: [] };
  },
  /** 표시 순서 — 같은 상위 부서 안의 부서들을 이 순서대로 */
  reorder: async (deptCds: number[]) => {
    await apiClient.post('/departments/order', { deptCds });
  },
  /** 삭제 — 직접 추가한 부서 중 비어 있는 것만 */
  remove: async (deptCd: number) => {
    await apiClient.delete(`/departments/${deptCd}`);
  },
};
