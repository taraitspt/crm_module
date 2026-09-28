import React, { useState, useEffect, useMemo } from 'react';
import {
  Table, message, Tag, Space, Select, Input, Radio,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { getOrderMargin } from '@/api/stats.api';
import type { OrderMarginDto, OrderMarginRow } from '@/types/stats';
import { PageLayout, PageHeader } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { lookupApi } from '@/api/info.api';
import { useQuery } from '@tanstack/react-query';
import { HeaderCell, matchesFilter, compareVals, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';
import StatsDateRangePicker from './components/StatsDateRangePicker';

const { Search } = Input;

const fmtNum = (v: number | undefined) => v?.toLocaleString() ?? '-';
const POSITIVE_COLOR = '#cf1322';
const NEGATIVE_COLOR = '#1677ff';

// 헤더 정렬/필터 kit — 컬럼 타입.
const OM_COL_TYPES: Record<string, ColType> = {
  orderKey: 'text', salesDate: 'text', vendorName: 'text', departmentName: 'text',
  managerName: 'text', workName: 'text', orderAmount: 'amount', outsourcingAmount: 'amount',
  marginAmount: 'amount', marginRate: 'amount', remark: 'text',
};

const withOrderKeys = (payload: OrderMarginDto): OrderMarginDto => {
  const counts = new Map<string, number>();
  return {
    ...payload,
    orders: (payload.orders ?? []).map((row) => {
      if (row.orderKey && row.orderSq != null) return row;
      if (row.orderSq != null) {
        return { ...row, orderKey: `${row.orderNo}-${row.orderSq}` };
      }
      const nextSq = (counts.get(row.orderNo) ?? 0) + 1;
      counts.set(row.orderNo, nextSq);
      return { ...row, orderSq: nextSq, orderKey: `${row.orderNo}-${nextSq}` };
    }),
  };
};

const isExecutiveDept = (name?: string) => (name ?? '').trim() === '임원';

const MARGIN_RANGES = [
  { value: '', label: '전체' },
  { value: 'high', label: '30% 이상' },
  { value: 'mid', label: '15~30%' },
  { value: 'low', label: '15% 미만' },
  { value: 'loss', label: '적자' },
];

const OrderMarginPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);
  const [orderKeyword, setOrderKeyword] = useState<string>();
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [marginRange, setMarginRange] = useState<string>();
  const [vatIncluded, setVatIncluded] = useState(false);
  const [data, setData] = useState<OrderMarginDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortCfg, setSortCfg] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});

  // 부서 트리 (팀=상위부서, 파트=하위부서) — 거래처별/품목별 실적과 동일 구조.
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
        const { data: res } = await getOrderMargin(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
          orderKeyword,
          teamCd,
          partCd,
          marginRange,
          vatIncluded,
        );
        if (res.success) setData(withOrderKeys(res.data));
      } catch {
        message.error('데이터 조회 실패');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [dateRange, orderKeyword, teamCd, partCd, marginRange, vatIncluded]);

  // ── 헤더 정렬/필터 (전부 프론트 처리) ──
  const omGetVal = (row: OrderMarginRow, colId: string): string => {
    if (colId === 'orderKey') return row.orderKey || (row.orderSq != null ? `${row.orderNo}-${row.orderSq}` : row.orderNo) || '';
    const v = (row as unknown as Record<string, unknown>)[colId];
    return v == null ? '' : String(v);
  };
  const processedRows = useMemo(() => {
    let rows = data?.orders ?? [];
    const activeCols = Object.entries(colFilters).filter(([, f]) => isColFilterActive(f));
    if (activeCols.length) rows = rows.filter((r) => activeCols.every(([colId, f]) => matchesFilter(omGetVal(r, colId), OM_COL_TYPES[colId], f)));
    if (sortCfg) {
      const { field, dir } = sortCfg; const type = OM_COL_TYPES[field];
      rows = [...rows].sort((a, b) => { const cmp = compareVals(omGetVal(a, field), omGetVal(b, field), type); return dir === 'desc' ? -cmp : cmp; });
    }
    return rows;
  }, [data, colFilters, sortCfg]);

  const toggleSort = (field: string) => setSortCfg((prev) => (!prev || prev.field !== field) ? { field, dir: 'asc' } : prev.dir === 'asc' ? { field, dir: 'desc' } : null);
  const applyColFilter = (colId: string, f: ColFilter) => setColFilters((prev) => ({ ...prev, [colId]: f }));
  const clearColFilter = (colId: string) => setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; });
  const hdr = (colId: string, label: string) => (
    <HeaderCell colId={colId} label={label} type={OM_COL_TYPES[colId]}
      filter={colFilters[colId]} sortDir={sortCfg?.field === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns: ColumnsType<OrderMarginRow> = [
    { title: hdr('orderKey', '주문번호-순번'), dataIndex: 'orderKey', width: 180,
      render: (_: unknown, row) => row.orderKey || (row.orderSq != null ? `${row.orderNo}-${row.orderSq}` : row.orderNo),
    },
    { title: hdr('salesDate', '매출일'), dataIndex: 'salesDate', width: 110 },
    { title: hdr('vendorName', '거래처명'), dataIndex: 'vendorName', width: 140 },
    { title: hdr('departmentName', '영업부서'), dataIndex: 'departmentName', width: 110 },
    { title: hdr('managerName', '담당자'), dataIndex: 'managerName', width: 90 },
    { title: hdr('workName', '작업명'), dataIndex: 'workName', width: 160, ellipsis: true },
    { title: hdr('orderAmount', '매출액'), dataIndex: 'orderAmount', width: 120, align: 'right', render: fmtNum },
    { title: hdr('outsourcingAmount', '외주원가'), dataIndex: 'outsourcingAmount', width: 120, align: 'right', render: fmtNum },
    { title: hdr('marginAmount', '마진액'), dataIndex: 'marginAmount', width: 120, align: 'right',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR, fontWeight: 500 }}>
          {fmtNum(v)}
        </span>
      ),
    },
    { title: hdr('marginRate', '마진율'), dataIndex: 'marginRate', width: 90, align: 'center',
      render: (v: number) => (
        <Tag color={v >= 0 ? 'red' : 'blue'}>
          {v?.toFixed(1)}%
        </Tag>
      ),
    },
    { title: hdr('remark', '비고'), dataIndex: 'remark', width: 100 },
  ];

  const excelColumns = [
    { header: '주문번호-순번', key: 'orderKey' },
    { header: '매출일', key: 'salesDate' },
    { header: '거래처명', key: 'vendorName' },
    { header: '영업부서', key: 'departmentName' },
    { header: '담당자', key: 'managerName' },
    { header: '작업명', key: 'workName' },
    { header: '매출액', key: 'orderAmount' },
    { header: '외주원가', key: 'outsourcingAmount' },
    { header: '마진액', key: 'marginAmount' },
    { header: '마진율', key: 'marginRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
    { header: '비고', key: 'remark' },
  ];

  return (
    <PageLayout>
      <PageHeader title="주문건별 외주 마진율" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }} />

      {/* 필터 — 한 줄에 세로 중앙정렬(마진율구간·VAT토글 높낮이 어긋남 방지). */}
      <Space wrap align="center" style={{ marginBottom: 16 }}>
        <Search
          placeholder="주문번호 검색"
          allowClear
          style={{ width: 200 }}
          onSearch={setOrderKeyword}
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
          fileName={`주문별마진_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={processedRows}
        rowKey={(row) => row.orderKey || (row.orderSq != null ? `${row.orderNo}-${row.orderSq}` : row.orderNo)}
        loading={loading}
        bordered
        size="middle"
        scroll={{ x: 1300 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `총 ${t}건` }}
      />
    </PageLayout>
  );
};

export default OrderMarginPage;
