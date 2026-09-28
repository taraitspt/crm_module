import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, message, Popover, Space, Table, Tag } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getGrpProfit } from '@/api/stats.api';
import type { GrpProfitRow } from '@/types/stats';
import StatsDateRangePicker from './components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const { Search } = Input;
const amount = (v?: number) => (v ?? 0).toLocaleString();
const costHeader = { background: '#fff200', color: '#111', fontWeight: 800 };

// 매출타입(sales_type) 코드→한글. 필터/표시 공용. 빈값은 '-'(매출타입 미지정 매출).
const SALES_TYPE_LABELS: Record<string, string> = {
  TAX_INVOICE: '전자세금계산서', CARD: '카드', TRANSFER: '계좌이체', INTERNAL: '사내실적',
  PRE_SALES: '선매출', PRE_SALES_DEDUCT: '선매출차감', PRE_SALES_CANCEL: '선매출취소',
  SALES_CANCEL: '매출취소', UNTACT: '비대면결제', UNTACT_PAY: '비대면결제',
};
const salesTypeLabel = (v?: string) => (v ? (SALES_TYPE_LABELS[v] ?? v) : '');

// 품목구분(내부/외부) — sales_dtl.work_type = I(내부)/O(외부).
const IO_LABELS: Record<string, string> = { I: '내부', O: '외부' };
const ioLabel = (v?: string) => (v ? (IO_LABELS[v] ?? v) : '');

// 컬럼별 헤더 필터 타입 (주문목록과 동일 필터 에디터). 미지정=text.
const GRP_COL_TYPES: Record<string, ColType> = {
  orderSq: 'amount', supplyAmount: 'amount', taxAmount: 'amount', totalAmount: 'amount',
  productPurchaseAmount: 'amount', outsourcingAmount: 'amount', podProductionAmount: 'amount',
  purchaseTotalAmount: 'amount', grossProfitAmount: 'amount', marginRate: 'amount',
  departmentName: 'enum', salesEmployeeName: 'enum', workPlace: 'enum', itemCategory: 'enum',
  salesType: 'enum', division: 'enum',
};
const grpColType = (c: string): ColType => GRP_COL_TYPES[c] ?? 'text';
const grpGetVal = (row: GrpProfitRow, colId: string): string => {
  const raw = String((row as unknown as Record<string, unknown>)[colId] ?? '');
  if (colId === 'salesType') return salesTypeLabel(raw);   // 필터/정렬도 한글 라벨 기준
  if (colId === 'itemCategory') return ioLabel(raw);       // 품목구분 I/O → 내부/외부
  return raw;
};

// ⚙ 컬럼 선택기용 colId(dataIndex)→라벨. localStorage 개인별 저장.
const GRP_COL_LABELS: Record<string, string> = {
  salesDate: '매출일자', departmentName: '부서명', salesEmployeeName: '영업담당자', salesNo: '매출번호',
  salesTitle: '매출명', salesPartnerName: '매출거래처', orderPartnerName: '주문거래처', orderNo: '주문번호',
  orderSq: '순번', workPlace: '작업처', itemCategory: '내/외부', detailItemName: '세부품목명',
  supplyAmount: '공급가액', taxAmount: '부가세', totalAmount: '총금액', salesType: '매출타입', division: '사업본부매출구분',
  accountingDate: '회계일',
  productPurchaseAmount: '상품매입', outsourcingAmount: '외주', podProductionAmount: '내부생산', purchaseTotalAmount: '매입계',
  grossProfitAmount: '매출총이익', marginRate: '마진율', remark: '비고',
};
const GRP_HIDDEN_COLS_KEY = 'grp-profit-hidden-cols';

const GrpProfitPage = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [keyword, setKeyword] = useState<string>();
  const [rows, setRows] = useState<GrpProfitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(GRP_HIDDEN_COLS_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(GRP_HIDDEN_COLS_KEY, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols]);

  useEffect(() => {
    setLoading(true);
    getGrpProfit(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD'), keyword)
      .then(({ data }) => setRows(data.success ? (data.data.rows ?? []) : []))
      .catch(() => message.error('GRP 수익비용대응 조회에 실패했습니다.'))
      .finally(() => setLoading(false));
  }, [dateRange, keyword]);

  // 헤더 필터/정렬 (주문목록과 동일 HeaderCell 에디터). 전부 프론트 처리.
  // enum 옵션은 grpGetVal(라벨 변환: 내/외부 I→내부·O→외부, 매출타입 코드→한글)로 만든다.
  // 필터 매칭도 grpGetVal 기준이라, raw(I/O)로 옵션을 만들면 표시도 틀리고 선택 시 매칭이 안 돼 0건이 된다.
  const enumOptsFor = (colId: keyof GrpProfitRow) =>
    Array.from(new Set(rows.map((r) => grpGetVal(r, colId as string)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));
  const applyColFilter = (colId: string, f: ColFilter) => setColFilters((prev) => ({ ...prev, [colId]: f }));
  const clearColFilter = (colId: string) => setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; });
  const toggleSort = (colId: string) => setSortCfg((prev) =>
    prev?.colId === colId ? (prev.dir === 'asc' ? { colId, dir: 'desc' } : null) : { colId, dir: 'asc' });
  const hdr = (colId: string, label: string) => (
    <HeaderCell colId={colId} label={label} type={grpColType(colId)}
      enumOptions={grpColType(colId) === 'enum' ? enumOptsFor(colId as keyof GrpProfitRow) : undefined}
      filter={colFilters[colId]} sortDir={sortCfg?.colId === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo<ColumnsType<GrpProfitRow>>(() => [
    { title: hdr('salesDate', '매출일자'), dataIndex: 'salesDate', width: 105, fixed: 'left' },
    { title: hdr('departmentName', '부서명'), dataIndex: 'departmentName', width: 120 },
    { title: hdr('salesEmployeeName', '영업담당자'), dataIndex: 'salesEmployeeName', width: 100 },
    { title: hdr('salesNo', '매출번호'), dataIndex: 'salesNo', width: 150 },
    { title: hdr('salesTitle', '매출명'), dataIndex: 'salesTitle', width: 180, ellipsis: true },
    { title: hdr('salesPartnerName', '매출거래처'), dataIndex: 'salesPartnerName', width: 150, ellipsis: true },
    { title: hdr('orderPartnerName', '주문거래처'), dataIndex: 'orderPartnerName', width: 150, ellipsis: true },
    { title: hdr('orderNo', '주문번호'), dataIndex: 'orderNo', width: 145 },
    { title: hdr('orderSq', '순번'), dataIndex: 'orderSq', width: 65, align: 'center' },
    { title: hdr('workPlace', '작업처'), dataIndex: 'workPlace', width: 110 },
    { title: hdr('itemCategory', '내/외부'), dataIndex: 'itemCategory', width: 110, render: (v: string) => ioLabel(v) || '-' },
    { title: hdr('detailItemName', '세부품목명'), dataIndex: 'detailItemName', width: 180, ellipsis: true },
    { title: hdr('supplyAmount', '공급가액'), dataIndex: 'supplyAmount', width: 115, align: 'right', render: amount },
    { title: hdr('taxAmount', '부가세'), dataIndex: 'taxAmount', width: 100, align: 'right', render: amount },
    { title: hdr('totalAmount', '총금액'), dataIndex: 'totalAmount', width: 115, align: 'right', render: amount },
    { title: hdr('salesType', '매출타입'), dataIndex: 'salesType', width: 100, render: (v: string) => salesTypeLabel(v) || '-' },
    { title: hdr('division', '사업본부매출구분'), dataIndex: 'division', width: 140 },
    { title: hdr('accountingDate', '회계일'), dataIndex: 'accountingDate', width: 115 },
    { title: hdr('productPurchaseAmount', '상품매입'), dataIndex: 'productPurchaseAmount', width: 115, align: 'right', onHeaderCell: () => ({ style: costHeader }), render: amount },
    { title: hdr('outsourcingAmount', '외주'), dataIndex: 'outsourcingAmount', width: 115, align: 'right', onHeaderCell: () => ({ style: costHeader }), render: amount },
    { title: hdr('podProductionAmount', '내부생산'), dataIndex: 'podProductionAmount', width: 115, align: 'right', onHeaderCell: () => ({ style: costHeader }), render: amount },
    { title: hdr('purchaseTotalAmount', '매입계'), dataIndex: 'purchaseTotalAmount', width: 115, align: 'right', onHeaderCell: () => ({ style: costHeader }), render: amount },
    { title: hdr('grossProfitAmount', '매출총이익'), dataIndex: 'grossProfitAmount', width: 125, align: 'right', render: (v: number) => <b style={{ color: v < 0 ? '#1677ff' : '#cf1322' }}>{amount(v)}</b> },
    { title: hdr('marginRate', '마진율'), dataIndex: 'marginRate', width: 90, align: 'center', render: (v: number) => <Tag color={v < 0 ? 'blue' : 'red'}>{v.toFixed(1)}%</Tag> },
    { title: hdr('remark', '비고'), dataIndex: 'remark', width: 90 },
  ], [colFilters, sortCfg, rows]);

  // 헤더 필터 + 정렬 적용.
  const processedRows = useMemo(() => {
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    let out = active.length
      ? rows.filter((row) => active.every(([colId, f]) => matchesFilter(grpGetVal(row, colId), grpColType(colId), f)))
      : rows;
    if (sortCfg) {
      const t = grpColType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(grpGetVal(a, sortCfg.colId), grpGetVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, colFilters, sortCfg]);

  // ⚙ 컬럼 선택 반영.
  const visibleColumns = useMemo(
    () => columns.filter((c) => !('dataIndex' in c) || typeof c.dataIndex !== 'string' || !hiddenCols[c.dataIndex]),
    [columns, hiddenCols],
  );

  // 현재 조회/컬럼 필터 결과 전체의 합계(테이블 페이지와 무관).
  const totals = useMemo(() => {
    const summed = processedRows.reduce((acc, row) => ({
      supplyAmount: acc.supplyAmount + (row.supplyAmount ?? 0),
      totalAmount: acc.totalAmount + (row.totalAmount ?? 0),
      productPurchaseAmount: acc.productPurchaseAmount + (row.productPurchaseAmount ?? 0),
      outsourcingAmount: acc.outsourcingAmount + (row.outsourcingAmount ?? 0),
      podProductionAmount: acc.podProductionAmount + (row.podProductionAmount ?? 0),
      purchaseTotalAmount: acc.purchaseTotalAmount + (row.purchaseTotalAmount ?? 0),
      grossProfitAmount: acc.grossProfitAmount + (row.grossProfitAmount ?? 0),
    }), {
      supplyAmount: 0,
      totalAmount: 0,
      productPurchaseAmount: 0,
      outsourcingAmount: 0,
      podProductionAmount: 0,
      purchaseTotalAmount: 0,
      grossProfitAmount: 0,
    });
    return {
      ...summed,
      marginRate: summed.supplyAmount === 0
        ? 0
        : Math.round((summed.grossProfitAmount * 1000) / summed.supplyAmount) / 10,
    };
  }, [processedRows]);

  const excelColumns = [
    ['매출일자', 'salesDate'], ['부서명', 'departmentName'], ['영업담당자', 'salesEmployeeName'],
    ['매출번호', 'salesNo'], ['매출명', 'salesTitle'], ['매출거래처', 'salesPartnerName'],
    ['주문거래처', 'orderPartnerName'], ['주문번호', 'orderNo'], ['순번', 'orderSq'],
    ['작업처', 'workPlace'], ['품목구분', 'itemCategory'], ['세부품목명', 'detailItemName'],
    ['공급가액', 'supplyAmount'], ['부가세', 'taxAmount'], ['총금액', 'totalAmount'],
    ['매출타입', 'salesType'], ['사업본부매출구분', 'division'], ['회계일', 'accountingDate'], ['상품매입', 'productPurchaseAmount'],
    ['외주', 'outsourcingAmount'], ['내부생산', 'podProductionAmount'], ['매입계', 'purchaseTotalAmount'],
    ['매출총이익', 'grossProfitAmount'], ['마진율', 'marginRate'], ['비고', 'remark'],
  ].map(([header, key]) => ({ header, key }));

  return (
    <PageLayout>
      <PageHeader title="GRP수익비용대응" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Space wrap style={{ marginBottom: 16 }}>
        <Search placeholder="주문번호 검색" allowClear style={{ width: 220 }} onSearch={setKeyword} />
        <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
        <ExcelDownloadBtn data={processedRows as unknown as Record<string, unknown>[]} columns={excelColumns}
          fileName={`GRP수익비용대응_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        <Popover trigger="click" placement="bottomRight" content={
          <div style={{ maxHeight: 340, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(GRP_COL_LABELS).map(([key, label]) => (
              <Checkbox key={key} checked={!hiddenCols[key]}
                onChange={(e) => setHiddenCols((prev) => ({ ...prev, [key]: !e.target.checked }))}>{label}</Checkbox>
            ))}
          </div>
        }>
          <Button size="small" icon={<SettingOutlined />}>컬럼</Button>
        </Popover>
      </Space>
      <Table columns={visibleColumns} dataSource={processedRows} rowKey={(r) => `${r.orderNo}-${r.orderSq}`}
        loading={loading} bordered size="small" scroll={{ x: 3300, y: 'calc(100vh - 310px)' }}
        pagination={{ defaultPageSize: 100, showSizeChanger: true, pageSizeOptions: ['100', '500', '1000'], showTotal: (n) => `총 ${n}건` }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ background: '#f0f5ff', fontWeight: 700 }}>
              {visibleColumns.map((column, index) => {
                const key = 'dataIndex' in column && typeof column.dataIndex === 'string' ? column.dataIndex : '';
                const totalKeys = new Set([
                  'supplyAmount', 'totalAmount', 'productPurchaseAmount', 'outsourcingAmount',
                  'podProductionAmount', 'purchaseTotalAmount', 'grossProfitAmount',
                ]);
                let content: React.ReactNode = index === 0 ? `합계 (${processedRows.length}건)` : '';
                if (totalKeys.has(key)) content = amount(totals[key as keyof typeof totals]);
                if (key === 'marginRate') {
                  content = <Tag color={totals.marginRate < 0 ? 'blue' : 'red'}>{totals.marginRate.toFixed(1)}%</Tag>;
                }
                return (
                  <Table.Summary.Cell key={key || index} index={index}
                    align={totalKeys.has(key) ? 'right' : key === 'marginRate' ? 'center' : undefined}>
                    {content}
                  </Table.Summary.Cell>
                );
              })}
            </Table.Summary.Row>
          </Table.Summary>
        )} />
    </PageLayout>
  );
};

export default GrpProfitPage;
