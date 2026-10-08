import React, { useMemo, useState } from 'react';
import { Alert, Card, Col, Drawer, Empty, Input, Progress, Row, Segmented, Space, Spin, Table, Tag, Tooltip, Typography, message } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, WarningFilled } from '@ant-design/icons';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getLifecycleLines, getLifecycleStages } from '@/api/production.api';
import { STAGES, lineProgress, lineStatus, stageCounts, stageRowStatus, type LifecycleLine, type LifecycleStage, type LifecycleStageRow, type LineStatus } from '@/types/lifecycle';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

/** 서버와 같은 한도 — LifecycleController.MAX_RANGE_DAYS */
const MAX_RANGE_DAYS = 31;

const num = (v?: number | null) => (v == null || v === 0 ? (v === 0 ? '0' : '') : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
const md = (v?: string | null) => (v && /^\d{8}$/.test(v) ? `${Number(v.slice(4, 6))}/${Number(v.slice(6, 8))}` : '');
const stageMeta = (k: LifecycleStage) => STAGES.find((s) => s.key === k)!;

/** 목록의 공정 칩 — 전부 마감이면 진한 색, 일부면 연한 색에 분수, 계획 없으면 흐린 대시. */
const StageChip: React.FC<{ stage: LifecycleStage; n: number; done: number }> = ({ stage, n, done }) => {
  const m = stageMeta(stage);
  if (!n) return <span style={{ display: 'inline-block', width: 54, textAlign: 'center', color: T.t4, fontSize: 12 }}>—</span>;
  const all = done >= n;
  return (
    <Tooltip title={`${m.label} ${done}/${n} 대수마감`}>
      <span style={{
        display: 'inline-block', width: 54, textAlign: 'center', fontSize: 12, fontWeight: 600, borderRadius: 10, padding: '1px 0',
        color: all ? '#fff' : m.color, background: all ? m.color : m.bg, border: `1px solid ${all ? m.color : m.head}`,
      }}>
        {all ? `${m.label} ✓` : `${done}/${n}`}
      </span>
    </Tooltip>
  );
};

/** 진행상태 셀 — 대수마감이면 완료(+실적일), 아니면 계획일 지났는지로 지연/대기. */
const StatusCell: React.FC<{ r?: LifecycleStageRow }> = ({ r }) => {
  if (!r) return null;
  if (r.closeYn === 'Y') {
    return (
      <Tooltip title={r.extYn === 'Y' && r.rawCloseYn !== 'Y' ? '외부입고 — 대수마감 없이 완료로 봄' : r.resultDt ? `실적 완료 ${ymd(r.resultDt)}` : '대수마감'}>
        <span style={{ color: T.ok, fontWeight: 700, whiteSpace: 'nowrap' }}><CheckCircleFilled /> 완료</span>
      </Tooltip>
    );
  }
  if (stageRowStatus(r) === 'late') return <span style={{ color: T.er, fontWeight: 600, whiteSpace: 'nowrap' }}><WarningFilled /> 지연</span>;
  return <span style={{ color: T.t4, whiteSpace: 'nowrap' }}><ClockCircleOutlined /> 대기</span>;
};

/** 일정 셀 — 계획일, 외주 발주가 있으면 아래 줄에 입고요청일(발주 납기요청일). */
const ScheduleCell: React.FC<{ r?: LifecycleStageRow }> = ({ r }) => {
  if (!r?.planDt && !r?.reqDt) return null;
  return (
    <div style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
      {r.planDt && <Tooltip title={`계획일 ${ymd(r.planDt)}`}><div>{md(r.planDt)}</div></Tooltip>}
      {r.reqDt && (
        <Tooltip title={`입고요청일 ${ymd(r.reqDt)}${r.purdocNo ? ` · 발주 ${r.purdocNo}` : ''}`}>
          <div style={{ fontSize: 11, color: T.bl }}>입고 {md(r.reqDt)}</div>
        </Tooltip>
      )}
    </div>
  );
};

// ───────────────────────── 상세: 구성×대수 한 줄로 펼치기 ─────────────────────────

interface GridRow {
  key: string;
  configNm?: string;
  prpcntSq?: number;
  color?: string;
  spot?: string;
  PLATE?: LifecycleStageRow;
  PRINT?: LifecycleStageRow;
  PROC: LifecycleStageRow[];
  FOLD?: LifecycleStageRow;
  configCd?: string;
  /** 이 줄에 보여줄 보충 작업(같은 구성 묶음의 첫 줄만) + 병합할 줄 수(0 이면 위 줄에 합쳐짐) */
  supp: LifecycleStageRow[];
  suppSpan: number;
}

const buildGrid = (rows: LifecycleStageRow[]) => {
  const byKey = new Map<string, GridRow>();
  for (const r of rows) {
    if (!r.keyValNm || r.stage === 'BIND') continue;
    const g = byKey.get(r.keyValNm) ?? { key: r.keyValNm, PROC: [], supp: [], suppSpan: 1 };
    if (r.stage === 'PROC') g.PROC.push(r);
    else if (!g[r.stage]) g[r.stage] = r;
    byKey.set(r.keyValNm, g);
  }
  const grid = [...byKey.values()].map((g) => {
    const a = g.PRINT ?? g.PLATE ?? g.FOLD ?? g.PROC[0];
    const p = g.PRINT;
    return {
      ...g,
      configCd: a?.configCd,
      configNm: a?.configNm,
      prpcntSq: a?.prpcntSq,
      color: p ? `${p.gnrlPrwBefQt ?? 0}/${p.gnrlPrwAftrQt ?? 0}` : '',
      spot: p ? `${p.spclrPrwBefQt ?? 0}/${p.spclrPrwAftrQt ?? 0}` : '',
    };
  });
  const maxProc = Math.max(1, ...grid.map((g) => g.PROC.length));
  const bind = rows.filter((r) => r.stage === 'BIND');
  const suppAll = bind.filter((r) => r.lastYn !== 'Y');
  // 보충 작업은 구성 단위 — 같은 구성이 연달아 있는 줄들을 한 칸으로 합치고, 그 구성의 첫 묶음에만 붙인다.
  const used = new Set<string>();
  for (let i = 0; i < grid.length;) {
    let j = i;
    while (j + 1 < grid.length && grid[j + 1].configCd === grid[i].configCd) j += 1;
    const cd = grid[i].configCd ?? '';
    grid[i].suppSpan = j - i + 1;
    if (!used.has(cd)) { grid[i].supp = suppAll.filter((r) => r.configCd === cd); used.add(cd); }
    for (let k = i + 1; k <= j; k += 1) grid[k].suppSpan = 0;
    i = j + 1;
  }
  const unmatched = suppAll.filter((r) => !used.has(r.configCd ?? ''));
  return { grid, maxProc, finish: bind.find((r) => r.lastYn === 'Y'), supp: unmatched, hasSupp: suppAll.length > unmatched.length };
};

/**
 * 설비 칸 — 외주 발주가 있으면 설비("외주(톰슨)" 같은 자리표시) 대신 발주 업체를 보여준다(사용자 요청 2026-10-08).
 * 원래 설비명·발주번호는 툴팁으로.
 */
const EqpCell: React.FC<{ r?: LifecycleStageRow }> = ({ r }) => {
  if (!r) return null;
  const name = r.vendorNm || r.eqpNm || '';
  const tip = r.vendorNm ? `${r.eqpNm ?? '외주'} · ${r.purdocNo ?? ''}` : r.eqpNm;
  return <Text ellipsis={{ tooltip: tip }} style={{ maxWidth: 96, fontWeight: r.vendorNm ? 600 : undefined }}>{name}</Text>;
};

/** 공정 그룹 열(공정·[용지]·수량·설비·일정·진행) — 헤더·셀 색은 공정 색. */
const stageGroup = (stage: LifecycleStage, title: string, pick: (g: GridRow) => LifecycleStageRow | undefined): ColumnType<GridRow> => {
  const m = stageMeta(stage);
  const head = () => ({ style: { background: m.head, color: T.t1, fontWeight: 700, textAlign: 'center' as const } });
  const cell = () => ({ style: { background: m.bg } });
  const col = (t: string, w: number, render: (r?: LifecycleStageRow) => React.ReactNode, align?: 'right' | 'center'): ColumnType<GridRow> => ({
    title: t, width: w, align, onHeaderCell: head, onCell: cell, render: (_: unknown, g: GridRow) => render(pick(g)),
  });
  const children: ColumnType<GridRow>[] = [
    col('공정', 64, (r) => r?.opNm ?? ''),
    ...(stage === 'PRINT' ? [col('용지', 190, (r) => <Text ellipsis={{ tooltip: r?.mtrilNm }} style={{ maxWidth: 180 }}>{r?.mtrilNm ?? ''}</Text>)] : []),
    ...(stage === 'PROC' ? [col('작업', 110, (r) => <Text ellipsis={{ tooltip: r?.wrkNm }} style={{ maxWidth: 100 }}>{r?.wrkNm ?? ''}</Text>)] : []),
    col('수량', 64, (r) => num(r?.qty), 'right'),
    col('설비', 104, (r) => <EqpCell r={r} />),
    col('일정', 64, (r) => <ScheduleCell r={r} />, 'center'),
    col('진행', 66, (r) => <StatusCell r={r} />, 'center'),
  ];
  return { title, onHeaderCell: head, children } as ColumnType<GridRow>;
};

const bindHead = () => ({ style: { background: stageMeta('BIND').head, color: T.t1, fontWeight: 700, textAlign: 'center' as const } });

/** 보충 작업 — 같은 구성 줄들을 합친 칸에 그 구성의 보충 작업을 줄줄이. 제본 색. */
const suppGroup = (): ColumnType<GridRow> => {
  const m = stageMeta('BIND');
  const col = (t: string, w: number, render: (r: LifecycleStageRow) => React.ReactNode, align?: 'right' | 'center'): ColumnType<GridRow> => ({
    title: t, width: w, align, onHeaderCell: bindHead,
    onCell: (g: GridRow) => ({ rowSpan: g.suppSpan, style: { background: m.bg, verticalAlign: 'middle' } }),
    render: (_: unknown, g: GridRow) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {g.supp.map((r) => <div key={r.planLowSq}>{render(r)}</div>)}
      </div>
    ),
  });
  return {
    title: '보충 작업', onHeaderCell: bindHead,
    children: [
      col('작업', 120, (r) => <Text ellipsis={{ tooltip: `${r.opNm ?? ''} · ${r.wrkNm ?? ''}` }} style={{ maxWidth: 110 }}>{r.wrkNm ?? r.opNm}</Text>),
      col('설비', 104, (r) => <EqpCell r={r} />),
      col('일정', 64, (r) => <ScheduleCell r={r} />, 'center'),
      col('진행', 66, (r) => <StatusCell r={r} />, 'center'),
    ],
  } as ColumnType<GridRow>;
};

/** 완성품 제본 — 순번 전체에 한 번이라 모든 줄을 합친 한 칸. */
const finishGroup = (finish: LifecycleStageRow | undefined, rowCount: number): ColumnType<GridRow> => {
  const m = stageMeta('BIND');
  const col = (t: string, w: number, render: (r: LifecycleStageRow) => React.ReactNode, align?: 'right' | 'center'): ColumnType<GridRow> => ({
    title: t, width: w, align, onHeaderCell: bindHead,
    onCell: (_: GridRow, i?: number) => ({ rowSpan: i === 0 ? rowCount : 0, style: { background: m.bg, verticalAlign: 'middle', fontWeight: 600 } }),
    render: () => (finish ? render(finish) : ''),
  });
  return {
    title: '제본 (완성품)', onHeaderCell: bindHead,
    children: [
      col('공정', 90, (r) => <div><div>{r.opNm}</div>{r.wrkNm && r.wrkNm !== r.opNm && <div style={{ fontSize: 11, color: T.t3, fontWeight: 400 }}>{r.wrkNm}</div>}</div>),
      col('수량', 70, (r) => num(r.qty), 'right'),
      col('설비', 104, (r) => <EqpCell r={r} />),
      col('일정', 64, (r) => <ScheduleCell r={r} />, 'center'),
      col('진행', 66, (r) => <StatusCell r={r} />, 'center'),
    ],
  } as ColumnType<GridRow>;
};

const LifecycleDetail: React.FC<{ line: LifecycleLine }> = ({ line }) => {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['lifecycle-stages', line.orderNo, line.orderSq],
    queryFn: () => getLifecycleStages(line.orderNo, line.orderSq),
    staleTime: 60_000,
  });
  const rows = useMemo(() => data?.data?.data ?? [], [data]);
  const { grid, maxProc, finish, supp, hasSupp } = useMemo(() => buildGrid(rows), [rows]);
  const counts = stageCounts(line);

  const columns = useMemo<ColumnsType<GridRow>>(() => {
    const fixedHead = () => ({ style: { background: T.border2, fontWeight: 700, textAlign: 'center' as const } });
    return [
      { title: '구성', dataIndex: 'configNm', width: 70, fixed: 'left', onHeaderCell: fixedHead, render: (v: string) => <b>{v}</b> },
      { title: '대수', dataIndex: 'prpcntSq', width: 50, fixed: 'left', align: 'center', onHeaderCell: fixedHead },
      { title: '색도', dataIndex: 'color', width: 56, align: 'center', onHeaderCell: fixedHead, render: (v: string) => <Tooltip title="일반 앞/뒤">{v}</Tooltip> },
      { title: '별색', dataIndex: 'spot', width: 56, align: 'center', onHeaderCell: fixedHead, render: (v: string) => <Tooltip title="별색 앞/뒤">{v}</Tooltip> },
      stageGroup('PLATE', '제판', (g) => g.PLATE),
      stageGroup('PRINT', '인쇄', (g) => g.PRINT),
      ...Array.from({ length: maxProc }, (_, i) => stageGroup('PROC', maxProc > 1 ? `후가공 ${i + 1}` : '후가공', (g) => g.PROC[i])),
      stageGroup('FOLD', '접지', (g) => g.FOLD),
      ...(hasSupp ? [suppGroup()] : []),
      finishGroup(finish, grid.length),
    ];
  }, [maxProc, hasSupp, finish, grid.length]);

  const suppCols: ColumnsType<LifecycleStageRow> = [
    { title: '구성', dataIndex: 'configNm', width: 80 },
    { title: '공정', dataIndex: 'opNm', width: 80 },
    { title: '작업', dataIndex: 'wrkNm', width: 120 },
    { title: '설비', width: 120, render: (_, r) => <EqpCell r={r} /> },
    { title: '수량', dataIndex: 'qty', width: 80, align: 'right', render: (v: number) => num(v) },
    { title: '일정', width: 100, align: 'center', render: (_, r) => <ScheduleCell r={r} /> },
    { title: '진행', width: 90, align: 'center', render: (_, r) => <StatusCell r={r} /> },
  ];

  if (isError) return <Alert type="error" showIcon message="생애주기를 불러오지 못했습니다. ERP 연결을 확인하세요." />;
  return (
    <Spin spinning={isFetching}>
      {/* 공정 흐름 요약 — 공정마다 마감 수와 계획 기간 */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {STAGES.map((s, i) => {
          const [n, d] = counts[s.key];
          const st = rows.filter((r) => r.stage === s.key);
          const dts = st.map((r) => r.planDt).filter(Boolean).sort() as string[];
          const pct = n ? Math.round((d / n) * 100) : 0;
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <div style={{ alignSelf: 'center', color: T.t4, fontSize: 18 }}>›</div>}
              <div style={{ flex: '1 0 150px', borderRadius: 10, padding: '10px 12px', background: n ? s.bg : T.border3,
                            border: `1px solid ${n ? s.head : T.border1}`, opacity: n ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 800, color: n ? s.color : T.t4 }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: T.t3 }}>{n ? `${d}/${n}` : '계획 없음'}</span>
                </div>
                {n > 0 && <Progress percent={pct} size="small" showInfo={false} strokeColor={s.color} style={{ margin: '4px 0 2px' }} />}
                <div style={{ fontSize: 11, color: T.t3 }}>{dts.length ? (dts[0] === dts[dts.length - 1] ? ymd(dts[0]) : `${md(dts[0])} ~ ${md(dts[dts.length - 1])}`) : ''}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {grid.length ? (
        <Table<GridRow> size="small" bordered rowKey="key" columns={columns} dataSource={grid} pagination={false}
          scroll={{ x: 'max-content' }} className="lifecycle-grid" />
      ) : !isFetching ? <Empty description="인쇄·제판 계획이 없습니다" /> : null}

      {supp.length > 0 && (
        <Card size="small" style={{ marginTop: 14, borderColor: stageMeta('BIND').head }}
          title={<span style={{ color: stageMeta('BIND').color, fontWeight: 800 }}>구성에 연결되지 않은 보충 작업 {supp.length}건</span>}
          styles={{ header: { background: stageMeta('BIND').bg } }}>
          <Table<LifecycleStageRow> size="small" bordered rowKey={(r) => `${r.planLowSq}`} columns={suppCols} dataSource={supp} pagination={false} />
        </Card>
      )}
      <style>{`.lifecycle-grid .ant-table-thead > tr > th { padding: 4px 6px !important; font-size: 12px; }
               .lifecycle-grid .ant-table-tbody > tr > td { padding: 4px 6px !important; font-size: 12px; }`}</style>
    </Spin>
  );
};

// ───────────────────────── 목록 + 대시보드 ─────────────────────────

type Filter = 'all' | LineStatus;

const LifecyclePage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(3, 'day'), dayjs().add(7, 'day')]);
  const [filter, setFilter] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<LifecycleLine | null>(null);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching, isError } = useQuery({
    queryKey: ['lifecycle-lines', startDate, endDate],
    queryFn: () => getLifecycleLines({ startDate, endDate }),
    staleTime: 60_000,
  });
  const lines = useMemo(() => data?.data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return lines.filter((l) => (filter === 'all' || lineStatus(l) === filter)
      && (!kw || [l.orderNo, l.orderNm, l.partnerNm, l.detailItemNm, l.planNo].some((v) => v?.toLowerCase().includes(kw))));
  }, [lines, filter, keyword]);

  const kpi = useMemo(() => {
    const by = { done: 0, late: 0, progress: 0 } as Record<LineStatus, number>;
    lines.forEach((l) => { by[lineStatus(l)] += 1; });
    const stage = STAGES.map((s) => {
      let n = 0; let d = 0;
      lines.forEach((l) => { const [a, b] = stageCounts(l)[s.key]; n += a; d += b; });
      return { ...s, n, d, pct: n ? Math.round((d / n) * 100) : 0 };
    });
    return { by, stage };
  }, [lines]);

  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) { message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`); return; }
    setDateRange(next);
  };

  const columns: ColumnsType<LifecycleLine> = [
    { title: '주문번호', width: 170, fixed: 'left', render: (_, l) => <b style={{ color: T.primary700 }}>{l.orderNo}-{l.orderSq}</b>,
      sorter: (a, b) => `${a.orderNo}-${a.orderSq}`.localeCompare(`${b.orderNo}-${b.orderSq}`) },
    { title: '거래처', dataIndex: 'partnerNm', width: 150, ellipsis: true },
    { title: '주문명 / 세부품목', ellipsis: true, render: (_, l) => (
      <div style={{ lineHeight: 1.3 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.orderNm}</div>
        {l.detailItemNm && l.detailItemNm !== l.orderNm && <div style={{ fontSize: 12, color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.detailItemNm}</div>}
      </div>
    ) },
    { title: '수량', dataIndex: 'ordQt', width: 80, align: 'right', render: (v: number) => num(v) },
    { title: '공정 진행 (대수마감)', width: 320, render: (_, l) => {
      const c = stageCounts(l);
      return <Space size={4}>{STAGES.map((s) => <StageChip key={s.key} stage={s.key} n={c[s.key][0]} done={c[s.key][1]} />)}</Space>;
    } },
    { title: '진행률', width: 110, sorter: (a, b) => lineProgress(a) - lineProgress(b),
      render: (_, l) => <Progress percent={lineProgress(l)} size="small" strokeColor={T.primary} /> },
    { title: '완성(제본)', width: 150, sorter: (a, b) => (a.finishDt ?? '').localeCompare(b.finishDt ?? ''), render: (_, l) => {
      const st = lineStatus(l);
      return (
        <Space size={4}>
          <span>{ymd(l.finishDt) || '-'}</span>
          {st === 'done' ? <Tag color="green">완성</Tag> : st === 'late' ? <Tag color="red">지연</Tag> : <Tag>진행</Tag>}
        </Space>
      );
    } },
  ];

  const excelColumns = [
    { header: '주문번호', key: 'orderNo' }, { header: '순번', key: 'orderSq' }, { header: '계획번호', key: 'planNo' },
    { header: '거래처', key: 'partnerNm' }, { header: '주문명', key: 'orderNm' }, { header: '세부품목', key: 'detailItemNm' },
    { header: '수량', key: 'ordQt' },
    ...STAGES.flatMap((s) => {
      const k = s.key.toLowerCase();
      return [{ header: `${s.label} 계획`, key: `${k}N` }, { header: `${s.label} 마감`, key: `${k}Done` }];
    }),
    { header: '진행률(%)', key: '_pct', formatter: (_: unknown, r?: Record<string, unknown>) => lineProgress(r as unknown as LifecycleLine) },
    { header: '완성 계획일', key: 'finishDt', formatter: (v: unknown) => ymd(v as string) },
    { header: '완성 마감', key: 'finishDone' },
  ];

  const KpiCard: React.FC<{ label: string; value: number; color: string; active: boolean; onClick: () => void }> = ({ label, value, color, active, onClick }) => (
    <div onClick={onClick} style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 14px', background: active ? color : T.surface,
                                     border: `1px solid ${active ? color : T.border1}`, color: active ? '#fff' : T.t1, minWidth: 110 }}>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{value.toLocaleString()}</div>
    </div>
  );

  return (
    <PageLayout>
      <PageHeader title="주문별 생애주기" sub="주문 순번(제품 하나)의 제판 → 인쇄 → 후가공 → 접지 → 제본 진행 · 진행상태 = 대수마감" />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <span style={{ fontWeight: 600 }}>계획일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <Input.Search allowClear placeholder="주문번호·주문명·거래처·세부품목" onSearch={setKeyword}
            onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ width: 280 }} />
          <ExcelDownloadBtn data={filtered.map((l) => ({ ...l }) as Record<string, unknown>)} columns={excelColumns}
            fileName={`주문별생애주기_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        </Space>
      </Card>
      {isError && <Alert type="error" showIcon style={{ marginBottom: 10 }} message="생애주기 목록을 불러오지 못했습니다. ERP 연결을 확인하세요." />}

      <Spin spinning={isFetching}>
        <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
          <Col xs={24} lg={9}>
            <Card size="small" style={{ height: '100%' }} styles={{ body: { display: 'flex', gap: 8, flexWrap: 'wrap' } }}>
              <KpiCard label="전체 순번" value={lines.length} color={T.navy} active={filter === 'all'} onClick={() => setFilter('all')} />
              <KpiCard label="진행 중" value={kpi.by.progress} color={T.primary} active={filter === 'progress'} onClick={() => setFilter('progress')} />
              <KpiCard label="완성" value={kpi.by.done} color={T.ok} active={filter === 'done'} onClick={() => setFilter('done')} />
              <KpiCard label="지연" value={kpi.by.late} color={T.er} active={filter === 'late'} onClick={() => setFilter('late')} />
            </Card>
          </Col>
          <Col xs={24} lg={15}>
            <Card size="small" title="공정별 대수마감" style={{ height: '100%' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {kpi.stage.map((s) => (
                  <div key={s.key} style={{ flex: '1 1 120px' }}>
                    <div style={{ fontWeight: 700, color: s.color }}>{s.label}</div>
                    <Progress percent={s.pct} strokeColor={s.color} size="small" />
                    <div style={{ fontSize: 11, color: T.t3 }}>{s.d.toLocaleString()} / {s.n.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>

        <Card size="small" title={<Space>순번 <Text type="secondary" style={{ fontWeight: 400 }}>{filtered.length.toLocaleString()}건 · 행을 누르면 생애주기</Text></Space>}
          extra={<Segmented<Filter> size="small" value={filter} onChange={setFilter}
            options={[{ label: '전체', value: 'all' }, { label: '진행 중', value: 'progress' }, { label: '완성', value: 'done' }, { label: '지연', value: 'late' }]} />}>
          <Table<LifecycleLine> size="small" rowKey={(l) => `${l.orderNo}-${l.orderSq}`} columns={columns} dataSource={filtered}
            pagination={{ pageSize: 30, showSizeChanger: false }} scroll={{ x: 1200 }}
            onRow={(l) => ({ onClick: () => setSelected(l), style: { cursor: 'pointer' } })} />
        </Card>
      </Spin>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width="92%" destroyOnClose
        title={selected && (
          <div style={{ lineHeight: 1.35 }}>
            <div><b>{selected.orderNo}-{selected.orderSq}</b> <Text type="secondary" style={{ fontWeight: 400 }}>· {selected.partnerNm}</Text></div>
            <div style={{ fontSize: 13, fontWeight: 400, color: T.t2 }}>
              {selected.orderNm}{selected.detailItemNm && selected.detailItemNm !== selected.orderNm ? ` / ${selected.detailItemNm}` : ''}
              {selected.ordQt ? ` · ${num(selected.ordQt)}부` : ''} · 계획 {selected.planNo}
              {selected.rcptDts ? ` · 입고예정 ${dayjs(selected.rcptDts).format('YYYY-MM-DD')}` : ''}
              {selected.dueDts ? ` · 납품 ${dayjs(selected.dueDts).format('YYYY-MM-DD')}` : ''}
            </div>
          </div>
        )}>
        {selected && <LifecycleDetail line={selected} />}
      </Drawer>
    </PageLayout>
  );
};

export default LifecyclePage;
