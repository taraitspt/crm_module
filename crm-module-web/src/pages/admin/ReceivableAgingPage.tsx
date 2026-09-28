import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, DatePicker, Input, Row, Segmented, Spin, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
 *  - 사업부 = 계정: 국내외상매출금 10801 → TPS · 그래픽스외상매출금 10805 → GRP · PM사업외상매출금 10804 → PM. 전사 = 셋의 합.
 *  - 상단(제목·조회조건·핵심지표)은 고정, 아래는 대시보드 / 부서·거래처별 표 전환.
 *  - 채권율·회수기한은 TPS·GRP·PM·전사 모두 산식(분모·부가세·선매출차감·신판재고이관 처리)을 사용자가 정할 때까지
 *    "—"(산식 미정)로 둔다(2026-09-28 사용자 지시).
 *    어설픈 금액을 넣지 않기로 한 결정. 확정되면 서버 분모 조회와 함께 붙인다 — ReceivableAgingController 주석 참고.
 *    잔액·연령버킷·전년 잔액은 원장 사실이라 그대로 보여준다(부가세 포함 금액).
 */

const DIVISIONS = [
  { key: 'TPS', acct: '10801' },
  { key: 'GRP', acct: '10805' },
  { key: 'PM', acct: '10804' },
] as const;
type DivKey = ReceivableDivision;
type Scope = 'ALL' | DivKey;
type View = 'dashboard' | 'detail';

/** PageLayout 의 고정 앱 헤더 높이 — 핵심지표 영역을 그 아래에 붙여 고정한다. */
const APP_HEADER_HEIGHT = 70;

/** 작성부서별 집계 행 */
interface DeptRow extends Totals { key: string; deptNm: string; divisions: string; partnerCount: number; dangerCount: number }
/** 거래처별 집계 행 — 사업부+거래처 단위(같은 거래처가 두 사업부에 있으면 따로) */
interface PartnerRow extends Totals { key: string; division: DivKey; partnerCd: string; partnerNm: string; bizrNo: string; deptNm: string; signal: Signal }

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

/**
 * 연령 막대 X축 범위 — 음수가 있으면 왼쪽으로 60% 더 벌려 막대 왼쪽에 붙는 라벨 자리를 만든다.
 * 오른쪽도 15% 여유(양수 라벨 자리). 음수가 없으면 0 부터.
 */
const AGING_X_DOMAIN: [(min: number) => number, (max: number) => number] = [
  (min) => (min < 0 ? Math.floor(min * 1.6) : 0),
  (max) => (max > 0 ? Math.ceil(max * 1.15) : 0),
];

/** 막대 값 라벨 — 양수는 막대 오른쪽 끝 바깥, 음수는 막대 왼쪽 끝 바깥(빨강). 0 이면 0 쪽에 표시. */
const BarValueLabel = (props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }) => {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const w = Number(props.width ?? 0);
  const h = Number(props.height ?? 0);
  const v = Number(props.value ?? 0);
  const left = Math.min(x, x + w);
  const right = Math.max(x, x + w);
  const neg = v < 0;
  return (
    <text x={neg ? left - 4 : right + 4} y={y + h / 2} dy="0.35em" textAnchor={neg ? 'end' : 'start'}
      fontSize={10} fill={neg ? '#D32F2F' : '#555'}>
      {v.toLocaleString()}
    </text>
  );
};

const ReceivableAgingPage = () => {
  // 기본 = 지난달(마감된 달) 말일 기준. 이번 달은 아직 안 끝나 말일 잔액이 확정되지 않는다.
  const [month, setMonth] = useState<Dayjs>(() => dayjs().subtract(1, 'month'));
  const [scope, setScope] = useState<Scope>('ALL');
  const [view, setView] = useState<View>('dashboard');
  const [partnerKeyword, setPartnerKeyword] = useState('');
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

  // 거래처별 — 사업부+거래처 단위 합산. 작성부서는 금액이 가장 큰 부서(여러 개면 "외 n").
  const partnerRows = useMemo<PartnerRow[]>(() => {
    const map = new Map<string, { t: Totals; r: ReceivableAgingRow; depts: Map<string, number> }>();
    for (const r of scopeRows) {
      const k = `${r.division}|${r.partnerCd ?? ''}`;
      const e = map.get(k) ?? { t: { ...ZERO }, r, depts: new Map<string, number>() };
      e.t = addTotals(e.t, r);
      const dn = r.wrtDeptNm || r.wrtDeptCd || '(부서없음)';
      e.depts.set(dn, (e.depts.get(dn) ?? 0) + (r.amHjan ?? 0));
      map.set(k, e);
    }
    const out: PartnerRow[] = [];
    map.forEach(({ t, r, depts }, k) => {
      if (t.amHjan === 0) return;
      const sorted = [...depts.entries()].sort((a, b) => b[1] - a[1]);
      out.push({
        ...t, key: k, division: r.division, partnerCd: r.partnerCd ?? '', partnerNm: r.partnerNm ?? r.partnerCd ?? '',
        bizrNo: r.bizrNo ?? '', deptNm: sorted.length > 1 ? `${sorted[0][0]} 외 ${sorted.length - 1}` : (sorted[0]?.[0] ?? ''),
        signal: classify(t),
      });
    });
    return out.sort((a, b) => b.amHjan - a.amHjan);
  }, [scopeRows]);

  // 작성부서별 — 금액 합, 사업부, 거래처 수, 위험(121일 이상 잔액 있는) 거래처 수.
  const deptRows = useMemo<DeptRow[]>(() => {
    const map = new Map<string, { t: Totals; nm: string; divs: Set<string>; partners: Set<string>; danger: Set<string> }>();
    for (const r of scopeRows) {
      const k = r.wrtDeptCd || '(없음)';
      const e = map.get(k) ?? { t: { ...ZERO }, nm: r.wrtDeptNm || r.wrtDeptCd || '(부서없음)', divs: new Set<string>(), partners: new Set<string>(), danger: new Set<string>() };
      e.t = addTotals(e.t, r);
      e.divs.add(r.division);
      map.set(k, e);
    }
    // 부서별 거래처/위험 거래처 수 — 거래처별 합산 결과(partnerRows) 기준이 아니라 부서 안에서의 거래처 합산으로 센다.
    const perDeptPartner = new Map<string, Totals>();
    for (const r of scopeRows) {
      const k = `${r.wrtDeptCd || '(없음)'}|${r.division}|${r.partnerCd ?? ''}`;
      perDeptPartner.set(k, addTotals(perDeptPartner.get(k) ?? { ...ZERO }, r));
    }
    perDeptPartner.forEach((t, k) => {
      if (t.amHjan === 0) return;
      const [dept, div, partner] = k.split('|');
      const e = map.get(dept);
      if (!e) return;
      e.partners.add(`${div}|${partner}`);
      if (classify(t) === 'danger') e.danger.add(`${div}|${partner}`);
    });
    const out: DeptRow[] = [];
    map.forEach((e, k) => {
      if (e.t.amHjan === 0) return;
      out.push({ ...e.t, key: k, deptNm: e.nm, divisions: [...e.divs].sort().join(', '), partnerCount: e.partners.size, dangerCount: e.danger.size });
    });
    return out.sort((a, b) => b.amHjan - a.amHjan);
  }, [scopeRows]);

  const filteredPartners = useMemo(() => {
    const kw = partnerKeyword.trim().toLowerCase();
    return kw
      ? partnerRows.filter((p) => [p.partnerNm, p.partnerCd, p.bizrNo, p.deptNm].some((v) => v?.toLowerCase().includes(kw)))
      : partnerRows;
  }, [partnerRows, partnerKeyword]);

  const pieData = BUCKETS.map((b) => ({ name: b.label, value: Math.max(scopeTotal[b.key as BucketKey], 0), color: b.color }))
    .filter((d) => d.value > 0);
  const yy = month.format('YY');
  const prevYy = month.subtract(1, 'year').format('YY');
  const monthLabel = `${month.format('M')}월말 잔액`;
  const prevBaseDate = data?.prevBaseDate ?? month.subtract(1, 'year').endOf('month').format('YYYY-MM-DD');

  // 사업부별 채권잔액 — 올해/전년 같은 날 막대 2개씩, 전사가 맨 앞.
  const balanceData = [
    { name: '전사', cur: baekman(allTotal.amHjan), prev: baekman(prevOf('ALL') ?? 0) },
    ...DIVISIONS.map((d) => ({ name: d.key, cur: baekman(byDiv[d.key].amHjan), prev: baekman(prevOf(d.key) ?? 0) })),
  ];
  // 사업부별 연령분석 패널 — 전사 + 사업부 셋.
  const agingPanels: { key: Scope; title: string; t: Totals }[] = [
    { key: 'ALL', title: '전사', t: allTotal },
    ...DIVISIONS.map((d) => ({ key: d.key as Scope, title: d.key, t: byDiv[d.key] })),
  ];
  const scopeLabel = scope === 'ALL' ? '전사' : scope;
  const scopeAmount = scopeTotal.amHjan;

  const deptColumns: ColumnsType<DeptRow> = [
    { title: '순위', width: 60, align: 'center', render: (_, __, i) => i + 1 },
    { title: '작성부서', dataIndex: 'deptNm', ellipsis: true },
    ...(scope === 'ALL' ? [{ title: '사업부', dataIndex: 'divisions', width: 110, align: 'center' as const }] : []),
    { title: '채권잔액(만원)', dataIndex: 'amHjan', width: 140, align: 'right', sorter: (a, b) => a.amHjan - b.amHjan,
      render: (v: number) => <b style={TABULAR}>{num(manwon(v))}</b> },
    { title: '비중', width: 80, align: 'right', render: (_, r) => (scopeAmount ? `${((r.amHjan / scopeAmount) * 100).toFixed(1)}%` : '-') },
    { title: '121일 이상(만원)', dataIndex: 'outDay121', width: 140, align: 'right', sorter: (a, b) => a.outDay121 - b.outDay121,
      render: (v: number) => <span style={{ ...TABULAR, color: v > 0 ? '#D32F2F' : undefined }}>{num(manwon(v))}</span> },
    { title: '거래처', dataIndex: 'partnerCount', width: 80, align: 'right', render: (v: number) => `${num(v)} 곳` },
    { title: '위험거래처', dataIndex: 'dangerCount', width: 95, align: 'right', sorter: (a, b) => a.dangerCount - b.dangerCount,
      render: (v: number) => <span style={{ color: v > 0 ? '#D32F2F' : undefined, fontWeight: v > 0 ? 700 : 400 }}>{num(v)} 곳</span> },
  ];

  const partnerColumns: ColumnsType<PartnerRow> = [
    { title: '순위', width: 60, align: 'center', render: (_, __, i) => i + 1 },
    { title: '거래처', dataIndex: 'partnerNm', ellipsis: true, render: (v: string, r) => <span title={`${r.partnerCd} ${r.bizrNo}`}>{v}</span> },
    { title: '작성부서', dataIndex: 'deptNm', width: 170, ellipsis: true },
    ...(scope === 'ALL' ? [{ title: '사업부', dataIndex: 'division', width: 70, align: 'center' as const }] : []),
    { title: '채권잔액(만원)', dataIndex: 'amHjan', width: 130, align: 'right', sorter: (a, b) => a.amHjan - b.amHjan,
      render: (v: number) => <b style={TABULAR}>{num(manwon(v))}</b> },
    ...BUCKETS.map((b) => ({
      title: `${b.label}`, dataIndex: b.key, width: 100, align: 'right' as const,
      sorter: (x: PartnerRow, y: PartnerRow) => x[b.key] - y[b.key],
      render: (v: number) => <span style={{ ...TABULAR, color: v !== 0 && (b.key === 'outDay121') ? '#D32F2F' : undefined }}>{v ? num(manwon(v)) : '-'}</span>,
    })),
    { title: '상태', dataIndex: 'signal', width: 70, align: 'center',
      filters: SIGNALS.map((s) => ({ text: s.label, value: s.key })), onFilter: (v, r) => r.signal === v,
      render: (v: Signal) => {
        const s = SIGNALS.find((x) => x.key === v)!;
        return <Tooltip title={s.sub}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: s.color }} /></Tooltip>;
      } },
  ];

  return (
    <PageLayout>
      {/* ── 상단 고정: 제목·조회조건·핵심지표 — 스크롤해도 앱 헤더 아래에 붙어 있다 ── */}
      <div style={{ position: 'sticky', top: APP_HEADER_HEIGHT, zIndex: 20, background: '#EEF9FA', paddingTop: 4, paddingBottom: 8 }}>
        <PageHeader
          title="채권연령분석"
          sub={`기준일 ${baseDate}`}
          actions={(
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <DatePicker picker="month" value={month} allowClear={false} onChange={(v) => v && setMonth(v)} format="YYYY년 M월"
                disabledDate={(d) => !d.isBefore(dayjs(), 'month')} />
              <Segmented<Scope>
                value={scope}
                onChange={(v) => setScope(v)}
                options={[{ label: '전사', value: 'ALL' }, ...DIVISIONS.map((d) => ({ label: d.key, value: d.key }))]}
              />
            </div>
          )}
        />
        <Card size="small" style={{ marginTop: 8 }} styles={{ body: { padding: '12px 16px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <Text strong style={{ fontSize: 13 }}>핵심지표</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              잔액은 더존 채권원장 기준(부가세 포함). 채권율·회수기한은 산식 미정.
            </Text>
          </div>
          <Spin spinning={isFetching}>
            <Row gutter={[16, 8]}>
              <Kpi label={`${yy}년 채권잔액`} value={eok(scopeTotal.amHjan)} sub={monthLabel} strong />
              <Kpi label={`${prevYy}년 채권잔액`} value={scopePrev == null ? '—' : eok(scopePrev)} sub={`${prevBaseDate} 시점 잔액`} />
              <Kpi label={`${yy}년 채권율`} value="—" sub="산식 미정" strong />
              <Kpi label={`${prevYy}년 채권율`} value="—" sub="산식 미정" />
              <Kpi label={`${yy}년 회수기한`} value="—" sub="산식 미정" strong />
              <Kpi label={`${prevYy}년 회수기한`} value="—" sub="산식 미정" />
            </Row>
          </Spin>
        </Card>
      </div>

      {isError && <Alert type="error" showIcon style={{ margin: '8px 0 12px' }} message="채권연령 조회에 실패했습니다. ERP(오라클) 연결을 확인하세요." />}

      {/* ── 보기 전환 ── */}
      <div style={{ margin: '4px 0 12px' }}>
        <Segmented<View>
          value={view}
          onChange={(v) => setView(v)}
          options={[{ label: '대시보드', value: 'dashboard' }, { label: '부서·거래처별', value: 'detail' }]}
        />
      </div>

      <Spin spinning={isFetching}>
        {view === 'detail' ? (
          <Row gutter={[12, 12]}>
            <Col span={24}>
              <Card size="small" title={`▶ 작성부서별 채권잔액 · ${scopeLabel}`} extra={<Text type="secondary">{num(deptRows.length)}개 부서 · 단위: 만원</Text>}>
                <Table<DeptRow> size="small" bordered rowKey="key" columns={deptColumns} dataSource={deptRows}
                  pagination={false} scroll={{ y: 360 }} />
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small" title={`▶ 거래처별 채권잔액 · ${scopeLabel}`}
                extra={(
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Text type="secondary">{num(filteredPartners.length)}곳 · 단위: 만원</Text>
                    <Input.Search allowClear size="small" placeholder="거래처·사업자번호·부서" style={{ width: 220 }}
                      onSearch={setPartnerKeyword} onChange={(e) => { if (!e.target.value) setPartnerKeyword(''); }} />
                  </div>
                )}>
                <Table<PartnerRow> size="small" bordered rowKey="key" columns={partnerColumns} dataSource={filteredPartners}
                  pagination={{ pageSize: 50, showSizeChanger: false }} scroll={{ x: 1200 }} />
              </Card>
            </Col>
          </Row>
        ) : (
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
                        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{d.title}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, ...TABULAR }}>잔액 {eok(t.amHjan)}</div>
                        <ResponsiveContainer width="100%" height={190}>
                          <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toLocaleString()}
                              domain={AGING_X_DOMAIN} />
                            <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                            <ChartTooltip formatter={(v: number) => [`${v.toLocaleString()} 만원`, '']} />
                            <Bar dataKey="value" barSize={18} isAnimationActive={false}>
                              {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                              <LabelList dataKey="value" content={BarValueLabel} />
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
        )}
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
