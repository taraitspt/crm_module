import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Select, Spin, Tag } from 'antd';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { attentionApi } from '@/api/activity.api';
import { lookupApi } from '@/api/info.api';
import { REASONS, reasonMeta, type AttentionItem, type AttentionReason } from '@/types/attention';
import ActivityFormModal from '@/pages/activity/components/ActivityFormModal';
import { T } from '@/theme/designTokens';
import { KpiTile, MCard, MEmpty, fmtCompact } from './mobileKit';

const PAGE = 40;

/**
 * 관리 필요 거래처 — PC 화면과 같은 기준(매출 1천만 이상·60일 미접촉·130% 성장·상위 20)으로
 * 사유별 칩을 눌러 거르고, 카드에서 바로 활동을 기록하거나 거래처 카드로 간다. 기본 범위는 내 부서.
 */
const MobileAttentionPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const year = dayjs().year();
  const toMm = dayjs().month() + 1;
  // 기본 범위 — 영업 담당은 내 부서, 전사를 보는 역할(관리자·임원·센터장·재무)은 전체
  const companyWide = user?.role === 'ADMIN' || user?.role === 'EXECUTIVE' || user?.role === 'CENTER_LEADER' || user?.role === 'FINANCE';
  const [deptCd, setDeptCd] = useState<string | undefined>(!companyWide && user?.deptCd != null ? String(user.deptCd) : undefined);
  const [reason, setReason] = useState<AttentionReason | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const [modalOpen, setModalOpen] = useState(false);
  const [target, setTarget] = useState<AttentionItem | null>(null);

  const { data: depts } = useQuery({ queryKey: ['lookup-departments'], queryFn: () => lookupApi.getDepartments(), staleTime: 10 * 60_000 });
  const { data, isFetching, error } = useQuery({
    queryKey: ['attention', year, 1, toMm, deptCd, '1000'],
    queryFn: () => attentionApi.find({ year, fromMm: 1, toMm, minAmt: 10_000_000, noContactDays: 60, growthRate: 130, vipTopN: 20, deptCd, plantCd: '1000' }),
    staleTime: 5 * 60_000,
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return reason ? all.filter((i) => i.reasons.includes(reason)) : all;
  }, [data, reason]);
  const risk = useMemo(() => (data?.items ?? []).filter((i) => i.reasons.some((r) => reasonMeta(r).group === 'RISK')).length, [data]);
  const opp = useMemo(() => (data?.items ?? []).filter((i) => i.reasons.some((r) => reasonMeta(r).group === 'OPPORTUNITY')).length, [data]);

  const refresh = () => {
    ['attention', 'activity-calendar', 'activity-list', 'activity-followups', 'today-follow-ups'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Select allowClear placeholder="부서 전체" value={deptCd} onChange={(v) => { setDeptCd(v); setLimit(PAGE); }}
          options={(depts ?? []).map((d) => ({ value: String(d.deptCd), label: d.deptNm }))} style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.t3, whiteSpace: 'nowrap' }}>{year}년 1~{toMm}월 · TPS</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <KpiTile label="관리 필요" value={`${data?.total ?? 0}곳`} />
        <KpiTile label="위험" value={`${risk}곳`} color={risk > 0 ? T.er : T.t1} />
        <KpiTile label="기회" value={`${opp}곳`} color={opp > 0 ? T.ok : T.t1} />
      </div>

      {/* 사유 칩 — 가로 스크롤 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        <Tag onClick={() => setReason(undefined)} color={reason ? undefined : 'default'}
          style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12, marginInlineEnd: 0, flex: 'none', fontWeight: reason ? 400 : 700, borderColor: reason ? undefined : T.t2 }}>전체</Tag>
        {REASONS.map((r) => {
          const n = data?.byReason?.[r.value] ?? 0;
          const on = reason === r.value;
          return (
            <Tag key={r.value} color={on ? r.color : undefined} onClick={() => { setReason(on ? undefined : r.value); setLimit(PAGE); }}
              style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12, marginInlineEnd: 0, flex: 'none', opacity: n === 0 ? 0.5 : 1 }}>
              {r.label} {n}
            </Tag>
          );
        })}
      </div>

      {data && !data.erpAvailable && <Alert type="warning" showIcon message="ERP 매출을 가져오지 못했습니다." description={data.erpMessage ?? undefined} />}
      {!!error && <Alert type="error" showIcon message="관리 필요 거래처를 가져오지 못했습니다." />}
      {isFetching && !data && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}

      {data && items.length === 0 && <MEmpty text="해당하는 거래처가 없습니다." />}
      {items.slice(0, limit).map((it) => (
        <MCard key={it.partnerCd} onClick={() => navigate(`/m/partner?cd=${encodeURIComponent(it.partnerCd)}`)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {it.salesRank != null && it.salesRank <= 20 && <Tag color="gold" style={{ marginInlineEnd: 0 }}>#{it.salesRank}</Tag>}
            <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.partnerNm}</span>
            <Button size="small" onClick={(e) => { e.stopPropagation(); setTarget(it); setModalOpen(true); }}>활동</Button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {it.reasons.map((r) => { const m = reasonMeta(r); return <Tag key={r} color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>; })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', marginTop: 8, fontSize: 12, color: T.t3 }}>
            <span>올해 <b className="tabular-nums" style={{ color: T.t1 }}>{fmtCompact(it.curAmt)}</b></span>
            <span>작년 <b className="tabular-nums" style={{ color: T.t2 }}>{fmtCompact(it.prevAmt)}</b></span>
            <span>증감 <b className="tabular-nums" style={{ color: it.changeRate == null ? T.bl : it.changeRate >= 0 ? T.ok : T.er }}>
              {it.changeRate == null ? '신규' : `${it.changeRate > 0 ? '+' : ''}${it.changeRate}%`}</b></span>
            <span>마지막 거래 <b style={{ color: T.t2 }}>{it.lastBillDt ? dayjs(it.lastBillDt).format('M/D') : '-'}</b></span>
            <span>담당 <b style={{ color: T.t2 }}>{it.ownerNm ?? (it.depts[0]?.deptNm ?? '-')}</b>{it.hasPlan ? '' : ' · 계획없음'}</span>
            <span>최근 활동 <b style={{ color: it.daysSinceActivity != null && it.daysSinceActivity >= 60 ? T.er : T.t2 }}>
              {it.lastActivityDt ? `${it.daysSinceActivity}일 전` : '기록 없음'}</b></span>
          </div>
        </MCard>
      ))}
      {items.length > limit && (
        <Button block onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({items.length - limit}곳 남음)</Button>
      )}

      <ActivityFormModal open={modalOpen} editing={null} defaultSalesEmpId={user?.id}
        defaultPartner={target ? { partnerCd: target.partnerCd, partnerNm: target.partnerNm } : undefined}
        onClose={() => setModalOpen(false)} onSaved={refresh} />
    </div>
  );
};

export default MobileAttentionPage;
