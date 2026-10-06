import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tag, message } from 'antd';
import { ArrowLeftOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
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
import { T } from '@/theme/designTokens';

/**
 * 매출리스트 — GROW 월매출리스트(매출번호 × 수주순번 × 주문)를 기간·사업부문으로 조회, 엑셀 다운로드.
 * 매출액은 ERP 장부금액, 정산공임/용지는 주문 정산 금액이라 주문이 없는 매출은 0 으로 온다.
 * 저작권 매출(TPSCOPYRIGHT001)·매출취소는 원본 쿼리대로 제외 — 매출현황 합계와는 그만큼 다르다.
 */

/** 서버와 같은 한도 — SalesListService.MAX_RANGE_DAYS */
const MAX_RANGE_DAYS = 92;
const PLANT_LABEL: Record<string, string> = { '1000': 'TPS', '2000': 'GRP', '3000': 'PM' };

const num = (v?: number | null) => (v == null ? '' : Number(v).toLocaleString('ko-KR'));

type ColDef = { id: keyof SalesListRow; label: string; type?: ColType; width: number; align?: 'right' | 'center'; fixed?: 'left' };
const amt = (id: keyof SalesListRow, label: string, width = 110): ColDef => ({ id, label, type: 'amount', width, align: 'right' });
const en = (id: keyof SalesListRow, label: string, width: number, align?: 'center'): ColDef => ({ id, label, type: 'enum', width, align });
const tx = (id: keyof SalesListRow, label: string, width: number): ColDef => ({ id, label, width });

/** GROW 월매출리스트 열 순서. */
const COLS: ColDef[] = [
  { id: 'billDate', label: '매출일자', width: 100, fixed: 'left' },
  { id: 'billNo', label: '매출번호', width: 140, fixed: 'left' },
  en('plantCd', '사업부문', 80, 'center'),
  en('deptName', '부서', 120),
  en('salesEmpName', '영업담당자', 90),
  tx('partnerCd', '거래처코드', 100),
  tx('partnerName', '거래처명', 200),
  tx('itemCd', '품목코드', 110),
  en('itemName', '품목명', 120),
  tx('detailItemName', '세부품목명', 260),
  amt('qty', '매출수량', 90),
  amt('salesAmt', '매출액', 120),
  amt('laborAmt', '정산공임', 110),
  amt('paperAmt', '정산용지', 110),
  amt('settleAmt', '정산합계', 120),
  en('soTypeName', '수주유형', 120),
  tx('soNo', '수주번호', 150),
  { ...amt('soSq', '수주순번', 80), align: 'center' },
  en('orderType', '주문구분', 90),
  tx('orderNo', '주문번호', 150),
  { ...amt('orderSq', '주문순번', 80), align: 'center' },
  en('workPlaceName', '작업처', 90),
  en('inOut', '내/외부', 75, 'center'),
  en('bindInfo', '제본정보', 100),
  en('makeEmpName', '제작담당자', 90),
  en('salesGroupName', '영업그룹', 120),
  en('ccName', '비용센터', 120),
];
const NUMERIC = new Set(COLS.filter((c) => c.type === 'amount').map((c) => c.id));
const colType = (id: string): ColType => COLS.find((c) => c.id === id)?.type ?? 'text';
const displayVal = (row: SalesListRow, id: string): string => {
  if (id === 'plantCd') return PLANT_LABEL[row.plantCd ?? ''] ?? row.plantCd ?? '';
  return String((row as unknown as Record<string, unknown>)[id] ?? '');
};
const HIDDEN_COLS_KEY = 'sales-list-hidden-cols-v2';

const SalesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [plantCd, setPlantCd] = useState('1000');
  const [orderType, setOrderType] = useState<string>();
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
      (!orderType || r.orderType === orderType)
      && (!dept || r.deptName === dept)
      && (!emp || r.salesEmpName === emp)
      && (!kw || [r.partnerName, r.partnerCd, r.itemName, r.detailItemName, r.billNo, r.soNo, r.orderNo]
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
  }, [allRows, orderType, dept, emp, keyword, colFilters, sortCfg]);

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
        render: c.id === 'inOut'
          ? (v: string) => (v ? <Tag color={v === '내부' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag> : '')
          : c.id === 'plantCd'
            ? (_: string, r: SalesListRow) => displayVal(r, 'plantCd')
            : NUMERIC.has(c.id)
              ? (v: number) => <span style={{ color: v < 0 ? '#D32F2F' : undefined }}>{num(v)}</span>
              : undefined,
      })),
    ];
  }, [allRows, colFilters, sortCfg, hiddenCols]);

  const scrollX = useMemo(() => 58 + COLS.filter((c) => !hiddenCols[c.id]).reduce((s, c) => s + c.width, 0), [hiddenCols]);

  const totals = useMemo(() => ({
    sales: rows.reduce((s, r) => s + Number(r.salesAmt ?? 0), 0),
    labor: rows.reduce((s, r) => s + Number(r.laborAmt ?? 0), 0),
    paper: rows.reduce((s, r) => s + Number(r.paperAmt ?? 0), 0),
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
      <PageHeader
        title="매출리스트"
        titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }}
        // 메뉴 없이 매출현황 안 버튼으로 들어오는 화면 — 돌아갈 길을 머리에 둔다.
        leading={<Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} aria-label="매출현황으로" />}
      />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <span style={{ fontWeight: 600 }}>매출일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <Select value={plantCd} onChange={setPlantCd} style={{ width: 160 }} options={PLANTS} />
          <Select allowClear placeholder="주문구분 전체" value={orderType} onChange={setOrderType}
            options={optionsOf('orderType')} style={{ width: 130 }} />
          <Select allowClear showSearch placeholder="부서 전체" value={dept} onChange={(v) => { setDept(v); setEmp(undefined); }}
            options={optionsOf('deptName')} style={{ width: 160 }} />
          <Select allowClear showSearch placeholder="영업담당자 전체" value={emp} onChange={setEmp}
            options={Array.from(new Set(allRows.filter((r) => !dept || r.deptName === dept).map((r) => r.salesEmpName).filter(Boolean) as string[]))
              .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }))}
            style={{ width: 140 }} />
          <Input.Search allowClear placeholder="거래처·품목·매출/수주/주문번호" onSearch={setKeyword}
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
        rowKey={(r, i) => `${r.billNo}-${r.soSq}-${r.orderNo}-${r.orderSq}-${i}`} pagination={false}
        scroll={{ x: scrollX, y: 'calc(100vh - 330px)' }} />
      {/* 합계 줄 — 표 아래 보조 정보라 작고 옅게. 정산 합계는 분할매출이면 중복이 섞이므로 참고용 */}
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, padding: '4px 8px', marginTop: 4,
                    fontSize: 12, color: T.t3 }}>
        <span>총 <b style={{ color: T.t2, fontWeight: 600 }}>{num(rows.length)}</b>건</span>
        <span>매출액 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.sales)}</b> 원</span>
        <span>정산공임 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.labor)}</b></span>
        <span>정산용지 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.paper)}</b></span>
      </div>
    </PageLayout>
  );
};

export default SalesListPage;
