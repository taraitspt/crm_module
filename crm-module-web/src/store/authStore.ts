import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/auth';

interface AuthState {
  /** JWT Access Token */
  accessToken: string | null;
  /** 로그인한 사용자 정보 */
  user: User | null;
  /** 인증 여부 */
  isAuthenticated: boolean;
  /** 임시 비밀번호로 로그인 — 새 비밀번호 설정 전까지 앱 사용을 막고 강제변경 화면으로 유도. */
  passwordResetRequired: boolean;

  /** 로그인 성공 시 토큰 저장 */
  setTokens: (accessToken: string) => void;
  /** 사용자 정보 설정 */
  setUser: (user: User) => void;
  /** 임시 비밀번호 강제변경 필요 여부 설정 */
  setPasswordResetRequired: (v: boolean) => void;
  /** 로그아웃 - 모든 상태 초기화 */
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      passwordResetRequired: false,

      setTokens: (accessToken) =>
        set({
          accessToken,
          isAuthenticated: true,
        }),

      setUser: (user) =>
        set({ user }),

      setPasswordResetRequired: (v) =>
        set({ passwordResetRequired: v }),

      logout: () =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          passwordResetRequired: false,
        }),
    }),
    {
      name: 'sm-auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        passwordResetRequired: state.passwordResetRequired,
      }),
    }
  )
);
