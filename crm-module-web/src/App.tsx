import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import koKR from 'antd/locale/ko_KR';
import AppRouter from '@/routes';
import HeartbeatManager from '@/components/common/HeartbeatManager';
import { T } from '@/theme/designTokens';

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5분
    },
  },
});

/**
 * 앱 루트 컴포넌트.
 * - QueryClientProvider: React Query 전역 설정
 * - ConfigProvider: Ant Design 한국어 로케일 + 테마
 * - AppRouter: 라우팅
 */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={koKR}
        theme={{
          // TARA TPS 디자인 시스템 — TARA GREEN 포인트 컬러 + TARA BLUE 다크 사이드바.
          token: {
            colorPrimary: T.primary,
            colorInfo: T.primary,
            colorSuccess: T.ok,
            colorWarning: T.wa,
            colorError: T.er,
            colorLink: T.primary700,
            colorTextBase: T.t1,
            colorText: T.t2,
            colorTextSecondary: T.t3,
            colorTextTertiary: T.t4,
            colorBgLayout: '#EEF9FA',
            colorBorder: T.border1,
            colorBorderSecondary: T.border2,
            borderRadius: 4,
            borderRadiusLG: 6,
            borderRadiusSM: 3,
            fontFamily: T.font,
            fontSize: 14,
            fontSizeHeading2: 24,
            fontSizeHeading3: 18,
            fontWeightStrong: 600,
            boxShadow: '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
            boxShadowSecondary: '0 4px 12px -2px rgba(16, 24, 40, 0.08)',
            boxShadowTertiary: '0 20px 60px rgba(0, 0, 0, 0.18)',
          },
          components: {
            // v3: 버튼 36px·radius 6, 인풋 34px, 테이블 컴팩트, 카드 8px, 태그 pill.
            Button: { controlHeight: 34, controlHeightLG: 42, paddingInline: 13, paddingInlineLG: 20, fontWeight: 500, borderRadius: 4, primaryShadow: 'none', defaultShadow: 'none' },
            Input: { controlHeight: 32, colorBgContainer: T.surface, activeBorderColor: T.primary, hoverBorderColor: T.primary, activeShadow: '0 0 0 2px rgba(0, 150, 162, 0.14)', borderRadius: 4 },
            InputNumber: { controlHeight: 32, borderRadius: 4, activeBorderColor: T.primary, hoverBorderColor: T.primary },
            Select: { controlHeight: 32, borderRadius: 4, optionSelectedBg: T.primary50, optionSelectedColor: T.primary700 },
            DatePicker: { controlHeight: 32, borderRadius: 4, activeBorderColor: T.primary, hoverBorderColor: T.primary },
            Table: { headerBg: T.border3, headerColor: T.t3, headerSplitColor: 'transparent', headerBorderRadius: 0, cellPaddingBlock: 6, cellPaddingInline: 12, borderColor: T.border2, rowHoverBg: '#F8FAFC', fontSize: 13 },
            Card: { borderRadiusLG: 4, colorBorderSecondary: T.border1, paddingLG: 16, boxShadowTertiary: 'none' },
            Menu: { itemActiveBg: T.primary50, itemSelectedBg: T.primary50, itemSelectedColor: T.primary700, itemColor: T.t2, itemHeight: 38, itemMarginInline: 6, itemBorderRadius: 6, activeBarBorderWidth: 0 },
            Layout: { headerBg: T.surface, headerPadding: '0 24px', headerHeight: 70, bodyBg: T.bg, siderBg: T.sidebarBg },
            Typography: { colorTextHeading: T.t1, fontWeightStrong: 700 },
            Tag: { borderRadiusSM: 20, defaultBg: T.border2, defaultColor: T.t3 },
            Modal: { borderRadiusLG: 10, titleFontSize: 16 },
            Drawer: { paddingLG: 0 },
            Tabs: { itemSelectedColor: T.primary700, inkBarColor: T.primary, itemHoverColor: T.primary },
            Pagination: { itemActiveBg: T.primary, borderRadius: 6 },
            Segmented: { itemSelectedBg: T.surface, trackBg: T.border2 },
            Switch: { colorPrimary: T.primary, colorPrimaryHover: T.primary700 },
          },
        }}
      >
        <style>{`
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            overflow-x: hidden;
            background: #EEF9FA;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          #root {
            width: 100%;
            min-height: 100vh;
          }
          /* 다크 사이드바 행 hover (v3 .sbh) */
          .sm-sbh:hover {
            background: ${T.sidebarHoverBg} !important;
          }
          /* 테크니컬 — 모노스페이스 코드/번호 + 탭뉴머럴 (전역) */
          .mono-cell {
            font-family: 'JetBrains Mono','SF Mono',ui-monospace,Menlo,Consolas,monospace;
            font-size: 12px;
            letter-spacing: -0.01em;
          }
          .tabular-nums { font-variant-numeric: tabular-nums; }
          /* Modal: 내부 스크롤 적용, 전체 페이지 스크롤 방지.
             주의: overflow: hidden !important 는 HMR 도중 wrap 이 stale 로 남으면
             화면 전체를 덮는 invisible overlay 가 되어 클릭이 막힘 → overflow-y: auto 로 약화.
             pointer-events 도 닫혔을 때 확실히 무효화. */
          .ant-modal-wrap {
            overflow-y: auto;
          }
          .ant-modal-wrap[style*="display: none"] {
            pointer-events: none !important;
          }
          .ant-modal {
            top: 50px !important;
            padding-bottom: 50px;
          }
          .ant-modal .ant-modal-body {
            max-height: calc(100vh - 200px);
            overflow-y: auto;
            overflow-x: hidden;
          }
          .ant-modal .ant-modal-body::-webkit-scrollbar {
            width: 4px;
          }
          .ant-modal .ant-modal-body::-webkit-scrollbar-track {
            background: transparent;
          }
          .ant-modal .ant-modal-body::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 4px;
          }
          .ant-modal .ant-modal-body::-webkit-scrollbar-thumb:hover {
            background: #cbd5e1;
          }
          /* Pagination: 디자인 시스템 통일 */
          .ant-pagination {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .ant-pagination .ant-pagination-item {
            border: none !important;
            border-radius: 8px !important;
            font-weight: 500;
            min-width: 34px;
            height: 34px;
            line-height: 34px;
            transition: all 0.2s ease;
          }
          .ant-pagination .ant-pagination-item a {
            color: #64748b !important;
          }
          .ant-pagination .ant-pagination-item:hover {
            background: #f1f5f9 !important;
          }
          .ant-pagination .ant-pagination-item:hover a {
            color: ${T.primary700} !important;
          }
          .ant-pagination .ant-pagination-item-active {
            background: ${T.primary} !important;
            border: none !important;
          }
          .ant-pagination .ant-pagination-item-active a {
            color: #fff !important;
            font-weight: 600;
          }
          .ant-pagination .ant-pagination-item-active:hover {
            background: ${T.primary700} !important;
          }
          .ant-pagination .ant-pagination-item-active:hover a {
            color: #fff !important;
          }
          .ant-pagination .ant-pagination-prev,
          .ant-pagination .ant-pagination-next {
            border: none !important;
            border-radius: 8px !important;
            min-width: 34px;
            height: 34px;
            line-height: 34px;
          }
          .ant-pagination .ant-pagination-prev:hover,
          .ant-pagination .ant-pagination-next:hover {
            background: #f1f5f9 !important;
          }
          .ant-pagination .ant-pagination-prev button,
          .ant-pagination .ant-pagination-next button {
            color: #64748b !important;
            border: none !important;
          }
          .ant-pagination .ant-pagination-disabled button {
            color: #cbd5e1 !important;
          }
          .ant-pagination .ant-pagination-total-text {
            color: #94a3b8;
            font-size: 13px;
            margin-right: 8px;
          }
          .ant-pagination .ant-pagination-options .ant-select-selector {
            border-radius: 8px !important;
            border-color: #e2e8f0 !important;
            font-size: 13px;
            height: 34px !important;
          }
          .ant-pagination .ant-pagination-options .ant-select-selection-item {
            line-height: 32px !important;
            color: #64748b;
          }
          /* size-changer 캐럿 정렬 — 안쪽 selector 만 34px 로 강제하고 외곽 .ant-select 는
             기본 24px 라, 화살표(top:50%)가 24px 기준으로 잡혀 34px 박스에서 5px 위로 떠 보였다.
             외곽 select 높이도 34px 로 맞춰 화살표·텍스트를 세로 중앙 정렬. */
          .ant-pagination .ant-pagination-options .ant-select {
            height: 34px !important;
          }
          /* 전체 스크롤바 — 세로 두께 2배(6→12px). 가로는 6px 유지. */
          ::-webkit-scrollbar {
            width: 12px;
            height: 6px;
          }
          ::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 10px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
        `}</style>
        {/* antd App: static message/notification/Modal 을 context-aware 로 만들어
            "Static function can not consume context" 경고 제거 + 테마 일관 적용. */}
        <AntApp>
          <HeartbeatManager />
          <AppRouter />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
