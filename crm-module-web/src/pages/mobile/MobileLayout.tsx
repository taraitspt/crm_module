import React, { Suspense, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Spin } from 'antd';
import {
  AlertOutlined, BarChartOutlined, CalendarOutlined, CloseOutlined, DesktopOutlined,
  DownloadOutlined, LogoutOutlined, ProfileOutlined, ShopOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutApi } from '@/api/auth.api';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { AppMenuItem } from '@/components/layout/menuItems';
import FollowUpBell from '@/components/layout/FollowUpBell';
import Logo from '@/components/common/Logo';
import { T } from '@/theme/designTokens';
import { useInstallPrompt } from './mobileKit';

const TOP_H = 54;
const TAB_H = 60;
const INSTALL_DISMISS_KEY = 'm-install-dismissed';

/**
 * 모바일 앱(/m) 탭 — 폰에서 쓸 네 화면만. PC 메뉴 전체를 옮기지 않는다(표 화면은 폰 폭에 안 맞음).
 * menuKey 는 PC 메뉴 키 — 관리자 > 권한 관리에서 그 메뉴를 끈 역할에겐 탭도 안 보인다.
 */
export const MOBILE_TABS = [
  { key: 'activity', path: '/m/activity', label: '활동', icon: <CalendarOutlined />, menuKey: '/activity/calendar' },
  { key: 'partner', path: '/m/partner', label: '거래처', icon: <ShopOutlined />, menuKey: '/activity/partner' },
  { key: 'attention', path: '/m/attention', label: '관리필요', icon: <AlertOutlined />, menuKey: '/activity/attention' },
  { key: 'sales', path: '/m/sales', label: '매출', icon: <BarChartOutlined />, menuKey: '/' },
];

function flattenKeys(items: AppMenuItem[], out = new Set<string>()): Set<string> {
  for (const it of items) {
    if (it.children) flattenKeys(it.children, out); else out.add(it.key);
  }
  return out;
}

/** 모바일 셸 — 상단바(로고·제목·알림·사용자) + 본문 + 하단 탭. */
const MobileLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: logoutStore } = useAuthStore();
  const { modal } = App.useApp();
  const { items } = useMenuAccess();
  const { isStandalone, isIOS, canInstall, install } = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
  });

  const allowed = useMemo(() => flattenKeys(items), [items]);
  const tabs = useMemo(() => MOBILE_TABS.filter((t) => allowed.has(t.menuKey)), [allowed]);
  const active = tabs.find((t) => location.pathname.startsWith(t.path)) ?? MOBILE_TABS.find((t) => location.pathname.startsWith(t.path));

  const logoutNow = async () => {
    try { await logoutApi(); } catch { /* ignore */ } finally {
      logoutStore();
      navigate('/login');
    }
  };
  const userMenu = {
    items: [
      { key: 'who', label: <span style={{ fontWeight: 700 }}>{user?.name ?? '사용자'}<span style={{ color: T.t3, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>{user?.departmentName ?? ''}</span></span>, disabled: true },
      { type: 'divider' as const },
      { key: 'me', icon: <ProfileOutlined />, label: '내 정보', onClick: () => navigate('/me') },
      { key: 'pc', icon: <DesktopOutlined />, label: 'PC 화면으로', onClick: () => navigate('/') },
      ...(!isStandalone
        ? [{ key: 'install', icon: <DownloadOutlined />, label: '홈 화면에 추가', onClick: () => (canInstall ? install() : showIosHelp()) }]
        : []),
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', danger: true,
        onClick: () => modal.confirm({ title: '로그아웃 하시겠습니까?', okText: '로그아웃', cancelText: '취소', onOk: logoutNow }) },
    ],
  };

  // 카카오톡·네이버 등 앱 안 브라우저는 설치 기능이 없다 — Chrome/Safari 로 열라고 안내한다.
  const inAppBrowser = typeof navigator !== 'undefined' && /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent);
  const showIosHelp = () => modal.info({
    title: '홈 화면에 추가',
    content: (
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {inAppBrowser && <p style={{ marginTop: 0 }}>지금은 메신저 안의 브라우저라 설치할 수 없습니다. 오른쪽 아래 <b>⋮</b> → <b>다른 브라우저로 열기</b>로 Chrome(또는 Safari)에서 여세요.</p>}
        {isIOS
          ? <p style={{ margin: 0 }}>Safari 하단의 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 누르세요.</p>
          : <p style={{ margin: 0 }}>Chrome 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 누르세요.</p>}
        <p style={{ margin: '8px 0 0', color: '#6B7280' }}>추가하면 홈 화면 아이콘으로 바로 열리고 주소창 없이 앱처럼 쓸 수 있습니다.</p>
      </div>
    ),
    okText: '확인',
  });

  const dismissInstall = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ }
  };
  // 이미 앱으로 실행 중이 아니면 어디서든 안내한다. 설치 프롬프트가 있으면 바로 띄우고, 없으면 방법을 보여준다.
  const showInstallBar = !isStandalone && !installDismissed;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font }}>
      {/* 상단바 */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: `calc(${TOP_H}px + env(safe-area-inset-top))`,
        paddingTop: 'env(safe-area-inset-top)', background: T.surface, borderBottom: `1px solid ${T.border1}`,
        display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 8,
      }}>
        <Logo size={20} />
        <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, marginLeft: 2 }}>{active?.label ?? '영업관리'}</span>
        <div style={{ flex: 1 }} />
        <FollowUpBell />
        <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
          <Avatar size={30} icon={<UserOutlined />} style={{ background: T.primary50, color: T.primary700, border: `1px solid ${T.primary100}`, cursor: 'pointer' }} />
        </Dropdown>
      </header>

      {/* 본문 */}
      <main style={{ paddingTop: `calc(${TOP_H}px + env(safe-area-inset-top) + 10px)`, paddingBottom: `calc(${TAB_H}px + env(safe-area-inset-bottom) + 12px)`, paddingLeft: 12, paddingRight: 12 }}>
        {showInstallBar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.primary50, border: `1px solid ${T.primary100}`, borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: T.t2 }}>
            <DownloadOutlined style={{ color: T.primary700 }} />
            <span style={{ flex: 1 }}>홈 화면에 추가하면 앱처럼 바로 열 수 있어요.</span>
            <Button size="small" type="primary" onClick={() => (canInstall ? install() : showIosHelp())}>추가</Button>
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={dismissInstall} />
          </div>
        )}
        {tabs.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.t3, padding: '60px 0', fontSize: 13 }}>
            모바일에서 볼 수 있는 메뉴 권한이 없습니다. 관리자에게 문의하세요.
          </div>
        ) : (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}>
            <Outlet />
          </Suspense>
        )}
      </main>

      {/* 하단 탭 */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, height: `calc(${TAB_H}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)', background: T.surface, borderTop: `1px solid ${T.border1}`,
        display: 'flex',
      }}>
        {tabs.map((t) => {
          const on = active?.key === t.key;
          return (
            <button key={t.key} type="button" onClick={() => navigate(t.path)} style={{
              flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 0 6px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: on ? T.primary700 : T.t3, fontFamily: T.font,
            }}>
              <span style={{ fontSize: 21, lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default MobileLayout;
