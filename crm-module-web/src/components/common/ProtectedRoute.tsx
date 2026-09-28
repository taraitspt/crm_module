import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import type { Role } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
  allowedDeptCds?: number[];
  /** 임시비번 강제변경 게이트를 건너뛴다 (강제변경 페이지 자신에만 사용). */
  skipPasswordGate?: boolean;
}

/**
 * 인증 가드 컴포넌트.
 * 미인증 사용자를 /login으로 리다이렉트한다.
 * allowedRoles가 지정되면 해당 역할만 접근 가능하며, 미충족 시 /로 리다이렉트한다.
 * 임시 비밀번호 상태(passwordResetRequired)면 강제변경 화면으로 보낸다.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, allowedDeptCds, skipPasswordGate }) => {
  const { isAuthenticated, user, passwordResetRequired } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 임시 비밀번호로 로그인한 경우 — 새 비밀번호를 설정하기 전까지 모든 화면 접근을 막는다.
  if (passwordResetRequired && !skipPasswordGate) {
    return <Navigate to="/force-password-change" replace />;
  }

  const roleAllowed = !allowedRoles || (user?.role != null && allowedRoles.includes(user.role));
  const deptAllowed = user?.deptCd != null && allowedDeptCds?.includes(user.deptCd);
  if (!roleAllowed && !deptAllowed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
