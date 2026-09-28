/**
 * TARA TPS 디자인 토큰 (Claude Design 핸드오프 → 실제 코드 반영).
 *
 * 브랜드: 타라티피에스(TARA TPS) 공식 팔레트.
 *   - TARA GREEN  #0096A2 (PANTONE 7467c)  → 포인트 컬러(primary)
 *   - TARA BLUE   #003957 (PANTONE 320c)   → 다크 네비/브랜드 패널(navy)
 *   - TARA ORANGE #F08300 (PANTONE 151c)   → 경고(warning)
 *   - TARA YELLOWGREEN #DBE000 / TARA GRAY #B4ACA5 → 보조 포인트
 *
 * - AntD `ConfigProvider`(App.tsx)는 이 값을 token/components 로 매핑한다.
 * - 다크 사이드바·로고처럼 AntD 토큰으로 표현 안 되는 부분은 이 객체를 직접 참조한다.
 */
export const T = {
  // 폰트
  font: "'Pretendard Variable', 'Pretendard', 'Inter', system-ui, -apple-system, sans-serif",

  // 브랜드 네이비 (TARA BLUE) — 다크 사이드바 / 로그인 패널 공용
  navy: '#003957',
  navyDeep: '#00263B',

  // 다크 사이드바 (TARA BLUE 베이스)
  sidebarBg: '#003957',
  sidebarText: '#8FA9B8',
  sidebarTextActive: '#F1F7FA',
  sidebarActiveBg: 'rgba(0, 150, 162, 0.22)',
  sidebarHoverBg: 'rgba(255, 255, 255, 0.07)',
  sidebarGroupActiveBg: 'rgba(255, 255, 255, 0.05)',
  sidebarBorder: 'rgba(255, 255, 255, 0.08)',
  sidebarDivider: 'rgba(255, 255, 255, 0.10)',

  // 배경 / 면 / 보더
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  border1: '#E5E7EB',
  border2: '#F1F3F5',
  border3: '#F9FAFB',

  // 포인트 컬러 (TARA GREEN #0096A2)
  primary: '#0096A2',
  primary50: '#E6F6F7',
  primary100: '#CCEFF1',
  primary600: '#0096A2',
  primary700: '#007E89',

  // 텍스트 스케일
  t1: '#111827',
  t2: '#374151',
  t3: '#6B7280',
  t4: '#9CA3AF',

  // 시맨틱 (경고는 TARA ORANGE)
  ok: '#10B981', okBg: '#ECFDF5', okBd: '#A7F3D0',
  er: '#EF4444', erBg: '#FEF2F2', erBd: '#FECACA',
  wa: '#F08300', waBg: '#FFF4E6', waBd: '#FFD6A8',
  bl: '#3B82F6', blBg: '#EFF6FF', blBd: '#BFDBFE',
  pu: '#8B5CF6', puBg: '#F5F3FF', puBd: '#DDD6FE',
} as const;

export type DesignTokens = typeof T;
