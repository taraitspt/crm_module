import React from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, PageLayout } from '@/components/layout';
import StockLeftoverPage from './StockLeftoverPage';
import SoCcCheckPage from './SoCcCheckPage';
import TransportCheckPage from './TransportCheckPage';

/**
 * 수주 점검(메뉴명; 경로·권한 키는 /stats/data-check 그대로) — 수주 주변 ERP 데이터가 어긋난 곳을 찾는 화면들을 탭 하나로 묶는다(2026-10-06 상단 메뉴 통합, 2026-10-06 "데이터 점검"→"수주 점검", 제목 아래 설명 문구 없앰).
 * 탭은 `?tab=` 으로 고정되며 옛 경로(/stats/stock-leftover, /stats/so-cc-check)는 여기로 리다이렉트된다.
 * 각 탭 화면은 `embedded` 로 자기 PageLayout/PageHeader 를 빼고 본문만 그린다. 보이는 탭만 마운트해 조회가 겹치지 않게 한다.
 */
const TABS = [
  { key: 'leftover', label: '매출 후 잔여재고', render: () => <StockLeftoverPage embedded /> },
  { key: 'so-cc', label: '수주 담당팀 점검', render: () => <SoCcCheckPage embedded /> },
  { key: 'transport', label: '운송정보 부서 점검', render: () => <TransportCheckPage embedded /> },
] as const;
type TabKey = typeof TABS[number]['key'];

const DataCheckPage: React.FC = () => {
  const [sp, setSp] = useSearchParams();
  const requested = sp.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'leftover';

  return (
    <PageLayout>
      <PageHeader title="수주 점검" />
      <Tabs
        activeKey={tab}
        onChange={(k) => setSp({ tab: k }, { replace: true })}
        size="small"
        items={TABS.map((t) => ({ key: t.key, label: t.label, children: t.key === tab ? t.render() : null }))}
      />
    </PageLayout>
  );
};

export default DataCheckPage;
