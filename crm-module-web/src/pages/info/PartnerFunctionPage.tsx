import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Input, Space, Typography } from 'antd';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/table/DataTable';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusDot from '@/components/common/StatusDot';
import { partnerFunctionApi, type PartnerFunctionListItem } from '@/api/info.api';
import { HeaderCell, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const { Text } = Typography;

const columnHelper = createColumnHelper<PartnerFunctionListItem>();

// 헤더 정렬/필터 kit — defaultYn 만 enum(Y/N), 나머지 텍스트.
const PF_COL_TYPES: Record<string, ColType> = {
  partnerCd: 'text', partnerNm: 'text', partnerBpDeptName: 'text', partnerBpName: 'text', defaultYn: 'enum',
};
const PF_ENUM_OPTS: Record<string, { label: string; value: string }[]> = {
  defaultYn: [{ label: 'Y', value: 'Y' }, { label: 'N', value: 'N' }],
};

/** 프론트 ColFilter 맵 → 서버 전송용 JSON. (전 컬럼이 Oracle 컬럼과 1:1 이라 모두 지원) */
function toServerColFilters(filters: Record<string, ColFilter>) {
  const list = Object.entries(filters)
    .filter(([, f]) => isColFilterActive(f))
    .map(([colId, f]) => ({ colId, op: f.op, values: f.values, excludeBlank: f.excludeBlank }));
  return list.length ? JSON.stringify(list) : undefined;
}

export default function PartnerFunctionPage() {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortCfg, setSortCfg] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});

  // ── 서버 페이징 (2026-09-01) ──
  //   전에는 size=100000 으로 전량을 받아 프론트에서 잘랐다. 페이지 크기만 요청하고
  //   정렬·헤더필터도 Oracle 쿼리로 넘긴다. (백엔드는 이미 ROW_NUMBER 페이징 지원)
  const searchParams = useMemo(() => ({
    keyword: keyword || undefined,
    sortField: sortCfg?.field, sortDir: sortCfg?.dir,
    colFilters: toServerColFilters(colFilters),
    page, size: pageSize,
  }), [keyword, sortCfg, colFilters, page, pageSize]);

  const { data, isFetching: isListLoading } = useQuery({
    queryKey: ['partner-functions', searchParams],
    queryFn: () => partnerFunctionApi.list(searchParams),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // 서버 페이징 — 응답이 곧 현재 페이지(정렬·필터도 서버에서 적용됨).
  const pageRows = useMemo(() => data?.data?.content ?? [], [data?.data?.content]);
  const totalCount = data?.data?.totalElements ?? 0;

  const toggleSort = (field: string) => { setPage(0); setSortCfg((prev) => (!prev || prev.field !== field) ? { field, dir: 'asc' } : prev.dir === 'asc' ? { field, dir: 'desc' } : null); };
  const applyColFilter = (colId: string, f: ColFilter) => { setColFilters((prev) => ({ ...prev, [colId]: f })); setPage(0); };
  const clearColFilter = (colId: string) => { setColFilters((prev) => { const n = { ...prev }; delete n[colId]; return n; }); setPage(0); };
  const hdr = (colId: string, label: string) => () => (
    <HeaderCell colId={colId} label={label} type={PF_COL_TYPES[colId]} enumOptions={PF_ENUM_OPTS[colId]}
      filter={colFilters[colId]} sortDir={sortCfg?.field === colId ? sortCfg.dir : undefined}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo(() => [
    columnHelper.accessor('partnerCd', {
      header: hdr('partnerCd', '거래처코드'),
      cell: (info) => <Text strong>{info.getValue() || '-'}</Text>,
    }),
    columnHelper.accessor('partnerNm', {
      header: hdr('partnerNm', '거래처명'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('partnerBpDeptName', {
      header: hdr('partnerBpDeptName', '영업담당부서'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('partnerBpName', {
      header: hdr('partnerBpName', '영업담당자명'),
      cell: (info) => info.getValue() || '-',
    }),
    columnHelper.accessor('defaultYn', {
      header: hdr('defaultYn', '기본'),
      cell: (info) => {
        const value = info.getValue() || 'N';
        return <StatusDot label={value} color={value === 'Y' ? 'green' : 'default'} />;
      },
    }),
  ], [colFilters, sortCfg]);

  return (
    <PageLayout>
      <PageHeader title="영업담당자관리" />

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="거래처코드, 거래처명, 영업담당자, 영업담당부서"
          allowClear
          style={{ width: 300 }}
          onSearch={(v) => { setKeyword(v); setPage(0); }}
        />
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
