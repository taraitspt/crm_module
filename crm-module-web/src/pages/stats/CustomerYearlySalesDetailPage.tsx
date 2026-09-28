import React, { useMemo, useState } from 'react';
import { Card, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getCustomerYearlySalesDetail } from '@/api/stats.api';
import type { CustomerYearlySalesDetailRow } from '@/types/stats';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { formatBusinessNo } from '@/utils/format';
import {
  HeaderCell, compareVals, isColFilterActive, matchesFilter,
  type ColFilter, type ColType,
} from '@/components/table/columnFilterKit';

const { Text } = Typography;
const amount = (value?: number) => (value ?? 0).toLocaleString('ko-KR');

const CustomerYearlySalesDetailPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [departmentCd, setDepartmentCd] = useState<string>();
  const [partnerCd, setPartnerCd] = useState<string>();
  const [salesEmpNo, setSalesEmpNo] = useState<string>();
  const [inOutType, setInOutType] = useState<string>();
  const [columnFilters, setColumnFilters] = useState<Record<string, ColFilter>>({});
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-yearly-sales-detail', year, departmentCd, partnerCd, salesEmpNo],
    // 연간 상세는 연도 기준 유지 — API가 기간(startDate/endDate)이라 그 해 1/1~12/31 로 호출.
    queryFn: () => getCustomerYearlySalesDetail(`${year}-01-01`, `${year}-12-31`, departmentCd, partnerCd, salesEmpNo),
  });
  const result = data?.data?.data;

  const groupedRows = useMemo(() => {
    const source = result?.rows ?? [];
    const grouped = new Map<string, CustomerYearlySalesDetailRow[]>();
    source.forEach((row) => {
      const key = `${row.partnerCd}\u0000${row.departmentCd}\u0000${row.salesEmpNo}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    });
    const output: CustomerYearlySalesDetailRow[] = [];
    grouped.forEach((items) => {
      const first = items[0];
      items.sort((a, b) => a.inOutType.localeCompare(b.inOutType));
      output.push(...items);
      const monthlyAmounts = Array.from({ length: 12 }, (_, month) =>
        items.reduce((sum, row) => sum + (row.monthlyAmounts?.[month] ?? 0), 0));
      output.push({
        ...first,
        inOutType: 'T',
        inOutLabel: '합계',
        monthlyAmounts,
        totalAmount: monthlyAmounts.reduce((sum, value) => sum + value, 0),
      });
    });
    return inOutType ? output.filter((row) => row.inOutType === inOutType) : output;
  }, [result?.rows, inOutType]);

  const columnType = (field: string): ColType => field.startsWith('month-') || field === 'totalAmount' ? 'amount' : 'text';
  const getColumnValue = (row: CustomerYearlySalesDetailRow, field: string): string => {
    if (field.startsWith('month-')) return String(row.monthlyAmounts?.[Number(field.slice(6)) - 1] ?? 0);
    if (field === 'businessNo') return formatBusinessNo(row.businessNo) || '';
    const value = (row as unknown as Record<string, unknown>)[field];
    return value == null ? '' : String(value);
  };
  const rows = useMemo(() => {
    let next = groupedRows;
    const activeFilters = Object.entries(columnFilters).filter(([, filter]) => isColFilterActive(filter));
    if (activeFilters.length) {
      next = next.filter((row) => activeFilters.every(([field, filter]) =>
        matchesFilter(getColumnValue(row, field), columnType(field), filter)));
    }
    if (sortConfig) {
      next = [...next].sort((a, b) => {
        const compared = compareVals(getColumnValue(a, sortConfig.field), getColumnValue(b, sortConfig.field), columnType(sortConfig.field));
        return sortConfig.dir === 'desc' ? -compared : compared;
      });
    }
    return next;
  }, [groupedRows, columnFilters, sortConfig]);
  const toggleSort = (field: string) => setSortConfig((previous) =>
    !previous || previous.field !== field ? { field, dir: 'asc' }
      : previous.dir === 'asc' ? { field, dir: 'desc' } : null);
  const header = (field: string, label: string) => (
    <HeaderCell colId={field} label={label} type={columnType(field)} filter={columnFilters[field]}
      sortDir={sortConfig?.field === field ? sortConfig.dir : undefined}
      onToggleSort={() => toggleSort(field)}
      onApply={(key, filter) => setColumnFilters((previous) => ({ ...previous, [key]: filter }))}
      onClear={(key) => setColumnFilters((previous) => { const next = { ...previous }; delete next[key]; return next; })} />
  );

  const columns = useMemo<ColumnsType<CustomerYearlySalesDetailRow>>(() => [
    { title: '순번', key: 'sequence', width: 65, fixed: 'left', align: 'center', render: (_, __, index) => index + 1 },
    {
      title: header('partnerName', '거래처명'), dataIndex: 'partnerName', key: 'partnerName', width: 220, fixed: 'left',
      render: (value, row) => <div><Text strong>{value || '-'}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{row.partnerCd}</Text></div>,
    },
    { title: header('businessNo', '사업자번호'), dataIndex: 'businessNo', key: 'businessNo', width: 140, fixed: 'left', render: (value) => formatBusinessNo(value) || '-' },
    { title: header('departmentName', '부서명'), dataIndex: 'departmentName', key: 'departmentName', width: 170, fixed: 'left' },
    {
      title: header('salesEmpName', '영업담당자'), dataIndex: 'salesEmpName', key: 'salesEmpName', width: 130, fixed: 'left',
      render: (value, row) => <span>{value || row.salesEmpNo || '-'}</span>,
    },
    {
      title: header('inOutLabel', '내/외부'), dataIndex: 'inOutLabel', key: 'inOutLabel', width: 90, align: 'center', fixed: 'left',
      render: (value, row) => row.inOutType === 'T'
        ? <Tag color="cyan">합계</Tag>
        : <Tag color={row.inOutType === 'I' ? 'blue' : 'orange'}>{value}</Tag>,
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      title: header(`month-${index + 1}`, `${index + 1}월`), key: `month-${index + 1}`, width: 125, align: 'right' as const,
      render: (_: unknown, row: CustomerYearlySalesDetailRow) => amount(row.monthlyAmounts?.[index]),
    })),
    {
      title: header('totalAmount', '합계'), dataIndex: 'totalAmount', key: 'totalAmount', width: 150, fixed: 'right', align: 'right',
      render: (value, row) => <Text strong={row.inOutType === 'T'} style={{ color: row.inOutType === 'T' ? '#004e64' : undefined }}>{amount(value)}</Text>,
    },
  ], [columnFilters, sortConfig]);

  const excelRows = useMemo(() => rows.map((row, index) => {
    const out: Record<string, unknown> = {
      sequence: index + 1, partnerName: row.partnerName, businessNo: formatBusinessNo(row.businessNo), departmentName: row.departmentName,
      salesEmpName: row.salesEmpName, inOutLabel: row.inOutLabel,
    };
    row.monthlyAmounts.forEach((value, month) => { out[`month${month + 1}`] = value; });
    out.totalAmount = row.totalAmount;
    return out;
  }), [rows]);
  const totalRows = useMemo(() => rows.filter((row) => row.inOutType === 'T'), [rows]);
  const aggregateRows = inOutType && inOutType !== 'T' ? rows : totalRows;
  const monthTotals = useMemo(() => Array.from({ length: 12 }, (_, month) =>
    aggregateRows.reduce((sum, row) => sum + (row.monthlyAmounts?.[month] ?? 0), 0)), [aggregateRows]);
  const grandTotal = useMemo(() => monthTotals.reduce((sum, value) => sum + value, 0), [monthTotals]);

  return (
    <PageLayout>
      <PageHeader title="거래처별 월매출(상세)" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }} />
      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={10}>
          <DatePicker picker="year" allowClear={false} value={dayjs().year(year)} onChange={(value) => {
            if (value) { setYear(value.year()); setDepartmentCd(undefined); setPartnerCd(undefined); setSalesEmpNo(undefined); }
          }} style={{ width: 125 }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업거래처 전체" value={partnerCd}
            onChange={setPartnerCd} style={{ width: 280 }} options={(result?.partners ?? []).map((o) => ({ ...o, label: `${o.label} (${o.value})` }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당부서 전체" value={departmentCd}
            onChange={setDepartmentCd} style={{ width: 210 }} options={result?.departments ?? []} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당자 전체" value={salesEmpNo}
            onChange={setSalesEmpNo} style={{ width: 180 }} options={result?.employees ?? []} />
          <Select allowClear placeholder="내/외부 전체" value={inOutType} onChange={setInOutType} style={{ width: 140 }}
            options={[
              { label: '내/외부 전체', value: '' },
              { label: '내부', value: 'I' },
              { label: '외부', value: 'O' },
              { label: '합계', value: 'T' },
            ]} />
          <ExcelDownloadBtn data={excelRows} columns={[
            { header: '순번', key: 'sequence' }, { header: '거래처명', key: 'partnerName' },
            { header: '사업자번호', key: 'businessNo' },
            { header: '부서명', key: 'departmentName' }, { header: '영업담당자', key: 'salesEmpName' },
            { header: '내/외부', key: 'inOutLabel' },
            ...Array.from({ length: 12 }, (_, month) => ({ header: `${month + 1}월`, key: `month${month + 1}` })),
            { header: '합계', key: 'totalAmount' },
          ]} fileName={`거래처별_월매출_상세_${year}`} />
        </Space>
      </Card>
      <Table<CustomerYearlySalesDetailRow>
        bordered size="small" loading={isLoading} columns={columns} dataSource={rows}
        rowKey={(row, index) => `${row.partnerCd}-${row.departmentCd}-${row.salesEmpNo}-${row.inOutType}-${index}`}
        pagination={false} scroll={{ x: 65 + 220 + 140 + 170 + 130 + 90 + 12 * 125 + 150, y: 'calc(100vh - 390px)' }}
        rowClassName={(row) => row.inOutType === 'T' ? 'customer-sales-detail-total-row' : ''}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>총합계</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2} />
              <Table.Summary.Cell index={3} />
              <Table.Summary.Cell index={4} />
              <Table.Summary.Cell index={5} />
              {monthTotals.map((value, month) => (
                <Table.Summary.Cell key={month} index={month + 6} align="right"><Text strong>{amount(value)}</Text></Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={18} align="right"><Text strong style={{ color: '#004e64' }}>{amount(grandTotal)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
      <style>{`
        .customer-sales-detail-total-row > td { background: #f0f9fa !important; font-weight: 800; }
      `}</style>
    </PageLayout>
  );
};

export default CustomerYearlySalesDetailPage;
