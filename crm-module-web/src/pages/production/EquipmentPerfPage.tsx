import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getEquipmentPerf } from '@/api/production.api';
import { WORK_CENTERS, colsFor, isRunning, type EquipmentPerfRow, type WorkCenter } from '@/types/equipmentPerf';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';
import { T } from '@/theme/designTokens';

/** 서버와 같은 한도 — EquipmentPerfController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

const num = (v?: number | string | null) => (v == null || v === '' ? '' : Number(v).toLocaleString('ko-KR'));
const getVal = (row: EquipmentPerfRow, id: string) => String(row[id] ?? '');

/**
 * 작업장 탭 하나(인쇄 또는 제본) — 같은 표 UI 에 컬럼 정의만 다르다(colsFor).
 * 작업시작시간은 있고 종료시간이 없는 행 = 지금 가동 중인 작업(맨 앞 상태 열에 표시, 행 배경 강조).
 */
const PerfTab: React.FC<{ workCenter: WorkCenter; dateRange: [Dayjs, Dayjs] }> = ({ workCenter, dateRange }) => {
  const COLS = colsFor(workCenter);
  const NUMERIC = useMemo(() => new Set(COLS.filter((c) => c.type === 'amount').map((c) => c.id)), [COLS]);
  const colType = (id: string): ColType => COLS.find((c) => c.id === id)?.type ?? 'text';
  const hiddenKey = `equipment-perf-hidden-cols-${workCenter}`;
  const wcLabel = WORK_CENTERS.find((w) => w.value === workCenter)?.label ?? workCenter;

  const [eqp, setEqp] = useState<string>();
  const [op, setOp] = useState<string>();
  const [shift, setShift] = useState<string>();
  const [onlyRunning, setOnlyRunning] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    const def = Object.fromEntries(COLS.filter((c) => c.hidden).map((c) => [c.id, true]));   // 코드 컬럼은 기본 숨김
    try { const s = localStorage.getItem(hiddenKey); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => {
    try { localStorage.setItem(hiddenKey, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols, hiddenKey]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['equipment-perf', workCenter, startDate, endDate],
    queryFn: () => getEquipmentPerf({ startDate, endDate, workCenter }),
    staleTime: 60_000,
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);

  const optionsOf = (id: string) =>
    Array.from(new Set(allRows.map((r) => getVal(r, id)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let out = allRows.filter((r) =>
      (!eqp || r.eqpNm === eqp)
      && (!op || r.opNm === op)
      && (!shift || r.shiftNm === shift)
      && (!onlyRunning || isRunning(r))
      && (!kw || ['orddocNo', 'planNo', 'partnerNm', 'spcfcsItemNm', 'mtrilNm'].some((k) => getVal(r, k).toLowerCase().includes(kw))));
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
  }, [allRows, eqp, op, shift, onlyRunning, keyword, colFilters, sortCfg]);

  const columns = useMemo<ColumnsType<EquipmentPerfRow>>(() => {
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
      { title: '상태', width: 78, fixed: 'left', align: 'center',
        render: (_, r) => (isRunning(r) ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>가동중</Tag> : <span style={{ color: T.t4 }}>완료</span>) },
      ...COLS.filter((c) => !hiddenCols[c.id]).map((c) => ({
        title: hdr(c.id, c.label),
        dataIndex: c.id,
        width: c.width,
        align: c.align,
        fixed: c.fixed,
        ellipsis: true,
        render: c.id === 'wrkDt'
          ? (v: string) => (v && v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v)   // ERP yyyyMMdd → 보기 좋게
          : NUMERIC.has(c.id) ? (v: number) => num(v) : undefined,
      })),
    ];
  }, [allRows, colFilters, sortCfg, hiddenCols, COLS]);

  const scrollX = useMemo(() => 136 + COLS.filter((c) => !hiddenCols[c.id]).reduce((s, c) => s + c.width, 0), [hiddenCols, COLS]);

  const totals = useMemo(() => ({
    running: rows.filter(isRunning).length,
    wrk: rows.reduce((s, r) => s + Number(r.wrkQt ?? 0), 0),
    net: rows.reduce((s, r) => s + Number(r.netQt ?? 0), 0),
    bad: rows.reduce((s, r) => s + Number(r.badQt ?? 0), 0),
  }), [rows]);

  const excelColumns = [{ header: '상태', key: '상태' }, ...COLS.map((c) => ({ header: c.label, key: c.id }))];
  const excelRows = rows.map((r) => ({ ...r, 상태: isRunning(r) ? '가동중' : '완료' }) as Record<string, unknown>);
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '설비별 작업실적을 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;
  const groups = useMemo(() => Array.from(new Set(COLS.map((c) => c.group))), [COLS]);

  return (
    <>
      <Space wrap size={8} style={{ marginBottom: 8 }}>
        <Select allowClear placeholder="공정 전체" value={op} onChange={setOp} options={optionsOf('opNm')} style={{ width: 120 }} />
        <Select allowClear showSearch placeholder="설비 전체" value={eqp} onChange={setEqp} options={optionsOf('eqpNm')} style={{ width: 150 }} />
        <Select allowClear placeholder="주야 전체" value={shift} onChange={setShift} options={optionsOf('shiftNm')} style={{ width: 110 }} />
        <Checkbox checked={onlyRunning} onChange={(e) => setOnlyRunning(e.target.checked)}>가동중만</Checkbox>
        <Input.Search allowClear placeholder="주문번호·계획번호·거래처·세부품목·용지" onSearch={setKeyword}
          onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ width: 300 }} />
        <ExcelDownloadBtn data={excelRows} columns={excelColumns}
          fileName={`설비별작업실적_${wcLabel}_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} sheetName={`설비별작업실적_${wcLabel}`} />
        <Popover trigger="click" placement="bottomRight" content={
          <div style={{ maxHeight: 420, overflowY: 'auto', minWidth: 420, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px 14px' }}>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: T.t3, marginTop: 6 }}>{g}</div>
                {COLS.filter((c) => c.group === g).map((c) => (
                  <Checkbox key={c.id} checked={!hiddenCols[c.id]}
                    onChange={(e) => setHiddenCols((p) => ({ ...p, [c.id]: !e.target.checked }))}>{c.label}</Checkbox>
                ))}
              </React.Fragment>
            ))}
          </div>
        }>
          <Button icon={<SettingOutlined />}>컬럼</Button>
        </Popover>
      </Space>
      {errMsg && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={errMsg} />}
      <Table<EquipmentPerfRow> virtual bordered size="small" loading={isFetching} columns={columns} dataSource={rows}
        rowKey={(r, i) => `${r.eqpCd}-${r.wrkDt}-${r.planNo}-${r.planSq}-${r.planLowSq}-${r.pacVr1 ?? ''}-${i}`} pagination={false}
        rowClassName={(r) => (isRunning(r) ? 'equip-running-row' : '')}
        scroll={{ x: scrollX, y: 'calc(100vh - 380px)' }} />
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, padding: '4px 8px', marginTop: 4, fontSize: 12, color: T.t3 }}>
        <span>총 <b style={{ color: T.t2, fontWeight: 600 }}>{num(rows.length)}</b>건</span>
        <span>가동중 <b style={{ color: T.primary700, fontWeight: 600 }}>{num(totals.running)}</b>건</span>
        <span>생산수량 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.wrk)}</b></span>
        <span>생산정미 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.net)}</b></span>
        <span>불량 <b style={{ color: totals.bad > 0 ? T.er : T.t2, fontWeight: 600 }}>{num(totals.bad)}</b></span>
      </div>
      <style>{`.equip-running-row td { background: ${T.primary50} !important; }`}</style>
    </>
  );
};

/** 설비별 작업실적 — ERP "설비별 작업실적조회" 를 작업장(인쇄 / 제본) 탭으로. 기간은 탭 공통. */
const EquipmentPerfPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);

  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) {
      message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
      return;
    }
    setDateRange(next);
  };

  return (
    <PageLayout>
      <PageHeader title="설비별 작업실적" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space size={8}>
          <span style={{ fontWeight: 600 }}>작업일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <span style={{ color: '#8c8c8c' }}>TPS · 최대 {MAX_RANGE_DAYS}일</span>
        </Space>
      </Card>
      <Card size="small">
        <Tabs
          defaultActiveKey="WC20"
          destroyInactiveTabPane
          items={WORK_CENTERS.map((w) => ({ key: w.value, label: w.label, children: <PerfTab workCenter={w.value} dateRange={dateRange} /> }))}
        />
      </Card>
    </PageLayout>
  );
};

export default EquipmentPerfPage;
