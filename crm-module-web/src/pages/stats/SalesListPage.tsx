import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tag, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getSalesList } from '@/api/salesList.api';
import type { SalesListRow } from '@/types/salesList';
import { PLANTS } from '@/types/attention';
import StatsDateRangePicker from './components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

/**
 * 매출리스트 — ERP 매출 상세(매출번호·순번 단위)를 기간·사업부문으로 조회, 엑셀 다운로드.
 * 원천·사업부문 조건이 매출현황과 같아 기간 합계(공급가)가 매출현황 실적과 같다.
 * 2026-08 부터 GRP·PM 은 ERP 매출모듈을 쓰지 않아 8월 이후 GRP·PM 은 비어 있다.
 */

/** 서버와 같은 한도 — SalesListService.MAX_RANGE_DAYS */
const MAX_RANGE_DAYS = 92;
const PLANT_LABEL: Record<string, string> = { '1000': 'TPS', '2000': 'GRP', '3000': 'PM' };

const num = (v?: number | null) => (v == null ? '' : Number(v).toLocaleString('ko-KR'));

type ColDef = { id: keyof SalesListRow; label: string; type?: ColType; width: number; align?: 'right' | 'center'; fixed?: 'left' };
const COLS: ColDef[] = [
  { id: 'billDate', label: '매출일', width: 100, fixed: 'left' },
  { id: 'billNo', label: '매출번호', width: 140, fixed: 'left' },
  { id: 'billSq', label: '순번', type: 'amount', width: 60, align: 'center' },
  { id: 'billTypeName', label: '매출유형', type: 'enum', width: 90, align: 'center' },
  { id: 'plantCd', label: '사업부문', type: 'enum', width: 80, align: 'center' },
  { id: 'partnerName', label: '거래처', width: 200 },
  { id: 'bizNo', label: '사업자번호', width: 115 },
  { id: 'salesDeptName', label: '영업부서', type: 'enum', width: 130 },
  { id: 'salesEmpName', label: '영업담당', type: 'enum', width: 90 },
  { id: 'itemCd', label: '품목코드', width: 110 },
  { id: 'itemName', label: '품목명', width: 220 },
  { id: 'qty', label: '수량', type: 'amount', width: 90, align: 'right' },
  { id: 'unitPrice', label: '단가', type: 'amount', width: 100, align: 'right' },
  { id: 'supplyAmt', label: '공급가액', type: 'amount', width: 120, align: 'right' },
  { id: 'taxAmt', label: '부가세', type: 'amount', width: 100, align: 'right' },
  { id: 'totalAmt', label: '합계', type: 'amount', width: 120, align: 'right' },
  { id: 'soNo', label: '수주번호', width: 140 },
  { id: 'docuNo', label: '전표번호', width: 150 },
  { id: 'remark', label: '비고', width: 180 },
];
const NUMERIC = new Set(COLS.filter((c) => c.type === 'amount').map((c) => c.id));
const colType = (id: string): ColType => COLS.find((c) => c.id === id)?.type ?? 'text';
const displayVal = (row: SalesListRow, id: string): string => {
  if (id === 'plantCd') return PLANT_LABEL[row.plantCd ?? ''] ?? row.plantCd ?? '';
  return String((row as unknown as Record<string, unknown>)[id] ?? '');
};
const HIDDEN_COLS_KEY = 'sales-list-hidden-cols';

const SalesListPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [plantCd, setPlantCd] = useState('1000');
  const [billType, setBillType] = useState<string>();
  const [dept, setDept] = useState<string>();
  const [emp, setEmp] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['sales-list', startDate, endDate, plantCd],
    queryFn: () => getSalesList({ startDate, endDate, plantCd }),
    staleTime: 60_000,
  });
  const allRows = useMemo(() => data?.data?.data?.rows ?? [], [data]);
  const hiddenByScope = data?.data?.data?.hiddenByScope ?? 0;

  const optionsOf = (id: keyof SalesListRow) =>
    Array.from(new Set(allRows.map((r) => displayVal(r, id)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));

  // 상단 조건 → 헤더 필터 → 정렬. 전부 프론트 처리(기간 조회 결과 위에서).
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let out = allRows.filter((r) =>
      (!billType || r.billTypeName === billType)
      && (!dept || r.salesDeptName === dept)
      && (!emp || r.salesEmpName === emp)
      && (!kw || [r.partnerName, r.partnerCd, r.bizNo, r.itemName, r.itemCd, r.billNo, r.soNo, r.docuNo, r.remark]
        .some((v) => v?.toLowerCase().includes(kw))));
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    if (active.length) {
      out = out.filter((r) => active.every(([id, f]) => matchesFilter(displayVal(r, id), colType(id), f)));
    }
    if (sortCfg) {
      const t = colType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(displayVal(a, sortCfg.colId), displayVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [allRows, billType, dept, emp, keyword, colFilters, sortCfg]);

  const columns = useMemo<ColumnsType<SalesListRow>>(() => {
    const hdr = (id: string, label: string) => (
      <HeaderCell colId={id} label={label} type={colType(id)}
        enumOptions={colType(id) === 'enum' ? optionsOf(id as keyof SalesListRow) : undefined}
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
        render: c.id === 'billTypeName'
          ? (v: string, r: SalesListRow) => (v ? <Tag color={r.totalAmt < 0 ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag> : r.billType)
          : c.id === 'plantCd'
            ? (_: string, r: SalesListRow) => displayVal(r, 'plantCd')
            : NUMERIC.has(c.id)
              ? (v: number) => <span style={{ color: v < 0 ? '#D32F2F' : undefined }}>{num(v)}</span>
              : undefined,
      })),
    ];
  }, [allRows, colFilters, sortCfg, hiddenCols]);

  const totals = useMemo(() => ({
    supply: rows.reduce((s, r) => s + Number(r.supplyAmt ?? 0), 0),
    tax: rows.reduce((s, r) => s + Number(r.taxAmt ?? 0), 0),
    total: rows.reduce((s, r) => s + Number(r.totalAmt ?? 0), 0),
  }), [rows]);

  const excelColumns = COLS.map((c) => ({
    header: c.label,
    key: c.id,
    formatter: c.id === 'plantCd' ? (_: unknown, row?: Record<string, unknown>) => PLANT_LABEL[String(row?.plantCd ?? '')] ?? String(row?.plantCd ?? '') : undefined,
  }));
  const excelRows = rows.map((r) => ({ ...r }) as Record<string, unknown>);

  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) {
      message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
      return;
    }
    setDateRange(next);
  };

  const errorMsg = isError
    ? ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '매출리스트 조회에 실패했습니다. ERP(오라클) 연결을 확인하세요.')
    : null;

  return (
    <PageLayout>
      <PageHeader title="매출리스트" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <span style={{ fontWeight: 600 }}>매출일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <Select value={plantCd} onChange={setPlantCd} style={{ width: 160 }} options={PLANTS} />
          <Select allowClear placeholder="매출유형 전체" value={billType} onChange={setBillType}
            options={optionsOf('billTypeName')} style={{ width: 130 }} />
          <Select allowClear showSearch placeholder="영업부서 전체" value={dept} onChange={(v) => { setDept(v); setEmp(undefined); }}
            options={optionsOf('salesDeptName')} style={{ width: 160 }} />
          <Select allowClear showSearch placeholder="영업담당 전체" value={emp} onChange={setEmp}
            options={Array.from(new Set(allRows.filter((r) => !dept || r.salesDeptName === dept).map((r) => r.salesEmpName).filter(Boolean) as string[]))
              .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }))}
            style={{ width: 140 }} />
          <Input.Search allowClear placeholder="거래처·사업자번호·품목·매출/수주/전표번호" onSearch={setKeyword}
            onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ width: 300 }} />
          <ExcelDownloadBtn data={excelRows} columns={excelColumns}
            fileName={`매출리스트_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} sheetName="매출리스트" />
          <Popover trigger="click" placement="bottomRight" content={
            <div style={{ maxHeight: 360, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {COLS.map((c) => (
                <Checkbox key={c.id} checked={!hiddenCols[c.id]}
                  onChange={(e) => setHiddenCols((p) => ({ ...p, [c.id]: !e.target.checked }))}>{c.label}</Checkbox>
              ))}
            </div>
          }>
            <Button icon={<SettingOutlined />}>컬럼</Button>
          </Popover>
        </Space>
      </Card>
      {errorMsg && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={errorMsg} />}
      {hiddenByScope > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 10 }}
          message={`데이터 범위 밖이라 ${num(hiddenByScope)}건은 표시하지 않았습니다.`} />
      )}
      <Table<SalesListRow> virtual bordered size="small" loading={isFetching} columns={columns} dataSource={rows}
        rowKey={(r) => `${r.billNo}-${r.billSq}`} pagination={false}
        scroll={{ x: 2600, y: 'calc(100vh - 330px)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '7px 14px', marginTop: 6,
                    background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 6, fontWeight: 700, color: '#001f3f' }}>
        <span>총 {num(rows.length)}건</span>
        <span>공급가액 {num(totals.supply)} 원</span>
        <span>부가세 {num(totals.tax)} 원</span>
        <span>합계 {num(totals.total)} 원</span>
      </div>
    </PageLayout>
  );
};

export default SalesListPage;
