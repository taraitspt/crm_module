import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Empty, Row, Segmented, Space, Spin, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { getProductionPlan } from '@/api/production.api';
import { PRODUCTION_TABS, type ProductionPlanRow, type ProductionPlanTab } from '@/types/production';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

/** 서버와 같은 한도 — ProductionPlanController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

/**
 * 완료/미완료 2계열 색 — 매출현황과 같은 검증 조합(validate_palette 통과, protan ΔE 16.5).
 * 완료 = 대수마감 Y 또는 외부입고 설비(서버 doneYn) — 주문 타임라인와 같은 기준(2026-10-08).
 * MES 실적 연동(실적있음/없음)은 외부입고·외주에 거의 안 생겨 진행 판단에 쓰지 않고 참고로만 보여준다.
 * 그 외 차트는 단일 색(TARA GREEN)만 쓴다.
 */
const C_DONE = '#0096A2';
const C_NONE = '#E06C00';
const NO_RESULT = '실적없음';

/** 차트에 올릴 측정값 — 건수 / 탭별 수량(판수·작업수량) / 사내금액. */
type Metric = 'count' | 'qty' | 'amount';
/** 측정값 라벨·단위 — 수량은 탭에 따라 다르다. */
interface MetricMeta { label: string; unit: string }

const fmtNum = (v: number | undefined | null) => Math.round(v ?? 0).toLocaleString('ko-KR');
/** 축 눈금용 — 금액은 억/만으로 줄여 라벨 충돌을 막는다. */
const fmtCompact = (v: number) =>
  v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${fmtNum(v / 1e4)}만` : fmtNum(v);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
/** 가로 막대 Y축 라벨 — 거래처명·설비명이 길어 잘라 쓴다. 전체 이름은 툴팁이 담당. */
const short = (s: string, n = 11) => (s.length > n ? `${s.slice(0, n)}…` : s);

interface Agg { name: string; value: number }

/** 이름별 값 합계, 큰 값부터. 이름이 비면 '(미지정)'. */
function groupSum(rows: ProductionPlanRow[], key: (r: ProductionPlanRow) => string | undefined, val: (r: ProductionPlanRow) => number): Agg[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = (key(r) ?? '').trim() || '(미지정)';
    map.set(k, (map.get(k) ?? 0) + val(r));
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** 상위 n개만 두고 나머지는 '기타' 한 줄로 접는다 — 색을 늘리지 않고 긴 꼬리를 처리. */
function topN(list: Agg[], n: number): Agg[] {
  if (list.length <= n) return list;
  const head = list.slice(0, n);
  const rest = list.slice(n).reduce((s, a) => s + a.value, 0);
  return rest > 0 ? [...head, { name: `기타 (${list.length - n})`, value: rest }] : head;
}

/** 차트 툴팁 — 텍스트는 잉크 토큰, 계열 식별은 좌측 점이 담당. */
function ChartTooltip({ active, payload, label, unit }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: { fullName?: string } }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const title = payload[0]?.payload?.fullName ?? label;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border1}`, borderRadius: 8,
      padding: '8px 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, maxWidth: 280,
    }}>
      <div style={{ color: T.t1, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.t2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block', flex: 'none' }} />
          <span style={{ minWidth: 48 }}>{p.name}</span>
          <span className="tabular-nums" style={{ marginLeft: 'auto', color: T.t1 }}>{fmtNum(p.value)}{unit}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border2}`, color: T.t2, display: 'flex' }}>
          <span>합계</span>
          <span className="tabular-nums" style={{ marginLeft: 'auto', color: T.t1 }}>{fmtNum(total)}{unit}</span>
        </div>
      )}
    </div>
  );
}

/** KPI 타일 — 숫자가 주인공이라 차트를 쓰지 않는다. */
function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <Card variant="borderless" styles={{ body: { padding: '14px 18px' } }}
      style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
      <Text style={{ fontSize: 12, color: T.t3 }}>{label}</Text>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, extra, height, children }: {
  title: string; extra?: React.ReactNode; height: number; children: React.ReactElement;
}) {
  return (
    <Card variant="borderless" styles={{ body: { padding: '14px 16px 6px' } }}
      style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{title}</Text>
        {extra && <div style={{ marginLeft: 'auto', fontSize: 12, color: T.t3 }}>{extra}</div>}
      </div>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </Card>
  );
}

/**
 * 가로 막대 한 장 — 단일 계열이라 범례 없이 막대 끝 직접 라벨만.
 * ResponsiveContainer 가 자식에 width/height 를 주입하므로 그 값을 BarChart 까지 그대로 넘긴다(안 넘기면 빈 차트).
 */
function HBar({ data, meta, ...size }: { data: Agg[]; meta: MetricMeta; width?: number; height?: number }) {
  const rows = data.map((d) => ({ ...d, fullName: d.name, label: short(d.name) }));
  return (
    <BarChart {...size} data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={T.border2} horizontal={false} />
      <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: T.t2 }} axisLine={false} tickLine={false} width={92} interval={0} />
      <Tooltip content={<ChartTooltip unit={meta.unit} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
      <Bar dataKey="value" name={meta.label} fill={C_DONE} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
        <LabelList dataKey="value" position="right" fontSize={11} fill={T.t2} formatter={(v: number) => fmtCompact(v)} />
      </Bar>
    </BarChart>
  );
}

/**
 * 생산계획 대시보드 — 생산계획현황의 탭(인쇄·제판·후가공·접지·제본) 하나를 골라 기간 단위로 요약한다.
 * 조회는 /production/plan/{tab} 한 번이고, 건수/수량/사내금액 전환과 집계는 전부 화면에서 한다.
 * 행 단위로 보려면 생산계획현황(표)으로 간다 — 그쪽이 이 화면의 표 보기다.
 */
const ProductionDashboardPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month').startOf('day')]);
  const [tab, setTab] = useState<ProductionPlanTab>('print');
  const [metric, setMetric] = useState<Metric>('count');
  const tabMeta = PRODUCTION_TABS.find((t) => t.key === tab)!;

  // 수량 축은 탭마다 다르다 — 인쇄·제판은 판수, 나머지는 작업수량(단위 없음).
  const METRICS: Record<Metric, MetricMeta> = {
    count: { label: '건수', unit: '건' },
    qty: { label: tabMeta.qtyLabel, unit: tabMeta.qtyField === 'plateCount' ? '판' : '' },
    amount: { label: '사내금액', unit: '원' },
  };
  const qtyOf = (r: ProductionPlanRow) => Number(r[tabMeta.qtyField] ?? 0);
  const valOf = (r: ProductionPlanRow) => (metric === 'count' ? 1 : metric === 'qty' ? qtyOf(r) : Number(r.workAmount ?? 0));

  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) {
      message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
      return;
    }
    setDateRange(next);
  };

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['production-plan', tab, startDate, endDate],   // 생산계획현황과 같은 키 — 캐시 공유
    queryFn: () => getProductionPlan(tab, { startDate, endDate }),
    staleTime: 60_000,
  });
  const rows = useMemo(() => data?.data?.data ?? [], [data]);

  const kpi = useMemo(() => {
    const noResult = rows.filter((r) => r.resultStatusName === NO_RESULT).length;
    const done = rows.filter((r) => r.doneYn === 'Y').length;
    const ext = rows.filter((r) => r.doneYn === 'Y' && r.extYn === 'Y' && r.pressCloseYn !== 'Y').length;
    return {
      total: rows.length,
      orders: new Set(rows.map((r) => r.orderNo).filter(Boolean)).size,
      plans: new Set(rows.map((r) => r.planNo).filter(Boolean)).size,
      qty: rows.reduce((s, r) => s + qtyOf(r), 0),
      amount: rows.reduce((s, r) => s + Number(r.workAmount ?? 0), 0),
      noResult, resultPct: pct(rows.length - noResult, rows.length),
      done, donePct: pct(done, rows.length), ext,
    };
  }, [rows, tabMeta.qtyField]);

  // 일자별 — 기간 안의 모든 날을 채워 빈 날이 그대로 보이게 한다. 완료/미완료 2계열 스택.
  const byDay = useMemo(() => {
    const map = new Map<string, { done: number; none: number }>();
    for (const r of rows) {
      const k = r.planDate ?? '';
      const cur = map.get(k) ?? { done: 0, none: 0 };
      if (r.doneYn === 'Y') cur.done += valOf(r); else cur.none += valOf(r);
      map.set(k, cur);
    }
    const out: { name: string; fullName: string; done: number; none: number }[] = [];
    for (let d = dateRange[0]; !d.isAfter(dateRange[1]); d = d.add(1, 'day')) {
      const k = d.format('YYYY-MM-DD');
      const v = map.get(k) ?? { done: 0, none: 0 };
      out.push({ name: d.format('M/D'), fullName: `${k} (${'일월화수목금토'[d.day()]})`, ...v });
    }
    return out;
  }, [rows, metric, tabMeta.qtyField, dateRange]);

  const byProcess = useMemo(() => groupSum(rows, (r) => r.processName, valOf), [rows, metric, tabMeta.qtyField]);
  const byEquipment = useMemo(() => topN(groupSum(rows, (r) => r.equipmentName, valOf), 10), [rows, metric, tabMeta.qtyField]);
  const byPartner = useMemo(() => topN(groupSum(rows, (r) => r.partnerName, valOf), 10), [rows, metric, tabMeta.qtyField]);

  const byStatus = useMemo(() => {
    const list = groupSum(rows, (r) => r.resultStatusName, () => 1);
    return list.map((a) => ({ ...a, pct: pct(a.value, rows.length) }));
  }, [rows]);

  const statusColumns: ColumnsType<Agg & { pct: number }> = [
    { title: '실적상태', dataIndex: 'name', render: (v: string) => <span style={{ color: T.t2 }}>{v}</span> },
    { title: '건수', dataIndex: 'value', align: 'right', width: 90,
      render: (v: number) => <span className="tabular-nums" style={{ color: T.t1 }}>{fmtNum(v)}</span> },
    { title: '비율', dataIndex: 'pct', width: 180,
      render: (v: number, rec) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 미터 — 채움은 같은 램프의 진한 단계, 트랙은 옅은 단계. 실적없음은 주의색 */}
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: rec.name === NO_RESULT ? T.waBg : T.primary100 }}>
            <div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: rec.name === NO_RESULT ? C_NONE : C_DONE }} />
          </div>
          <span className="tabular-nums" style={{ width: 44, textAlign: 'right', color: T.t2 }}>{v}%</span>
        </div>
      ) },
  ];

  const errMsg = error ? ((error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
    ?? (error as Error).message) : null;
  // 가로 막대 세 장은 한 줄에 놓이므로 가장 긴 쪽에 맞춰 같은 높이로 — 항목 수가 달라도 카드 아래가 비지 않게.
  const hRow = Math.max(160, Math.min(320, 28 * Math.max(byProcess.length, byEquipment.length, byPartner.length) + 40));
  const m = METRICS[metric];

  return (
    <PageLayout>
      <PageHeader title="생산계획 대시보드" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={12}>
          <span style={{ fontWeight: 600 }}>계획일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <Segmented<ProductionPlanTab> value={tab} onChange={setTab}
            options={PRODUCTION_TABS.map((t) => ({ value: t.key, label: t.label }))} />
          <Segmented<Metric> value={metric} onChange={setMetric}
            options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))} />
          <span style={{ color: T.t3, fontSize: 12 }}>TPS · 최대 {MAX_RANGE_DAYS}일 · 행 단위는 <Link to="/production/plan">생산계획현황</Link></span>
        </Space>
      </Card>

      {errMsg && <Alert type="error" showIcon style={{ marginBottom: 10 }} message="ERP 생산계획을 가져오지 못했습니다." description={errMsg} />}

      <Spin spinning={isFetching}>
        <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
          <Col xs={12} md={8} xl={4}><StatTile label={`${tabMeta.label} 계획 건수`} value={fmtNum(kpi.total)} sub={`계획번호 ${fmtNum(kpi.plans)}개`} /></Col>
          <Col xs={12} md={8} xl={4}><StatTile label="주문 수" value={fmtNum(kpi.orders)} sub="주문번호 기준" /></Col>
          <Col xs={12} md={8} xl={4}><StatTile label={`${tabMeta.qtyLabel} 합계`} value={fmtNum(kpi.qty)} /></Col>
          <Col xs={12} md={8} xl={4}><StatTile label="사내금액 합계" value={fmtCompact(kpi.amount)} sub={`${fmtNum(kpi.amount)} 원`} /></Col>
          <Col xs={12} md={8} xl={4}><StatTile label="완료" value={`${kpi.donePct}%`} color={C_DONE}
            sub={`${fmtNum(kpi.done)} / ${fmtNum(kpi.total)}건${kpi.ext ? ` · 외부입고 ${fmtNum(kpi.ext)}` : ''}`} /></Col>
          <Col xs={12} md={8} xl={4}><StatTile label="MES 실적 연동 (참고)" value={`${kpi.resultPct}%`}
            sub={`${fmtNum(kpi.total - kpi.noResult)}건 · 외부입고·외주는 거의 없음`} /></Col>
        </Row>

        {rows.length === 0 && !isFetching ? (
          <Card variant="borderless" style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            <Empty description={`선택한 기간에 ${tabMeta.label} 생산계획이 없습니다.`} />
          </Card>
        ) : (
          <>
            <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
              <Col span={24}>
                <ChartCard title={`일자별 ${m.label}`} extra="완료 / 미완료 (대수마감·외부입고 기준)" height={240}>
                  <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={T.border2} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.t3 }} axisLine={{ stroke: T.border1 }} tickLine={false} interval={0} />
                    <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip unit={m.unit} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                    {/* 스택 사이 2px 는 표면색 스트로크로 띄운다. 둥근 끝은 맨 위 계열만 */}
                    <Bar dataKey="done" name="완료" stackId="d" fill={C_DONE} stroke={T.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
                    <Bar dataKey="none" name="미완료" stackId="d" fill={C_NONE} stroke={T.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ChartCard>
              </Col>
            </Row>
            <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
              <Col xs={24} xl={8}>
                <ChartCard title={`공정별 ${m.label}`} height={hRow}>
                  <HBar data={byProcess} meta={m} />
                </ChartCard>
              </Col>
              <Col xs={24} xl={8}>
                <ChartCard title={`설비별 ${m.label}`} extra="상위 10" height={hRow}>
                  <HBar data={byEquipment} meta={m} />
                </ChartCard>
              </Col>
              <Col xs={24} xl={8}>
                <ChartCard title={`거래처별 ${m.label}`} extra="상위 10" height={hRow}>
                  <HBar data={byPartner} meta={m} />
                </ChartCard>
              </Col>
            </Row>
            <Row gutter={[10, 10]}>
              <Col xs={24} xl={12}>
                <Card variant="borderless" styles={{ body: { padding: '14px 16px 10px' } }}
                  style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: T.t1, display: 'block', marginBottom: 8 }}>MES 실적 연동 상태 (참고)</Text>
                  <Table<Agg & { pct: number }> size="small" pagination={false} rowKey="name" columns={statusColumns} dataSource={byStatus} />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </PageLayout>
  );
};

export default ProductionDashboardPage;
