import React, { useMemo, useState } from 'react';
import { Card, Radio, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getCustomerYearlySalesDetail } from '@/api/stats.api';
import type { CustomerYearlySalesDetailDto, CustomerYearlySalesDetailRow, StatsSelectOption } from '@/types/stats';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { formatBusinessNo } from '@/utils/format';
import StatsDateRangePicker from './components/StatsDateRangePicker';
import {
  HeaderCell, compareVals, isColFilterActive, matchesFilter,
  type ColFilter, type ColType,
} from '@/components/table/columnFilterKit';

const { Text } = Typography;

type UnitMode = 'thousand' | 'won';
// 조회 금액 표기 — 통합실적처럼 접미사(원/백만) 없이 숫자만. 단위는 상단 토글로 구분.
const fmtAmt = (value: number | undefined, unit: UnitMode) => {
  const n = value ?? 0;
  const v = unit === 'thousand' ? Math.round(n / 1_000) : n;
  return v.toLocaleString('ko-KR');
};

interface GrowthRow {
  key: string;
  partnerCd: string;
  partnerName: string;
  salesEmpNames: string[];   // 이 거래처에 매출을 낸 영업담당자(중복 제거). 여러 명이면 나란히/툴팁 표기.
  businessNo: string;
  salesAmount: number;
  internalAmount: number;
  externalAmount: number;
  previousSalesAmount: number;
  previousInternalAmount: number;
  previousExternalAmount: number;
  salesGrowthAmount: number;
  internalGrowthAmount: number;
  externalGrowthAmount: number;
}

const mergeOptions = (a?: StatsSelectOption[], b?: StatsSelectOption[]) => {
  const map = new Map<string, StatsSelectOption>();
  [...(a ?? []), ...(b ?? [])].forEach((option) => map.set(option.value, option));
  return [...map.values()].sort((x, y) => x.label.localeCompare(y.label, 'ko'));
};

const CustomerSalesGrowthPage: React.FC = () => {
  // 조회기간(기간 선택). 기본 = 올해 1/1 ~ 오늘.
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [startDate, endDate] = dateRange;
  const [unitMode, setUnitMode] = useState<UnitMode>('won');
  const [departmentCd, setDepartmentCd] = useState<string>();
  const [partnerCd, setPartnerCd] = useState<string>();
  const [salesEmpNo, setSalesEmpNo] = useState<string>();
  const [columnFilters, setColumnFilters] = useState<Record<string, ColFilter>>({});
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  const startStr = startDate.format('YYYY-MM-DD');
  const endStr = endDate.format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['customer-sales-growth', startStr, endStr, departmentCd, partnerCd, salesEmpNo],
    queryFn: async () => {
      // 전년동기간 = 조회기간을 그대로 1년 전으로.
      const prevStart = startDate.subtract(1, 'year').format('YYYY-MM-DD');
      const prevEnd = endDate.subtract(1, 'year').format('YYYY-MM-DD');
      const [current, previous] = await Promise.all([
        getCustomerYearlySalesDetail(startStr, endStr, departmentCd, partnerCd, salesEmpNo),
        getCustomerYearlySalesDetail(prevStart, prevEnd, departmentCd, partnerCd, salesEmpNo),
      ]);
      return {
        current: current.data.data,
        previous: previous.data.data,
      } as { current: CustomerYearlySalesDetailDto; previous: CustomerYearlySalesDetailDto };
    },
  });

  const sourceRows = useMemo<GrowthRow[]>(() => {
    // ★거래처 단위로 병합(담당자별로 행을 쪼개지 않음). 담당자는 중복 제거해 모아 나란히 표기.
    const map = new Map<string, GrowthRow & { _empSet: Set<string> }>();
    const add = (source: CustomerYearlySalesDetailRow[], previous: boolean) => {
      source.forEach((item) => {
        const key = item.partnerCd;
        const row = map.get(key) ?? {
          key,
          partnerCd: item.partnerCd,
          partnerName: item.partnerName,
          salesEmpNames: [] as string[],
          _empSet: new Set<string>(),
          businessNo: item.businessNo,
          salesAmount: 0, internalAmount: 0, externalAmount: 0,
          previousSalesAmount: 0, previousInternalAmount: 0, previousExternalAmount: 0,
          salesGrowthAmount: 0, internalGrowthAmount: 0, externalGrowthAmount: 0,
        };
        if (!row.businessNo && item.businessNo) row.businessNo = item.businessNo;
        if (!row.partnerName && item.partnerName) row.partnerName = item.partnerName;
        const empNm = item.salesEmpName || item.salesEmpNo;
        if (empNm && !row._empSet.has(empNm)) { row._empSet.add(empNm); row.salesEmpNames.push(empNm); }
        const value = item.totalAmount ?? item.monthlyAmounts?.reduce((sum, amount) => sum + amount, 0) ?? 0;
        if (previous) {
          row.previousSalesAmount += value;
          if (item.inOutType === 'I') row.previousInternalAmount += value;
          if (item.inOutType === 'O') row.previousExternalAmount += value;
        } else {
          row.salesAmount += value;
          if (item.inOutType === 'I') row.internalAmount += value;
          if (item.inOutType === 'O') row.externalAmount += value;
        }
        map.set(key, row);
      });
    };
    add(data?.current.rows ?? [], false);
    add(data?.previous.rows ?? [], true);
    return [...map.values()].map((row) => ({
      ...row,
      salesGrowthAmount: row.salesAmount - row.previousSalesAmount,
      internalGrowthAmount: row.internalAmount - row.previousInternalAmount,
      externalGrowthAmount: row.externalAmount - row.previousExternalAmount,
    })).sort((a, b) => b.salesAmount - a.salesAmount || a.partnerName.localeCompare(b.partnerName, 'ko'));
  }, [data]);

  const amountFields = new Set([
    'salesAmount', 'internalAmount', 'externalAmount', 'previousSalesAmount',
    'previousInternalAmount', 'previousExternalAmount', 'salesGrowthAmount',
    'internalGrowthAmount', 'externalGrowthAmount',
  ]);
  const columnType = (field: string): ColType => amountFields.has(field) ? 'amount' : 'text';
  const getColumnValue = (row: GrowthRow, field: string): string => {
    if (field === 'salesEmpNames') return row.salesEmpNames.join(', ');
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

  // 담당자 셀 — 여러 명이면 2명까지 표기 + "외 N명", 마우스오버 시 전체 목록 툴팁.
  const empCell = (names: string[]) => {
    if (!names || names.length === 0) return '-';
    const full = names.join(', ');
    if (names.length <= 2) return <span style={{ whiteSpace: 'nowrap' }}>{full}</span>;
    return (
      <Tooltip title={full}>
        <span style={{ whiteSpace: 'nowrap', cursor: 'default', borderBottom: '1px dotted #94a3b8' }}>
          {`${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명`}
        </span>
      </Tooltip>
    );
  };

  // 색: 당기 매출액=틸(강조), 전년동기=회색(참고), 증감=빨강/파랑. (통합실적 색감)
  const curCell = (value: number) => <span style={{ color: '#0096A2', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(value, unitMode)}</span>;
  const prevCell = (value: number) => <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtAmt(value, unitMode)}</span>;
  const growthCell = (value: number) => (
    <Text strong style={{ color: value > 0 ? '#cf1322' : value < 0 ? '#1677ff' : undefined, whiteSpace: 'nowrap' }}>
      {value > 0 ? '+' : ''}{fmtAmt(value, unitMode)}
    </Text>
  );
  const baseColumns = useMemo<ColumnsType<GrowthRow>>(() => [
    { title: '순번', width: 65, fixed: 'left', align: 'center', render: (_, __, index) => index + 1 },
    { title: '법인/거래처명', dataIndex: 'partnerName', width: 250, fixed: 'left', render: (value, row) => <div><Text strong>{value || '-'}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{row.partnerCd}</Text></div> },
    { title: '담당자', dataIndex: 'salesEmpNames', width: 150, fixed: 'left', render: (value: string[]) => empCell(value) },
    { title: '사업자번호', dataIndex: 'businessNo', width: 140, fixed: 'left', render: (value) => formatBusinessNo(value) || '-' },
    { title: '매출액', dataIndex: 'salesAmount', width: 150, align: 'right', render: curCell },
    { title: '내부 매출액', dataIndex: 'internalAmount', width: 150, align: 'right', render: curCell },
    { title: '외부 매출액', dataIndex: 'externalAmount', width: 150, align: 'right', render: curCell },
    { title: '전년동기간 매출액', dataIndex: 'previousSalesAmount', width: 160, align: 'right', render: prevCell },
    { title: '전년동기간 내부', dataIndex: 'previousInternalAmount', width: 150, align: 'right', render: prevCell },
    { title: '전년동기간 외부', dataIndex: 'previousExternalAmount', width: 150, align: 'right', render: prevCell },
    { title: '전년대비 매출증감액', dataIndex: 'salesGrowthAmount', width: 170, align: 'right', render: growthCell },
    { title: '전년대비 내부 증감', dataIndex: 'internalGrowthAmount', width: 175, align: 'right', render: growthCell },
    { title: '전년대비 외부 증감', dataIndex: 'externalGrowthAmount', width: 175, align: 'right', render: growthCell },
  ], [unitMode]);

  const columnLabels: Record<string, string> = {
    partnerName: '법인/거래처명', salesEmpNames: '담당자', businessNo: '사업자번호',
    salesAmount: '매출액', internalAmount: '내부 매출액', externalAmount: '외부 매출액',
    previousSalesAmount: '전년 동기간 매출액', previousInternalAmount: '전년 동기간 내부 매출액',
    previousExternalAmount: '전년 동기간 외부 매출액', salesGrowthAmount: '전년대비 매출증감액',
    internalGrowthAmount: '전년대비 내부 매출증감액', externalGrowthAmount: '전년대비 외부 매출증감액',
  };
  const columns = useMemo<ColumnsType<GrowthRow>>(() => baseColumns.map((column) => {
    if (!("dataIndex" in column) || typeof column.dataIndex !== 'string') return column;
    const field = column.dataIndex;
    return { ...column, title: header(field, columnLabels[field] ?? field) };
  }), [baseColumns, columnFilters, sortConfig]);

  const totals = useMemo(() => rows.reduce((sum, row) => {
    (Object.keys(sum) as Array<keyof typeof sum>).forEach((key) => { sum[key] += row[key]; });
    return sum;
  }, {
    salesAmount: 0, internalAmount: 0, externalAmount: 0,
    previousSalesAmount: 0, previousInternalAmount: 0, previousExternalAmount: 0,
    salesGrowthAmount: 0, internalGrowthAmount: 0, externalGrowthAmount: 0,
  }), [rows]);

  // 엑셀 — 금액은 원단위 원값 유지, 담당자는 콤마 병합.
  const excelRows = useMemo(() => rows.map((row, index) => ({
    ...row, sequence: index + 1,
    salesEmpName: row.salesEmpNames.join(', '),
    businessNo: formatBusinessNo(row.businessNo),
  })), [rows]);
  const excelColumns = [
    { header: '순번', key: 'sequence' }, { header: '법인/거래처명', key: 'partnerName' },
    { header: '담당자', key: 'salesEmpName' }, { header: '사업자번호', key: 'businessNo' },
    { header: '매출액', key: 'salesAmount' }, { header: '내부 매출액', key: 'internalAmount' },
    { header: '외부 매출액', key: 'externalAmount' }, { header: '전년동기간 매출액', key: 'previousSalesAmount' },
    { header: '전년동기간 내부', key: 'previousInternalAmount' }, { header: '전년동기간 외부', key: 'previousExternalAmount' },
    { header: '전년대비 매출증감액', key: 'salesGrowthAmount' }, { header: '전년대비 내부 증감', key: 'internalGrowthAmount' },
    { header: '전년대비 외부 증감', key: 'externalGrowthAmount' },
  ];

  const departments = mergeOptions(data?.current.departments, data?.previous.departments);
  const partners = mergeOptions(data?.current.partners, data?.previous.partners);
  const employees = mergeOptions(data?.current.employees, data?.previous.employees);

  return (
    <PageLayout>
      <PageHeader title="거래처별 매출증감" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }} />
      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={10}>
          <StatsDateRangePicker value={dateRange} onChange={(dates) => {
            setDateRange(dates);
            setDepartmentCd(undefined); setPartnerCd(undefined); setSalesEmpNo(undefined);
          }} />
          <Radio.Group value={unitMode} onChange={(e) => setUnitMode(e.target.value)} optionType="button" buttonStyle="solid"
            options={[{ label: '천원단위', value: 'thousand' }, { label: '원단위', value: 'won' }]} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업거래처 전체" value={partnerCd} onChange={setPartnerCd}
            style={{ width: 280 }} options={partners.map((option) => ({ ...option, label: `${option.label} (${option.value})` }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당부서 전체" value={departmentCd} onChange={setDepartmentCd}
            style={{ width: 210 }} options={departments} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당자 전체" value={salesEmpNo} onChange={setSalesEmpNo}
            style={{ width: 180 }} options={employees} />
          <ExcelDownloadBtn data={excelRows} columns={excelColumns} fileName={`거래처별_매출증감_${startStr}_${endStr}`} />
        </Space>
      </Card>
      <Table<GrowthRow>
        bordered size="small" loading={isLoading} columns={columns} dataSource={rows} rowKey="key" pagination={false}
        scroll={{ x: 1985, y: 'calc(100vh - 330px)' }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>총계</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} /><Table.Summary.Cell index={2} /><Table.Summary.Cell index={3} />
              {(['salesAmount', 'internalAmount', 'externalAmount', 'previousSalesAmount', 'previousInternalAmount', 'previousExternalAmount'] as const)
                .map((key, index) => <Table.Summary.Cell key={key} index={index + 4} align="right"><Text strong style={{ color: index < 3 ? '#0096A2' : '#64748b' }}>{fmtAmt(totals[key], unitMode)}</Text></Table.Summary.Cell>)}
              {(['salesGrowthAmount', 'internalGrowthAmount', 'externalGrowthAmount'] as const)
                .map((key, index) => <Table.Summary.Cell key={key} index={index + 10} align="right">{growthCell(totals[key])}</Table.Summary.Cell>)}
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </PageLayout>
  );
};

export default CustomerSalesGrowthPage;
