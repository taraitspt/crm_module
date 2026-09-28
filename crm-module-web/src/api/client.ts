import axios, { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

/**
 * Axios 인스턴스.
 * baseURL은 Vite proxy를 통해 백엔드로 전달된다.
 */
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 요청 인터셉터: Authorization 헤더에 JWT Access Token 첨부.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // zustand persist 가 비동기 hydrate 라 store.accessToken 이 null 인 race 가 있어
    // localStorage 의 persisted state 도 fallback 으로 읽는다.
    let accessToken: string | null = useAuthStore.getState().accessToken;
    if (!accessToken) {
      try {
        const raw = localStorage.getItem('sm-auth-storage');
        if (raw) accessToken = JSON.parse(raw)?.state?.accessToken ?? null;
      } catch { /* ignore parse error */ }
    }
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 응답 인터셉터:
 * - 401 응답 시 로그아웃 처리.
 */
/**
 * 토큰 만료가 아니라 endpoint 미배포/매핑 부재로도 401 이 떨어진다
 * (Spring 이 매핑 없는 path 를 /error 로 forward 하는 동작).
 * 이런 path 는 자동 로그아웃에서 제외해 부분 회귀가 전면 로그아웃을 일으키지 않도록 한다.
 */
const NO_AUTO_LOGOUT_PATHS = [
  // 실시간 접속 현황 하트비트/목록 — 백엔드 미배포 시 401 이 떨어져도 로그인 직후 전면 로그아웃을 막는다.
  // (하트비트는 로그인 성공 직후 자동 호출되므로, 미배포 상태에서 로그인 튕김의 원인이 됨)
  '/admin/active-users',
  // 영업활동 — 헤더 알림(FollowUpBell)이 모든 화면에서 호출한다. 백엔드가 구버전이면
  // 매핑이 없어 401 이 떨어지고, 그대로 두면 어느 화면에 있든 로그인 화면으로 튕긴다.
  '/activities',
];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const originalRequest = error.config as InternalAxiosRequestConfig;
      const url = originalRequest.url ?? '';
      const skip = url.includes('/auth/login')
        || NO_AUTO_LOGOUT_PATHS.some((p) => url.includes(p));
      if (!skip) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
