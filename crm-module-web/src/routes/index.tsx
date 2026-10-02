import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import BrandedLoader from '@/components/common/BrandedLoader';
import type { Role } from '@/types/auth';

// Lazy 로딩 컴포넌트
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ForcePasswordChangePage = lazy(() => import('@/pages/auth/ForcePasswordChangePage'));
const MyPage = lazy(() => import('@/pages/auth/MyPage'));
// 2026-09-18 홈 대시보드 폐기 — 첫 화면이 매출현황(계획 대비)로 바뀜.
// const DashboardPage = lazy(() => import('@/pages/home/DashboardPage'));

// 정보관리
// 2026-09-18 사업자/고객/영업담당자 관리 당분간 미사용 — menuItems.tsx 와 함께 주석 해제
// const BizOwnerPage = lazy(() => import('@/pages/info/BizOwnerPage'));
// const BizOwnerDetailPage = lazy(() => import('@/pages/info/BizOwnerDetailPage'));
// const CustomerPage = lazy(() => import('@/pages/info/CustomerPage'));
// const PartnerFunctionPage = lazy(() => import('@/pages/info/PartnerFunctionPage'));

// 목표입력 통합
// const GoalPage = lazy(() => import('@/pages/info/GoalPage')); // 2026-09-18 월매출계획으로 대체
const SalesPlanPage = lazy(() => import('@/pages/info/SalesPlanPage'));
const SalesStatusPage = lazy(() => import('@/pages/stats/SalesStatusPage'));
const SalesListPage = lazy(() => import('@/pages/stats/SalesListPage'));

// 영업관리 (CRM 영업활동)
const ActivityCalendarPage = lazy(() => import('@/pages/activity/ActivityCalendarPage'));
const ActivityBoardPage = lazy(() => import('@/pages/activity/ActivityBoardPage'));
const ActivityListPage = lazy(() => import('@/pages/activity/ActivityListPage'));
const PartnerCardPage = lazy(() => import('@/pages/activity/PartnerCardPage'));
const DealPipelinePage = lazy(() => import('@/pages/deal/DealPipelinePage'));
const PartnerAttentionPage = lazy(() => import('@/pages/activity/PartnerAttentionPage'));

// 생산현황 (TPS)
const ProductionPlanPage = lazy(() => import('@/pages/production/ProductionPlanPage'));
const ProductionDashboardPage = lazy(() => import('@/pages/production/ProductionDashboardPage'));
const EquipmentPerfPage = lazy(() => import('@/pages/production/EquipmentPerfPage'));
const EquipmentBoardPage = lazy(() => import('@/pages/production/EquipmentBoardPage'));
const OrderProgressPage = lazy(() => import('@/pages/production/OrderProgressPage'));
const PlanRegisterPage = lazy(() => import('@/pages/production/PlanRegisterPage'));
const WorkOrderPage = lazy(() => import('@/pages/production/WorkOrderPage'));

// 모바일 앱(PWA, /m) — 폰에서 쓰는 네 화면만. PC 메뉴 전체를 옮기지 않는다.
const MobileLayout = lazy(() => import('@/pages/mobile/MobileLayout'));
const MobileActivityPage = lazy(() => import('@/pages/mobile/MobileActivityPage'));
const MobilePartnerPage = lazy(() => import('@/pages/mobile/MobilePartnerPage'));
const MobileAttentionPage = lazy(() => import('@/pages/mobile/MobileAttentionPage'));
const MobileSalesPage = lazy(() => import('@/pages/mobile/MobileSalesPage'));
const MobileOrdersPage = lazy(() => import('@/pages/mobile/MobileOrdersPage'));
const MobileProductionPage = lazy(() => import('@/pages/mobile/MobileProductionPage'));
const MobileEquipmentPage = lazy(() => import('@/pages/mobile/MobileEquipmentPage'));
const MobilePlanPage = lazy(() => import('@/pages/mobile/MobilePlanPage'));
const AppDownloadPage = lazy(() => import('@/pages/mobile/AppDownloadPage'));

// 도구
const PdfConverterPage = lazy(() => import('@/pages/tools/PdfConverterPage'));

// 권한
const UserAdminPage = lazy(() => import('@/pages/admin/UserAdminPage'));
const MenuPermissionPage = lazy(() => import('@/pages/admin/MenuPermissionPage'));

// 관리자
const ErpSyncPage = lazy(() => import('@/pages/admin/ErpSyncPage'));
const ActiveUsersPage = lazy(() => import('@/pages/admin/ActiveUsersPage'));
const ClosingPeriodPage = lazy(() => import('@/pages/admin/ClosingPeriodPage'));
const CommonCodePage = lazy(() => import('@/pages/admin/CommonCodePage'));
const ReceivableAgingPage = lazy(() => import('@/pages/admin/ReceivableAgingPage'));

// 통계
// 2026-09-18 통합/AM별/품목별 실적 당분간 미사용 — menuItems.tsx 와 함께 주석 해제
// const TeamForecastPage = lazy(() => import('@/pages/stats/TeamForecastPage'));
// const TeamGoalActualPage = lazy(() => import('@/pages/stats/TeamGoalActualPage'));
// const PartGoalActualYoyPage = lazy(() => import('@/pages/stats/PartGoalActualYoyPage'));
// const AmGoalActualYoyPage = lazy(() => import('@/pages/stats/AmGoalActualYoyPage'));
// const ItemPerfPage = lazy(() => import('@/pages/stats/ItemPerfPage'));
// const ItemPartPerfPage = lazy(() => import('@/pages/stats/ItemPartPerfPage')); // 2026-09-18 미사용
// 2026-09-18 수익성 분석 탭 미사용 — menuItems.tsx 와 함께 주석 해제
// const VendorMarginPage = lazy(() => import('@/pages/stats/VendorMarginPage'));
// const OrderMarginPage = lazy(() => import('@/pages/stats/OrderMarginPage'));
// const GrpProfitPage = lazy(() => import('@/pages/stats/GrpProfitPage')); // 2026-09-18 미사용
const CustomerYearlySalesPage = lazy(() => import('@/pages/stats/CustomerYearlySalesPage'));
const CustomerYearlySalesDetailPage = lazy(() => import('@/pages/stats/CustomerYearlySalesDetailPage'));
const CustomerSalesGrowthPage = lazy(() => import('@/pages/stats/CustomerSalesGrowthPage'));
// const PodProductionPage = lazy(() => import('@/pages/stats/PodProductionPage')); // 2026-09-18 미사용
// const PodProductionSpecsPage = lazy(() => import('@/pages/stats/PodProductionSpecsPage')); // 2026-09-18 미사용
const DesignSalesPage = lazy(() => import('@/pages/stats/DesignSalesPage'));

/** 로딩 폴백 — 브랜드 로고 + Steel Teal 인디터미네이트 바. */
const Loading = () => <BrandedLoader />;


/** 인증 필수 라우트 래퍼 */
const Protected = ({ children, allowedRoles, allowedDeptCds, skipPasswordGate }: { children: React.ReactNode; allowedRoles?: Role[]; allowedDeptCds?: number[]; skipPasswordGate?: boolean }) => (
  <ProtectedRoute allowedRoles={allowedRoles} allowedDeptCds={allowedDeptCds} skipPasswordGate={skipPasswordGate}>
    <Suspense fallback={<Loading />}>
      {children}
    </Suspense>
  </ProtectedRoute>
);

const NotFoundPage = lazy(() => import('@/pages/common/NotFoundPage'));

/** 홈 화면에 설치한 앱(standalone)으로 열었으면 PC 홈 대신 모바일 앱으로 보낸다. */
const StandaloneRedirect = ({ children }: { children: React.ReactNode }) => {
  const standalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
  return standalone ? <Navigate to="/m" replace /> : <>{children}</>;
};

const router = createBrowserRouter([
  // 인증 불필요
  {
    path: '/login',
    element: (
      <Suspense fallback={<Loading />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <Suspense fallback={<Loading />}>
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  // 앱 설치 안내 — 링크 하나로 배포하므로 로그인 없이 연다.
  {
    path: '/app',
    element: (
      <Suspense fallback={<Loading />}>
        <AppDownloadPage />
      </Suspense>
    ),
  },
  // 인증 필수 — 첫 화면은 매출현황(계획 대비). 설치형 앱으로 열면 /m 으로.
  {
    path: '/',
    element: <Protected><StandaloneRedirect><SalesStatusPage /></StandaloneRedirect></Protected>,
  },
  // 모바일 앱(PWA) — 하단 탭 네 개. 레이아웃 안의 Outlet 이 자체 Suspense 를 가진다.
  {
    path: '/m',
    element: <Protected><MobileLayout /></Protected>,
    children: [
      { index: true, element: <Navigate to="/m/activity" replace /> },
      { path: 'activity', element: <MobileActivityPage /> },
      { path: 'partner', element: <MobilePartnerPage /> },
      { path: 'orders', element: <MobileOrdersPage /> },
      { path: 'production', element: <MobileProductionPage /> },
      { path: 'production/equipment', element: <MobileEquipmentPage /> },
      { path: 'production/plan', element: <MobilePlanPage /> },
      { path: 'attention', element: <MobileAttentionPage /> },
      { path: 'sales', element: <MobileSalesPage /> },
    ],
  },
  // 마이페이지
  {
    path: '/me',
    element: <Protected><MyPage /></Protected>,
  },
  // 임시 비밀번호 강제 변경 (게이트 통과 — 이 화면 자신은 막지 않음)
  {
    path: '/force-password-change',
    element: <Protected skipPasswordGate><ForcePasswordChangePage /></Protected>,
  },
  // 정보관리 — 사업자/고객/영업담당자 관리는 당분간 미사용(2026-09-18). 필요 시 아래와 상단 lazy import 주석 해제.
  // {
  //   path: '/info/biz-owners',
  //   element: <Protected><BizOwnerPage /></Protected>,
  // },
  // {
  //   path: '/info/biz-owners/:id',
  //   element: <Protected><BizOwnerDetailPage /></Protected>,
  // },
  // {
  //   path: '/info/customers',
  //   element: <Protected><CustomerPage /></Protected>,
  // },
  // {
  //   path: '/info/sales-persons',
  //   element: <Protected><PartnerFunctionPage /></Protected>,
  // },
  {
    path: '/info/sales-plan',
    element: <Protected><SalesPlanPage /></Protected>,
  },
  // 2026-09-18 부서/AM 목표입력은 월매출계획으로 대체 — 필요 시 주석 해제 (상단 GoalPage lazy import 도)
  // {
  //   path: '/info/goal',
  //   element: <Protected><GoalPage /></Protected>,
  // },
  {
    path: '/stats/sales-status',
    element: <Protected><SalesStatusPage /></Protected>,
  },
  // 매출리스트 — ERP 매출 상세 + 엑셀
  {
    path: '/stats/sales-list',
    element: <Protected><SalesListPage /></Protected>,
  },
  // 영업관리
  {
    path: '/activity/attention',
    element: <Protected><PartnerAttentionPage /></Protected>,
  },
  {
    path: '/activity/calendar',
    element: <Protected><ActivityCalendarPage /></Protected>,
  },
  {
    path: '/activity/board',
    element: <Protected><ActivityBoardPage /></Protected>,
  },
  {
    path: '/activity/list',
    element: <Protected><ActivityListPage /></Protected>,
  },
  {
    path: '/activity/partner',
    element: <Protected><PartnerCardPage /></Protected>,
  },
  {
    path: '/deals',
    element: <Protected><DealPipelinePage /></Protected>,
  },
  // 생산현황 (TPS)
  {
    path: '/production/plan',
    element: <Protected><ProductionPlanPage /></Protected>,
  },
  {
    path: '/production/dashboard',
    element: <Protected><ProductionDashboardPage /></Protected>,
  },
  {
    path: '/production/equipment-perf',
    element: <Protected><EquipmentPerfPage /></Protected>,
  },
  {
    path: '/production/equipment-board',
    element: <Protected><EquipmentBoardPage /></Protected>,
  },
  {
    path: '/production/order-progress',
    element: <Protected><OrderProgressPage /></Protected>,
  },
  {
    path: '/production/plan-register',
    element: <Protected><PlanRegisterPage /></Protected>,
  },
  {
    // 작업지시서 — 생산계획조회에서 새 탭으로 여는 인쇄용 단독 화면(메뉴 키 /production/plan-register 를 따른다)
    path: '/production/work-order/:orderNo',
    element: <Protected><WorkOrderPage /></Protected>,
  },
  {
    path: '/production/work-order/:orderNo/:sq',
    element: <Protected><WorkOrderPage /></Protected>,
  },
  // 도구 — 파일 PDF 변환 (전 직원)
  {
    path: '/tools/pdf',
    element: <Protected><PdfConverterPage /></Protected>,
  },
  // 권한 관리 (ADMIN)
  {
    path: '/admin/users',
    element: <Protected allowedRoles={['ADMIN']}><UserAdminPage /></Protected>,
  },
  {
    path: '/admin/menu-permissions',
    element: <Protected allowedRoles={['ADMIN']}><MenuPermissionPage /></Protected>,
  },
  // 관리자
  {
    path: '/admin/active-users',
    element: <Protected allowedRoles={['ADMIN']}><ActiveUsersPage /></Protected>,
  },
  {
    path: '/admin/erp-sync',
    element: <Protected allowedRoles={['ADMIN']}><ErpSyncPage /></Protected>,
  },
  {
    path: '/admin/closing',
    element: <Protected allowedRoles={['ADMIN', 'FINANCE']}><ClosingPeriodPage /></Protected>,
  },
  {
    path: '/admin/common-codes',
    element: <Protected allowedRoles={['ADMIN']}><CommonCodePage /></Protected>,
  },
  {
    path: '/admin/receivable-aging',
    element: <Protected allowedRoles={['ADMIN', 'FINANCE']}><ReceivableAgingPage /></Protected>,
  },
  // 2026-09-18 당분간 미사용 (통합 실적 / 매출목표및실적 / 파트별 전년대비 / AM별 실적 / 품목별 실적)
  // {
  //   path: '/stats/team-forecast',
  //   element: <Protected><TeamForecastPage /></Protected>,
  // },
  // {
  //   path: '/stats/team-goal-actual',
  //   element: <Protected><TeamGoalActualPage /></Protected>,
  // },
  // {
  //   path: '/stats/part-goal-yoy',
  //   element: <Protected><PartGoalActualYoyPage /></Protected>,
  // },
  // {
  //   path: '/stats/am-goal-yoy',
  //   element: <Protected><AmGoalActualYoyPage /></Protected>,
  // },
  // {
  //   path: '/stats/item-perf',
  //   element: <Protected><ItemPerfPage /></Protected>,
  // },
  // 2026-09-18 당분간 미사용 (파트별 부대비용 실적) — menuItems.tsx·상단 lazy import 와 함께 주석 해제
  // {
  //   path: '/stats/item-part-perf',
  //   element: <Protected><ItemPartPerfPage /></Protected>,
  // },
  // 2026-09-18 수익성 분석 탭 미사용 (거래처별/주문건별 외주 마진율)
  // {
  //   path: '/stats/vendor-margin',
  //   element: <Protected><VendorMarginPage /></Protected>,
  // },
  // {
  //   path: '/stats/order-margin',
  //   element: <Protected><OrderMarginPage /></Protected>,
  // },
  // 2026-09-18 당분간 미사용 (GRP수익비용대응)
  // {
  //   path: '/stats/grp-profit',
  //   element: <Protected><GrpProfitPage /></Protected>,
  // },
  {
    path: '/stats/customer-yearly-sales',
    element: <Protected><CustomerYearlySalesPage /></Protected>,
  },
  {
    path: '/stats/customer-yearly-sales-detail',
    element: <Protected><CustomerYearlySalesDetailPage /></Protected>,
  },
  {
    path: '/stats/customer-sales-growth',
    element: <Protected><CustomerSalesGrowthPage /></Protected>,
  },
  // 2026-09-18 당분간 미사용 (GRP생산내역, POD 작업사양 내역)
  // {
  //   path: '/stats/pod-production',
  //   element: <Protected><PodProductionPage /></Protected>,
  // },
  // {
  //   path: '/stats/pod-production-specs',
  //   element: <Protected><PodProductionSpecsPage /></Protected>,
  // },
  {
    // 디자인매출통계 — 1차(프론트 선배포, 백엔드 미연결)라 ADMIN 만. 검수 후 다른 통계와 같이 전체 공개 예정.
    path: '/stats/design-sales',
    element: <Protected><DesignSalesPage /></Protected>,
  },
  // catch-all — 미등록 URL(오타·구 북마크·메뉴 상위 클릭)이 React Router 의
  // 개발자용 ErrorBoundary 를 노출하던 버그 차단.
  {
    path: '*',
    element: (
      <Suspense fallback={<Loading />}>
        <NotFoundPage />
      </Suspense>
    ),
  },
]);

const AppRouter: React.FC = () => {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
};

export default AppRouter;
