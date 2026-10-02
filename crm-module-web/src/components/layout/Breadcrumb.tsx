import React, { useEffect, useState } from 'react';
import { Breadcrumb as AntBreadcrumb, theme } from 'antd';
import { useLocation, Link } from 'react-router-dom';

const { useToken } = theme;

/** 경로 → 라벨 매핑 테이블 */
const pathLabels: Record<string, string> = {
  '/': '매출현황',
  '/activity': '영업관리',
  '/activity/attention': '관리 필요 거래처',
  '/activity/calendar': '영업활동 캘린더',
  '/activity/board': '일자별 영업현황',
  '/activity/list': '영업활동 이력',
  '/activity/partner': '거래처 카드',
  '/deals': '수주 추진',
  '/production': '생산현황',
  '/production/plan': '생산계획현황',
  '/production/dashboard': '생산계획 대시보드',
  '/production/equipment-perf': '설비별 작업실적',
  '/production/equipment-board': '설비 가동 현황',
  '/production/order-progress': '주문진행현황',
  '/production/plan-register': '생산계획조회',
  '/production/work-order': '작업지시서',
  '/tools/pdf': 'PDF 변환',
  '/admin/users': '사용자 관리',
  '/admin/menu-permissions': '권한 관리',
  '/admin/receivable-aging': '채권연령분석',
  '/info': '정보관리',
  '/info/biz-owners': '사업자관리',
  '/info/customers': '고객관리',
  '/info/sales-persons': '영업담당자관리',
  '/info/goal': '목표 입력',
  '/info/sales-plan': '월매출계획',
  '/stats/sales-status': '매출현황 (계획 대비)',
  '/stats/sales-list': '매출리스트',
  '/stats': '통계',
  '/stats/team-forecast': '본부/팀 예상매출',
  '/stats/team-goal-actual': '매출목표 및 실적',
  '/stats/part-goal-yoy': '파트별 전년대비',
  '/stats/am-goal-yoy': 'AM별 실적',
  '/stats/item-perf': '품목별 실적조회',
  '/stats/item-part-perf': '파트별 부대비용 실적',
  '/stats/vendor-margin': '거래처별 외주 마진율',
  '/stats/order-margin': '주문건별 외주 마진율',
  '/stats/customer-yearly-sales': '거래처별 월매출',
  '/stats/customer-yearly-sales-detail': '거래처별 월매출(상세)',
  '/stats/pod-production': 'GRP생산내역',
  '/stats/pod-production-specs': 'POD 작업사양 내역',
  '/stats/design-sales': '디자인매출통계',
};

const AppBreadcrumb: React.FC = () => {
  const location = useLocation();
  const { token } = useToken();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 992);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 현재 경로를 세그먼트로 분리하여 브레드크럼 항목 생성
  const buildBreadcrumbItems = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    const items: { title: React.ReactNode }[] = [];

    let currentPath = '';
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const label = pathLabels[currentPath];
      if (label) {
        items.push({
          title: currentPath === location.pathname
            ? label
            : <Link to={currentPath}>{label}</Link>,
        });
      }
    }

    // 기본적으로 '홈' 아이콘이나 텍스트 추가 (경로가 '/'가 아닐 때만)
    if (location.pathname !== '/') {
      items.unshift({ title: <Link to="/">홈</Link> });
    }

    return items;
  };

  if (location.pathname === '/') return null;

  return (
    <div
      style={{
        padding: isMobile ? '0 0 16px 0' : '0 0 20px 0',
        background: 'transparent',
      }}
    >
      <AntBreadcrumb
        items={buildBreadcrumbItems()}
      />
      <style>{`
        .ant-breadcrumb {
          font-size: 13px;
        }
        .ant-breadcrumb a {
          color: ${token.colorTextSecondary} !important;
          transition: color 0.2s;
        }
        .ant-breadcrumb a:hover {
          color: ${token.colorPrimary} !important;
        }
        .ant-breadcrumb li:last-child {
          color: ${token.colorTextBase} !important;
          font-weight: 600;
        }
        .ant-breadcrumb-separator {
          color: ${token.colorTextTertiary} !important;
          margin: 0 8px;
        }
      `}</style>
    </div>
  );
};

export default AppBreadcrumb;
