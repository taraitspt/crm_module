import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, message, Tag, Space, Select, Input, Radio,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs, { Dayjs } from 'dayjs';
import { getVendorMargin } from '@/api/stats.api';
import { lookupApi } from '@/api/info.api';
import { useQuery } from '@tanstack/react-query';
import type { VendorMarginDto, VendorMarginRow } from '@/types/stats';
import { PageLayout, PageHeader } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';
import StatsDateRangePicker from './components/StatsDateRangePicker';

const { Search } = Input;

const fmtNum = (v: number | undefined) => v?.toLocaleString() ?? '-';
const POSITIVE_COLOR = '#cf1322';
const NEGATIVE_COLOR = '#1677ff';

// 헤더 정렬/필터 kit — 컬럼 타입.
const VM_COL_TYPES: Record<string, ColType> = {
  vendorName: 'text', departmentName: 'text', orderAmount: 'amount', outsourcingAmount: 'amount',
  marginAmount: 'amount', marginRate: 'amount', prevMonthMarginRate: 'amount', marginRateChange: 'amount', remark: 'text',
};

const isExecutiveDept = (name?: string) => (name ?? '').trim() === '임원';

const MARGIN_RANGES = [
  { value: '', label: '전체' },
  { value: 'high', label: '30% 이상' },
  { value: 'mid', label: '15~30%' },
  { value: 'low', label: '15% 미만' },
  { value: 'loss', label: '적자' },
];

const VendorMarginPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);
  const [vendorKeyword, setVendorKeyword] = useState<string>();
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [marginRange, setMarginRange] = useState<string>();
  const [vatIncluded, setVatIncluded] = useState(false);
  const [data, setData] = useState<VendorMarginDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortCfg, setSortCfg] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});

  // 부서 트리 (팀=상위부서, 파트=하위부서) — 품목별실적(ItemPerfPage)과 동일 구조.
  const { data: deptTree = [] } = useQuery({
    queryKey: ['deptTree'],
    queryFn: lookupApi.getDeptTree,
    staleTime: 10 * 60 * 1000,
  });
  const teamOptions = useMemo(() => {
    const parentCds = new Set(deptTree.map((d) => d.upDeptCd).filter((v): v is number => v != null));
    return deptTree
      .filter((d) => parentCds.has(d.deptCd) && !isExecutiveDept(d.deptNm))
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [deptTree]);
  const partOptions = useMemo(() => {
    if (!teamCd) return [];
    return deptTree
      .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [deptTree, teamCd]);
  useEffect(() => {
    if (teamCd && !teamOptions.some((o) => o.value === teamCd)) {
      setTeamCd(undefined);
      setPartCd(undefined);
    }
  }, [teamCd, teamOptions]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getVendorMargin(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
          vendorKeyword,
          teamCd,
          partCd,
          marginRange,
          vatIncluded,
        );
        if (res.success) setData(res.data);
      } catch {
        message.error('데이터 조회 실패');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [dateRange, vendorKeyword, teamCd, partCd, marginRange, vatIncluded]);

  const chartData = data?.vendors.slice(0, 10).map((v: VendorMarginRow) => ({
    name: v.vendorName.length > 8 ? v.vendorName.substring(0, 8) + '…' : v.vendorName,
    매출액: v.orderAmount,
    외주원가: v.outsourcingAmount,
  })) ?? [];

  // ── 헤더 정렬/필터 (전부 프론트 처리) ──
  const vmGetVal = (row: VendorMarginRow, colId: string): string => {
    const v = (row as unknown as Record<string, unknown>)[colId];
    return v == null ? '' : String(v);
  };
  const processedRows = useMemo(() => {
    let rows = data?.vendors ?? [];
    const activeCols = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    if (activeCols.length) rows = rows.filter((r) => activeCols.every(([colId, f]) => matchesFilter(vmGetVal(r, colId), VM_COL_TYPES[colId], f)));
    if (sortCfg) {
      const { field, dir } = sortCfg; const type = VM_COL_TYPES[field];
      rows = [...rows].sort((a, b) => { const cmp = compareVals(vmGetVal(a, field), vmGetVal(b, field), type); return dir === 'desc' ? -cmp : cmp; });
    }
    return rows;
  }, [data, colFilters, sortCfg]);

  const toggleSort = (field: string) => setSortCfg((prev) => (!prev || prev.field !== field) ? { field, dir: 'asc' } : prev.dir === 'asc' ? { field, dir: 'desc' } : null);
  const applyColFilter = (colId: string, f: ColFilter) => setColFilters((prev) => ({ ...prev, [colId]: f }));
  const clearColFilter = (colId: string) => setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; });
  const hdr = (colId: string, label: string) => (
    <HeaderCell colId={colId} label={label} type={VM_COL_TYPES[colId]}
      filter={colFilters[colId]} sortDir={sortCfg?.field === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns: ColumnsType<VendorMarginRow> = [
    { title: hdr('vendorName', '거래처명'), dataIndex: 'vendorName', width: 150 },
    { title: hdr('departmentName', '부서명'), dataIndex: 'departmentName', width: 120 },
    { title: hdr('orderAmount', '매출액'), dataIndex: 'orderAmount', width: 130, align: 'right', render: fmtNum },
    { title: hdr('outsourcingAmount', '외주원가'), dataIndex: 'outsourcingAmount', width: 130, align: 'right', render: fmtNum },
    { title: hdr('marginAmount', '마진액'), dataIndex: 'marginAmount', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{fmtNum(v)}</span>,
    },
    { title: hdr('marginRate', '마진율'), dataIndex: 'marginRate', width: 90, align: 'center',
      render: (v: number) => <Tag color={v >= 0 ? 'red' : 'blue'}>{v?.toFixed(1)}%</Tag>,
    },
    { title: hdr('prevMonthMarginRate', '전월마진율'), dataIndex: 'prevMonthMarginRate', width: 100, align: 'center',
      render: (v: number) => v != null ? `${v.toFixed(1)}%` : '-',
    },
    { title: hdr('marginRateChange', '증감'), dataIndex: 'marginRateChange', width: 80, align: 'center',
      render: (v: number) => v != null ? (
        <span style={{ color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR, fontWeight: 600 }}>
          {v >= 0 ? '+' : ''}{v.toFixed(1)}%
        </span>
      ) : '-',
    },
    { title: hdr('remark', '비고'), dataIndex: 'remark', width: 120 },
  ];

  const excelColumns = [
    { header: '거래처명', key: 'vendorName' },
    { header: '부서명', key: 'departmentName' },
    { header: '매출액', key: 'orderAmount' },
    { header: '외주원가', key: 'outsourcingAmount' },
    { header: '마진액', key: 'marginAmount' },
    { header: '마진율', key: 'marginRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
    { header: '전월마진율', key: 'prevMonthMarginRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
    { header: '증감', key: 'marginRateChange', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
    { header: '비고', key: 'remark' },
  ];

  return (
    <PageLayout>
      <PageHeader title="거래처별 마진율" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }} />

      {/* 필터 — 한 줄에 세로 중앙정렬(마진율구간·VAT토글 높낮이 어긋남 방지). */}
      <Space wrap align="center" style={{ marginBottom: 16 }}>
        <Search
          placeholder="거래처 검색"
          allowClear
          style={{ width: 180 }}
          onSearch={setVendorKeyword}
        />
        <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
        <Select
          placeholder="팀 전체"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 140 }}
          value={teamCd}
          onChange={(v) => { setTeamCd(v); setPartCd(undefined); }}
          options={teamOptions}
        />
        <Select
          placeholder="파트 전체"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 182 }}
          value={partCd}
          onChange={setPartCd}
          disabled={!teamCd}
          options={partOptions}
        />
        <Select
          placeholder="마진율 구간"
          allowClear
          style={{ width: 130 }}
          value={marginRange}
          onChange={setMarginRange}
          options={MARGIN_RANGES}
        />
        <Radio.Group
          value={vatIncluded}
          onChange={(e) => setVatIncluded(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: 'VAT 제외', value: false },
            { label: 'VAT 포함', value: true },
          ]}
        />
        <ExcelDownloadBtn
          data={processedRows as unknown as Record<string, unknown>[]}
          columns={excelColumns}
          fileName={`거래처별마진_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`}
        />
      </Space>

      {/* 차트 */}
      <Card title="상위 10 거래처 매출 vs 외주원가" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
            <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`]} />
            <Legend />
            <Bar dataKey="매출액" fill="#1677ff" />
            <Bar dataKey="외주원가" fill="#ff7a45" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table
        className="vendor-margin-table"
        columns={columns}
        dataSource={processedRows}
        rowKey="vendorName"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `총 ${t}건` }}
        bordered
        size="middle"
        scroll={{ x: 1100 }}
      />
      <style>{`
        .vendor-margin-table .ant-table-column-sorters {
          justify-content: space-between;
        }
        .vendor-margin-table .ant-table-column-sorter {
          color: #0097a7;
          opacity: 1;
          margin-inline-start: 6px;
        }
        .vendor-margin-table .ant-table-column-sorter-up.active,
        .vendor-margin-table .ant-table-column-sorter-down.active {
          color: #0097a7;
        }
      `}</style>
    </PageLayout>
  );
};

export default VendorMarginPage;
