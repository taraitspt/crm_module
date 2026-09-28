import React, { useMemo, useState } from 'react';
import { RightOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { T } from '@/theme/designTokens';
import Logo from '../common/Logo';
import { getActiveTopKey, type AppMenuItem } from './menuItems';
import { useMenuAccess } from '@/hooks/useMenuAccess';

function isModifiedClick(e: React.MouseEvent) {
  return e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
}

/** 리프 메뉴(실제 경로). 활성 시 좌측 Teal 인디케이터 + 흰 텍스트. */
const SbLeaf: React.FC<{ item: AppMenuItem; active: boolean; onNav: (path: string, e: React.MouseEvent) => void }> = ({ item, active, onNav }) => (
  <a
    href={item.key}
    onClick={(e) => onNav(item.key, e)}
    className="sm-sbh"
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '6px 10px 6px 42px',
      cursor: 'pointer',
      borderRadius: 6,
      margin: '1px 6px',
      textDecoration: 'none',
      background: active ? T.sidebarActiveBg : 'transparent',
      borderLeft: active ? `2px solid ${T.primary}` : '2px solid transparent',
      transition: 'background 0.1s',
    }}
  >
    <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#fff' : T.sidebarText, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      {item.label}
    </span>
  </a>
);

/** 그룹(하위 메뉴 보유). 클릭으로 펼침/접힘, 자식 활성 시 강조. */
const SbGroup: React.FC<{ item: AppMenuItem; activePath: string; onNav: (path: string, e: React.MouseEvent) => void }> = ({ item, activePath, onNav }) => {
  const grpActive = !!item.children?.some((c) => c.key === activePath);
  const [open, setOpen] = useState(grpActive);

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        className="sm-sbh"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '7px 10px 7px 14px',
          cursor: 'pointer',
          borderRadius: 6,
          margin: '1px 6px',
          background: grpActive ? T.sidebarGroupActiveBg : 'transparent',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ display: 'inline-flex', fontSize: 14, color: grpActive ? T.sidebarTextActive : T.sidebarText, flexShrink: 0 }}>
          {item.icon}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: grpActive ? 500 : 400, color: grpActive ? T.sidebarTextActive : T.sidebarText, whiteSpace: 'nowrap' }}>
          {item.label}
        </span>
        <RightOutlined style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </div>
      {open && item.children?.map((c) => (
        <SbLeaf key={c.key} item={c} active={c.key === activePath} onNav={onNav} />
      ))}
    </div>
  );
};

/** 단독 루트(하위 없는 메뉴, 예: 대시보드). */
const SbRoot: React.FC<{ item: AppMenuItem; active: boolean; onNav: (path: string, e: React.MouseEvent) => void }> = ({ item, active, onNav }) => (
  <a
    href={item.key}
    onClick={(e) => onNav(item.key, e)}
    className="sm-sbh"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '7px 10px 7px 14px',
      cursor: 'pointer',
      borderRadius: 6,
      margin: '1px 6px',
      textDecoration: 'none',
      background: active ? T.sidebarActiveBg : 'transparent',
      borderLeft: active ? `2px solid ${T.primary}` : '2px solid transparent',
      transition: 'background 0.1s',
    }}
  >
    <span style={{ display: 'inline-flex', fontSize: 14, color: active ? T.primary : T.sidebarText, flexShrink: 0 }}>
      {item.icon}
    </span>
    <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#fff' : T.sidebarText }}>
      {item.label}
    </span>
  </a>
);

/**
 * v3 다크 좌측 사이드바 — 데스크탑 Sider 와 모바일 Drawer 양쪽에서 공유.
 * 로고 헤더 + 역할 필터링된 메뉴 트리 + 사용자 푸터(로그아웃).
 */
export const SidebarContent: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { setDrawerVisible } = useUiStore();

  const activePath = location.pathname;
  const activeTop = useMemo(() => getActiveTopKey(activePath), [activePath]);

  // 메뉴 구성은 관리자 화면에서 설정한 역할별 권한을 따른다.
  const { items: filteredItems } = useMenuAccess();

  const onNav = (path: string, e: React.MouseEvent) => {
    if (!path.startsWith('/')) return;
    if (isModifiedClick(e)) return;
    e.preventDefault();
    navigate(path);
    if (isMobile) setDrawerVisible(false);
  };

  const initial = (user?.name || '사용자').charAt(0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.sidebarBg }}>
      {/* 로고 헤더 */}
      <div
        style={{ height: 54, display: 'flex', alignItems: 'center', padding: '0 16px', background: T.surface, borderBottom: `1px solid ${T.border1}`, flexShrink: 0, cursor: 'pointer' }}
        onClick={() => { navigate('/'); if (isMobile) setDrawerVisible(false); }}
      >
        <Logo size={22} tone="light" />
      </div>

      {/* 메뉴 트리 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 8px' }}>
        {filteredItems.map((item) =>
          item.children && item.children.length > 0
            ? <SbGroup key={item.key} item={item} activePath={activePath} onNav={onNav} />
            : <SbRoot key={item.key} item={item} active={item.key === activePath || (item.key !== '/' && item.key === activeTop)} onNav={onNav} />,
        )}
      </div>

      {/* 사용자 푸터 */}
      <div style={{ borderTop: `1px solid ${T.sidebarBorder}`, padding: '10px 12px', flexShrink: 0 }}>
        <div
          className="sm-sbh"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
          onClick={() => { navigate('/me'); if (isMobile) setDrawerVisible(false); }}
        >
          <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'rgba(0,150,162,0.22)', border: '1px solid rgba(0,150,162,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.primary }}>{initial}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.sidebarTextActive, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || '사용자'}
            </div>
            <div style={{ fontSize: 10, color: T.sidebarText, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.departmentName || '지원팀'}
            </div>
          </div>
          <LogoutOutlined
            style={{ fontSize: 13, color: T.sidebarText, flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); logout(); }}
          />
        </div>
      </div>
    </div>
  );
};

// 데스크탑에서는 PageLayout 이 Sider 안에 SidebarContent 를 직접 렌더한다.
const AppSidebar: React.FC = () => null;
export default AppSidebar;
