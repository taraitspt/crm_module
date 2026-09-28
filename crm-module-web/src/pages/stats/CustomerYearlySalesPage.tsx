import React, { useMemo, useState } from 'react';
import { Card, DatePicker, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getCustomerYearlySales } from '@/api/stats.api';
import type { CustomerYearlySalesRow } from '@/types/stats';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { formatBusinessNo } from '@/utils/format';
import {
  HeaderCell, compareVals, isColFilterActive, matchesFilter,
  type ColFilter, type ColType,
} from '@/components/table/columnFilterKit';

const { Text } = Typography;
const amount = (value?: number) => (value ?? 0).toLocaleString('ko-KR');

const CustomerYearlySalesPage: React.FC = () => {
  const [year, setYear] = useState(dayjs().year());
  const [departmentCd, setDepartmentCd] = useState<string>();
  const [partnerCd, setPartnerCd] = useState<string>();
  const [columnFilters, setColumnFilters] = useState<Record<string, ColFilter>>({});
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-yearly-sales', year, departmentCd, partnerCd],
    queryFn: () => getCustomerYearlySales(year, departmentCd, partnerCd),
  });

  const result = data?.data?.data;
  const sourceRows = result?.rows ?? [];
  const columnType = (field: string): ColType => field.startsWith('month-') || field === 'totalAmount' ? 'amount' : 'text';
  const getColumnValue = (row: CustomerYearlySalesRow, field: string): string => {
    if (field.startsWith('month-')) return String(row.monthlyAmounts?.[Number(field.slice(6)) - 1] ?? 0);
    if (field === 'businessNo') return formatBusinessNo(row.businessNo) || '';
    const value = (row as unknown as Record<string, unknown>)[field];
    return value == null ? '' : String(value);
  };
  const rows = useMemo(() => {
    let next = sourceRows;
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
  }, [sourceRows, columnFilters, sortConfig]);
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
  const monthTotals = useMemo(() => Array.from({ length: 12 }, (_, month) =>
    rows.reduce((sum, row) => sum + (row.monthlyAmounts?.[month] ?? 0), 0)), [rows]);
  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0), [rows]);

  const columns = useMemo<ColumnsType<CustomerYearlySalesRow>>(() => [
    {
      title: '순번', key: 'sequence', width: 70, fixed: 'left', align: 'center',
      render: (_: unknown, __: CustomerYearlySalesRow, index: number) => index + 1,
    },
    {
      title: header('partnerName', '거래처명'), dataIndex: 'partnerName', key: 'partnerName', width: 240, fixed: 'left',
      render: (value, row) => (
        <div><Text strong>{value || '-'}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{row.partnerCd}</Text></div>
      ),
    },
    { title: header('businessNo', '사업자번호'), dataIndex: 'businessNo', key: 'businessNo', width: 140, fixed: 'left', render: (value) => formatBusinessNo(value) || '-' },
    {
      title: header('departmentName', '부서명'), dataIndex: 'departmentName', key: 'departmentName', width: 180, fixed: 'left',
      render: (value) => <Text>{value || '-'}</Text>,
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      title: header(`month-${index + 1}`, `${index + 1}월`),
      key: `month-${index + 1}`,
      width: 130,
      align: 'right' as const,
      render: (_: unknown, row: CustomerYearlySalesRow) => amount(row.monthlyAmounts?.[index]),
    })),
    {
      title: header('totalAmount', '누적합계'), dataIndex: 'totalAmount', key: 'totalAmount', width: 160, align: 'right', fixed: 'right',
      render: (value) => <Text strong style={{ color: '#004e64' }}>{amount(value)}</Text>,
    },
  ], [columnFilters, sortConfig]);

  const excelRows = useMemo(() => rows.map((row, index) => {
    const out: Record<string, unknown> = {
      sequence: index + 1, partnerName: row.partnerName, businessNo: formatBusinessNo(row.businessNo), departmentName: row.departmentName,
    };
    row.monthlyAmounts?.forEach((value, monthIndex) => { out[`month${monthIndex + 1}`] = value; });
    out.totalAmount = row.totalAmount;
    return out;
  }), [rows]);

  return (
    <PageLayout>
      <PageHeader
        title="거래처별 월매출"
        titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }}
      />

      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={12}>
          <DatePicker
            picker="year"
            allowClear={false}
            value={dayjs().year(year)}
            onChange={(value) => {
              if (value) {
                setYear(value.year());
                setDepartmentCd(undefined);
                setPartnerCd(undefined);
              }
            }}
            style={{ width: 130 }}
          />
          <Select
            allowClear showSearch optionFilterProp="label" placeholder="영업담당부서 전체"
            value={departmentCd} onChange={setDepartmentCd} style={{ width: 220 }}
            options={result?.departments ?? []}
          />
          <Select
            allowClear showSearch optionFilterProp="label" placeholder="영업거래처 전체"
            value={partnerCd} onChange={setPartnerCd} style={{ width: 300 }}
            options={(result?.partners ?? []).map((option) => ({
              ...option, label: `${option.label} (${option.value})`,
            }))}
          />
          <ExcelDownloadBtn
            data={excelRows}
            columns={[
              { header: '순번', key: 'sequence' },
              { header: '거래처명', key: 'partnerName' },
              { header: '사업자번호', key: 'businessNo' },
              { header: '부서명', key: 'departmentName' },
              ...Array.from({ length: 12 }, (_, index) => ({ header: `${index + 1}월`, key: `month${index + 1}` })),
              { header: '누적합계', key: 'totalAmount' },
            ]}
            fileName={`거래처별_월매출_${year}`}
          />
        </Space>
      </Card>

      <Table<CustomerYearlySalesRow>
        bordered size="middle" loading={isLoading} columns={columns} dataSource={rows}
        rowKey={(row) => `${row.partnerCd}-${row.departmentCd}`}
        pagination={false}
        scroll={{ x: 70 + 240 + 140 + 180 + 12 * 130 + 160, y: 'calc(100vh - 440px)' }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>합계</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2} />
              <Table.Summary.Cell index={3} />
              {monthTotals.map((value, index) => (
                <Table.Summary.Cell key={index} index={index + 4} align="right"><Text strong>{amount(value)}</Text></Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={16} align="right"><Text strong style={{ color: '#004e64' }}>{amount(grandTotal)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </PageLayout>
  );
};

export default CustomerYearlySalesPage;
