import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getProductionPlatePlan } from '@/api/production.api';
import type { ProductionPlateRow } from '@/types/production';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

/** 서버와 같은 한도 — ProductionPlanController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

const num = (v?: number | null) => (v == null ? '' : Number(v).toLocaleString('ko-KR'));

// 컬럼 정의 — colId(=dataIndex) → 라벨·필터 타입·폭·정렬. 표·헤더필터·컬럼선택·엑셀이 모두 이걸 쓴다.
type ColDef = { id: keyof ProductionPlateRow; label: string; type?: ColType; width: number; align?: 'right' | 'center'; fixed?: 'left' };
const PLATE_COLS: ColDef[] = [
  { id: 'planNo', label: '계획번호', width: 150, fixed: 'left' },
  { id: 'planSq', label: '계획순번', type: 'amount', width: 80, align: 'center' },
  { id: 'planLowSq', label: '하위순번', type: 'amount', width: 80, align: 'center' },
  { id: 'planDate', label: '계획일', width: 100 },
  { id: 'orderNo', label: '주문번호', width: 150 },
  { id: 'orderName', label: '주문명', width: 260 },
  { id: 'orderSq', label: '주문순번', type: 'amount', width: 80, align: 'center' },
  { id: 'partnerName', label: '영업거래처', type: 'enum', width: 170 },
  { id: 'itemCd', label: '주문품목', width: 110 },
  { id: 'itemName', label: '주문품목명', width: 180 },
  { id: 'detailItemName', label: '세부품목명', width: 260 },
  { id: 'orderQty', label: '주문수량', type: 'amount', width: 90, align: 'right' },
  { id: 'configName', label: '구성명', type: 'enum', width: 90 },
  { id: 'processName', label: '공정명', type: 'enum', width: 90 },
  { id: 'workName', label: '작업명', type: 'enum', width: 110 },
  { id: 'pressSq', label: '대수', type: 'amount', width: 65, align: 'right' },
  { id: 'equipmentName', label: '설비명', type: 'enum', width: 110 },
  { id: 'materialCd', label: '용지코드', width: 115 },
  { id: 'materialName', label: '용지명', width: 180 },
  { id: 'cutSize', label: '재단규격', width: 90 },
  { id: 'pages', label: '면수', type: 'amount', width: 65, align: 'right' },
  { id: 'imposition', label: '터잡기', width: 75 },
  { id: 'cutCount', label: '절수', type: 'amount', width: 65, align: 'right' },
  { id: 'generalFront', label: '일반 앞', type: 'amount', width: 70, align: 'right' },
  { id: 'generalBack', label: '일반 뒤', type: 'amount', width: 70, align: 'right' },
  { id: 'spotFront', label: '별색 앞', type: 'amount', width: 70, align: 'right' },
  { id: 'spotBack', label: '별색 뒤', type: 'amount', width: 70, align: 'right' },
  { id: 'plateCount', label: '판수', type: 'amount', width: 70, align: 'right' },
  { id: 'groupParentYn', label: '합대모품목', type: 'enum', width: 90, align: 'center' },
  { id: 'groupChildYn', label: '합대자품목', type: 'enum', width: 90, align: 'center' },
  { id: 'groupSq', label: '합대기준순번', type: 'amount', width: 100, align: 'center' },
  { id: 'workUnitPrice', label: '사내단가', type: 'amount', width: 90, align: 'right' },
  { id: 'workAmount', label: '사내금액', type: 'amount', width: 105, align: 'right' },
  { id: 'stdUnitPrice', label: '표준단가', type: 'amount', width: 90, align: 'right' },
  { id: 'stdAmount', label: '표준금액', type: 'amount', width: 105, align: 'right' },
  { id: 'pressCloseYn', label: '대수마감', type: 'enum', width: 80, align: 'center' },
  { id: 'resultStatusName', label: '실적상태', type: 'enum', width: 100, align: 'center' },
  { id: 'resultDate', label: '실적일자', width: 100 },
];
const NUMERIC = new Set(PLATE_COLS.filter((c) => c.type === 'amount').map((c) => c.id));
const colType = (id: string): ColType => PLATE_COLS.find((c) => c.id === id)?.type ?? 'text';
const getVal = (row: ProductionPlateRow, id: string) => String((row as unknown as Record<string, unknown>)[id] ?? '');
const HIDDEN_COLS_KEY = 'production-plan-plate-hidden-cols';

/** 제판 탭 — ERP 생산계획현황 제판 탭과 같은 데이터. */
const PlateTab: React.FC<{ dateRange: [Dayjs, Dayjs] }> = ({ dateRange }) => {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [process, setProcess] = useState<string>();
  const [equipment, setEquipment] = useState<string>();
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
  const { data, isFetching } = useQuery({
    queryKey: ['production-plan-plate', startDate, endDate],
    queryFn: () => getProductionPlatePlan({ startDate, endDate }),
    staleTime: 60_000,
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);

  const optionsOf = (field: keyof ProductionPlateRow) =>
    Array.from(new Set(allRows.map((r) => String(r[field] ?? '')).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));

  // 상단 조건 → 헤더 필터 → 정렬. 전부 프론트 처리(기간 조회 결과 위에서).
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let out = allRows.filter((r) =>
      (!status || r.resultStatusName === status)
      && (!process || r.processName === process)
      && (!equipment || r.equipmentName === equipment)
      && (!kw || [r.planNo, r.orderNo, r.orderName, r.partnerName, r.detailItemName]
        .some((v) => v?.toLowerCase().includes(kw))));
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    if (active.length) {
      out = out.filter((r) => active.every(([id, f]) => matchesFilter(getVal(r, id), colType(id), f)));
    }
    if (sortCfg) {
      const t = colType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(getVal(a, sortCfg.colId), getVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [allRows, keyword, status, process, equipment, colFilters, sortCfg]);

  const columns = useMemo<ColumnsType<ProductionPlateRow>>(() => {
    const hdr = (id: string, label: string) => (
      <HeaderCell colId={id} label={label} type={colType(id)}
        enumOptions={colType(id) === 'enum' ? optionsOf(id as keyof ProductionPlateRow) : undefined}
        filter={colFilters[id]} sortDir={sortCfg?.colId === id ? sortCfg.dir : undefined}
        onToggleSort={() => setSortCfg((p) => (p?.colId === id ? (p.dir === 'asc' ? { colId: id, dir: 'desc' } : null) : { colId: id, dir: 'asc' }))}
        onApply={(colId, f) => setColFilters((p) => ({ ...p, [colId]: f }))}
        onClear={(colId) => setColFilters((p) => { const n = { ...p }; delete n[colId]; return n; })} />
    );
    return [
      { title: 'No', width: 58, fixed: 'left', align: 'center', render: (_, __, i) => i + 1 },
      ...PLATE_COLS.filter((c) => !hiddenCols[c.id]).map((c) => ({
        title: hdr(c.id, c.label),
        dataIndex: c.id,
        width: c.width,
        align: c.align,
        fixed: c.fixed,
        ellipsis: true,
        render: c.id === 'resultStatusName'
          ? (v: string) => (v ? <Tag color={v === '실적없음' ? 'default' : 'blue'} style={{ marginInlineEnd: 0 }}>{v}</Tag> : '')
          : NUMERIC.has(c.id) ? (v: number) => num(v) : undefined,
      })),
    ];
  }, [allRows, colFilters, sortCfg, hiddenCols]);

  const totals = useMemo(() => ({
    plates: rows.reduce((s, r) => s + Number(r.plateCount ?? 0), 0),
    amount: rows.reduce((s, r) => s + Number(r.workAmount ?? 0), 0),
    noResult: rows.filter((r) => r.resultStatusName === '실적없음').length,
  }), [rows]);

  const excelColumns = PLATE_COLS.map((c) => ({ header: c.label, key: c.id }));
  const excelRows = rows.map((r) => ({ ...r }) as Record<string, unknown>);

  return (
    <>
      <Space wrap size={8} style={{ marginBottom: 8 }}>
        <Select allowClear showSearch placeholder="실적상태 전체" value={status} onChange={setStatus}
          options={optionsOf('resultStatusName')} style={{ width: 140 }} />
        <Select allowClear showSearch placeholder="공정 전체" value={process} onChange={setProcess}
          options={optionsOf('processName')} style={{ width: 130 }} />
        <Select allowClear showSearch placeholder="설비 전체" value={equipment} onChange={setEquipment}
          options={optionsOf('equipmentName')} style={{ width: 150 }} />
        <Input.Search allowClear placeholder="계획번호·주문번호·주문명·거래처" onSearch={setKeyword}
          onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ width: 280 }} />
        <ExcelDownloadBtn data={excelRows} columns={excelColumns}
          fileName={`생산계획현황_제판_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        <Popover trigger="click" placement="bottomRight" content={
          <div style={{ maxHeight: 360, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PLATE_COLS.map((c) => (
              <Checkbox key={c.id} checked={!hiddenCols[c.id]}
                onChange={(e) => setHiddenCols((p) => ({ ...p, [c.id]: !e.target.checked }))}>{c.label}</Checkbox>
            ))}
          </div>
        }>
          <Button icon={<SettingOutlined />}>컬럼</Button>
        </Popover>
      </Space>
      <Table<ProductionPlateRow> virtual bordered size="small" loading={isFetching} columns={columns} dataSource={rows}
        rowKey={(r, i) => `${r.planNo}-${r.planSq}-${r.planLowSq}-${i}`} pagination={false}
        scroll={{ x: 4300, y: 'calc(100vh - 360px)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '7px 14px', marginTop: 6,
                    background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 6, fontWeight: 700, color: '#001f3f' }}>
        <span>총 {num(rows.length)}건</span>
        <span>실적없음 {num(totals.noResult)}건</span>
        <span>판수 합계 {num(totals.plates)}</span>
        <span>사내금액 합계 {num(totals.amount)} 원</span>
      </div>
    </>
  );
};

const ProductionPlanPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month').startOf('day')]);

  const onRangeChange = (next: [Dayjs, Dayjs]) => {
    if (next[1].diff(next[0], 'day') >= MAX_RANGE_DAYS) {
      message.warning(`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`);
      return;
    }
    setDateRange(next);
  };

  return (
    <PageLayout>
      <PageHeader title="생산계획현황" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space size={8}>
          <span style={{ fontWeight: 600 }}>계획일</span>
          <StatsDateRangePicker value={dateRange} onChange={onRangeChange} />
          <span style={{ color: '#8c8c8c' }}>TPS · 최대 {MAX_RANGE_DAYS}일</span>
        </Space>
      </Card>
      <Card size="small">
        <Tabs
          defaultActiveKey="plate"
          destroyInactiveTabPane
          items={[
            { key: 'plate', label: '제판', children: <PlateTab dateRange={dateRange} /> },
          ]}
        />
      </Card>
    </PageLayout>
  );
};

export default ProductionPlanPage;
