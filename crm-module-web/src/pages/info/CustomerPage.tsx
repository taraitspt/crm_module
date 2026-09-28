import { useMemo, useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Space, Typography, Select } from 'antd';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/table/DataTable';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { customerApi, lookupApi, type CustomerListItem } from '@/api/info.api';
import { HeaderCell, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const { Text } = Typography;

const columnHelper = createColumnHelper<CustomerListItem>();

// 헤더 정렬/필터 kit — 전부 텍스트 컬럼.
const CUST_COL_TYPES: Record<string, ColType> = {
  companyName: 'text', contactName: 'text', contactDept: 'text', contactPosition: 'text',
  contactEmail: 'text', contactPhone: 'text', partnerCd: 'text',
};

/** 프론트 ColFilter 맵 → 서버 전송용 JSON. (고객관리는 전 컬럼이 Oracle 컬럼과 1:1 이라 모두 지원) */
function toServerColFilters(filters: Record<string, ColFilter>) {
  const list = Object.entries(filters)
    .filter(([, f]) => isColFilterActive(f))
    .map(([colId, f]) => ({ colId, op: f.op, values: f.values, excludeBlank: f.excludeBlank }));
  return list.length ? JSON.stringify(list) : undefined;
}

export default function CustomerPage() {
  const [keyword] = useState('');
  const [filterPartnerCd, setFilterPartnerCd] = useState<string | undefined>();
  const [filterPartnerOptions, setFilterPartnerOptions] = useState<{ label: string; value: string }[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortCfg, setSortCfg] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});

  // ── 서버 페이징 (2026-09-01) ──
  //   전에는 size=100000 으로 전량을 받아 프론트에서 잘랐다(Oracle 대량 전송 → 목록 지연).
  //   페이지 크기만 요청하고 정렬·헤더필터도 Oracle 쿼리로 넘긴다.
  const searchParams = useMemo(() => ({
    keyword, partnerCd: filterPartnerCd,
    sortField: sortCfg?.field, sortDir: sortCfg?.dir,
    colFilters: toServerColFilters(colFilters),
    page, size: pageSize,
  }), [keyword, filterPartnerCd, sortCfg, colFilters, page, pageSize]);

  const { data, isFetching: isListLoading } = useQuery({
    queryKey: ['customers', searchParams],
    queryFn: () => customerApi.list(searchParams),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // 서버 페이징 — 응답이 곧 현재 페이지(정렬·필터도 서버에서 적용됨).
  const pageRows = useMemo(() => data?.data?.content ?? [], [data?.data?.content]);
  const totalCount = data?.data?.totalElements ?? 0;

  const toggleSort = (field: string) => {
    setPage(0);
    setSortCfg((prev) => (!prev || prev.field !== field) ? { field, dir: 'asc' } : prev.dir === 'asc' ? { field, dir: 'desc' } : null);
  };
  const applyColFilter = (colId: string, f: ColFilter) => { setColFilters((prev) => ({ ...prev, [colId]: f })); setPage(0); };
  const clearColFilter = (colId: string) => { setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; }); setPage(0); };
  const hdr = (colId: string, label: string) => () => (
    <HeaderCell colId={colId} label={label} type={CUST_COL_TYPES[colId]}
      filter={colFilters[colId]} sortDir={sortCfg?.field === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo(() => [
    columnHelper.accessor('companyName', { header: hdr('companyName', '거래처명') }),
    columnHelper.accessor('contactName', {
      header: hdr('contactName', '거래처담당자'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('contactDept', {
      header: hdr('contactDept', '부서'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('contactPosition', {
      header: hdr('contactPosition', '직책'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('contactEmail', {
      header: hdr('contactEmail', '이메일'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('contactPhone', {
      header: hdr('contactPhone', '연락처'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('partnerCd', {
      header: hdr('partnerCd', '거래처코드'),
      cell: (info) => <Text type="secondary" style={{ fontSize: 12 }}>{info.getValue() || '-'}</Text>,
    }),
  ], [colFilters, sortCfg]);

  const handleFilterPartnerSearch = async (value: string) => {
    try {
      const results = await lookupApi.searchPartners(value);
      setFilterPartnerOptions(results.map(p => ({ label: `${p.partnerNm} (${p.partnerCd})`, value: p.partnerCd })));
    } catch {
      setFilterPartnerOptions([]);
    }
  };

  useEffect(() => { handleFilterPartnerSearch(''); }, []);

  return (
    <PageLayout>
      <PageHeader title="고객관리" />

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          showSearch
          allowClear
          filterOption={false}
          placeholder="거래처 선택"
          style={{ width: 220 }}
          options={filterPartnerOptions}
          onSearch={handleFilterPartnerSearch}
          onChange={(v) => { setFilterPartnerCd(v); setPage(0); }}
        />
        {/*
        <Input.Search
          placeholder="거래처명, 거래처코드"
          allowClear
          style={{ width: 260 }}
          onSearch={(v) => { setKeyword(v); setPage(0); }}
        />
        */}
      </Space>

      <DataTable
        columns={columns}
        data={pageRows}
        loading={isListLoading}
        totalElements={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
      />
    </PageLayout>
  );
}
