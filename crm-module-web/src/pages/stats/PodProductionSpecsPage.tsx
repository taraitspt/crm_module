import React, { useMemo, useState } from 'react';
import { Card, Input, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getPodProductionSpecs } from '@/api/stats.api';
import type { PodProductionSpecRow } from '@/types/stats';
import StatsDateRangePicker from './components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const number = (value?: number | null) => value == null ? '-' : Number(value).toLocaleString('ko-KR');

// 컬럼별 헤더 필터 타입 (주문목록과 동일한 HeaderCell). 지정 없으면 text.
const COL_TYPES: Record<string, ColType> = {
  orderSq: 'amount', lineSq: 'amount', horizontal: 'amount', vertical: 'amount',
  pageQty: 'amount', orderQty: 'amount', unitAmount: 'amount', amount: 'amount',
  productionStatus: 'enum', workPlaceName: 'enum', workName: 'enum', configName: 'enum',
  option1Name: 'enum', option2Name: 'enum', deptName: 'enum',
};
const colType = (id: string): ColType => COL_TYPES[id] ?? 'text';
const getVal = (row: PodProductionSpecRow, id: string): string =>
  String((row as unknown as Record<string, unknown>)[id] ?? '');

const PodProductionSpecsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [productionStatus, setProductionStatus] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pod-production-specs', dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')],
    queryFn: () => getPodProductionSpecs({
      startDate: dateRange[0].format('YYYY-MM-DD'), endDate: dateRange[1].format('YYYY-MM-DD'),
    }),
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);

  const rows = useMemo(() => {
    let out = productionStatus ? allRows.filter((r) => r.productionStatus === productionStatus) : allRows;
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      out = out.filter((r) => (r.orderNo ?? '').toLowerCase().includes(k) || (r.deptName ?? '').toLowerCase().includes(k));
    }
    return out;
  }, [allRows, productionStatus, keyword]);

  const enumOptsFor = (id: string) =>
    Array.from(new Set(allRows.map((r) => String((r as unknown as Record<string, unknown>)[id] ?? '')).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));
  const statusOptions = enumOptsFor('productionStatus');
  const applyColFilter = (id: string, f: ColFilter) => setColFilters((p) => ({ ...p, [id]: f }));
  const clearColFilter = (id: string) => setColFilters((p) => { const n = { ...p }; delete n[id]; return n; });
  const toggleSort = (id: string) => setSortCfg((p) =>
    p?.colId === id ? (p.dir === 'asc' ? { colId: id, dir: 'desc' } : null) : { colId: id, dir: 'asc' });
  const hdr = (id: string, label: string) => (
    <HeaderCell colId={id} label={label} type={colType(id)}
      enumOptions={colType(id) === 'enum' ? enumOptsFor(id) : undefined}
      filter={colFilters[id]} sortDir={sortCfg?.colId === id ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(id)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo<ColumnsType<PodProductionSpecRow>>(() => [
    { title: 'No', width: 56, fixed: 'left', align: 'center', render: (_, __, i) => i + 1 },
    { title: hdr('orderDate', '주문일'), dataIndex: 'orderDate', width: 105, fixed: 'left' },
    { title: hdr('orderNo', 'ERP주문번호'), dataIndex: 'orderNo', width: 155, fixed: 'left' },
    { title: hdr('orderSq', '순번'), dataIndex: 'orderSq', width: 70, align: 'center' },
    { title: hdr('lineSq', '라인'), dataIndex: 'lineSq', width: 70, align: 'center' },
    { title: hdr('deptName', '영업부서'), dataIndex: 'deptName', width: 160 },
    { title: hdr('productionStatus', 'POD생산현황'), dataIndex: 'productionStatus', width: 120 },
    { title: hdr('workPlaceName', '작업처'), dataIndex: 'workPlaceName', width: 120,
      render: (value, row) => value || row.workPlaceCd || '-' },
    { title: hdr('wcFg', '내/외부'), dataIndex: 'wcFg', width: 80, align: 'center',
      render: (v) => v === 'N' ? '내부' : v ? '외부' : '-' },
    { title: hdr('itemCd', '품목코드'), dataIndex: 'itemCd', width: 120 },
    { title: hdr('workName', '작업'), dataIndex: 'workName', width: 140, ellipsis: true },
    { title: hdr('configName', '구성'), dataIndex: 'configName', width: 120, ellipsis: true },
    { title: hdr('option1Name', '옵션1'), dataIndex: 'option1Name', width: 130, ellipsis: true },
    { title: hdr('option2Name', '옵션2'), dataIndex: 'option2Name', width: 130, ellipsis: true },
    { title: hdr('horizontal', '가로'), dataIndex: 'horizontal', width: 85, align: 'right', render: number },
    { title: hdr('vertical', '세로'), dataIndex: 'vertical', width: 85, align: 'right', render: number },
    { title: hdr('pageQty', '페이지'), dataIndex: 'pageQty', width: 85, align: 'right', render: number },
    { title: hdr('imposePages', '조판페이지'), dataIndex: 'imposePages', width: 100, align: 'right' },
    { title: hdr('orderQty', '수량'), dataIndex: 'orderQty', width: 90, align: 'right', render: number },
    { title: hdr('unitAmount', '단가'), dataIndex: 'unitAmount', width: 100, align: 'right', render: number },
    { title: hdr('amount', '금액'), dataIndex: 'amount', width: 120, align: 'right', render: number },
  ], [colFilters, sortCfg, allRows]);

  const processedRows = useMemo(() => {
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    let out = active.length
      ? rows.filter((row) => active.every(([id, f]) => matchesFilter(getVal(row, id), colType(id), f)))
      : rows;
    if (sortCfg) {
      const t = colType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(getVal(a, sortCfg.colId), getVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, colFilters, sortCfg]);

  const excelRows = processedRows.map((row) => ({
    ...row,
    wcFg: row.wcFg === 'N' ? '내부' : row.wcFg ? '외부' : '',
  }) as Record<string, unknown>);
  const excelColumns = columns.flatMap((column) => {
    if (!('dataIndex' in column) || typeof column.dataIndex !== 'string') return [];
    return [{ header: typeof column.title === 'string' ? column.title : column.dataIndex, key: column.dataIndex }];
  });

  return (
    <PageLayout>
      <PageHeader title="POD 작업사양 내역" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="POD생산현황 전체"
            value={productionStatus} onChange={setProductionStatus} options={statusOptions} style={{ width: 160 }} />
          <Input.Search allowClear placeholder="ERP 주문번호, 부서명 검색" onSearch={setKeyword} style={{ width: 260 }} />
          <ExcelDownloadBtn data={excelRows} columns={excelColumns}
            fileName={`POD작업사양내역_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        </Space>
      </Card>
      <Table<PodProductionSpecRow> virtual bordered size="small" loading={isLoading} columns={columns} dataSource={processedRows}
        rowKey={(row) => `${row.orderNo}-${row.orderSq}-${row.lineSq}`} pagination={false} scroll={{ x: 2400, y: 'calc(74vh - 200px)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '7px 14px', marginTop: 6,
                    background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 6, fontWeight: 700, color: '#001f3f' }}>
        <span>총 {processedRows.length.toLocaleString('ko-KR')}건</span>
        <span>금액 합계 : {number(processedRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))} 원</span>
      </div>
    </PageLayout>
  );
};

export default PodProductionSpecsPage;
