import React from 'react';
import { T } from '@/theme/designTokens';

/** AntD 색상명(green/red/blue…) → 테크니컬 팔레트 hex 매핑. */
const ANTD_COLOR: Record<string, string> = {
  green: T.ok, success: T.ok, lime: T.ok,
  red: T.er, error: T.er, volcano: T.er,
  gold: T.wa, warning: T.wa, orange: T.wa, yellow: T.wa,
  blue: T.bl, geekblue: T.bl, processing: T.bl, cyan: T.bl,
  purple: T.pu, magenta: T.pu, pink: T.pu,
  teal: T.primary, primary: T.primary,
  default: T.t4, '': T.t4,
};

function resolveColor(color?: string): string {
  if (!color) return T.t4;
  if (color.startsWith('#') || color.startsWith('rgb')) return color;
  return ANTD_COLOR[color] ?? T.t4;
}

interface StatusDotProps {
  label: React.ReactNode;
  /** hex/rgb 또는 AntD 색상명. 미지정 시 중립 회색. */
  color?: string;
}

/**
 * 테크니컬 데이터 UI용 상태 표시 — 알약(pill) 배지 대신 색 점 + 텍스트.
 * 밀도 높은 테이블에서 위계를 흩뜨리지 않고 상태를 읽히게 한다.
 */
const StatusDot: React.FC<StatusDotProps> = ({ label, color }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.t2, whiteSpace: 'nowrap' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: resolveColor(color), flexShrink: 0 }} />
    {label}
  </span>
);

export default StatusDot;
