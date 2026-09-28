import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, DatePicker, Row, Segmented, Spin, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader, PageLayout } from '@/components/layout';
import { getReceivableAging } from '@/api/stats.api';
import type { ReceivableAgingRow, ReceivableDivision } from '@/types/stats';

const { Text } = Typography;

/**
 * 채권연령분석(관리자) — 더존 채권원장 기준 사업부별 채권 대시보드.
 *  - 조회는 월 단위, 기준일 = 그 달 말일. 잔액은 기준일 시점(그 뒤 반제분을 되돌려 계산), 연령버킷은 말일에서 거꾸로 30일 단위.
 *  - 사업부 = 계정: 국내외상매출금 10801 → TPS(파주본부) · 그래픽스외상매출금 10805 → GRP · PM사업외상매출금 10804 → PM. 전사 = 셋의 합.
 *  - 전년 잔액 = 기준일의 정확히 1년 전 시점 잔액. 채권율·회수기한은 산식 확정 전이라 비워 둔다.
 */

const DIVISIONS = [
  { key: 'TPS', acct: '10801', label: '파주본부' },
  { key: 'GRP', acct: '10805', label: '그래픽스본부' },
  { key: 'PM', acct: '10804', label: 'PM본부' },
] as const;
type DivKey = ReceivableDivision;
type Scope = 'ALL' | DivKey;

const BUCKETS = [
  { key: 'inDay30', label: '30일 이내', color: '#8FDC9A' },
  { key: 'inDay60', label: '60일 이내', color: '#2E7D32' },
  { key: 'inDay90', label: '90일 이내', color: '#F5A623' },
  { key: 'inDay120', label: '120일 이내', color: '#EF6C00' },
  { key: 'outDay121', label: '121일 이상', color: '#D32F2F' },
] as const;
type BucketKey = typeof BUCKETS[number]['key'];

interface Totals { amHjan: number; inDay30: number; inDay60: number; inDay90: number; inDay120: number; outDay121: number }
const ZERO: Totals = { amHjan: 0, inDay30: 0, inDay60: 0, inDay90: 0, inDay120: 0, outDay121: 0 };
const addTotals = (t: Totals, r: Partial<Totals>): Totals => ({
  amHjan: t.amHjan + (r.amHjan ?? 0),
  inDay30: t.inDay30 + (r.inDay30 ?? 0),
  inDay60: t.inDay60 + (r.inDay60 ?? 0),
  inDay90: t.inDay90 + (r.inDay90 ?? 0),
  inDay120: t.inDay120 + (r.inDay120 ?? 0),
  outDay121: t.outDay121 + (r.outDay121 ?? 0),
});
const sumRows = (rows: ReceivableAgingRow[]): Totals => rows.reduce(addTotals, { ...ZERO });

// 신호등(임시 기준) — 거래처 단위로 합산한 뒤: 121일 이상 잔액 있으면 위험, 91~120일 잔액 있으면 주의, 나머지 정상.
//   거래처별 여신기한(결제조건)을 반영한 기준은 산식 확정 후 교체.
type Signal = 'danger' | 'warn' | 'ok';
const SIGNALS: { key: Signal; label: string; sub: string; color: string }[] = [
  { key: 'danger', label: '위험', sub: '121일 이상 잔액 있음', color: '#D32F2F' },
  { key: 'warn', label: '주의', sub: '91~120일 잔액 있음', color: '#F5A623' },
  { key: 'ok', label: '정상', sub: '90일 이내만', color: '#2E7D32' },
];
const classify = (t: Totals): Signal => (t.outDay121 > 0 ? 'danger' : t.inDay120 > 0 ? 'warn' : 'ok');

const eok = (v: number) => `${(v / 1e8).toFixed(2)}억`;
const manwon = (v: number) => Math.round(v / 1e4);
const baekman = (v: number) => Math.round(v / 1e6);
const num = (v: number) => v.toLocaleString();
const TABULAR: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const ReceivableAgingPage = () => {
  // 기본 = 지난달(마감된 달) 말일 기준. 이번 달은 아직 안 끝나 말일 잔액이 확정되지 않는다.
  const [month, setMonth] = useState<Dayjs>(() => dayjs().subtract(1, 'month'));
  const [scope, setScope] = useState<Scope>('ALL');
  const baseDate = month.endOf('month').format('YYYY-MM-DD');

  const { data, isFetching, isError } = useQuery({
    queryKey: ['receivable-aging', baseDate],
    queryFn: () => getReceivableAging(baseDate).then((r) => (r.data.success ? r.data.data : null)),
    staleTime: 5 * 60 * 1000,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // 사업부별 집계 + 선택 범위 집계
  const byDiv = useMemo(() => Object.fromEntries(
    DIVISIONS.map((d) => [d.key, sumRows(rows.filter((r) => r.division === d.key))]),
  ) as Record<DivKey, Totals>, [rows]);
  const allTotal = useMemo(() => sumRows(rows), [rows]);
  const scopeRows = useMemo(() => (scope === 'ALL'
    ? rows
    : rows.filter((r) => r.division === scope)), [rows, scope]);
  const scopeTotal = useMemo(() => sumRows(scopeRows), [scopeRows]);

  // 전년 같은 날 잔액 — 서버가 사업부별 합계만 내려준다.
  const prevTotals = data?.prevTotals;
  const prevOf = (s: Scope): number | undefined => {
    if (!prevTotals) return undefined;
    return s === 'ALL'
      ? DIVISIONS.reduce((sum, d) => sum + Number(prevTotals[d.key] ?? 0), 0)
      : Number(prevTotals[s] ?? 0);
  };
  const scopePrev = prevOf(scope);

  // 거래처 단위 신호등 — 사업부+거래처 키(같은 거래처가 두 사업부에 있으면 따로 센다)
  const signals = useMemo(() => {
    const perPartner = new Map<string, Totals>();
    for (const r of scopeRows) {
      const k = `${r.division}|${r.partnerCd ?? ''}`;
      perPartner.set(k, addTotals(perPartner.get(k) ?? { ...ZERO }, r));
    }
    const out: Record<Signal, { count: number; amount: number }> = { danger: { count: 0, amount: 0 }, warn: { count: 0, amount: 0 }, ok: { count: 0, amount: 0 } };
    perPartner.forEach((t) => {
      if (t.amHjan === 0 && t.inDay30 === 0 && t.inDay60 === 0 && t.inDay90 === 0 && t.inDay120 === 0 && t.outDay121 === 0) return;
      const s = classify(t);
      out[s].count += 1;
      out[s].amount += t.amHjan;
    });
    return out;
  }, [scopeRows]);

  const pieData = BUCKETS.map((b) => ({ name: b.label, value: Math.max(scopeTotal[b.key as BucketKey], 0), color: b.color }))
    .filter((d) => d.value > 0);
  const yy = month.format('YY');
  const prevYy = month.subtract(1, 'year').format('YY');
  const monthLabel = `${month.format('M')}월말 잔액`;
  const prevBaseDate = data?.prevBaseDate ?? month.subtract(1, 'year').endOf('month').format('YYYY-MM-DD');

  // 사업부별 채권잔액 — 올해/전년 같은 날 막대 2개씩, 전사가 맨 앞.
  const balanceData = [
    { name: '전사', label: '전사', cur: baekman(allTotal.amHjan), prev: baekman(prevOf('ALL') ?? 0) },
    ...DIVISIONS.map((d) => ({ name: d.key, label: d.label, cur: baekman(byDiv[d.key].amHjan), prev: baekman(prevOf(d.key) ?? 0) })),
  ];
  // 사업부별 연령분석 패널 — 전사 + 사업부 셋.
  const agingPanels: { key: Scope; title: string; label: string; t: Totals }[] = [
    { key: 'ALL', title: '전사', label: '3개 사업부 합계', t: allTotal },
    ...DIVISIONS.map((d) => ({ key: d.key as Scope, title: d.key, label: d.label, t: byDiv[d.key] })),
  ];
  const scopeLabel = scope === 'ALL' ? '전사' : DIVISIONS.find((d) => d.key === scope)!.label;

  return (
    <PageLayout>
      <PageHeader
        title={`${scopeLabel} 채권 핵심지표 대시보드`}
        sub={`기준일 ${baseDate} 시점 잔액 · 더존 채권원장 · 파주=국내외상매출금 / 그래픽스=그래픽스외상매출금 / PM=PM사업외상매출금`}
        actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <DatePicker picker="month" value={month} allowClear={false} onChange={(v) => v && setMonth(v)} format="YYYY년 M월"
              disabledDate={(d) => !d.isBefore(dayjs(), 'month')} />
            <Segmented<Scope>
              value={scope}
              onChange={(v) => setScope(v)}
              options={[{ label: '전사', value: 'ALL' }, ...DIVISIONS.map((d) => ({ label: d.label, value: d.key }))]}
            />
          </div>
        )}
      />

      {isError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="채권연령 조회에 실패했습니다. ERP(오라클) 연결을 확인하세요." />}

      <Spin spinning={isFetching}>
        {/* ── 핵심지표 6칸 ── */}
        <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={[16, 8]}>
            <Kpi label={`${yy}년 채권잔액`} value={eok(scopeTotal.amHjan)} sub={monthLabel} strong />
            <Kpi label={`${prevYy}년 채권잔액`} value={scopePrev == null ? '—' : eok(scopePrev)} sub={`${prevBaseDate} 시점 잔액`} />
            <Kpi label={`${yy}년 채권율`} value="—" sub="산식 미정" strong />
            <Kpi label={`${prevYy}년 채권율`} value="—" sub="산식 미정" />
            <Kpi label={`${yy}년 회수기한`} value="—" sub="산식 미정" strong />
            <Kpi label={`${prevYy}년 회수기한`} value="—" sub="산식 미정" />
          </Row>
        </Card>

        <Row gutter={[12, 12]}>
          {/* ── 위험지표 신호등 ── */}
          <Col xs={24} lg={6}>
            <Card
              size="small"
              title={(
                <span>위험지표 신호등 <Tooltip title="임시 기준: 거래처별 합산 잔액에서 121일 이상이 있으면 위험, 91~120일이 있으면 주의, 90일 이내만 있으면 정상. 결제조건(여신기한) 반영 기준은 산식 확정 후 교체."><InfoCircleOutlined style={{ color: '#999' }} /></Tooltip></span>
              )}
              style={{ height: '100%' }}
            >
              {SIGNALS.map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 4px' }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', background: s.color, flex: 'none', boxShadow: 'inset 0 -3px 6px rgba(0,0,0,.18)' }} />
                  <div>
                    <div style={{ fontWeight: 700, color: s.color }}>{s.label} <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>({s.sub})</Text></div>
                    <div style={{ fontWeight: 600, ...TABULAR }}>{num(signals[s.key].count)} 개 · {(signals[s.key].amount / 1e8).toFixed(1)} 억</div>
                  </div>
                </div>
              ))}
            </Card>
          </Col>

          {/* ── 사업부별 채권연령분석 ── */}
          <Col xs={24} lg={18}>
            <Card size="small" title="▶ 사업부별 채권연령분석" extra={<Text type="secondary">단위: 만원</Text>} style={{ height: '100%' }}>
              <Row gutter={8}>
                {agingPanels.map((d) => {
                  const t = d.t;
                  const chart = BUCKETS.map((b) => ({ name: b.label, value: manwon(t[b.key as BucketKey]), color: b.color })).reverse();
                  const active = scope === 'ALL' || scope === d.key;
                  return (
                    <Col xs={24} md={12} xl={6} key={d.key}>
                      <div style={{ border: `1px solid ${active ? '#0096A2' : '#eee'}`, borderRadius: 6, padding: 8, opacity: active ? 1 : 0.55 }}>
                        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{d.title} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{d.label}</Text></div>
                        <div style={{ textAlign: 'center', fontSize: 12, ...TABULAR }}>잔액 {eok(t.amHjan)}</div>
                        <ResponsiveContainer width="100%" height={190}>
                          <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toLocaleString()} />
                            <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                            <ChartTooltip formatter={(v: number) => [`${v.toLocaleString()} 만원`, '']} />
                            <Bar dataKey="value" barSize={18} isAnimationActive={false}>
                              {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                              <LabelList dataKey="value" position="right" style={{ fontSize: 10 }} formatter={(v: number) => v.toLocaleString()} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>

          {/* ── 사업부별 채권잔액 ── */}
          <Col xs={24} lg={12}>
            <Card size="small" title={`▶ 사업부별 채권잔액 (${baseDate} vs ${prevBaseDate})`} extra={<Text type="secondary">단위: 백만</Text>}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={balanceData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
                  <ChartTooltip formatter={(v: number, n) => [`${v.toLocaleString()} 백만`, n]} />
                  <Legend />
                  <Bar dataKey="prev" name={`${prevYy}년`} fill="#A6BDDB" barSize={30} isAnimationActive={false}>
                    <LabelList dataKey="prev" position="top" style={{ fontSize: 10 }} formatter={(v: number) => v.toLocaleString()} />
                  </Bar>
                  <Bar dataKey="cur" name={`${yy}년`} fill="#4F81BD" barSize={30} isAnimationActive={false}>
                    <LabelList dataKey="cur" position="top" style={{ fontSize: 10 }} formatter={(v: number) => v.toLocaleString()} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>

          {/* ── 채권회수기간 비율 ── */}
          <Col xs={24} lg={12}>
            <Card size="small" title="▶ 채권회수기간 비율" extra={<Text type="secondary">{scopeLabel}</Text>}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="40%"
                    cy="50%"
                    outerRadius={100}
                    isAnimationActive={false}
                    label={(p: { percent?: number }) => `${Math.round((p.percent ?? 0) * 100)}%`}
                    labelLine={false}
                  >
                    {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <ChartTooltip formatter={(v: number) => [`${manwon(v).toLocaleString()} 만원`, '']} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      </Spin>
    </PageLayout>
  );
};

/** 핵심지표 한 칸 — 라벨 / 값 / 보조문구. strong 이면 당해(빨강 강조). */
const Kpi = ({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) => (
  <Col xs={12} md={8} lg={4}>
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: strong ? '#D32F2F' : '#222', ...TABULAR }}>{value}</div>
      <div style={{ fontSize: 11, color: '#999' }}>{sub}</div>
    </div>
  </Col>
);

export default ReceivableAgingPage;
