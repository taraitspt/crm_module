import '@tanstack/react-table';

// TanStack Table 컬럼 meta 확장 — DataTable 이 헤더·본문 정렬에 사용한다.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    /** 셀 정렬 — 금액 등 우측정렬 컬럼에 지정 */
    align?: 'left' | 'right' | 'center';
    /** true 면 DataTable 공통 셀 툴팁(원본값)을 붙이지 않는다 — 셀이 자체 툴팁을 그리는 경우 */
    noCellTooltip?: boolean;
  }
}
