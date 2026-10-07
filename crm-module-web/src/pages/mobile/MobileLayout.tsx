import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Spin } from 'antd';
import {
  AlertOutlined, BarChartOutlined, BellOutlined, CalendarOutlined, CloseOutlined,
  DownloadOutlined, FileDoneOutlined, LogoutOutlined, ShopOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutApi } from '@/api/auth.api';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { AppMenuItem } from '@/components/layout/menuItems';
import FollowUpBell from '@/components/layout/FollowUpBell';
import Logo from '@/components/common/Logo';
import { T } from '@/theme/designTokens';
import { useInstallPrompt } from './mobileKit';
import { REMINDER_HOUR, clearActivityReminders, isNativeApp, onReminderTap, reminderEnabled, setReminderEnabled, syncActivityReminders } from './activityReminders';
import { ensurePushRegistered, getPushState, subscribePush, unsubscribePush, type PushState } from './webPush';
import { App as CapApp } from '@capacitor/app';

const PUSH_DISMISS_KEY = 'm-push-dismissed';

const TOP_H = 54;
const TAB_H = 60;
const INSTALL_DISMISS_KEY = 'm-install-dismissed';

/**
 * 모바일 앱(/m) 탭 — 폰에서 쓸 화면만. PC 메뉴 전체를 옮기지 않는다(표 화면은 폰 폭에 안 맞음).
 * menuKeys 는 PC 메뉴 키 — 관리자 > 권한 관리에서 그 메뉴를 끈 역할에겐 탭도 안 보인다(여럿이면 하나라도 보이면 탭 노출).
 * "생산" 탭은 설비 가동 현황 · 작업지시서(생산계획조회 축소판) · 주문진행현황 입구(2026-10-02).
 */
export const MOBILE_TABS = [
  { key: 'activity', path: '/m/activity', label: '활동', icon: <CalendarOutlined />, menuKeys: ['/activity/calendar'] },
  { key: 'partner', path: '/m/partner', label: '거래처', icon: <ShopOutlined />, menuKeys: ['/activity/partner'] },
  { key: 'orders', path: '/m/orders', label: '주문', icon: <FileDoneOutlined />, menuKeys: ['/production/order-progress'] },
  { key: 'production', path: '/m/production', label: '생산', icon: <ToolOutlined />, menuKeys: ['/production/equipment-board', '/production/schedule'] },
  { key: 'attention', path: '/m/attention', label: '관리필요', icon: <AlertOutlined />, menuKeys: ['/activity/attention'] },
  { key: 'sales', path: '/m/sales', label: '매출', icon: <BarChartOutlined />, menuKeys: ['/'] },
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
  const { modal, message } = App.useApp();
  const { items } = useMenuAccess();
  const { isStandalone, isIOS, canInstall, install } = useInstallPrompt();
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [reminderOn, setReminderOn] = useState(reminderEnabled);
  // 웹 푸시(아이폰 홈 화면 앱·브라우저) 상태 — 네이티브 앱에서는 쓰지 않는다
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDismissed, setPushDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(PUSH_DISMISS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (isNativeApp()) return;
    let alive = true;
    getPushState().then((s) => { if (alive) setPushState(s); if (s === 'subscribed') void ensurePushRegistered(); });
    return () => { alive = false; };
  }, [user?.id]);
  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushState === 'subscribed') {
        await unsubscribePush(); setPushState('unsubscribed'); message.info('활동 알림을 껐습니다.');
      } else {
        const s = await subscribePush(); setPushState(s);
        if (s === 'subscribed') message.success(`활동일 아침 ${REMINDER_HOUR}시에 알림이 옵니다.`);
        else if (s === 'denied') message.warning('알림이 차단돼 있습니다. 폰 설정 > 알림에서 이 앱을 허용해 주세요.');
        else if (s === 'server-off') message.warning('서버에 알림 설정이 아직 없습니다.');
      }
    } catch (e) {
      message.error((e as Error).message || '알림 설정에 실패했습니다.');
    } finally { setPushBusy(false); }
  };
  const dismissPush = () => { setPushDismissed(true); try { localStorage.setItem(PUSH_DISMISS_KEY, '1'); } catch { /* ignore */ } };
  // 아이폰은 Safari 탭이 아니라 홈 화면에 추가한 앱에서만 푸시가 된다(iOS 16.4+)
  const pushNeedsHomeScreen = !isNativeApp() && isIOS && !isStandalone;

  // 활동 알림(앱 자체, 네이티브 앱만) — 앱을 열 때·다시 앞으로 올 때 내 활동을 폰에 예약하고, 알림을 누르면 활동 화면으로.
  useEffect(() => {
    if (!isNativeApp()) return;
    const sync = () => { if (document.visibilityState === 'visible') void syncActivityReminders(user?.id); };
    sync();
    document.addEventListener('visibilitychange', sync);
    const off = onReminderTap(() => navigate('/m/activity'));
    return () => { document.removeEventListener('visibilitychange', sync); off(); };
  }, [user?.id, navigate]);
  // 안드로이드 뒤로가기 — WebView 는 탭 이동을 돌아갈 기록으로 안 쳐서 어느 탭에서든 바로 꺼졌다(사용자 보고 2026-10-02).
  // 기록에 기대지 않고 규칙으로: 탭 아래 화면이면 이전 화면(없으면 그 탭)으로, 활동 이외 탭이면 활동 탭으로, 활동 탭에서만 종료 확인.
  // 리스너를 달면 Capacitor 기본 동작(뒤로/종료)이 꺼지므로 모든 경우를 여기서 처리한다.
  const pathRef = React.useRef(location.pathname);
  pathRef.current = location.pathname;
  useEffect(() => {
    if (!isNativeApp()) return;
    let confirming = false;
    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
      const path = pathRef.current;
      const tab = MOBILE_TABS.find((t) => path === t.path || path.startsWith(t.path + '/'));
      const home = MOBILE_TABS[0].path;
      if (tab && path !== tab.path) {            // 탭 아래 화면(예: /m/production/equipment, /m/partner/…)
        if (canGoBack) window.history.back(); else navigate(tab.path, { replace: true });
        return;
      }
      if (path !== home) { navigate(home, { replace: true }); return; }   // 다른 탭 → 활동 탭
      if (confirming) return;
      confirming = true;
      modal.confirm({
        title: '앱을 종료할까요?',
        okText: '종료', cancelText: '취소', okButtonProps: { danger: true },
        onOk: () => { void CapApp.exitApp(); },
        afterClose: () => { confirming = false; },
      });
    });
    return () => { sub.then((h) => h.remove()).catch(() => {}); };
  }, [modal]);
  const toggleReminder = async () => {
    const next = !reminderOn;
    setReminderEnabled(next); setReminderOn(next);
    if (next) {
      const r = await syncActivityReminders(user?.id);
      if (r == null) message.warning('알림 권한이 없어 예약하지 못했습니다. 폰 설정에서 알림을 허용해 주세요.');
      else message.success(`활동일 아침 ${REMINDER_HOUR}시 알림을 켰습니다 (${r.scheduled}건 예약)`);
    } else {
      await clearActivityReminders();
      message.info('활동 알림을 껐습니다.');
    }
  };

  const allowed = useMemo(() => flattenKeys(items), [items]);
  const tabs = useMemo(() => MOBILE_TABS.filter((t) => t.menuKeys.some((k) => allowed.has(k))), [allowed]);
  const active = tabs.find((t) => location.pathname.startsWith(t.path)) ?? MOBILE_TABS.find((t) => location.pathname.startsWith(t.path));

  const logoutNow = async () => {
    await clearActivityReminders();
    try { await logoutApi(); } catch { /* ignore */ } finally {
      logoutStore();
      navigate('/login');
    }
  };
  const userMenu = {
    items: [
      // 모바일은 모바일 메뉴만 쓴다 — PC 화면(홈·내 정보)으로 가는 항목은 두지 않는다(사용자 결정 2026-10-02)
      { key: 'who', label: <span style={{ fontWeight: 700 }}>{user?.name ?? '사용자'}<span style={{ color: T.t3, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>{user?.departmentName ?? ''}</span></span>, disabled: true },
      { type: 'divider' as const },
      ...(!isStandalone
        ? [{ key: 'install', icon: <DownloadOutlined />, label: '홈 화면에 추가', onClick: () => (canInstall ? install() : showIosHelp()) }]
        : []),
      // 활동 알림 — 네이티브 앱(APK)은 폰 로컬 알림, 홈 화면 웹앱·브라우저는 웹 푸시. 아이폰 Safari 탭이면 홈 화면 추가부터.
      ...(isNativeApp()
        ? [{ key: 'reminder', icon: <BellOutlined />, label: `활동 알림 (아침 ${REMINDER_HOUR}시) · ${reminderOn ? '켬' : '끔'}`, onClick: () => { void toggleReminder(); } }]
        : pushNeedsHomeScreen
          ? [{ key: 'reminder', icon: <BellOutlined />, label: `활동 알림 (아침 ${REMINDER_HOUR}시) · 홈 화면에 추가 후 사용`, onClick: () => showIosHelp() }]
          : pushState !== 'unsupported' && pushState !== 'server-off'
            ? [{ key: 'reminder', icon: <BellOutlined />, disabled: pushBusy,
                label: `활동 알림 (아침 ${REMINDER_HOUR}시) · ${pushState === 'subscribed' ? '켬' : pushState === 'denied' ? '차단됨' : '끔'}`,
                onClick: () => { void togglePush(); } }]
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
        {!isNativeApp() && isStandalone && pushState === 'unsubscribed' && !pushDismissed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.waBg, border: `1px solid ${T.waBd}`, borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: T.t2 }}>
            <BellOutlined style={{ color: T.wa }} />
            <span style={{ flex: 1 }}>활동일 아침 {REMINDER_HOUR}시에 활동 알림을 받으세요.</span>
            <Button size="small" type="primary" loading={pushBusy} onClick={() => { void togglePush(); }}>알림 켜기</Button>
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={dismissPush} />
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
