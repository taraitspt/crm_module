import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tag, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getOrderProgress } from '@/api/production.api';
import { ORDER_PROGRESS_COLS, STAGE_LABEL, stageColor, stageGroup, ymd, type OrderProgressRow } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';
import { T } from '@/theme/designTokens';

/** 서버와 같은 한도 — OrderProgressController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 92;
const COLS = ORDER_PROGRESS_COLS;
const DATE_COLS = new Set(['progDt', 'ordDt', 'dlvshDts', 'ppProcDt', 'puProcDt']);
const num = (v?: number | string | null) => (v == null || v === '' ? '' : Number(v).toLocaleString('ko-KR'));
const NUMERIC = new Set(COLS.filter((c) => c.type === 'amount').map((c) => c.id));
const colType = (id: string): ColType => COLS.find((c) => c.id === id)?.type ?? 'text';
const getVal = (row: OrderProgressRow, id: string) => (DATE_COLS.has(id) ? ymd(row[id]) : String(row[id] ?? ''));
const HIDDEN_COLS_KEY = 'order-progress-hidden-cols';
const DEFAULT_HIDDEN: Record<string, boolean> = Object.fromEntries(COLS.filter((c) => c.hidden).map((c) => [c.id, true]));

/**
 * 주문진행현황 — GROW 주문별진행현황 이식. 주문일 기간으로 받아 진행상태 칩으로 거른다.
 * 모바일 앱의 "주문" 탭(MobileOrdersPage)이 같은 API 를 카드로 보여준다.
 */
const OrderProgressPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [stage, setStage] = useState<string>();
  const [dept, setDept] = useState<string>();
  const [emp, setEmp] = useState<string>();
  const [prpl, setPrpl] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { const s = localStorage.getItem(HIDDEN_COLS_KEY); return s ? JSON.parse(s) : DEFAULT_HIDDEN; } catch { return DEFAULT_HIDDEN; }
  });
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['order-progress', startDate, endDate],
    queryFn: () => getOrderProgress({ startDate, endDate }),
    staleTime: 60_000,
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);

  const optionsOf = (id: string) =>
    Array.from(new Set(allRows.map((r) => getVal(r, id)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));

  // 진행상태 칩 — 단계 순서대로, 건수 포함
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) { const k = String(r.progNm ?? '(없음)'); m.set(k, (m.get(k) ?? 0) + 1); }
    const order = ['todo', 'doing', 'shipped', 'done'];
    return Array.from(m, ([name, count]) => ({ name, count, group: stageGroup(name) }))
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.count - a.count);
  }, [allRows]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let out = allRows.filter((r) =>
      (!stage || String(r.progNm ?? '(없음)') === stage)
      && (!dept || r.deptNm === dept)
      && (!emp || r.bizrsptEmpnoNm === emp)
      && (!prpl || r.prplNm === prpl)
      && (!kw || ['orddocNo', 'orddocNm', 'partnerNm', 'spcfcsItemNm', 'sodocNo', 'billdocNo'].some((k) => getVal(r, k).toLowerCase().includes(kw))));
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    if (active.length) out = out.filter((r) => active.every(([id, f]) => matchesFilter(getVal(r, id), colType(id), f)));
    if (sortCfg) {
      const t = colType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(getVal(a, sortCfg.colId), getVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [allRows, stage, dept, emp, prpl, keyword, colFilters, sortCfg]);

  const columns = useMemo<ColumnsType<OrderProgressRow>>(() => {
    const hdr = (id: string, label: string) => (
      <HeaderCell colId={id} label={label} type={colType(id)}
        enumOptions={colType(id) === 'enum' ? optionsOf(id) : undefined}
        filter={colFilters[id]} sortDir={sortCfg?.colId === id ? sortCfg.dir : undefined}
        onToggleSort={() => setSortCfg((p) => (p?.colId === id ? (p.dir === 'asc' ? { colId: id, dir: 'desc' } : null) : { colId: id, dir: 'asc' }))}
        onApply={(colId, f) => setColFilters((p) => ({ ...p, [colId]: f }))}
        onClear={(colId) => setColFilters((p) => { const n = { ...p }; delete n[colId]; return n; })} />
    );
    return [
      { title: 'No', width: 58, fixed: 'left', align: 'center', render: (_, __, i) => i + 1 },
      ...COLS.filter((c) => !hiddenCols[c.id]).map((c) => ({
        title: hdr(c.id, c.label),
        dataIndex: c.id,
        width: c.width,
        align: c.align,
        fixed: c.fixed,
        ellipsis: true,
        render: c.id === 'progNm'
          ? (v: string) => (v ? <Tag color={stageColor(v)} style={{ marginInlineEnd: 0 }}>{v}</Tag> : '')
          : DATE_COLS.has(c.id) ? (v: string) => ymd(v)
          : NUMERIC.has(c.id) ? (v: number) => num(v) : undefined,
      })),
    ];
  }, [allRows, colFilters, sortCfg, hiddenCols]);

  const scrollX = useMemo(() => 58 + COLS.filter((c) => !hiddenCols[c.id]).reduce((s, c) => s + c.width, 0), [hiddenCols]);
  const totals = useMemo(() => ({
    qty: rows.reduce((s, r) => s + Number(r.ordQt ?? 0), 0),
    amt: rows.reduce((s, r) => s + Number(r.sumAmt ?? 0), 0),
    done: rows.filter((r) => stageGroup(r.progNm) === 'done').length,
  }), [rows]);

  const excelColumns = COLS.map((c) => ({ header: c.label, key: c.id, formatter: DATE_COLS.has(c.id) ? (v: unknown) => ymd(v as string) : undefined }));
  const excelRows = rows.map((r) => ({ ...r }) as Record<string, unknown>);
  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) { message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`); return; }
    setDateRange(next);
  };
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '주문진행현황을 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;

  return (
    <PageLayout>
      <PageHeader title="주문진행현황" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <span style={{ fontWeight: 600 }}>주문일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <Select allowClear showSearch placeholder="영업담당부서 전체" value={dept} onChange={(v) => { setDept(v); setEmp(undefined); }} options={optionsOf('deptNm')} style={{ width: 160 }} />
          <Select allowClear showSearch placeholder="영업담당자 전체" value={emp} onChange={setEmp}
            options={Array.from(new Set(allRows.filter((r) => !dept || r.deptNm === dept).map((r) => String(r.bizrsptEmpnoNm ?? '')).filter(Boolean)))
              .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }))} style={{ width: 140 }} />
          <Select allowClear placeholder="작업처 전체" value={prpl} onChange={setPrpl} options={optionsOf('prplNm')} style={{ width: 130 }} />
          <Input.Search allowClear placeholder="주문번호·주문명·거래처·세부품목·수주/매출번호" onSearch={setKeyword}
            onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ width: 320 }} />
          <ExcelDownloadBtn data={excelRows} columns={excelColumns}
            fileName={`주문진행현황_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} sheetName="주문진행현황" />
          <Popover trigger="click" placement="bottomRight" content={
            <div style={{ maxHeight: 400, overflowY: 'auto', minWidth: 360, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 14px' }}>
              {COLS.map((c) => (
                <Checkbox key={c.id} checked={!hiddenCols[c.id]}
                  onChange={(e) => setHiddenCols((p) => ({ ...p, [c.id]: !e.target.checked }))}>{c.label}</Checkbox>
              ))}
            </div>
          }>
            <Button icon={<SettingOutlined />}>컬럼</Button>
          </Popover>
          <span style={{ color: T.t3, fontSize: 12 }}>TPS · 최대 {MAX_RANGE_DAYS}일</span>
        </Space>
        {/* 진행상태 칩 — 누르면 그 상태만 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <Tag onClick={() => setStage(undefined)} style={{ cursor: 'pointer', padding: '3px 10px', marginInlineEnd: 0, fontWeight: stage ? 400 : 700, borderColor: stage ? undefined : T.t2 }}>
            전체 {allRows.length}
          </Tag>
          {stageCounts.map((s) => (
            <Tag key={s.name} color={stage === s.name ? stageColor(s.name) : undefined} onClick={() => setStage(stage === s.name ? undefined : s.name)}
              style={{ cursor: 'pointer', padding: '3px 10px', marginInlineEnd: 0 }}>
              {s.name} {s.count}
            </Tag>
          ))}
          <span style={{ fontSize: 11, color: T.t4, alignSelf: 'center', marginLeft: 4 }}>
            {(['todo', 'doing', 'shipped', 'done'] as const).map((g) => `${STAGE_LABEL[g]}`).join(' → ')}
          </span>
        </div>
      </Card>
      {errMsg && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={errMsg} />}
      <Table<OrderProgressRow> virtual bordered size="small" loading={isFetching} columns={columns} dataSource={rows}
        rowKey={(r, i) => `${r.orddocNo}-${r.orddocSq}-${i}`} pagination={false}
        scroll={{ x: scrollX, y: 'calc(100vh - 380px)' }} />
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, padding: '4px 8px', marginTop: 4, fontSize: 12, color: T.t3 }}>
        <span>총 <b style={{ color: T.t2, fontWeight: 600 }}>{num(rows.length)}</b>건</span>
        <span>완료(정산·수주·매출) <b style={{ color: T.ok, fontWeight: 600 }}>{num(totals.done)}</b>건</span>
        <span>주문수량 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.qty)}</b></span>
        <span>합계금액 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.amt)}</b> 원</span>
      </div>
    </PageLayout>
  );
};

export default OrderProgressPage;
