/** 사용자 역할 */
export type Role = 'ADMIN' | 'EXECUTIVE' | 'MANAGER' | 'TEAM_LEADER' | 'PART_LEADER' | 'FINANCE' | 'SALES_SPT' | 'CENTER_LEADER' | 'STAFF';

/** 사용자 상태 */
export type UserStatus = 'ACTIVE' | 'INACTIVE';

/** 로그인 사용자 정보 */
export interface User {
  id: string;
  employeeNo: string;
  name: string;
  /** 휴대폰 번호 */
  phone: string | null;
  /** 사무실/직통 연락처 */
  contactPhone?: string | null;
  email: string | null;
  role: Role;
  status: UserStatus;
  companyCd: number;
  deptCd: number | null;
  departmentName: string | null;
  ccCd?: string | null;
  /** 시트 #1 0504 — 직책 (예: 파트장, 팀장, 사원) */
  jobTitle?: string | null;
  /** 시트 #1 — 2차인증 활성 여부 */
  mfaEnabled?: boolean;
}

/** 로그인 요청 (식별자 = 아이디, ERP USER_ID) */
export interface LoginRequest {
  id: string;
  password: string;
}

/** 토큰 응답. mfaRequired=true 면 accessToken 은 비어있고 mfaChallenge 로 /auth/mfa/verify 호출 필요. */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  mfaRequired?: boolean;
  mfaChallenge?: string;
  /** 임시 비밀번호로 로그인한 경우 true — 새 비밀번호 설정 화면으로 강제 유도. */
  passwordResetRequired?: boolean;
}
