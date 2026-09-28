import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Input, Popover, Select, Space, Table, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getPodProductionDetails, getPodProductionRows } from '@/api/stats.api';
import type { PodProductionDetail, PodProductionRow } from '@/types/stats';
import StatsDateRangePicker from './components/StatsDateRangePicker';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const { Text } = Typography;
const number = (value?: number) => value == null ? '-' : value.toLocaleString('ko-KR');

// 컬럼별 헤더 필터 타입 — 주문목록과 동일한 필터 에디터(HeaderCell). 지정 없으면 text.
const POD_COL_TYPES: Record<string, ColType> = {
  growOrderSq: 'amount', orderSq: 'amount', orderQty: 'amount', totalPages: 'amount', imposePages: 'amount',
  imposedTotalPages: 'amount', amount: 'amount',
  workPlaceName: 'enum', itemType: 'enum', salesDepartmentName: 'enum', salesEmployeeName: 'enum',
  packingMethod: 'enum', printDirection: 'enum', productionStatus: 'enum',
};
const podColType = (colId: string): ColType => POD_COL_TYPES[colId] ?? 'text';
const podGetVal = (row: PodProductionRow, colId: string): string =>
  String((row as unknown as Record<string, unknown>)[colId] ?? '');

// 컬럼 표시/숨김 선택기(⚙ 컬럼)용 — colId(dataIndex) → 라벨. localStorage 로 개인별 저장.
const POD_COL_LABELS: Record<string, string> = {
  workPlaceName: '작업처', growOrderNo: 'CRM주문번호', growOrderSq: 'CRM순번',
  orderNo: 'ERP주문번호', orderSq: 'ERP순번',
  orderName: '주문명', orderDate: '주문일', salesDepartmentName: '영업담당부서', salesEmployeeName: '영업담당자',
  itemType: '품목구분', itemCd: '품목코드', itemName: '품목명', detailItemName: '세부품목명',
  orderQty: '오더수량', totalPages: '총페이지', imposePages: '조판페이지', imposedTotalPages: '조판후 총페이지',
  amount: '금액', size: '사이즈', packingMethod: '포장방법', printDirection: '인쇄방향',
  deliveryDueAt: '납품예정일', productionEmployeeName: '생산담당자', productionStatus: '진행상태', completedAt: '완료시간',
};
const POD_HIDDEN_COLS_KEY = 'pod-production-hidden-cols';

const PodProductionPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [workPlaceCd, setWorkPlaceCd] = useState<string>();
  const [salesDepartmentCd, setSalesDepartmentCd] = useState<string>();
  const [salesEmployee, setSalesEmployee] = useState<string>();
  const [productionStatus, setProductionStatus] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<PodProductionRow>();
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});
  const [sortCfg, setSortCfg] = useState<{ colId: string; dir: 'asc' | 'desc' } | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(POD_HIDDEN_COLS_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(POD_HIDDEN_COLS_KEY, JSON.stringify(hiddenCols)); } catch { /* ignore */ }
  }, [hiddenCols]);

  const { data, isLoading } = useQuery({
    queryKey: ['pod-production', dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD'), workPlaceCd, salesDepartmentCd, salesEmployee, keyword],
    queryFn: () => getPodProductionRows({
      startDate: dateRange[0].format('YYYY-MM-DD'), endDate: dateRange[1].format('YYYY-MM-DD'),
      workPlaceCd, salesDepartmentCd, salesEmployee, keyword: keyword || undefined,
    }),
  });
  const allRows = useMemo(() => data?.data?.data ?? [], [data]);
  const rows = useMemo(
    () => productionStatus
      ? allRows.filter((row) => row.productionStatus === productionStatus)
      : allRows,
    [allRows, productionStatus],
  );
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['pod-production-detail', selected?.orderNo, selected?.orderSq],
    queryFn: () => getPodProductionDetails(selected!.orderNo, selected!.orderSq),
    enabled: !!selected,
  });
  const details = detailData?.data?.data ?? [];

  const options = (field: keyof PodProductionRow, valueField: keyof PodProductionRow = field) =>
    Array.from(new Map(allRows.filter((row) => row[field]).map((row) => [String(row[valueField]), String(row[field])])).entries())
      .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  // 헤더 필터/정렬 (주문목록과 동일한 HeaderCell 에디터). 전부 프론트 처리.
  const enumOptsFor = (colId: keyof PodProductionRow) =>
    Array.from(new Set(allRows.map((r) => String(r[colId] ?? '')).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ label: v, value: v }));
  const applyColFilter = (colId: string, f: ColFilter) => setColFilters((prev) => ({ ...prev, [colId]: f }));
  const clearColFilter = (colId: string) => setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; });
  const toggleSort = (colId: string) => setSortCfg((prev) =>
    prev?.colId === colId ? (prev.dir === 'asc' ? { colId, dir: 'desc' } : null) : { colId, dir: 'asc' });
  const hdr = (colId: string, label: string) => (
    <HeaderCell colId={colId} label={label} type={podColType(colId)}
      enumOptions={podColType(colId) === 'enum' ? enumOptsFor(colId as keyof PodProductionRow) : undefined}
      filter={colFilters[colId]} sortDir={sortCfg?.colId === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo<ColumnsType<PodProductionRow>>(() => [
    { title: 'No', width: 58, fixed: 'left', align: 'center', render: (_, __, index) => index + 1 },
    { title: hdr('workPlaceName', '작업처'), dataIndex: 'workPlaceName', width: 110, fixed: 'left' },
    { title: hdr('growOrderNo', 'CRM주문번호'), dataIndex: 'growOrderNo', width: 155, fixed: 'left', render: (v) => v || '-' },
    { title: hdr('growOrderSq', 'CRM순번'), dataIndex: 'growOrderSq', width: 85, align: 'center', render: (v) => v ?? '-' },
    { title: hdr('orderNo', 'ERP주문번호'), dataIndex: 'orderNo', width: 155, fixed: 'left' },
    { title: hdr('orderSq', 'ERP순번'), dataIndex: 'orderSq', width: 80, align: 'center' },
    { title: hdr('orderName', '주문명'), dataIndex: 'orderName', width: 240, ellipsis: true },
    { title: hdr('orderDate', '주문일'), dataIndex: 'orderDate', width: 105 },
    { title: hdr('salesDepartmentName', '영업담당부서'), dataIndex: 'salesDepartmentName', width: 145 },
    { title: hdr('salesEmployeeName', '영업담당자'), dataIndex: 'salesEmployeeName', width: 105 },
    { title: hdr('itemType', '품목구분'), dataIndex: 'itemType', width: 95 },
    { title: hdr('itemCd', '품목코드'), dataIndex: 'itemCd', width: 115 },
    { title: hdr('itemName', '품목명'), dataIndex: 'itemName', width: 120 },
    { title: hdr('detailItemName', '세부품목명'), dataIndex: 'detailItemName', width: 210, ellipsis: true },
    { title: hdr('orderQty', '오더수량'), dataIndex: 'orderQty', width: 95, align: 'right', render: number },
    { title: hdr('totalPages', '총페이지'), dataIndex: 'totalPages', width: 90, align: 'right', render: number },
    { title: hdr('imposePages', '조판페이지'), dataIndex: 'imposePages', width: 100, align: 'right', render: number },
    { title: hdr('imposedTotalPages', '조판후 총페이지'), dataIndex: 'imposedTotalPages', width: 120, align: 'right', render: number },
    { title: hdr('amount', '금액'), dataIndex: 'amount', width: 110, align: 'right', render: number },
    { title: hdr('size', '사이즈'), dataIndex: 'size', width: 95 },
    { title: hdr('packingMethod', '포장방법'), dataIndex: 'packingMethod', width: 100 },
    { title: hdr('printDirection', '인쇄방향'), dataIndex: 'printDirection', width: 100 },
    { title: hdr('deliveryDueAt', '납품예정일'), dataIndex: 'deliveryDueAt', width: 145 },
    { title: hdr('productionEmployeeName', '생산담당자'), dataIndex: 'productionEmployeeName', width: 110 },
    { title: hdr('productionStatus', '진행상태'), dataIndex: 'productionStatus', width: 100 },
    { title: hdr('completedAt', '완료시간'), dataIndex: 'completedAt', width: 145 },
  ], [colFilters, sortCfg, allRows]);

  // 헤더 필터 + 정렬 적용 (상단 select/keyword 로 걸러진 rows 위에 프론트 처리).
  const processedRows = useMemo(() => {
    const active = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    let out = active.length
      ? rows.filter((row) => active.every(([colId, f]) => matchesFilter(podGetVal(row, colId), podColType(colId), f)))
      : rows;
    if (sortCfg) {
      const t = podColType(sortCfg.colId);
      out = [...out].sort((a, b) => {
        const c = compareVals(podGetVal(a, sortCfg.colId), podGetVal(b, sortCfg.colId), t);
        return sortCfg.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, colFilters, sortCfg]);

  // ⚙ 컬럼 선택 반영 — dataIndex 없는 컬럼(No)은 항상 표시.
  const visibleColumns = useMemo(
    () => columns.filter((c) => !('dataIndex' in c) || typeof c.dataIndex !== 'string' || !hiddenCols[c.dataIndex]),
    [columns, hiddenCols],
  );

  const detailColumns: ColumnsType<PodProductionDetail> = [
    { title: 'No', width: 55, align: 'center', render: (_, __, index) => index + 1 },
    { title: '공정', dataIndex: 'process', width: 110 }, { title: '구성', dataIndex: 'composition', width: 100 },
    { title: '작업방법', dataIndex: 'workMethod', width: 120 }, { title: '작업처', dataIndex: 'workPlace', width: 105 },
    { title: '옵션1', dataIndex: 'option1', width: 105 }, { title: '옵션2', dataIndex: 'option2', width: 105 },
    { title: '옵션3', dataIndex: 'option3', width: 105 }, { title: '옵션4', dataIndex: 'option4', width: 105 },
    { title: '옵션5', dataIndex: 'option5', width: 105 }, { title: '원자재코드', dataIndex: 'materialCd', width: 115 },
    { title: '원자재명', dataIndex: 'materialName', width: 180 },
    { title: '부수', dataIndex: 'quantity', width: 85, align: 'right', render: number },
    { title: '페이지', dataIndex: 'pages', width: 85, align: 'right', render: number },
    { title: '단가', dataIndex: 'unitPrice', width: 100, align: 'right', render: number },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right', render: number },
    { title: '사이즈', dataIndex: 'size', width: 95 }, { title: '비고', dataIndex: 'remark', width: 180 },
  ];
  const excelRows = processedRows.map((row) => ({ ...row }) as Record<string, unknown>);
  const excelColumns = columns.flatMap((column) => {
    if (!("dataIndex" in column) || typeof column.dataIndex !== 'string') return [];
    return [{ header: typeof column.title === 'string' ? column.title : column.dataIndex, key: column.dataIndex }];
  });

  return (
    <PageLayout>
      <PageHeader title="GRP생산내역" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={8}>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="작업처 전체" value={workPlaceCd} onChange={setWorkPlaceCd}
            options={options('workPlaceName', 'workPlaceCd')} style={{ width: 150 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당부서 전체" value={salesDepartmentCd}
            onChange={(value) => { setSalesDepartmentCd(value); setSalesEmployee(undefined); }}
            options={options('salesDepartmentName', 'salesDepartmentCd')} style={{ width: 190 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당자 전체" value={salesEmployee} onChange={setSalesEmployee}
            options={options('salesEmployeeName')} style={{ width: 145 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="진행상태 전체" value={productionStatus} onChange={setProductionStatus}
            options={options('productionStatus')} style={{ width: 145 }} />
          <Input.Search allowClear placeholder="CRM/ERP 주문번호, 주문명 검색" onSearch={setKeyword} style={{ width: 260 }} />
          <ExcelDownloadBtn data={excelRows} columns={excelColumns}
            fileName={`GRP생산내역_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`} />
        </Space>
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <Popover trigger="click" placement="bottomRight" content={
          <div style={{ maxHeight: 340, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(POD_COL_LABELS).map(([key, label]) => (
              <Checkbox key={key} checked={!hiddenCols[key]}
                onChange={(e) => setHiddenCols((prev) => ({ ...prev, [key]: !e.target.checked }))}>{label}</Checkbox>
            ))}
          </div>
        }>
          <Button size="small" icon={<SettingOutlined />}>컬럼</Button>
        </Popover>
      </div>
      <Table<PodProductionRow> virtual bordered size="small" loading={isLoading} columns={visibleColumns} dataSource={processedRows}
        rowKey={(row) => `${row.orderNo}-${row.orderSq}`} pagination={false} scroll={{ x: 2800, y: 'calc(58vh - 220px)' }}
        onRow={(row) => ({ onClick: () => setSelected(row), style: { cursor: 'pointer' } })}
        rowClassName={(row) => selected?.orderNo === row.orderNo && selected?.orderSq === row.orderSq ? 'pod-selected-row' : ''} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '7px 14px', marginTop: 6,
                    background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 6, fontWeight: 700, color: '#001f3f' }}>
        <span>총 {processedRows.length.toLocaleString('ko-KR')}건</span>
        <span>생산금액 합계 : {number(processedRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))} 원</span>
      </div>
      <Card size="small" title={selected ? `상세내역 · ${selected.orderNo}-${selected.orderSq}` : '상세내역 · 상단 행을 선택하세요'} style={{ marginTop: 10 }}>
        <Table<PodProductionDetail> bordered size="small" loading={detailLoading} columns={detailColumns} dataSource={details}
          rowKey={(_, index) => String(index)} pagination={false} scroll={{ x: 1900, y: 'calc(42vh - 190px)' }}
          locale={{ emptyText: selected ? '상세내역이 없습니다.' : '상단 목록에서 행을 선택하세요.' }}
          summary={() => details.length ? <Table.Summary.Row>
            <Table.Summary.Cell index={0}><Text strong>합계</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1} colSpan={14} />
            <Table.Summary.Cell index={15} align="right"><Text strong>{number(details.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={16} colSpan={2} />
          </Table.Summary.Row> : null} />
      </Card>
      <style>{`.pod-selected-row > td { background: #e6f7f8 !important; }`}</style>
    </PageLayout>
  );
};

export default PodProductionPage;
