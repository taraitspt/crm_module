import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { AppMenuItem } from '@/components/layout/menuItems';
import { T } from '@/theme/designTokens';
import { MCard } from './mobileKit';

function keysOf(items: AppMenuItem[], out = new Set<string>()): Set<string> {
  for (const it of items) { if (it.children) keysOf(it.children, out); else out.add(it.key); }
  return out;
}

/**
 * 생산 탭 홈 — 설비 가동 현황 · 작업지시서 입구. 주문진행현황은 하단 "주문" 탭이 따로 있어 여기 두지 않는다(사용자 지적 2026-10-06).
 * 각 항목은 PC 메뉴 키 권한을 따른다.
 */
const MobileProductionPage: React.FC = () => {
  const { items } = useMenuAccess();
  const allowed = keysOf(items);
  const entries = [
    { to: '/m/production/equipment', menuKey: '/production/equipment-board', icon: <DashboardOutlined />, title: '설비 가동 현황', desc: '인쇄·제본 설비마다 지금 돌리는 작업과 오늘 생산량. 60초마다 갱신.' },
    { to: '/m/production/plan', menuKey: '/production/plan-register', icon: <PrinterOutlined />, title: '작업지시서', desc: '주문·의뢰 번호로 찾아 상세 순번을 고르면 그 라인의 작업지시서를 봅니다.' },
  ].filter((e) => allowed.has(e.menuKey));

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
