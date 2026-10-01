import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Segmented, Select, Spin } from 'antd';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { salesPlanApi } from '@/api/salesPlan.api';
import { T } from '@/theme/designTokens';
import { KpiTile, MCard, MEmpty, fmtCompact, fmtNum, rate, rateColor } from './mobileKit';

const C_PLAN = '#E06C00';
const C_ACTUAL = '#0096A2';

/**
 * 매출 — 월매출계획 대비 ERP 실적 요약(TPS). 이번 달·연누계 KPI, 월별 막대, 거래처별 달성률.
 * 기본은 내 담당(로그인 사용자) — 범위 자체는 서버(SALES_STATS)가 역할대로 자른다.
 */
const MobileSalesPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const thisYear = dayjs().year();
  const thisMonth = dayjs().month() + 1;
  const [year, setYear] = useState(thisYear);
  const [mine, setMine] = useState(true);
  const salesEmpId = mine ? user?.id : undefined;
  const curMm = year === thisYear ? thisMonth : 12;

  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-status', year, undefined, salesEmpId, '1000'],
    queryFn: () => salesPlanApi.getStatus(String(year), undefined, salesEmpId, '1000'),
    staleTime: 5 * 60_000,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // 월별 합계 — 연누계는 1월~이번 달까지만(계획은 미래 달도 있어서 그대로 더하면 달성률이 깎인다)
  const monthly = useMemo(() => {
    const out = Array.from({ length: 12 }, (_, i) => ({ mm: i + 1, name: `${i + 1}`, plan: 0, actual: 0 }));
    for (const r of rows) for (const m of r.months) {
      const i = Number(m.planMm) - 1;
      if (i >= 0 && i < 12) { out[i].plan += m.planAmt; out[i].actual += m.actualAmt; }
    }
    return out;
  }, [rows]);
  const cur = monthly[curMm - 1];
  const ytd = monthly.slice(0, curMm).reduce((s, m) => ({ plan: s.plan + m.plan, actual: s.actual + m.actual }), { plan: 0, actual: 0 });
  const rCur = rate(cur.actual, cur.plan);
  const rYtd = rate(ytd.actual, ytd.plan);

  // 거래처별 연누계 — 같은 거래처를 여러 담당자가 가지면 합친다
  const partners = useMemo(() => {
    const map = new Map<string, { name: string; plan: number; actual: number }>();
    for (const r of rows) {
      const cur = map.get(r.partnerCd) ?? { name: r.partnerNm ?? r.partnerCd, plan: 0, actual: 0 };
      for (const m of r.months) if (Number(m.planMm) <= curMm) { cur.plan += m.planAmt; cur.actual += m.actualAmt; }
      map.set(r.partnerCd, cur);
    }
    return Array.from(map, ([cd, v]) => ({ cd, ...v, rate: rate(v.actual, v.plan) })).sort((a, b) => b.actual - a.actual);
  }, [rows, curMm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Select value={year} onChange={setYear} options={[0, 1, 2].map((i) => ({ value: thisYear - i, label: `${thisYear - i}년` }))} style={{ width: 100 }} />
        <Segmented size="small" value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')}
          options={[{ value: 'mine', label: '내 담당' }, { value: 'all', label: '전체' }]} />
        <span style={{ fontSize: 12, color: T.t3, marginLeft: 'auto' }}>TPS</span>
      </div>

      {data && !data.erpAvailable && <Alert type="warning" showIcon message="ERP 실적을 가져오지 못해 계획만 표시합니다." description={data.erpMessage ?? undefined} />}
      {!!error && <Alert type="error" showIcon message="매출현황을 가져오지 못했습니다." />}
      {isFetching && !data && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}

      {data && rows.length === 0 && <MEmpty text={mine ? '내 담당 월매출계획이 없습니다. "전체"로 바꿔 보세요.' : '월매출계획이 없습니다.'} />}

      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{curMm}월</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <KpiTile label="계획" value={fmtCompact(cur.plan)} />
            <KpiTile label="실적" value={fmtCompact(cur.actual)} />
            <KpiTile label="달성률" value={rCur == null ? '-' : `${rCur}%`} color={rateColor(rCur)} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>연누계 (1~{curMm}월)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <KpiTile label="계획" value={fmtCompact(ytd.plan)} />
            <KpiTile label="실적" value={fmtCompact(ytd.actual)} />
            <KpiTile label="달성률" value={rYtd == null ? '-' : `${rYtd}%`} color={rateColor(rYtd)} />
          </div>

          <MCard title="월별 계획 · 실적">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid stroke={T.border2} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={56} />
                <Tooltip formatter={(v: number, n: string) => [`${fmtNum(v)}원`, n]} labelFormatter={(l) => `${l}월`} contentStyle={{ fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="plan" name="계획" fill={C_PLAN} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
                <Bar dataKey="actual" name="실적" fill={C_ACTUAL} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </MCard>

          <MCard title="거래처별 연누계" extra={`${partners.length}곳 · 실적순`}>
            {partners.map((p) => (
              <div key={p.cd} onClick={() => navigate(`/m/partner?cd=${encodeURIComponent(p.cd)}`)}
                style={{ padding: '7px 0', borderBottom: `1px solid ${T.border3}`, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.t1, fontWeight: 600 }}>{p.name}</span>
                  <span className="tabular-nums" style={{ color: T.t2 }}>{fmtCompact(p.actual)}</span>
                  <span className="tabular-nums" style={{ color: rateColor(p.rate), fontWeight: 700, flex: '0 0 52px', textAlign: 'right' }}>{p.rate == null ? '-' : `${p.rate}%`}</span>
                </div>
                {/* 미터 — 계획 대비 실적 */}
                <div style={{ height: 4, borderRadius: 2, background: T.primary100, marginTop: 5 }}>
                  <div style={{ width: `${Math.min(100, p.rate ?? 0)}%`, height: '100%', borderRadius: 2, background: rateColor(p.rate) }} />
                </div>
                <div style={{ fontSize: 11, color: T.t3, marginTop: 3 }}>계획 {fmtCompact(p.plan)}</div>
              </div>
            ))}
          </MCard>
        </>
      )}
    </div>
  );
};

export default MobileSalesPage;
