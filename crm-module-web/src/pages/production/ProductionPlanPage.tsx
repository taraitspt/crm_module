import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Input, Popover, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getProductionPlan } from '@/api/production.api';
import { PRODUCTION_TABS, type ProductionPlanRow, type ProductionPlanTab } from '@/types/production';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';
import { T } from '@/theme/designTokens';

/** 서버와 같은 한도 — ProductionPlanController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

const num = (v?: number | null) => (v == null ? '' : Number(v).toLocaleString('ko-KR'));

// 컬럼 정의 — colId(=dataIndex) → 라벨·필터 타입·폭·정렬. 표·헤더필터·컬럼선택·엑셀이 모두 이걸 쓴다.
type ColDef = { id: keyof ProductionPlanRow; label: string; type?: ColType; width: number; align?: 'right' | 'center'; fixed?: 'left' };
const amt = (id: keyof ProductionPlanRow, label: string, width = 70): ColDef => ({ id, label, type: 'amount', width, align: 'right' });
const en = (id: keyof ProductionPlanRow, label: string, width: number, align?: 'center'): ColDef => ({ id, label, type: 'enum', width, align });
const tx = (id: keyof ProductionPlanRow, label: string, width: number): ColDef => ({ id, label, width });

/** 모든 탭 공통 머리 컬럼 — 계획·주문·품목. */
const HEAD: ColDef[] = [
  { id: 'planNo', label: '계획번호', width: 150, fixed: 'left' },
  { ...amt('planSq', '계획순번', 80), align: 'center' },
  { ...amt('planLowSq', '하위순번', 80), align: 'center' },
  tx('planDate', '계획일', 100),
  tx('orderNo', '주문번호', 150),
  tx('orderName', '주문명', 260),
  { ...amt('orderSq', '주문순번', 80), align: 'center' },
  en('partnerName', '영업거래처', 170),
  tx('itemCd', '주문품목', 110),
  tx('itemName', '주문품목명', 180),
  tx('detailItemName', '세부품목명', 260),
];
/** 재단규격·면수·터잡기·절수 — 제본 탭 제외. */
const SHEET: ColDef[] = [tx('cutSize', '재단규격', 90), amt('pages', '면수', 65), tx('imposition', '터잡기', 75), amt('cutCount', '절수', 65)];
/** 사내/표준 단가·금액. */
const MONEY: ColDef[] = [amt('workUnitPrice', '사내단가', 90), amt('workAmount', '사내금액', 105), amt('stdUnitPrice', '표준단가', 90), amt('stdAmount', '표준금액', 105)];
/** 대수마감·실적상태·실적일자 — 모든 탭 꼬리. */
const TAIL: ColDef[] = [en('pressCloseYn', '대수마감', 80, 'center'), en('resultStatusName', '실적상태', 100, 'center'), tx('resultDate', '실적일자', 100)];
/** 인쇄판 색 수·판수. */
const PLATES: ColDef[] = [amt('generalFront', '일반 앞'), amt('generalBack', '일반 뒤'), amt('spotFront', '별색 앞'), amt('spotBack', '별색 뒤'), amt('plateCount', '판수')];
const GROUP: ColDef[] = [en('groupParentYn', '합대모품목', 90, 'center'), en('groupChildYn', '합대자품목', 90, 'center'), { ...amt('groupSq', '합대기준순번', 100), align: 'center' }];

/** 탭별 컬럼 — ERP 생산계획현황 각 탭의 열 순서를 따른다. */
const COLS: Record<ProductionPlanTab, ColDef[]> = {
  print: [
    ...HEAD, amt('orderQty', '주문수량', 90),
    en('configName', '구성명', 90), en('processName', '공정', 90), en('seriesName', '계열', 70), en('workName', '작업', 110),
    amt('pressSq', '대수', 65), amt('startPage', '시작페이지', 90), amt('endPage', '끝페이지', 90), en('equipmentName', '설비명', 130),
    tx('materialCd', '용지코드', 115), tx('materialName', '용지명', 180), en('plateInfoName', '제판정보', 90),
    ...SHEET, ...PLATES,
    amt('netReam', '정미연수', 80), amt('spareReam', '여분연수', 80), amt('fullReam', '정미여분연수합', 110), amt('adjReam', '조정연수', 80),
    amt('cutTimes', '재단횟수', 80),
    amt('netSheets', '정미매수', 85), amt('spareSheets', '여분매수', 85), amt('fullSheets', '정미여분매수합', 115), amt('adjSheets', '조정매수', 85),
    amt('adjSheetsSum', '정미조정매수합', 115), amt('tongCount', '통수', 70),
    ...GROUP, amt('groupNet', '합대정미', 80), amt('groupSpare', '합대여분', 80), amt('groupAdj', '합대조정', 80),
    ...MONEY, ...TAIL,
  ],
  plate: [
    ...HEAD, amt('orderQty', '주문수량', 90),
    en('configName', '구성명', 90), en('processName', '공정명', 90), en('workName', '작업명', 110),
    amt('pressSq', '대수', 65), en('equipmentName', '설비명', 110),
    tx('materialCd', '용지코드', 115), tx('materialName', '용지명', 180),
    ...SHEET, ...PLATES, ...GROUP, ...MONEY, ...TAIL,
  ],
  process: [
    ...HEAD, amt('orderQty', '주문수량', 90),
    en('configName', '구성명', 90), en('processName', '공정명', 100), en('seriesName', '계열명', 70), en('workName', '작업명', 110),
    amt('pressSq', '대수', 65), en('equipmentName', '설비명', 140),
    ...SHEET, amt('procQty', '작업수량', 90),
    ...MONEY, ...TAIL,
  ],
  fold: [
    ...HEAD, amt('orderQty', '작업수량', 90), en('orderUnitCd', '작업단위', 80, 'center'),
    en('configName', '구성명', 90), en('processName', '공정명', 90), en('seriesName', '계열명', 70), en('workName', '작업명', 110),
    amt('pressSq', '대수', 65), en('equipmentName', '설비명', 120),
    ...SHEET, ...MONEY, ...TAIL,
  ],
  bind: [
    ...HEAD,
    en('configName', '구성명', 90), en('processName', '공정명', 90), en('seriesName', '계열명', 70), en('workName', '작업명', 110),
    amt('fullPressCount', '전체대수', 80), amt('fullPageCount', '전체페이지수', 100), amt('totalPages', '전체면수', 80),
    en('equipmentName', '설비명', 120), amt('orderQty', '작업수량', 90), en('orderUnitCd', '작업단위', 80, 'center'),
    ...MONEY, en('pressCloseYn', '대수마감', 80, 'center'), en('resultStatusName', '실적상태', 100, 'center'),
    en('lastYn', '제품여부', 80, 'center'), tx('resultDate', '실적일자', 100),
  ],
};

const getVal = (row: ProductionPlanRow, id: string) => String((row as unknown as Record<string, unknown>)[id] ?? '');

/** 탭 하나 — 같은 표 UI 에 탭별 컬럼·수량 합계만 다르다. */
const PlanTab: React.FC<{ tab: ProductionPlanTab; dateRange: [Dayjs, Dayjs] }> = ({ tab, dateRange }) => {
  const cols = COLS[tab];
  const meta = PRODUCTION_TABS.find((t) => t.key === tab)!;
  const NUMERIC = useMemo(() => new Set(cols.filter((c) => c.type === 'amount').map((c) => c.id)), [cols]);
  const colType = (id: string): ColType => cols.find((c) => c.id === id)?.type ?? 'text';
  const hiddenKey = `production-plan-${tab}-hidden-cols`;

  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [process, setProcess] = useState<string>();
  const [equipment, setEquipment] = useState<string>();
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(hiddenKey) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(hiddenKey, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols, hiddenKey]);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const { data, isFetching } = useQuery({
    queryKey: ['production-plan', tab, startDate, endDate],
    queryFn: () => getProductionPlan(tab, { startDate, endDate }),
    staleTime: 60_000,
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);

  const optionsOf = (field: keyof ProductionPlanRow) =>
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

  const columns = useMemo<ColumnsType<ProductionPlanRow>>(() => {
    const hdr = (id: string, label: string) => (
      <HeaderCell colId={id} label={label} type={colType(id)}
        enumOptions={colType(id) === 'enum' ? optionsOf(id as keyof ProductionPlanRow) : undefined}
        filter={colFilters[id]} sortDir={sortCfg?.colId === id ? sortCfg.dir : undefined}
        onToggleSort={() => setSortCfg((p) => (p?.colId === id ? (p.dir === 'asc' ? { colId: id, dir: 'desc' } : null) : { colId: id, dir: 'asc' }))}
        onApply={(colId, f) => setColFilters((p) => ({ ...p, [colId]: f }))}
        onClear={(colId) => setColFilters((p) => { const n = { ...p }; delete n[colId]; return n; })} />
    );
    return [
      { title: 'No', width: 58, fixed: 'left', align: 'center', render: (_, __, i) => i + 1 },
      ...cols.filter((c) => !hiddenCols[c.id]).map((c) => ({
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
  }, [allRows, colFilters, sortCfg, hiddenCols, cols]);

  const scrollX = useMemo(() => 58 + cols.filter((c) => !hiddenCols[c.id]).reduce((s, c) => s + c.width, 0), [cols, hiddenCols]);

  const totals = useMemo(() => ({
    qty: rows.reduce((s, r) => s + Number(r[meta.qtyField] ?? 0), 0),
    amount: rows.reduce((s, r) => s + Number(r.workAmount ?? 0), 0),
    noResult: rows.filter((r) => r.resultStatusName === '실적없음').length,
  }), [rows, meta.qtyField]);

  const excelColumns = cols.map((c) => ({ header: c.label, key: c.id }));
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
          fileName={`생산계획현황_${meta.label}_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        <Popover trigger="click" placement="bottomRight" content={
          <div style={{ maxHeight: 360, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cols.map((c) => (
              <Checkbox key={c.id} checked={!hiddenCols[c.id]}
                onChange={(e) => setHiddenCols((p) => ({ ...p, [c.id]: !e.target.checked }))}>{c.label}</Checkbox>
            ))}
          </div>
        }>
          <Button icon={<SettingOutlined />}>컬럼</Button>
        </Popover>
      </Space>
      <Table<ProductionPlanRow> virtual bordered size="small" loading={isFetching} columns={columns} dataSource={rows}
        rowKey={(r, i) => `${r.planNo}-${r.planSq}-${r.planLowSq}-${i}`} pagination={false}
        scroll={{ x: scrollX, y: 'calc(100vh - 360px)' }} />
      {/* 합계 줄 — 표 아래 보조 정보라 작고 옅게. 숫자만 한 단계 진하게 */}
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, padding: '4px 8px', marginTop: 4,
                    fontSize: 12, color: T.t3 }}>
        <span>총 <b style={{ color: T.t2, fontWeight: 600 }}>{num(rows.length)}</b>건</span>
        <span>실적없음 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.noResult)}</b>건</span>
        <span>{meta.qtyLabel} <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.qty)}</b></span>
        <span>사내금액 <b style={{ color: T.t2, fontWeight: 600 }}>{num(totals.amount)}</b> 원</span>
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
          defaultActiveKey="print"
          destroyInactiveTabPane
          items={PRODUCTION_TABS.map((t) => ({ key: t.key, label: t.label, children: <PlanTab tab={t.key} dateRange={dateRange} /> }))}
        />
      </Card>
    </PageLayout>
  );
};

export default ProductionPlanPage;
