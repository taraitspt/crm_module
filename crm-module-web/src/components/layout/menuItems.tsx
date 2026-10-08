import React from 'react';
import {
  HomeOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  ScheduleOutlined,
  FilePdfOutlined,
  BuildOutlined,
  FundOutlined,
} from '@ant-design/icons';
import type { Role } from '@/types/auth';

export interface AppMenuItem {
  key: string;
  icon?: React.ReactNode;
  label: string;
  roles?: Role[];
  /** 역할과 무관하게 메뉴 접근을 허용할 부서코드. */
  allowedDeptCds?: number[];
  /** 이 부서(dept_cd)에 속한 사용자에겐 메뉴를 숨긴다. */
  hideForDepts?: number[];
  children?: AppMenuItem[];
}

/** 시트 #1 0511_0 — 사이드바와 상단 메뉴가 동일 정의를 공유한다. */
export const MENU_ITEMS: AppMenuItem[] = [
  {
    // 매출관리 (2026-10-06 상단 메뉴 통합). 첫 화면 = 매출현황(계획 대비, '/'). 2026-09-18 기존 홈 대시보드는 폐기.
    // 매출리스트(/stats/sales-list)는 메뉴에 두지 않고 매출현황 안 버튼으로 연다 — 권한 키는 그대로라 버튼 노출도 그 키를 따른다.
    // 매출 후 잔여재고·수주 담당팀 점검·운송정보 부서 점검은 '수주 점검' 한 항목(탭, ?tab=leftover|so-cc). 옛 경로는 리다이렉트.
    key: 'sales',
    icon: <FundOutlined />,
    label: '매출관리',
    children: [
      { key: '/', icon: <HomeOutlined />, label: '매출현황' },
      { key: '/stats/data-check', label: '수주 점검' },
    ],
  },
  {
    key: 'info',
    icon: <InfoCircleOutlined />,
    label: '정보관리',
    children: [
      // 2026-09-18 당분간 미사용 — 필요 시 주석 해제 (routes/index.tsx 의 라우트·lazy import 도 같이)
      // { key: '/info/biz-owners', label: '사업자관리' },
      // { key: '/info/customers', label: '고객관리' },
      // { key: '/info/sales-persons', label: '영업담당자관리' },
      { key: '/info/sales-plan', label: '월매출계획' },
      // 2026-09-18 부서/AM 목표입력(goal_mst)은 월매출계획으로 대체 — 필요 시 주석 해제
      // { key: '/info/goal', label: '목표입력' },
    ],
  },
  {
    key: 'activity',
    icon: <ScheduleOutlined />,
    label: '영업관리',
    children: [
      { key: '/activity/attention', label: '관리 필요 거래처' },
      { key: '/deals', label: '수주 추진' },
      { key: '/activity/calendar', label: '영업활동 캘린더' },
      { key: '/activity/board', label: '일자별 영업현황' },
      { key: '/activity/list', label: '영업활동 이력' },
      { key: '/activity/partner', label: '거래처 카드' },
    ],
  },
  {
    // TPS(공장 1000) 생산 — ERP 조회 전용. 권한 키는 MenuCatalog 에 등록.
    key: 'production',
    icon: <BuildOutlined />,
    label: '생산현황',
    children: [
      { key: '/production/plan', label: '생산계획현황' },
      { key: '/production/dashboard', label: '생산계획 대시보드' },
      { key: '/production/equipment-perf', label: '설비별 작업실적' },
      { key: '/production/equipment-board', label: '설비 가동 현황' },
      { key: '/production/order-progress', label: '주문진행현황' },
      { key: '/production/plan-register', label: '생산계획조회' },
      { key: '/production/schedule', label: '생산일정현황' },
      { key: '/production/lifecycle', label: '주문 타임라인' },
    ],
  },
  // 2026-09-18 '데이터 분석' 탭 전체 미사용 — 매출현황은 홈('/')으로 올라갔고,
  // 나머지 통계는 CRM 범위 밖이라 껐다. 되살리려면 이 블록과 routes/index.tsx 의
  // 해당 라우트·lazy import 를 함께 주석 해제.
  // {
  //   key: 'stats',
  //   icon: <BarChartOutlined />,
  //   label: '데이터 분석',
  //   children: [
  //     { key: '/stats/customer-yearly-sales', label: '거래처별 월매출' },
  //     { key: '/stats/customer-yearly-sales-detail', label: '거래처별 월매출(상세)' },
  //     { key: '/stats/customer-sales-growth', label: '거래처별 매출증감' },
  //     { key: '/stats/design-sales', label: '디자인매출통계' },
  //   ],
  // },
  // 2026-09-18 수익성 분석 탭 전체 미사용 — 되살리려면 이 블록과 routes/index.tsx 의
  // vendor-margin / order-margin / grp-profit 라우트·lazy import 를 함께 주석 해제.
  // {
  //   key: 'profit',
  //   icon: <RiseOutlined />,
  //   label: '수익성 분석',
  //   children: [
  //     { key: '/stats/grp-profit', label: 'GRP수익비용대응' },
  //     { key: '/stats/order-margin', label: '주문건별 외주 마진율' },
  //     { key: '/stats/vendor-margin', label: '거래처별 외주 마진율' },
  //   ],
  // },
  { key: '/tools/pdf', icon: <FilePdfOutlined />, label: 'PDF 변환' },
  {
    key: 'admin',
    icon: <SettingOutlined />,
    label: '관리자',
    roles: ['ADMIN', 'FINANCE'],
    children: [
      { key: '/admin/active-users', label: '실시간 접속 현황', roles: ['ADMIN'] },
      { key: '/admin/erp-sync', label: 'ERP 동기화', roles: ['ADMIN'] },
      // 2026-10-06 월마감 관리·공통코드 관리는 쓰지 않아 뺐다(사용자 결정). 코드는 남아 있다 — 되살리려면 여기와 routes/index.tsx, MenuCatalog 를 함께 푼다.
      // { key: '/admin/closing', label: '월마감 관리', roles: ['ADMIN', 'FINANCE'] },
      // { key: '/admin/common-codes', label: '공통코드 관리', roles: ['ADMIN'] },
      { key: '/admin/users', label: '사용자 관리', roles: ['ADMIN'] },
      { key: '/admin/departments', label: '부서 관리', roles: ['ADMIN'] },
      { key: '/admin/menu-permissions', label: '권한 관리', roles: ['ADMIN'] },
      // 채권연령분석 — 더존 채권원장 기준 사업부별(파주/그래픽스/PM/전사) 채권 대시보드. 2026-09-28 sm_module 에서 이관.
      { key: '/admin/receivable-aging', label: '채권연령분석', roles: ['ADMIN', 'FINANCE'] },
    ],
  },
];

/**
 * 서버에서 받은 허용 메뉴키로 걸러낸다 (관리자 → 권한 관리에서 설정).
 * allowedKeys 가 없으면(아직 못 받았거나 구버전 백엔드) 아래 filterMenuByRole 로 폴백한다.
 */
export function filterMenuByKeys(items: AppMenuItem[], allowedKeys: Set<string>): AppMenuItem[] {
  return items
    .map((item) => {
      if (item.children) {
        const children = filterMenuByKeys(item.children, allowedKeys);
        return children.length === 0 ? null : { ...item, children };
      }
      return allowedKeys.has(item.key) ? item : null;
    })
    .filter(Boolean) as AppMenuItem[];
}

export function filterMenuByRole(items: AppMenuItem[], role?: Role, deptCd?: number | null): AppMenuItem[] {
  return items
    // 역할 조건(roles) + 부서 숨김(hideForDepts) 둘 다 통과해야 노출.
    .filter((item) => ((!item.roles || (role != null && item.roles.includes(role)))
        || (deptCd != null && item.allowedDeptCds?.includes(deptCd)))
      && !(deptCd != null && item.hideForDepts?.includes(deptCd)))
    .map((item) => {
      if (item.children) {
        const filtered = filterMenuByRole(item.children, role, deptCd);
        if (filtered.length === 0) return null;
        return { ...item, children: filtered };
      }
      return item;
    })
    .filter(Boolean) as AppMenuItem[];
}

/** 현재 path 로 활성 topkey 결정 (사이드바 openKeys 및 헤더 selectedKeys 공통 사용). */
export function getActiveTopKey(pathname: string): string {
  // 매출현황은 홈('/')이 정식 경로. 구 경로로 들어와도 홈이 활성화되게 먼저 판정한다.
  if (pathname === '/' || pathname.startsWith('/stats/sales-status')) return 'sales';
  if (pathname.startsWith('/stats/sales-list')) return 'sales';
  if (pathname.startsWith('/stats/data-check') || pathname.startsWith('/stats/stock-leftover') || pathname.startsWith('/stats/so-cc-check')) return 'sales';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/deals')) return 'activity';
  if (pathname.startsWith('/tools/pdf')) return '/tools/pdf';
  if (pathname.startsWith('/production')) return 'production';
  // 수익성 분석 화면들은 경로가 /stats 지만 활성키는 'profit'.
  // (아래 일반 /stats 분기보다 먼저 판정해야 함)
  if (pathname.startsWith('/stats/grp-profit')) return 'profit';
  if (pathname.startsWith('/stats/order-margin')) return 'profit';
  if (pathname.startsWith('/stats/vendor-margin')) return 'profit';
  if (pathname.startsWith('/info')) return 'info';
  if (pathname.startsWith('/stats')) return 'stats';
  if (pathname.startsWith('/admin')) return 'admin';
  return '';
}
