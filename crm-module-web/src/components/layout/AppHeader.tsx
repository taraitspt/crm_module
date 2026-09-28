import React, { useMemo } from 'react';
import { Layout, Space, Avatar, Button, Grid, Dropdown, App } from 'antd';
import {
  UserOutlined,
  MenuOutlined,
  LogoutOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { logout as logoutApi } from '@/api/auth.api';
import { T } from '@/theme/designTokens';
// 헤더 브랜드 락업 — 타라티피에스 공식 로고(올빼미+워드마크) + 시스템명 배지.
import Logo from '@/components/common/Logo';
import FollowUpBell from './FollowUpBell';
import { getActiveTopKey } from './menuItems';
import { useMenuAccess } from '@/hooks/useMenuAccess';

const { useBreakpoint } = Grid;

function isModifiedClick(e: React.MouseEvent) {
  return e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
}

const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: logoutStore } = useAuthStore();
  const { toggleDrawer } = useUiStore();
  const screens = useBreakpoint();
  const isDesktop = screens.lg;

  const { modal } = App.useApp();

  // 메뉴 구성은 관리자 화면에서 설정한 역할별 권한을 따른다.
  const { items: filteredItems } = useMenuAccess();

  const activePath = location.pathname;
  const activeTop = useMemo(() => getActiveTopKey(activePath), [activePath]);

  const logoutNow = async () => {
    try { await logoutApi(); } catch { /* ignore */ } finally {
      logoutStore();
      navigate('/login');
    }
  };

  const handleLogout = () => {
    modal.confirm({
      title: '로그아웃 하시겠습니까?',
      okText: '로그아웃', cancelText: '취소', okType: 'primary',
      onOk: logoutNow,
    });
  };

  const handleLinkClick = (path: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!path.startsWith('/') || isModifiedClick(e)) return;
    e.preventDefault();
    navigate(path);
  };

  const userMenu = useMemo(() => ({
    items: [
      { key: 'me', icon: <ProfileOutlined />, label: '내 정보', onClick: () => navigate('/me') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', danger: true, onClick: handleLogout },
    ],
  }), []);

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        background: T.surface,
        padding: isDesktop ? '0 24px' : '0 12px',
        borderBottom: `1px solid ${T.border1}`,
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 100,
        height: 70,
        gap: isDesktop ? 0 : 10,
      }}
    >
      {/* 모바일 햄버거 */}
      {!isDesktop && (
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={toggleDrawer}
          style={{ display: 'flex', alignItems: 'center', padding: 4, minWidth: 36, marginRight: 4 }}
        />
      )}

      {/* 브랜드 락업 — 타라티피에스 로고 + 얇은 구분선 + 시스템명 배지 */}
      <a
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isDesktop ? 10 : 7,
          cursor: 'pointer',
          userSelect: 'none',
          flexShrink: 0,
          width: 'auto',
          marginRight: isDesktop ? 18 : 6,
          textDecoration: 'none',
        }}
        onClick={(e) => handleLinkClick('/', e)}
      >
        <Logo size={isDesktop ? 30 : 22} />
        <span aria-hidden style={{ width: 1, height: isDesktop ? 22 : 16, background: T.border1 }} />
        <span
          style={{
            fontSize: isDesktop ? 12 : 10,
            fontWeight: 700,
            // 한글이라 자간을 거의 주지 않는다 — 약자(CRM)에 쓰던 0.12em 은 너무 벌어진다.
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            color: T.primary,
            background: T.primary50,
            border: `1px solid ${T.primary100}`,
            borderRadius: 6,
            padding: isDesktop ? '3px 8px' : '2px 6px',
            lineHeight: 1.2,
          }}
        >
          영업관리시스템
        </span>
      </a>

      {/* 데스크탑 가로 메뉴 */}
      {isDesktop && (
        <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1, height: '100%', gap: 0 }}>
          {filteredItems.map((item) => {
            const isActive = item.key === '/'
              ? activePath === '/'
              : activePath.startsWith('/' + item.key) || activeTop === item.key;

            const itemStyle: React.CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 16px',
              height: '100%',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: isActive ? 800 : 700,
              color: T.navy,
              borderBottom: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
              borderTop: '2px solid transparent',
              transition: 'color 0.12s, border-color 0.12s',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              fontFamily: T.font,
              textDecoration: 'none',
              boxSizing: 'border-box',
            };

            if (item.children && item.children.length > 0) {
              return (
                <Dropdown
                  key={item.key}
                  placement="bottomLeft"
                  menu={{
                    items: item.children.map((c) => ({
                      key: c.key,
                      label: (
                        <a
                          href={c.key}
                          onClick={(e) => handleLinkClick(c.key, e)}
                          style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
                        >
                          {c.label}
                        </a>
                      ),
                    })),
                    style: { minWidth: 160 },
                  }}
                >
                  <div className="sm-nav-item" style={itemStyle}>
                    {item.icon && <span style={{ fontSize: 13, display: 'inline-flex', opacity: 0.75 }}>{item.icon}</span>}
                    <span>{item.label}</span>
                  </div>
                </Dropdown>
              );
            }

            return (
              <a
                key={item.key}
                href={item.key}
                className="sm-nav-item"
                style={itemStyle}
                onClick={(e) => handleLinkClick(item.key, e)}
              >
                {item.icon && <span style={{ fontSize: 13, display: 'inline-flex', opacity: 0.75 }}>{item.icon}</span>}
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      )}

      {!isDesktop && <div style={{ flex: 1 }} />}

      {/* 우측: 아이콘 + 사용자 */}
      <Space size={isDesktop ? 8 : 6} style={{ flexShrink: 0, marginLeft: isDesktop ? 16 : 0 }}>
        {/* 도움말·알림 아이콘 제거 (요청 2026-07-14) — 기능 미구현이라 헤더에서 숨김. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingLeft: isDesktop ? 12 : 0,
          borderLeft: isDesktop ? `1px solid ${T.border1}` : 'none',
        }}>
          {isDesktop && (
            <div
              style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', lineHeight: 1.25, cursor: 'pointer' }}
              onClick={() => navigate('/me')}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{user?.name || '사용자'}</span>
              <span style={{ fontSize: 11, color: T.t3 }}>{user?.departmentName || '지원부서'}</span>
            </div>
          )}
          <FollowUpBell />
          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <Avatar
              size={isDesktop ? 34 : 30}
              icon={<UserOutlined />}
              style={{
                background: T.primary50,
                color: T.primary700,
                cursor: 'pointer',
                border: `1px solid ${T.primary100}`,
                flexShrink: 0,
              }}
            />
          </Dropdown>
        </div>
      </Space>

      <style>{`
        .sm-nav-item:hover {
          color: ${T.primary} !important;
          border-bottom-color: ${T.primary} !important;
        }
      `}</style>
    </Layout.Header>
  );
};

export default AppHeader;
