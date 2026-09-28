import apiClient from './client';
import type { ApiResponse } from '@/types/common';

export interface ActiveUser {
  userId: string;
  name: string | null;
  role: string | null;
  active: boolean;
  lastActivitySec: number; // 실요청 경과초(-1 = 하트비트만, 실요청 없음)
  lastBeatSec: number;     // 최근 요청 경과초
  lastPath: string | null;
}

export interface ActiveUsersResponse {
  serverTime: string;
  onlineCount: number;
  activeCount: number;
  users: ActiveUser[];
}

export const activeUsersApi = {
  /** 접속/활동 사용자 목록(ADMIN). */
  list: async (): Promise<ActiveUsersResponse> => {
    const res = await apiClient.get<ApiResponse<ActiveUsersResponse>>('/admin/active-users');
    return res.data.data!;
  },
  /** 하트비트 — 탭이 열려 있음을 알린다(모든 로그인 사용자). */
  ping: async (): Promise<void> => {
    await apiClient.get('/admin/active-users/ping');
  },
};
