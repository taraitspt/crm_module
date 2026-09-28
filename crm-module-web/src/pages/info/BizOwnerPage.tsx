import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Button, Input, Select, Space, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/table/DataTable';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { bizOwnerApi } from '@/api/info.api';
import type { BizOwnerListItem } from '@/types/info';
import { HeaderCell, isColFilterActive, type ColFilter, type ColType } from '@/components/table/columnFilterKit';

const columnHelper = createColumnHelper<BizOwnerListItem>();

const fmtDate = (v: string) => v ? v.slice(0, 10) : '';

// 헤더 정렬/필터 kit — 전부 텍스트 컬럼.
const BIZ_COL_TYPES: Record<string, ColType> = {
  companyName: 'text', bizNo: 'text', ceoNm: 'text', bizType: 'text', bizItem: 'text',
  address: 'text', departmentName: 'text', partnerCd: 'text', createdAt: 'text', updatedAt: 'text',
};

/** 서버(Oracle)가 정렬·필터를 지원하는 컬럼.
 *  담당부서·등록일·수정일은 MySQL(BusinessOwner) 값으로 override 될 수 있어
 *  Oracle 기준으로 거르면 화면 표시값과 어긋난다 → 서버 미지원(헤더에서 숨김). */
const BIZ_SERVER_COLS = new Set([
  'companyName', 'bizNo', 'ceoNm', 'bizType', 'bizItem', 'address', 'partnerCd',
]);

/** 프론트 ColFilter 맵 → 서버 전송용 JSON. 서버 미지원 컬럼은 제외. */
function toServerColFilters(filters: Record<string, ColFilter>) {
  const list = Object.entries(filters)
    .filter(([colId, f]) => BIZ_SERVER_COLS.has(colId) && isColFilterActive(f))
    .map(([colId, f]) => ({ colId, op: f.op, values: f.values, excludeBlank: f.excludeBlank }));
  return list.length ? JSON.stringify(list) : undefined;
}

const PLANT_OPTIONS = [
  { value: 1000, label: 'TPS' },
  { value: 2000, label: 'GRP' },
  { value: 3000, label: 'PM' },
];

const EXCEL_COLS = [
  { header: '거래처명',    key: 'companyName',    width: 28 },
  { header: '사업자번호', key: 'bizNo',          width: 18 },
  { header: '대표자',    key: 'ceoNm',          width: 14 },
  { header: '업태',      key: 'bizType',        width: 12 },
  { header: '종목',      key: 'bizItem',        width: 12 },
  { header: '주소',      key: 'address',        width: 36 },
  { header: '담당부서',   key: 'departmentName', width: 18 },
  { header: '거래처코드', key: 'partnerCd',      width: 18 },
  { header: '등록일',    key: 'createdAt',      width: 14 },
  { header: '수정일',    key: 'updatedAt',      width: 14 },
] as const;

export default function BizOwnerPage() {
  const navigate = useNavigate();
  // 공장 기본값 = 전체(undefined). 특정 공장(GRP 2000 등)만 등록된 거래처가 기본조회에서 빠지는 것 방지.
  const [plantCd, setPlantCd] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [isExporting, setIsExporting] = useState(false);
  const [sortCfg, setSortCfg] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, ColFilter>>({});

  // ── 서버 페이징 (2026-09-01) ──
  //   전에는 size=100000 으로 전량(약 1만 건)을 받아 프론트에서 잘랐다. 그 탓에
  //     · Oracle 에서 1만 행 전송
  //     · 최근주문일 조회가 partner_cd IN (1만 개) 로 MySQL 에 전송
  //   이 매번 일어나 목록이 5초 이상 걸렸다. 페이지 크기만 요청해 둘 다 20건 규모로 줄인다.
  const searchParams = useMemo(() => ({
    plantCd, keyword,
    sortField: sortCfg?.field, sortDir: sortCfg?.dir,
    colFilters: toServerColFilters(colFilters),
    page, size: pageSize,
  }), [plantCd, keyword, sortCfg, colFilters, page, pageSize]);

  const { data, isFetching: isListLoading } = useQuery({
    queryKey: ['bizOwners', searchParams],
    queryFn: () => bizOwnerApi.list(searchParams),
    // 페이지 이동 중 표가 접히지 않게 이전 페이지 유지 + 같은 페이지 재방문은 1분 캐시.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const handlePageChange = (newPage: number, newSize: number) => {
    setPage(newPage);
    setPageSize(newSize);
  };

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
    <HeaderCell colId={colId} label={label} type={BIZ_COL_TYPES[colId]}
      filter={colFilters[colId]} sortDir={sortCfg?.field === colId ? sortCfg.dir : undefined}
      sortable={BIZ_SERVER_COLS.has(colId)} filterable={BIZ_SERVER_COLS.has(colId)}
      onToggleSort={() => toggleSort(colId)} onApply={applyColFilter} onClear={clearColFilter} />
  );

  const columns = useMemo(() => [
    columnHelper.accessor('companyName',    { header: hdr('companyName', '거래처명'),    size: 160 }),
    columnHelper.accessor('bizNo',          { header: hdr('bizNo', '사업자번호'), size: 120 }),
    columnHelper.accessor('ceoNm',          { header: hdr('ceoNm', '대표자'),    size: 90 }),
    columnHelper.accessor('bizType',        { header: hdr('bizType', '업태'),      size: 70 }),
    columnHelper.accessor('bizItem',        { header: hdr('bizItem', '종목'),      size: 70 }),
    columnHelper.accessor('address',        { header: hdr('address', '주소'),      size: 180 }),
    columnHelper.accessor('departmentName', { header: hdr('departmentName', '담당부서'),   size: 110 }),
    columnHelper.accessor('partnerCd',      { header: hdr('partnerCd', '거래처코드'), size: 110 }),
    columnHelper.accessor('createdAt',      { header: hdr('createdAt', '등록일'),    size: 100, cell: (i) => fmtDate(i.getValue()) }),
    columnHelper.accessor('updatedAt',      { header: hdr('updatedAt', '수정일'),    size: 100, cell: (i) => fmtDate(i.getValue()) }),
  ], [colFilters, sortCfg]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 엑셀은 화면 페이지가 아니라 '조회조건+헤더필터에 맞는 전체'를 내려받는다(정렬도 화면과 동일).
      const res = await bizOwnerApi.list({ ...searchParams, page: 0, size: 99999 });
      const rows: BizOwnerListItem[] = res?.data?.content ?? [];
      if (rows.length === 0) { message.warning('다운로드할 데이터가 없습니다.'); return; }

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('사업자관리');

      ws.columns = EXCEL_COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));

      // 헤더 행 스타일
      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      headerRow.height = 22;

      // 데이터 행
      rows.forEach(r => {
        ws.addRow({
          companyName:    r.companyName    ?? '',
          bizNo:          r.bizNo          ?? '',
          ceoNm:          r.ceoNm          ?? '',
          bizType:        r.bizType        ?? '',
          bizItem:        r.bizItem        ?? '',
          address:        r.address        ?? '',
          departmentName: r.departmentName ?? '',
          partnerCd:      r.partnerCd      ?? '',
          createdAt:      fmtDate(r.createdAt ?? ''),
          updatedAt:      fmtDate(r.updatedAt ?? ''),
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '사업자관리.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      message.success(`${rows.length}건 다운로드 완료`);
    } catch {
      message.error('엑셀 다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageLayout>
      <PageHeader title="사업자관리" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Select
            placeholder="공장 전체"
            value={plantCd}
            allowClear
            style={{ width: 160 }}
            onChange={(v) => { setPlantCd(v); setPage(0); }}
            options={PLANT_OPTIONS}
          />
          <Input.Search
            placeholder="거래처명"
            allowClear
            style={{ width: 300 }}
            onSearch={(v) => { setKeyword(v); setPage(0); }}
          />
        </Space>
        <Button icon={<DownloadOutlined />} onClick={handleExport} loading={isExporting}>
          엑셀다운로드
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={pageRows}
        loading={isListLoading}
        totalElements={totalCount}
        page={page}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onRowClick={(row) => { if (row.id) navigate(`/info/biz-owners/${row.id}`); }}
        scroll={{}}
      />
    </PageLayout>
  );
}
