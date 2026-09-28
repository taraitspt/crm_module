import React from 'react';
import { Layout, Drawer, Grid } from 'antd';
import AppHeader from './AppHeader';
import { SidebarContent } from './AppSidebar';
import AppBreadcrumb from './Breadcrumb';
import { useUiStore } from '@/store/uiStore';
import { T } from '@/theme/designTokens';

const { Content } = Layout;
const { useBreakpoint } = Grid;

const HEADER_HEIGHT = 70;
const DRAWER_WIDTH = 240;

interface PageLayoutProps {
  children: React.ReactNode;
}

/**
 * 공용 페이지 레이아웃 — v3 상단 헤더 네비게이션.
 * 데스크탑은 상단 가로 메뉴(AppHeader)만, 좌측 사이드바 없음(풀폭).
 * 모바일은 헤더 햄버거 → 좌측 Drawer(세로 메뉴).
 */
const PageLayout: React.FC<PageLayoutProps> = ({ children }) => {
  const { drawerVisible, setDrawerVisible } = useUiStore();
  const screens = useBreakpoint();

  const isDesktop = screens.lg;

  return (
    <Layout style={{ minHeight: '100vh', background: '#EEF9FA' }}>
      {/* 모바일: 햄버거로 여는 좌측 Drawer(세로 메뉴) — 데스크탑은 헤더 가로 메뉴라 불필요 */}
      {!isDesktop && (
        <Drawer
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          width={DRAWER_WIDTH}
          styles={{ body: { padding: 0, background: T.sidebarBg } }}
          closable={false}
        >
          <SidebarContent isMobile />
        </Drawer>
      )}

      <Layout
        style={{
          background: 'transparent',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          paddingTop: HEADER_HEIGHT,
        }}
      >
        <AppHeader />
        <Content style={{
          padding: isDesktop ? '22px 20px' : '16px 12px',
          width: '100%',
          flex: 1,
        }}>
          <AppBreadcrumb />
          <div style={{ marginTop: isDesktop ? 14 : 8, minHeight: 280 }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default PageLayout;
