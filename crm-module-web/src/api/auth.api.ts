import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type {
  LoginRequest,
  TokenResponse,
  User,
} from '@/types/auth';

/**
 * 로그인 API
 */
export const login = async (data: LoginRequest): Promise<TokenResponse> => {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/login', data);
  return response.data.data;
};

/**
 * 로그아웃 API
 */
export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/logout');
};

/**
 * 내 정보 조회 API
 */
export const getMe = async (): Promise<User> => {
  const response = await apiClient.get<ApiResponse<User>>('/auth/me');
  return response.data.data;
};

/**
 * 내 비용센터(cc_cd) 변경 API
 * - 4자 영숫자 또는 빈 문자열(NULL) 허용
 */
export const updateMyCcCd = async (ccCd: string): Promise<User> => {
  const response = await apiClient.put<ApiResponse<User>>('/auth/me/cc-cd', { ccCd });
  return response.data.data;
};

/**
 * 시트 #1 0504_1 — 내 연락처/이메일/직책 변경 API.
 * 견적서 등 외부 문서에 표시되는 정보를 사용자가 직접 갱신.
 */
export const updateMyProfile = async (
  payload: { phone?: string; contactPhone?: string; email?: string },
): Promise<User> => {
  const response = await apiClient.put<ApiResponse<User>>('/auth/me/profile', payload);
  return response.data.data;
};

/**
 * 시트 #1 0504 — 내 비밀번호 변경 API.
 * 현재 비밀번호로 본인 확인 후 새 비밀번호로 교체.
 */
/** 비밀번호 변경 — 서버가 새 토큰을 돌려준다(임시 비밀번호 토큰은 변경 후에도 다른 API 가 403 이라 갈아끼워야 한다). */
export const changeMyPassword = async (
  payload: { currentPassword: string; newPassword: string },
): Promise<TokenResponse> => {
  const res = await apiClient.put<ApiResponse<TokenResponse>>('/auth/me/password', payload);
  return res.data.data;
};

/** 시트 #1 — 2차인증 OTP 검증. mfaRequired=true 시 후속 호출. */
export const verifyMfa = async (
  payload: { challenge: string; code: string },
): Promise<TokenResponse> => {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/mfa/verify', payload);
  return response.data.data;
};

/** 시트 #1 — 마이페이지 2차인증 토글. */
export const toggleMfa = async (enabled: boolean): Promise<User> => {
  const response = await apiClient.put<ApiResponse<User>>('/auth/me/mfa', { enabled });
  return response.data.data;
};

/** 비밀번호 찾기 — ERP ID(로그인 ID)로 임시 비밀번호를 Teams 로 발송. */
export const resetPassword = async (payload: {
  companyCd?: number;
  loginId: string;
}): Promise<void> => {
  await apiClient.post('/public/password-reset', payload);
};
