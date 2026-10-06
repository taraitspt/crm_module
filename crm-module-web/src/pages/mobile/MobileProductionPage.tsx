import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { DashboardOutlined, RightOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { AppMenuItem } from '@/components/layout/menuItems';
import { T } from '@/theme/designTokens';
import { MCard } from './mobileKit';

function keysOf(items: AppMenuItem[], out = new Set<string>()): Set<string> {
  for (const it of items) { if (it.children) keysOf(it.children, out); else out.add(it.key); }
  return out;
}

/**
 * 생산 탭 홈 — 설비 가동 현황 입구. 주문진행현황은 하단 "주문" 탭이 따로 있어 여기 두지 않고(사용자 지적 2026-10-06),
 * 작업지시서도 주문 탭 카드에서 바로 열게 돼 여기서 뺐다(2026-10-06; /m/production/plan 검색 화면은 라우트만 주석). 생산일정현황(모바일)은 2026-10-06 추가. 항목이 하나뿐이면 홈을 건너뛰고 바로 연다.
 * 각 항목은 PC 메뉴 키 권한을 따른다.
 */
const MobileProductionPage: React.FC = () => {
  const { items } = useMenuAccess();
  const allowed = keysOf(items);
  const entries = [
    { to: '/m/production/equipment', menuKey: '/production/equipment-board', icon: <DashboardOutlined />, title: '설비 가동 현황', desc: '인쇄·제본 설비마다 지금 돌리는 작업과 오늘 생산량. 60초마다 갱신.' },
    { to: '/m/production/schedule', menuKey: '/production/schedule', icon: <ScheduleOutlined />, title: '생산일정현황', desc: '인쇄·제본·코팅 계획을 날짜·설비유형별로. 수량 진행과 상태, 라인 작업지시서.' },
    // { to: '/m/production/plan', menuKey: '/production/plan-register', icon: <PrinterOutlined />, title: '작업지시서', desc: '…' }, — 주문 탭 카드로 이동(2026-10-06)
  ].filter((e) => allowed.has(e.menuKey));
  if (entries.length === 1) return <Navigate to={entries[0].to} replace />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((e) => (
        <Link key={e.to} to={e.to} style={{ color: 'inherit' }}>
          <MCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24, color: T.primary700, width: 36, textAlign: 'center' }}>{e.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.t1 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{e.desc}</div>
              </div>
              <RightOutlined style={{ color: T.t4 }} />
            </div>
          </MCard>
        </Link>
      ))}
      {entries.length === 0 && <div style={{ textAlign: 'center', color: T.t3, padding: '40px 0', fontSize: 13 }}>볼 수 있는 생산 메뉴가 없습니다.</div>}
    </div>
  );
};

export default MobileProductionPage;
