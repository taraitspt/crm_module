import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { allowedInShell, isDesktopBrowser, isMobileMode } from '@/utils/shell';

/**
 * 앱/PC 관문 — 보호 라우트 전체를 감싼다(routes/index.tsx 의 Protected).
 * 모바일 모드(앱, 또는 /m 을 연 적 있는 폰 브라우저)에서 PC 경로를 열면 /m 으로, PC 브라우저에서 /m 을 열면 PC 홈으로 보낸다.
 * 예외는 utils/shell.ts 의 allowedInShell(작업지시서·설치 안내·인증 화면).
 */
const ShellGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  if (isMobileMode() && !allowedInShell(pathname)) return <Navigate to="/m" replace />;
  if (isDesktopBrowser() && /^\/m(\/|$)/.test(pathname)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default ShellGate;
