import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { activeUsersApi } from '@/api/activeUsers.api';

/** 하트비트 간격(ms) — 접속 판정(online) 창(서버 3분)보다 충분히 짧게. */
const HEARTBEAT_MS = 45_000;

/**
 * 실시간 접속 현황용 하트비트.
 * 로그인 상태 + 탭이 보일 때(visible) 주기적으로 ping 을 보내 "탭 열려있음"을 서버에 알린다.
 * (JWT 무상태라 서버가 열린 탭을 알 방법이 없어 이 핑으로 접속중을 잡는다.)
 * 렌더링 없음. 앱 루트에 1회 마운트.
 */
export default function HeartbeatManager() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      activeUsersApi.ping().catch(() => { /* 접속 현황 실패는 조용히 무시(401 은 client 인터셉터가 처리) */ });
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    // 탭이 다시 보이면 즉시 한 번 갱신(백그라운드에서 돌아왔을 때 빠르게 online 반영).
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated]);

  return null;
}
