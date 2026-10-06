/** 권한 타입 — 백엔드 MenuPermissionDto / ResourceScopeDto / UserAdminDto 와 1:1 */

export type DataScope = 'NONE' | 'SELF' | 'DEPT' | 'ALL';

/** 실제 운용할 4개 역할을 앞에 두고, 나머지는 기존 데이터 호환용으로 남긴다. */
export const ROLE_META: { value: string; label: string; primary: boolean }[] = [
  { value: 'ADMIN', label: '관리자', primary: true },
  { value: 'TEAM_LEADER', label: '팀장', primary: true },
  { value: 'MANAGER', label: '일반매니저', primary: true },
  { value: 'SALES_SPT', label: '영업지원', primary: true },
  { value: 'PART_LEADER', label: '파트장', primary: false },
  { value: 'EXECUTIVE', label: '임원', primary: false },
  { value: 'CENTER_LEADER', label: '센터장', primary: false },
  { value: 'FINANCE', label: '회계', primary: false },
  { value: 'STAFF', label: '사원', primary: false },
];

/** 직책 — 백엔드 JobTitle.ALL 과 같은 값(한글 그대로 저장). 낮은 직책부터. 관리자만 사용자 관리에서 바꾼다.
 *  역할(시스템 권한)과 별개 — 직책을 바꿔도 역할은 그대로다. */
export const JOB_TITLES = ['매니저', '파트장', '센터장', '팀장', '본부장', '대표이사', '회장'] as const;
export const JOB_TITLE_OPTIONS = JOB_TITLES.map((t) => ({ value: t, label: t }));

export const roleMeta = (r?: string | null) =>
  ROLE_META.find((x) => x.value === r) ?? { value: r ?? '-', label: r ?? '-', primary: false };

export const SCOPE_LABEL: Record<DataScope, string> = {
  NONE: '없음',
  SELF: '본인',
  DEPT: '본인 부서',
  ALL: '전체',
};

/** 범위 선택 옵션 — 좁은 것부터 */
export const SCOPE_OPTIONS: { value: DataScope; label: string }[] = [
  { value: 'NONE', label: '없음' },
  { value: 'SELF', label: '본인' },
  { value: 'DEPT', label: '본인 부서' },
  { value: 'ALL', label: '전체' },
];

/** 범위 태그 색 — 넓을수록 진하게 */
export const SCOPE_COLOR: Record<DataScope, string> = {
  NONE: 'default',
  SELF: 'blue',
  DEPT: 'cyan',
  ALL: 'green',
};

export const scopeLabel = (s?: string | null) => SCOPE_LABEL[(s as DataScope) ?? 'SELF'] ?? s ?? '-';

export interface MenuPermissionRow {
  menuKey: string;
  group: string;
  label: string;
  adminArea: boolean;
  roles: Record<string, boolean>;
}

export interface MenuPermissionMatrix {
  roleOrder: string[];
  rows: MenuPermissionRow[];
}

/** 데이터 범위 매트릭스 — 리소스(행) × 역할(열) */
export interface ResourceScopeRow {
  resource: string;
  label: string;
  desc: string;
  roles: Record<string, DataScope>;
}

export interface ResourceScopeMatrix {
  roleOrder: string[];
  rows: ResourceScopeRow[];
}

export interface MyAccess {
  role: string | null;
  /** 리소스 → 범위 */
  scopes: Record<string, DataScope>;
  menuKeys: string[];
}

export interface AdminUser {
  id: string;
  employeeNo: string | null;
  name: string;
  deptCd: number | null;
  deptNm: string | null;
  /** 직책 (JOB_TITLES 중 하나 — 옛 자유 입력값이 남아 있을 수 있다) */
  jobTitle: string | null;
  role: string | null;
  /** 역할에서 파생된 리소스별 범위 — 여기서 직접 바꾸지 않는다 */
  scopes: Record<string, DataScope>;
  status: string | null;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  /** 연속 로그인 실패 횟수 */
  failedLoginCount: number;
  /** 잠금 해제 시각(ISO) — null 이면 잠기지 않음 */
  lockedUntil: string | null;
  /** 지금 잠겨 있는가 */
  locked: boolean;
}

/** 리소스 표시명 — 사용자 목록처럼 매트릭스를 안 받아오는 곳에서 쓴다. */
export const RESOURCE_LABEL: Record<string, string> = {
  ACTIVITY: '영업활동',
  DEAL: '수주 추진',
  SALES_PLAN: '월매출계획',
  SALES_STATS: '매출현황',
};

/** 리소스별 범위를 "본인 · 전체" 처럼 한 줄로 줄인다. */
export const scopeSummary = (scopes?: Record<string, string> | null) => {
  const vals = Object.values(scopes ?? {});
  if (vals.length === 0) return '-';
  return [...new Set(vals)]
    .sort((a, b) => SCOPE_ORDER.indexOf(a as DataScope) - SCOPE_ORDER.indexOf(b as DataScope))
    .map((v) => SCOPE_LABEL[v as DataScope] ?? v)
    .join(' · ');
};

const SCOPE_ORDER: DataScope[] = ['NONE', 'SELF', 'DEPT', 'ALL'];
