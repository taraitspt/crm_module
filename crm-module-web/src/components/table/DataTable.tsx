import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Table, TableProps, theme, Pagination, Popover, Checkbox, Button } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';

const { useToken } = theme;

// 컬럼 너비 드래그 리사이즈용 헤더 셀 — 오른쪽 가장자리 8px 핸들을 잡고 드래그하면 너비 변경.
//   width/onResize 가 없으면(체크박스 등) 일반 <th> 로 렌더.
const ResizableTitle: React.FC<
  React.HTMLAttributes<HTMLTableCellElement> & { onResize?: (w: number) => void; width?: number }
> = (props) => {
  const { onResize, width, children, style, ...rest } = props;
  if (!width || !onResize) return <th {...rest} style={style}>{children}</th>;
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => onResize(Math.max(80, startW + (ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  return (
    <th {...rest} style={{ ...style, position: 'relative' }}>
      {children}
      <span
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, height: '100%', width: 8,
          cursor: 'col-resize', userSelect: 'none', touchAction: 'none', zIndex: 2,
        }}
      />
    </th>
  );
};

interface DataTableProps<T> {
  /** TanStack Table 컬럼 정의 */
  columns: ColumnDef<T, any>[];
  /** 테이블 데이터 */
  data: T[];
  /** 로딩 상태 */
  loading?: boolean;
  /** 총 데이터 건수 (서버 페이징 시) */
  totalElements?: number;
  /** 현재 페이지 (0-based) */
  page?: number;
  /** 페이지 크기 */
  pageSize?: number;
  /** 페이지 변경 핸들러 */
  onPageChange?: (page: number, pageSize: number) => void;
  /** 페이지당 표시 건수 선택지 (화면별 확장용) */
  pageSizeOptions?: Array<string | number>;
  /** 정렬 상태 */
  sorting?: SortingState;
  /** 정렬 변경 핸들러 */
  onSortingChange?: (sorting: SortingState) => void;
  /** 행 클릭 핸들러 */
  onRowClick?: (record: T) => void;
  /** Ctrl+클릭·미들클릭 시 새 탭으로 열 URL 반환 함수 */
  getRowHref?: (record: T) => string;
  /** 행 키 추출 함수 */
  rowKey?: (record: T) => string | number;
  /** 스크롤 설정 */
  scroll?: TableProps<T>['scroll'];
  /** 하단 요약 행 렌더링 */
  summary?: TableProps<T>['summary'];
  /** 페이지네이션 왼쪽에 표시할 보조 정보 */
  paginationLeft?: React.ReactNode;
  /** 행 선택 (체크박스) - 선택된 키 배열 */
  selectedRowKeys?: React.Key[];
  /** 행 선택 변경 핸들러 */
  onSelectedRowKeysChange?: (keys: React.Key[], rows: T[]) => void;
  /** 행별 커스텀 className 반환. rowClassName 에 합산된다. */
  getRowClassName?: (record: T) => string;
  /** columnId → onCell 핸들러 맵. rowSpan 셀 병합 등에 사용. meta.onCell 보다 우선 적용. */
  onCellHandlers?: Record<string, (record: T, index?: number) => React.TdHTMLAttributes<any>>;
  /** true 면 헤더 오른쪽 가장자리를 드래그해 컬럼 너비 조절 가능(size 지정된 컬럼만). */
  resizableColumns?: boolean;
  /** true 면 우상단 ⚙️로 컬럼 표시/숨김 선택 가능(개인별 localStorage 저장). */
  columnChooser?: boolean;
  /** 표 위 툴바 왼쪽 영역 — 선택 요약 칩 등. 컬럼 설정(⚙️)과 같은 줄에 놓인다. */
  toolbarLeft?: React.ReactNode;
}

/**
 * 공용 데이터 테이블 컴포넌트.
 * TanStack Table의 컬럼 정의를 Ant Design Table에 매핑하여 렌더링한다.
 */
function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  totalElements,
  page = 0,
  pageSize = 10,
  onPageChange,
  pageSizeOptions = [10, 20, 50, 100],
  sorting,
  onSortingChange,
  onRowClick,
  getRowHref,
  rowKey,
  scroll,
  summary,
  paginationLeft,
  selectedRowKeys,
  onSelectedRowKeysChange,
  getRowClassName,
  onCellHandlers,
  resizableColumns = true,
  columnChooser = true,
  toolbarLeft,
}: DataTableProps<T>) {
  const { token } = useToken();
  // 컬럼별 사용자 조절 너비(columnId → px). 컬럼 구성 시그니처를 키로 localStorage 에 저장 → 개인별(브라우저) 최근값 복원.
  const resizeStorageKey = useMemo(
    () => 'sm-coltbl-w:' + (columns as any[]).map((c) => c.id ?? c.accessorKey ?? '').join('|'),
    [columns],
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try { const raw = localStorage.getItem(resizeStorageKey); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(resizeStorageKey, JSON.stringify(colWidths)); } catch { /* 저장 실패 무시 */ }
  }, [resizeStorageKey, colWidths]);
  // 컬럼 표시/숨김(columnId → hidden). 같은 시그니처 키로 localStorage 저장 → 개인별 복원.
  const hideStorageKey = 'sm-coltbl-hidden:' + resizeStorageKey.slice('sm-coltbl-w:'.length);
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem(hideStorageKey); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(hideStorageKey, JSON.stringify(hiddenCols)); } catch { /* 무시 */ }
  }, [hideStorageKey, hiddenCols]);
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const effectiveSorting = sorting ?? internalSorting;

  // TanStack Table 인스턴스
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: effectiveSorting,
      ...(onPageChange && { pagination: { pageIndex: 0, pageSize: Math.max(data.length, 1) } }),
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(effectiveSorting) : updater;
      if (onSortingChange) onSortingChange(newSorting);
      else setInternalSorting(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: !!onPageChange,
    manualSorting: !!onSortingChange,
  });

  // 행 키 추출 헬퍼
  const getRowKey = (record: T): React.Key => {
    if (rowKey) return rowKey(record);
    const r = record as Record<string, unknown>;
    // 안정적인 키: id > salesNo > poNo > orderNo > index
    // (Math.random은 매 render마다 새 키를 만들어 selection이 깨짐)
    if (r.id !== undefined && r.id !== null) return String(r.id);
    if (typeof r.salesNo === 'string') return r.salesNo;
    if (typeof r.poNo === 'string') return r.poNo;
    if (typeof r.orderNo === 'string') return r.orderNo;
    const idx = data.indexOf(record);
    return `__row_${idx}`;
  };

  // 페이지를 넘나들며 선택한 행을 유지하기 위해 본 적 있는 행을 key→row 로 누적.
  // (기존엔 onChange 의 newRows 를 현재 페이지 data 에서만 필터해, 이전 페이지에서 고른
  //  선택분이 rows 에서 누락됐다 — 통합발행 동일거래처 판정/건수가 페이지 교차 시 깨지던 원인.)
  const seenRowsRef = useRef<Map<React.Key, T>>(new Map());
  useEffect(() => {
    for (const r of data) seenRowsRef.current.set(getRowKey(r), r);
  }, [data]);
  const rowsForKeys = (keys: React.Key[]): T[] =>
    keys.map((k) => seenRowsRef.current.get(k)).filter((r): r is T => r != null);

  // TanStack 컬럼 → Ant Design 컬럼 변환 + 선택 체크박스 컬럼 prepend
  const antColumns = useMemo(() => {
    const dataCols = table.getAllColumns().filter((col) => !hiddenCols[col.id]).map((col) => ({
      key: col.id,
      title: col.columnDef.header
        ? flexRender(col.columnDef.header, { column: col, table } as any)
        : col.id,
      dataIndex: col.id,
      width: (resizableColumns && colWidths[col.id]) || col.columnDef.size,
      onHeaderCell: (resizableColumns && col.columnDef.size)
        ? () => ({
            width: colWidths[col.id] || col.columnDef.size,
            onResize: (w: number) => setColWidths((prev) => ({ ...prev, [col.id]: w })),
          })
        : undefined,
      // 컬럼 정렬 — columnDef.meta.align 지정 시 헤더·본문에 적용(금액 우측정렬 등). 미지정 컬럼은 무영향.
      align: (col.columnDef.meta as any)?.align as ('left' | 'right' | 'center' | undefined),
      sorter: !!onSortingChange && col.getCanSort(),
      sortOrder: col.getIsSorted()
        ? col.getIsSorted() === 'asc' ? 'ascend' as const : 'descend' as const
        : undefined,
      onCell: (record: T, index?: number) => {
        if (onCellHandlers?.[col.id]) return onCellHandlers[col.id](record, index);
        const colDef = col.columnDef as any;
        if (colDef.onCell) return colDef.onCell(record, index);
        if (colDef.meta?.onCell) return colDef.meta.onCell(record, index);
        return {};
      },
      render: (_: unknown, _record: T, index: number) => {
        const row = table.getRowModel().rows[index];
        if (!row) return null;
        const cell = row.getAllCells().find((c) => c.column.id === col.id);
        if (!cell) return null;
        const rawValue = cell.getValue();
        const tooltipTitle = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : undefined;
        const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
        // meta.noCellTooltip — 셀이 자체 툴팁을 그리는 컬럼은 공통 원본값 툴팁을 생략한다.
        const noCellTooltip = (cell.column.columnDef.meta as any)?.noCellTooltip;
        // 성능: 셀마다 AntD <Tooltip>(행×열 = 수만 개)을 렌더하면 500/1000행에서 매우 느림.
        //   동일 UX(마우스 오버 시 전체 텍스트)를 네이티브 title 속성으로 대체 → React 컴포넌트 비용 0.
        return (
          <div
            title={noCellTooltip ? undefined : tooltipTitle}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {rendered}
          </div>
        );
      },
    }));

    if (!onSelectedRowKeysChange) return dataCols;

    const allKeys = data.map(getRowKey);
    const selectedSet = new Set(selectedRowKeys || []);
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
    const someSelected = allKeys.some((k) => selectedSet.has(k)) && !allSelected;

    // 클릭 가능 영역을 셀 전체로 확장하기 위한 wrapper. 체크박스 자체(16x16)는 작아서 padding(14×16) 영역
    // 클릭 시 부모 td onRow 핸들러가 행 클릭으로 오인하는 회귀가 있었음. label 로 감싸 padding 까지 click target 으로 흡수.
    const cellWrapStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', cursor: 'pointer',
      position: 'relative', zIndex: 1,
    };
    const stopAll = (e: React.MouseEvent | React.SyntheticEvent) => e.stopPropagation();

    const checkboxCol = {
      key: '__checkbox__',
      dataIndex: '__checkbox__',
      width: 40,
      // #382 — 가로 스크롤과 무관하게 체크박스 열을 왼쪽에 고정(전 목록 공통).
      fixed: 'left' as const,
      title: (
        <label style={cellWrapStyle} onClick={stopAll}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onClick={stopAll}
            onChange={(e) => {
              // ★헤더 전체선택은 '현재 페이지'에만 작용한다 — 다른 페이지에서 고른 건은 건드리지 않는다.
              //   (종전엔 현재 페이지 키로 통째 덮어써서, 2페이지에서 전체선택하면 1페이지 선택이 사라졌다.
              //    서버 페이징 전환 후 여러 페이지 선택이 일괄 처리에 함께 들어가므로 유실이 곧 사고다. 2026-09-04)
              const prev = selectedRowKeys || [];
              const pageKeySet = new Set(allKeys);
              const next = e.target.checked
                ? [...prev.filter((k) => !pageKeySet.has(k)), ...allKeys]   // 현재 페이지분 추가
                : prev.filter((k) => !pageKeySet.has(k));                    // 현재 페이지분만 해제
              for (const r of data) seenRowsRef.current.set(getRowKey(r), r);
              onSelectedRowKeysChange(next, rowsForKeys(next));
            }}
            style={{ cursor: 'pointer', width: 16, height: 16, pointerEvents: 'auto' }}
          />
        </label>
      ),
      sorter: false,
      onCell: () => ({
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        style: { cursor: 'pointer' as const },
      }),
      render: (_: unknown, record: T) => {
        const k = getRowKey(record);
        return (
          <label style={cellWrapStyle} onClick={stopAll}>
            <input
              type="checkbox"
              checked={selectedSet.has(k)}
              onClick={stopAll}
              onChange={(e) => {
                const newKeys = e.target.checked
                  ? [...(selectedRowKeys || []), k]
                  : (selectedRowKeys || []).filter((x) => x !== k);
                // 현재 행을 맵에 보장 후, 전체 선택키에 대응하는 행을 누적 맵에서 복원
                // (현재 페이지 data 로만 필터하면 이전 페이지 선택분이 빠진다).
                seenRowsRef.current.set(k, record);
                onSelectedRowKeysChange(newKeys, rowsForKeys(newKeys));
              }}
              style={{ cursor: 'pointer', width: 16, height: 16, pointerEvents: 'auto' }}
            />
          </label>
        );
      },
    };

    return [checkboxCol, ...dataCols];
  }, [table, sorting, selectedRowKeys, data, onSelectedRowKeysChange, onCellHandlers, colWidths, resizableColumns, hiddenCols]);

  // 컬럼 선택기용 라벨 — meta.headerLabel → 문자열 header → HeaderCell(label prop, 함수형 헤더 포함) → col.id.
  const resolveColLabel = (col: any): string => {
    const meta = col.columnDef.meta;
    if (meta?.headerLabel) return String(meta.headerLabel);
    const h = col.columnDef.header;
    if (typeof h === 'string') return h;
    try {
      const el: any = typeof h === 'function' ? h({ column: col, table }) : h;
      if (typeof el?.props?.label === 'string') return el.props.label;
      if (typeof el?.props?.children === 'string') return el.props.children;
    } catch { /* 헤더 렌더 실패 시 폴백 */ }
    return col.id;
  };

  return (
    <div className="modern-table-container">
      {/* 표 위 툴바 — 왼쪽은 선택 요약 등 보조 정보, 오른쪽은 컬럼 설정(⚙️).
          둘 중 하나만 있어도 같은 줄을 쓰도록 한 곳에서 렌더한다. */}
      {(columnChooser || toolbarLeft) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginBottom: 6, minHeight: toolbarLeft ? 32 : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{toolbarLeft}</div>
          {columnChooser ? (
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ maxHeight: 340, overflowY: 'auto', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {table.getAllColumns().map((col) => {
                  const label = resolveColLabel(col);
                  return (
                    <Checkbox
                      key={col.id}
                      checked={!hiddenCols[col.id]}
                      onChange={(e) => setHiddenCols((prev) => ({ ...prev, [col.id]: !e.target.checked }))}
                    >
                      {label}
                    </Checkbox>
                  );
                })}
              </div>
            }
          >
            <Button size="small" icon={<SettingOutlined />}>컬럼</Button>
          </Popover>
          ) : <span />}
        </div>
      )}
      <Table
        columns={antColumns}
        components={resizableColumns ? { header: { cell: ResizableTitle as any } } : undefined}
        dataSource={data}
        loading={loading}
        rowKey={(record: T) => String(getRowKey(record))}
        scroll={{ x: scroll?.x ?? 'max-content', y: scroll?.y ?? 'calc(100vh - 340px)' }}
        summary={summary}
        rowClassName={(record: T) => [
          (selectedRowKeys || []).includes(getRowKey(record)) ? 'ant-table-row-selected' : '',
          getRowClassName?.(record) ?? '',
        ].filter(Boolean).join(' ')}
        onRow={(onRowClick || getRowHref) ? (record) => ({
          onClick: (e: React.MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('input, button, .ant-checkbox-wrapper, .ant-checkbox, .ant-select, .ant-select-selector, .ant-select-item, .ant-picker, label')) return;
            if (e.shiftKey && getRowHref) {
              e.preventDefault();
              window.open(getRowHref(record), '_blank', 'popup=yes,width=1400,height=900,noopener,noreferrer');
              return;
            }
            if ((e.ctrlKey || e.metaKey) && getRowHref) {
              e.preventDefault();
              window.open(getRowHref(record), '_blank');
              return;
            }
            onRowClick?.(record);
          },
          onAuxClick: (e: React.MouseEvent) => {
            if (e.button === 1 && getRowHref) {
              e.preventDefault();
              window.open(getRowHref(record), '_blank');
            }
          },
          style: { cursor: 'pointer' },
        }) : undefined}
        pagination={
          onPageChange
            ? false
            : {
                pageSize,
                showSizeChanger: true,
              }
        }
        size="small"
        bordered={false}
      />
      {onPageChange && (
        <div className="modern-table-pagination">
          {paginationLeft && (
            <div className="modern-table-pagination-left">
              {paginationLeft}
            </div>
          )}
          <Pagination
            current={page + 1}
            pageSize={pageSize}
            total={totalElements}
            showSizeChanger
            showTotal={(total) => `Total ${total} items`}
            pageSizeOptions={pageSizeOptions.map(String)}
            onChange={(newPage, newSize) => onPageChange(newPage - 1, newSize)}
          />
        </div>
      )}
      <style>{`
        /* 테크니컬 고밀도 리스트 — 구조 유지, 시각 폴리시(여백 리듬·소프트 코너·브랜드 hover·옅은 zebra). */
        .modern-table-container {
          background: ${token.colorBgContainer};
          border-radius: 10px;
          padding: 0;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.03);
          border: 1px solid ${token.colorBorder};
          overflow: hidden;
        }
        .ant-table {
          background: transparent !important;
          font-variant-numeric: tabular-nums;
        }
        .ant-table table {
          table-layout: fixed !important;
        }
        .ant-table-thead > tr > th {
          background: ${token.colorFillQuaternary} !important;
          color: ${token.colorTextTertiary} !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.03em !important;
          border-bottom: 1px solid ${token.colorBorder} !important;
          padding: 10px 14px !important;
          white-space: nowrap !important;
        }
        .ant-table-thead > tr > th::before { display: none !important; }
        /* 좌우 끝 셀 — 컨테이너 가장자리 숨쉴 공간 */
        .ant-table-thead > tr > th:first-child,
        .ant-table-tbody > tr > td:first-child { padding-left: 18px !important; }
        .ant-table-thead > tr > th:last-child,
        .ant-table-tbody > tr > td:last-child { padding-right: 18px !important; }
        .ant-table-tbody > tr > td {
          border-bottom: 1px solid ${token.colorBorderSecondary} !important;
          padding: 9px 14px !important;
          font-size: 13px;
          line-height: 1.5;
          color: ${token.colorText};
          transition: background-color 0.15s ease;
        }
        /* 아주 옅은 zebra — 스캔성↑ (헤어라인과 함께 과하지 않게) */
        .ant-table-tbody > tr:nth-child(even) > td { background: rgba(16, 24, 40, 0.014); }
        .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
        /* 행 hover — 회색 대신 브랜드 teal 틴트 */
        .ant-table-tbody > tr:hover > td {
          background: rgba(13, 148, 136, 0.05) !important;
        }
        .ant-table-row-selected > td {
          background: ${token.colorPrimaryBg} !important;
          box-shadow: inset 2px 0 0 ${token.colorPrimary};
        }

        /* 고정(sticky) 셀 배경 — 체크박스 열 고정(#382) 후, 셀에 불투명 배경이 없어 가로 스크롤 시
           뒤 내용이 비쳐 보였다. 위 zebra/hover 틴트가 반투명이라 그대로 두면 겹쳐 보이므로,
           불투명 배경을 깔고 같은 틴트를 그 위에 다시 얹어(gradient 레이어) 색을 정확히 맞춘다. */
        .ant-table-thead > tr > th.ant-table-cell-fix-left,
        .ant-table-thead > tr > th.ant-table-cell-fix-right {
          background: linear-gradient(${token.colorFillQuaternary}, ${token.colorFillQuaternary}), ${token.colorBgContainer} !important;
        }
        .ant-table-tbody > tr > td.ant-table-cell-fix-left,
        .ant-table-tbody > tr > td.ant-table-cell-fix-right,
        .ant-table-summary > tr > td.ant-table-cell-fix-left,
        .ant-table-summary > tr > td.ant-table-cell-fix-right {
          background: ${token.colorBgContainer} !important;
        }
        .ant-table-tbody > tr:nth-child(even) > td.ant-table-cell-fix-left,
        .ant-table-tbody > tr:nth-child(even) > td.ant-table-cell-fix-right {
          background: linear-gradient(rgba(16, 24, 40, 0.014), rgba(16, 24, 40, 0.014)), ${token.colorBgContainer} !important;
        }
        .ant-table-tbody > tr:hover > td.ant-table-cell-fix-left,
        .ant-table-tbody > tr:hover > td.ant-table-cell-fix-right {
          background: linear-gradient(rgba(13, 148, 136, 0.05), rgba(13, 148, 136, 0.05)), ${token.colorBgContainer} !important;
        }
        .ant-table-row-selected > td.ant-table-cell-fix-left,
        .ant-table-row-selected > td.ant-table-cell-fix-right {
          background: ${token.colorPrimaryBg} !important;
        }

        /* 모션 — 절제된 진입(테이블 fade-up + 행 stagger fade). 데이터 로드/페이징 시 가볍게 살아남. */
        .modern-table-container {
          animation: smTableIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes smTableIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        .ant-table-tbody > tr {
          animation: smRowFade 0.28s ease-out both;
        }
        .ant-table-tbody > tr:nth-child(1) { animation-delay: 0ms; }
        .ant-table-tbody > tr:nth-child(2) { animation-delay: 24ms; }
        .ant-table-tbody > tr:nth-child(3) { animation-delay: 48ms; }
        .ant-table-tbody > tr:nth-child(4) { animation-delay: 72ms; }
        .ant-table-tbody > tr:nth-child(5) { animation-delay: 96ms; }
        .ant-table-tbody > tr:nth-child(6) { animation-delay: 120ms; }
        .ant-table-tbody > tr:nth-child(7) { animation-delay: 144ms; }
        .ant-table-tbody > tr:nth-child(8) { animation-delay: 168ms; }
        .ant-table-tbody > tr:nth-child(n+9) { animation-delay: 190ms; }
        @keyframes smRowFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .modern-table-container { animation: none; }
          .ant-table-tbody > tr { animation: none; }
        }

        /* 탭뉴머럴 + 모노스페이스 유틸 */
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .mono-cell {
          font-family: 'JetBrains Mono','SF Mono',ui-monospace,Menlo,Consolas,monospace;
          font-size: 12px;
          letter-spacing: -0.01em;
        }

        /* 페이지네이션 — 샤프 */
        .modern-table-pagination {
          padding: 8px 12px;
          border-top: 1px solid ${token.colorBorder};
          background: ${token.colorFillQuaternary};
          display: flex;
          align-items: center;
          justify-content: ${paginationLeft ? 'space-between' : 'flex-end'};
          gap: 16px;
        }
        .modern-table-pagination-left {
          min-width: 0;
          color: ${token.colorTextSecondary};
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .ant-pagination { margin: 0 !important; }
        .ant-pagination-item {
          border-radius: 6px !important;
          border: 1px solid transparent !important;
          min-width: 28px !important;
          height: 28px !important;
          line-height: 26px !important;
        }
        .ant-pagination-item-active {
          background: ${token.colorPrimary} !important;
          border-color: ${token.colorPrimary} !important;
        }
        .ant-pagination-item-active a { color: #fff !important; }

        @media (max-width: 576px) {
          .ant-table-thead > tr > th { padding: 6px 8px !important; font-size: 10px !important; }
          .ant-table-tbody > tr > td { padding: 5px 8px !important; font-size: 12px !important; }
        }
      `}</style>
    </div>
  );
}

export default DataTable;
