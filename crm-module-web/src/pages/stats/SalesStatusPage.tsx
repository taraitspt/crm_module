import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Row, Select, Space, Table, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { lookupApi } from '@/api/info.api';
import { salesPlanApi } from '@/api/salesPlan.api';
import type { SalesStatusRow } from '@/types/salesPlan';
import { PLANTS } from '@/types/attention';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;
const MONTH_OPTIONS = MONTHS.map((_, i) => ({ value: i + 1, label: `${i + 1}월` }));

/**
 * 계획/실적 2계열 색. dataviz 검증(validate_palette) 통과 조합 —
 * 색각이상 분리 ΔE 16.5(protan) / 31.1(tritan), 표면 대비 3:1 이상.
 * TARA ORANGE(#F08300)는 대비가 2.57 로 미달이라 한 단계 어두운 #E06C00 사용.
 */
const C_PLAN = '#E06C00';
const C_ACTUAL = '#0096A2';

const fmtNum = (v: number | undefined | null) =>
  v ? `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0';
/** 축 눈금용 — 억 단위로 줄여 라벨 충돌을 막는다. */
const fmtEok = (v: number) => (v === 0 ? '0' : `${Math.round(v / 1e8)}억`);
/** KPI 타일용 — 원 단위 그대로 쓰면 카드 폭에서 잘린다. 정확한 값은 보조줄에 둔다. */
const fmtEok1 = (v: number) => `${(v / 1e8).toFixed(1)}억`;
const rate = (actual: number, plan: number) => (plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null);
const rateColor = (r: number | null) => (r == null ? T.t3 : r >= 100 ? T.ok : T.er);

/**
 * 표의 행 구분.
 * 전체보기 = 계획(공임+용지) / 실적 2줄. 상세보기 = 계획-공임 / 계획-용지 / 실적 3줄.
 * 실적은 ERP 매출전표에 공임·용지 구분이 없어 어느 모드에서든 합계 한 줄이다.
 */
type Line2 = 'plan' | 'labor' | 'paper' | 'actual';
const LINE_LABEL: Record<Line2, string> = { plan: '계획', labor: '계획·공임', paper: '계획·용지', actual: '실적' };

interface FlatRow {
  key: string;
  line: Line2;
  rowSpan: number;
  src: SalesStatusRow;
  /** 선택한 기간(fromMm~toMm) 합계 — 연간 합계가 아니다. */
  plan: number;
  actual: number;
}
interface Agg { name: string; plan: number; actual: number; rate: number | null }

/** 차트 툴팁 — 계획/실적/달성률을 한 번에. 텍스트는 잉크 토큰, 색은 좌측 점이 담당. */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const plan = payload.find((p) => p.name === '계획')?.value ?? 0;
  const actual = payload.find((p) => p.name === '실적')?.value ?? 0;
  const r = rate(actual, plan);
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border1}`, borderRadius: 8,
      padding: '8px 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12,
    }}>
      <div style={{ color: T.t1, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.t2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
          <span style={{ minWidth: 28 }}>{p.name}</span>
          <span className="tabular-nums" style={{ marginLeft: 'auto', color: T.t1 }}>{fmtNum(p.value)}</span>
        </div>
      ))}
      {r != null && payload.length > 1 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border2}`, color: T.t2 }}>
          달성률 <span style={{ color: rateColor(r), fontWeight: 600 }}>{r}%</span>
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
      <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3, marginTop: 2 }}>
        {value}
      </div>
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
 * 매출현황 — 월매출계획(공임+용지) 대비 ERP 매출 실적.
 * 대시보드 탭(요약·추이·부서/담당자·거래처)과 상세 탭(거래처별 계획/실적 2줄 표)으로 나뉜다.
 * 기간(시작월~종료월)을 고르면 모든 집계가 그 구간으로 다시 계산된다.
 * 백엔드는 항상 12개월을 내려주므로 기간 변경은 재조회 없이 즉시 반영된다.
 */
export default function SalesStatusPage() {
  const navigate = useNavigate();
  const { menuKeys } = useMenuAccess();
  // 매출리스트는 상단 메뉴에서 빼고 여기서 연다(2026-10-06). 권한 키 /stats/sales-list 가 없으면 버튼도 숨긴다.
  const canSalesList = menuKeys == null || menuKeys.has('/stats/sales-list');
  const thisYear = dayjs().year();
  const thisMonth = dayjs().month() + 1;

  const [year, setYear] = useState(thisYear);
  const [deptCd, setDeptCd] = useState<number | undefined>(undefined);
  const [salesEmpId, setSalesEmpId] = useState<string>('');
  const [fromMm, setFromMm] = useState(1);
  // 기본은 연초~당월. 연중에 12월까지 잡으면 아직 안 지난 달이 실적 0 으로 섞여 달성률이 낮게 보인다.
  const [toMm, setToMm] = useState(thisMonth);
  /** 사업부문 — 기본은 타라티피에스(1000). 그래픽스·PM 은 별도 조직이라 기본에서 제외. */
  const [plantCd, setPlantCd] = useState('1000');
  /** 상세 탭 표시 모드 — 계획을 공임/용지로 쪼갤지 여부. */
  const [split, setSplit] = useState(false);

  const { data: depts } = useQuery({ queryKey: ['departments'], queryFn: () => lookupApi.getDepartments() });
  const deptOptions = useMemo(
    () => (depts ?? []).filter((d) => d.deptCd != null && d.deptNm).map((d) => ({ value: d.deptCd, label: d.deptNm })),
    [depts],
  );
  const { data: users } = useQuery({ queryKey: ['sales-plan-users', deptCd], queryFn: () => salesPlanApi.getUsers(deptCd) });
  const userOptions = useMemo(() => (users ?? []).map((u) => ({ value: u.id, label: u.name })), [users]);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-status', year, deptCd, salesEmpId, plantCd],
    queryFn: () => salesPlanApi.getStatus(String(year), deptCd, salesEmpId || undefined, plantCd),
  });

  /** 시작월이 종료월보다 뒤면 한 달짜리로 본다(선택 도중 역전 방지). */
  const [lo, hi] = fromMm <= toMm ? [fromMm, toMm] : [toMm, toMm];
  const visibleMonths = useMemo(() => MONTHS.slice(lo - 1, hi), [lo, hi]);
  const periodLabel = lo === hi ? `${lo}월` : `${lo}~${hi}월`;
  const setRange = (from: number, to: number) => { setFromMm(from); setToMm(to); };
  /** 연도를 바꾸면 기간도 그 해에 맞게 — 지난 해는 연간, 올해는 연초~당월. */
  const pickYear = (y: number) => { setYear(y); setRange(1, y === thisYear ? thisMonth : 12); };

  const { flatRows, planTotal, actualTotal } = useMemo(() => {
    const out: FlatRow[] = [];
    let plans = 0;
    let actuals = 0;
    (data?.rows ?? []).forEach((r) => {
      let plan = 0;
      let actual = 0;
      visibleMonths.forEach((mm) => {
        const m = r.months.find((x) => x.planMm === mm);
        plan += m?.planAmt ?? 0;
        actual += m?.actualAmt ?? 0;
      });
      plans += plan;
      actuals += actual;
      const k = `${r.salesEmpId}|${r.partnerCd}`;
      const lines: Line2[] = split ? ['labor', 'paper', 'actual'] : ['plan', 'actual'];
      lines.forEach((line, i) => {
        out.push({ key: `${k}|${line}`, line, rowSpan: i === 0 ? lines.length : 0, src: r, plan, actual });
      });
    });
    return { flatRows: out, planTotal: plans, actualTotal: actuals };
  }, [data, visibleMonths, split]);

  const totalRate = rate(actualTotal, planTotal);

  /**
   * 월별 계획/실적/달성률 — 표 하단 합계와 차트가 같은 값을 쓴다.
   * 아직 오지 않은 달은 달성률을 null 로 둔다(실적 0 을 0% 로 그리면 추세선이 바닥으로 꺾여 오해를 준다).
   */
  const monthTotals = useMemo(
    () => visibleMonths.map((mm) => {
      const n = parseInt(mm, 10);
      const future = year > thisYear || (year === thisYear && n > thisMonth);
      const sum = (pick: (m: SalesStatusRow['months'][number]) => number) =>
        (data?.rows ?? []).reduce((s, r) => {
          const m = r.months.find((x) => x.planMm === mm);
          return s + (m ? pick(m) : 0);
        }, 0);
      const plan = sum((m) => m.planAmt ?? 0);
      const actual = sum((m) => m.actualAmt ?? 0);
      const labor = sum((m) => m.planLaborAmt ?? 0);
      const paper = sum((m) => m.planPaperAmt ?? 0);
      return { mm, name: `${n}월`, plan, actual, labor, paper, rate: future ? null : rate(actual, plan) };
    }),
    [data, visibleMonths, year, thisYear, thisMonth],
  );

  /** 부서별 / 담당자별 집계 — 계획 큰 순. */
  const groupBy = (pick: (r: FlatRow) => string): Agg[] => {
    const map = new Map<string, { plan: number; actual: number }>();
    flatRows.filter((f) => f.line === 'plan').forEach((f) => {
      const k = pick(f) || '-';
      const cur = map.get(k) ?? { plan: 0, actual: 0 };
      cur.plan += f.plan;
      cur.actual += f.actual;
      map.set(k, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, rate: rate(v.actual, v.plan) }))
      .sort((a, b) => b.plan - a.plan);
  };
  const byDept = useMemo(() => groupBy((f) => f.src.deptNm ?? '-'), [flatRows]);
  const byEmp = useMemo(() => groupBy((f) => f.src.empNm), [flatRows]);

  /** 거래처 순위 — 계획이 있는 행만(달성률 정의가 되는 행). */
  const partnerRank = useMemo(() => {
    const list = flatRows
      .filter((f) => f.line === 'plan' && f.plan > 0)
      .map((f) => ({
        key: f.key,
        partnerNm: f.src.partnerNm ?? f.src.partnerCd,
        empNm: f.src.empNm,
        plan: f.plan,
        actual: f.actual,
        rate: rate(f.actual, f.plan) ?? 0,
      }));
    return {
      top: [...list].sort((a, b) => b.rate - a.rate).slice(0, 6),
      bottom: [...list].sort((a, b) => a.rate - b.rate).slice(0, 6),
    };
  }, [flatRows]);

  const cellVal = (f: FlatRow, mm: string) => {
    const m = f.src.months.find((x) => x.planMm === mm);
    if (!m) return 0;
    switch (f.line) {
      case 'plan': return m.planAmt ?? 0;
      case 'labor': return m.planLaborAmt ?? 0;
      case 'paper': return m.planPaperAmt ?? 0;
      default: return m.actualAmt ?? 0;
    }
  };
  /** 행 합계(기간) — 상세보기의 공임/용지 줄은 해당 항목만 더한다. */
  const rowSum = (f: FlatRow) => {
    if (f.line === 'actual') return f.actual;
    if (f.line === 'plan') return f.plan;
    return visibleMonths.reduce((s, mm) => s + cellVal(f, mm), 0);
  };

  const columns: ColumnsType<FlatRow> = [
    { title: '부서', key: 'dept', width: 100, fixed: 'left', onCell: (f) => ({ rowSpan: f.rowSpan }), render: (_, f) => f.src.deptNm ?? '-' },
    { title: '담당자', key: 'emp', width: 90, fixed: 'left', onCell: (f) => ({ rowSpan: f.rowSpan }), render: (_, f) => f.src.empNm },
    { title: '거래처명', key: 'partner', width: 180, fixed: 'left', ellipsis: true, onCell: (f) => ({ rowSpan: f.rowSpan }),
      render: (_, f) => <span>{f.src.partnerNm ?? '-'} <Text type="secondary" style={{ fontSize: 11 }}>{f.src.partnerCd}</Text></span> },
    { title: '구분', key: 'line', width: split ? 76 : 60, fixed: 'left',
      render: (_, f) => <Text style={{ fontSize: 12, color: f.line === 'actual' ? T.t1 : T.t3 }}>{LINE_LABEL[f.line]}</Text> },
    ...visibleMonths.map((mm) => ({
      title: `${parseInt(mm, 10)}월`,
      key: `m${mm}`,
      width: 105,
      align: 'right' as const,
      render: (_: unknown, f: FlatRow) => {
        const v = cellVal(f, mm);
        if (f.line !== 'actual') return <Text type="secondary" className="tabular-nums">{fmtNum(v)}</Text>;
        const p = f.src.months.find((x) => x.planMm === mm)?.planAmt ?? 0;
        const under = p > 0 && v < p;
        return <Text className="tabular-nums" style={{ color: under ? T.er : undefined }}>{fmtNum(v)}</Text>;
      },
    })),
    { title: `합계 (${periodLabel})`, key: 'total', width: 130, align: 'right', fixed: 'right',
      render: (_, f) => <Text strong className="tabular-nums" style={{ color: f.line === 'actual' ? '#1e40af' : T.t3 }}>{fmtNum(rowSum(f))}</Text> },
    { title: '달성률', key: 'rate', width: 80, align: 'right', fixed: 'right', onCell: (f) => ({ rowSpan: f.rowSpan }),
      render: (_, f) => { const r = rate(f.actual, f.plan); return r == null ? '-' : <Text strong style={{ color: rateColor(r) }}>{r}%</Text>; } },
  ];

  const gap = actualTotal - planTotal;
  const noData = !isLoading && (data?.rows.length ?? 0) === 0;

  /** 순위 리스트(거래처 TOP/BOTTOM) 공통 렌더 */
  const rankList = (items: typeof partnerRank.top, emptyText: string) => (
    items.length === 0
      ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ margin: '12px 0' }} />
      : (
        <div>
          {items.map((p) => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border3}` }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.partnerNm}</div>
                <div style={{ fontSize: 11, color: T.t4 }}>{p.empNm}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tabular-nums" style={{ fontSize: 12, color: T.t2 }}>{fmtNum(p.actual)}</div>
                <div className="tabular-nums" style={{ fontSize: 11, color: T.t4 }}>계획 {fmtNum(p.plan)}</div>
              </div>
              <div className="tabular-nums" style={{ width: 56, textAlign: 'right', fontSize: 13, fontWeight: 600, color: rateColor(p.rate) }}>
                {p.rate}%
              </div>
            </div>
          ))}
        </div>
      )
  );

  const dashboard = (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <StatTile label={`계획 (${periodLabel})`} value={fmtEok1(planTotal)} sub={`${fmtNum(planTotal)}원 · ${data?.rows.length ?? 0}개 거래처`} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile label={`실적 (${periodLabel})`} value={fmtEok1(actualTotal)} color={C_ACTUAL} sub={`${fmtNum(actualTotal)}원 · ERP 매출전표`} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile label="달성률" value={totalRate == null ? '-' : `${totalRate}%`} color={rateColor(totalRate)}
            sub={totalRate == null ? '계획 없음' : totalRate >= 100 ? '계획 달성' : '계획 미달'} />
        </Col>
        <Col xs={12} md={6}>
          <StatTile label="계획 대비 차이" value={`${gap >= 0 ? '+' : '−'}${fmtEok1(Math.abs(gap))}`}
            color={gap >= 0 ? T.ok : T.er} sub={`${gap >= 0 ? '+' : '−'}${fmtNum(Math.abs(gap))}원 · ${gap >= 0 ? '초과 달성' : '부족'}`} />
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={16}>
          <ChartCard title="월별 계획 대비 실적" height={260}>
            <BarChart data={monthTotals} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke={T.border2} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.t3 }} axisLine={{ stroke: T.border1 }} tickLine={false} />
              <YAxis tickFormatter={fmtEok} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Bar dataKey="plan" name="계획" fill={C_PLAN} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="actual" name="실적" fill={C_ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title="월별 달성률" extra="100% = 계획 달성 · 미래 월 제외" height={260}>
            <LineChart data={monthTotals} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={T.border2} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.t3 }} axisLine={{ stroke: T.border1 }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: T.border1 }}
                formatter={(v: number) => [`${v}%`, '달성률']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border1}` }}
              />
              <ReferenceLine y={100} stroke={T.t4} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="rate" name="달성률" stroke={C_ACTUAL} strokeWidth={2}
                dot={{ r: 4, fill: C_ACTUAL, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} />
            </LineChart>
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={10}>
          <ChartCard title="부서별 계획 대비 실적" height={Math.max(160, byDept.length * 56)}>
            <BarChart data={byDept} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={T.border2} horizontal={false} />
              <XAxis type="number" tickFormatter={fmtEok} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: T.t2 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Bar dataKey="plan" name="계획" fill={C_PLAN} radius={[0, 4, 4, 0]} maxBarSize={14} />
              <Bar dataKey="actual" name="실적" fill={C_ACTUAL} radius={[0, 4, 4, 0]} maxBarSize={14}>
                <LabelList dataKey="rate" position="right" offset={8}
                  formatter={(v: number | null) => (v == null ? '' : `${v}%`)}
                  style={{ fontSize: 11, fill: T.t2, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ChartCard>
        </Col>
        <Col xs={24} lg={14}>
          <ChartCard title="담당자별 달성률" extra="막대 = 실적, 숫자 = 달성률" height={Math.max(180, byEmp.length * 30)}>
            <BarChart data={byEmp} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={T.border2} horizontal={false} />
              <XAxis type="number" tickFormatter={fmtEok} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: T.t2 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="actual" name="실적" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {byEmp.map((d) => (
                  <Cell key={d.name} fill={C_ACTUAL} fillOpacity={(d.rate ?? 0) >= 100 ? 1 : 0.55} />
                ))}
                <LabelList dataKey="rate" position="right" offset={8}
                  formatter={(v: number | null) => (v == null ? '' : `${v}%`)}
                  style={{ fontSize: 11, fill: T.t2, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card variant="borderless" title={<Text style={{ fontSize: 13, fontWeight: 600 }}>달성률 상위 거래처</Text>}
            styles={{ body: { padding: '4px 16px 12px' }, header: { minHeight: 40, borderBottom: `1px solid ${T.border2}` } }}
            style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            {rankList(partnerRank.top, '계획이 입력된 거래처가 없습니다.')}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card variant="borderless" title={<Text style={{ fontSize: 13, fontWeight: 600 }}>달성률 하위 거래처</Text>}
            styles={{ body: { padding: '4px 16px 12px' }, header: { minHeight: 40, borderBottom: `1px solid ${T.border2}` } }}
            style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            {rankList(partnerRank.bottom, '계획이 입력된 거래처가 없습니다.')}
          </Card>
        </Col>
      </Row>
    </>
  );

  const detailTable = (
    <>
      <Space style={{ marginBottom: 10 }} size={8} align="center">
        <Button.Group>
          <Button size="small" type={split ? 'default' : 'primary'} onClick={() => setSplit(false)}>전체보기</Button>
          <Button size="small" type={split ? 'primary' : 'default'} onClick={() => setSplit(true)}>공임/용지 상세</Button>
        </Button.Group>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {split
            ? '계획을 공임·용지로 나눠 봅니다. 실적은 ERP 매출전표에 공임·용지 구분이 없어 합계만 표시됩니다.'
            : '계획은 공임+용지 합계입니다.'}
        </Text>
      </Space>
      <Table<FlatRow>
      columns={columns}
      dataSource={flatRows}
      loading={isLoading}
      rowKey="key"
      pagination={false}
      size="small"
      bordered
      scroll={{ x: 430 + visibleMonths.length * 105 + 210, y: 'calc(100vh - 360px)' }}
      rowClassName={(f) => (f.line === 'actual' ? '' : 'sales-status-plan-row')}
      locale={{ emptyText: '해당 조건의 월매출계획이 없습니다. 정보관리 → 월매출계획에서 입력하세요.' }}
      summary={() => {
        if (!data || data.rows.length === 0) return null;
        // leaf 컬럼: [부서·담당자·거래처명](3) → 구분(1) → 선택한 월 → 합계 → 달성률
        const rateIdx = 4 + visibleMonths.length + 1;
        type MT = typeof monthTotals[number];
        const line = (label: string, pick: (m: MT) => number, total: number, strong: boolean) => {
          const cells = [
            <Table.Summary.Cell key="l" index={0} colSpan={3}><Text strong>합계 ({data.rows.length}건)</Text></Table.Summary.Cell>,
            <Table.Summary.Cell key="g" index={3}><Text style={{ fontSize: 12 }}>{label}</Text></Table.Summary.Cell>,
          ];
          let idx = 4;
          monthTotals.forEach((m) => {
            cells.push(
              <Table.Summary.Cell key={m.mm} index={idx++} align="right">
                <Text className="tabular-nums" type={strong ? undefined : 'secondary'}>{fmtNum(pick(m))}</Text>
              </Table.Summary.Cell>,
            );
          });
          cells.push(
            <Table.Summary.Cell key="t" index={idx++} align="right">
              <Text strong className="tabular-nums" style={{ color: strong ? '#1e40af' : T.t3 }}>{fmtNum(total)}</Text>
            </Table.Summary.Cell>,
          );
          return cells;
        };
        const sumOf = (pick: (m: MT) => number) => monthTotals.reduce((s, m) => s + pick(m), 0);
        const planLines: { label: string; pick: (m: MT) => number; total: number }[] = split
          ? [
            { label: '계획·공임', pick: (m) => m.labor, total: sumOf((m) => m.labor) },
            { label: '계획·용지', pick: (m) => m.paper, total: sumOf((m) => m.paper) },
          ]
          : [{ label: '계획', pick: (m) => m.plan, total: planTotal }];
        return (
          <Table.Summary fixed>
            {planLines.map((pl, i) => (
              <Table.Summary.Row key={pl.label} className="sales-status-summary">
                {line(pl.label, pl.pick, pl.total, false)}
                {i === 0 && (
                  <Table.Summary.Cell key="rate" index={rateIdx} align="right" rowSpan={planLines.length + 1}>
                    <Text strong style={{ color: rateColor(totalRate) }}>
                      {totalRate == null ? '-' : `${totalRate}%`}
                    </Text>
                  </Table.Summary.Cell>
                )}
              </Table.Summary.Row>
            ))}
            <Table.Summary.Row className="sales-status-summary">
              {line('실적', (m) => m.actual, actualTotal, true)}
            </Table.Summary.Row>
          </Table.Summary>
        );
      }}
      />
    </>
  );

  return (
    <PageLayout>
      <PageHeader
        title="매출현황 (계획 대비)"
        actions={canSalesList && (
          <Button icon={<UnorderedListOutlined />} onClick={() => navigate('/stats/sales-list')}>매출리스트</Button>
        )}
      />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }} style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Select value={year} onChange={pickYear} style={{ width: 100 }}
              options={[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: `${y}년` }))} />
          </Col>
          <Col>
            <Select value={plantCd} onChange={setPlantCd} style={{ width: 170 }} options={PLANTS} />
          </Col>
          <Col>
            <Space.Compact>
              <Select value={lo} onChange={(v) => setFromMm(v)} options={MONTH_OPTIONS} style={{ width: 82 }} />
              <Select value={hi} onChange={(v) => setToMm(v)} options={MONTH_OPTIONS} style={{ width: 82 }} />
            </Space.Compact>
          </Col>
          <Col>
            <Space size={4}>
              <Button size="small" type={lo === 1 && hi === 12 ? 'primary' : 'default'} onClick={() => setRange(1, 12)}>연간</Button>
              <Button size="small" type={lo === 1 && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(1, thisMonth)}>연초~당월</Button>
              <Button size="small" type={lo === thisMonth && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(thisMonth, thisMonth)}>당월</Button>
            </Space>
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="부서" value={deptCd} options={deptOptions} style={{ width: 160 }}
              onChange={(v) => { setDeptCd(v); setSalesEmpId(''); }}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="담당자" value={salesEmpId || undefined} options={userOptions} style={{ width: 140 }}
              onChange={(v) => setSalesEmpId(v ?? '')}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
        </Row>
      </Card>

      {data && !data.erpAvailable && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="실적을 불러오지 못해 계획만 표시합니다." description={data.erpMessage ?? undefined} />
      )}

      <Tabs
        defaultActiveKey="dashboard"
        items={[
          {
            key: 'dashboard',
            label: '대시보드',
            children: noData
              ? <Empty description="해당 조건의 월매출계획이 없습니다. 정보관리 → 월매출계획에서 입력하세요." style={{ padding: '48px 0' }} />
              : dashboard,
          },
          { key: 'detail', label: '상세', children: detailTable },
        ]}
      />

      <style>{`
        .sales-status-plan-row td { background: #f8fafc !important; }
        .sales-status-summary > td { background: #eef2f7 !important; }
      `}</style>
    </PageLayout>
  );
}
