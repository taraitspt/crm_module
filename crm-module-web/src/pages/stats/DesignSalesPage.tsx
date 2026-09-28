import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Select, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getDesignSales, getDesignSalesDetail } from '@/api/stats.api';
import type { DesignSalesRow } from '@/types/stats';
import { PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { formatBusinessNo } from '@/utils/format';

/**
 * 디자인매출통계 (데이터분석 > 디자인매출통계, 2026-09 신설 — 요청자 결정으로 전 역할 개방, 금액 검증 후 권한 조정 가능)
 *
 * 디자인 매출 정의(요청서 3항):
 *   내부(I) = ① 작업처가 디자인(S003)인 순번 + ② 일반 주문의 디자인비(design_fee)
 *   외부(O) = 작업처 상품구매(G9999) + 품목구분 디자인(G10S001009)   ← 현업 확인 전(기본값)
 *
 * 화면은 디자인 시안(디자인매출집계_리디자인.dc.html)을 따른다:
 *   헤더 → 필터(연도·팀·파트·구분 탭·엑셀·산출기준) → 표 (월별 고정 — 분기 보기는 사용자 요청으로 제외)
 *   표 = 파트 그룹 헤더(팀 뱃지·파트명·거래처 수·기간 소계·합계·비중) → 거래처×구분 행(0원은 –) → 총합계(어두운 푸터)
 *   KPI 카드·월별 추이·파트별 비중 카드는 1차에서 제외(아래 주석 블록). 거래처 클릭 → 주문 명세 팝업.
 */

const ACCENT_COLOR = '#0f766e';
// 표가 온통 흰색이라 눈이 피로하다는 피드백(2026-09) — 본문 전체를 아주 옅은 청회색으로 한 톤 낮추고
//   헤더/합계열만 조금 더 진하게. 줄무늬(짝수행 교차색)는 산만하다는 피드백으로 쓰지 않는다.
const ROW_BG = '#fbfdfd';
const HEAD_BG = '#eef4f5';
const LINE_COLOR = '#d2dee3';
const TOTAL_COL_BG = '#f1f8f6';
const formatAmount = (value?: number) => (value ?? 0).toLocaleString('ko-KR');

type DesignKindFilter = '' | 'I' | 'O';

/** 표의 열 하나 = 월. monthIndexes 는 0-based 월 인덱스 목록(합계 계산 공용). */
interface PeriodColumn {
  key: string;
  label: string;
  monthIndexes: number[];
}

/** 파트 그룹 = 같은 팀·파트의 거래처 행 묶음. */
interface PartGroup {
  groupKey: string;
  teamName: string;
  partName: string;
  partnerCount: number;
  rows: DesignSalesRow[];
  columnAmounts: number[];
  totalAmount: number;
}

// ── 표 치수 (시안 기준, 거래처 열은 좁혀서 기간 열에 자리 배분) ──
const PARTNER_COLUMN_WIDTH = 200;
const SALES_EMP_COLUMN_WIDTH = 92;
const KIND_COLUMN_WIDTH = 72;
const PERIOD_COLUMN_WIDTH = 104;
const TOTAL_COLUMN_WIDTH = 132;
const SHARE_COLUMN_WIDTH = 108;

/** 말줄임 셀 — 잘렸을 때만 Ant Tooltip 으로 전체 텍스트를 띄운다(브라우저 기본 title 툴팁 대체).
 *  잘림 여부는 마우스가 올라온 순간 scrollWidth 로 판단해, 안 잘린 셀은 툴팁이 뜨지 않는다. */
const EllipsisText: React.FC<{ text?: string; children?: React.ReactNode; style?: React.CSSProperties }> = ({ text, children, style }) => {
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const content = children ?? (text || '-');
  return (
    <Tooltip title={overflowing ? text : undefined} placement="topLeft" mouseEnterDelay={0.2}>
      <span
        ref={spanRef}
        onMouseEnter={() => { const el = spanRef.current; if (el) setOverflowing(el.scrollWidth > el.clientWidth + 1); }}
        style={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }}
      >
        {content}
      </span>
    </Tooltip>
  );
};

const DesignSalesPage: React.FC = () => {
  const currentYear = dayjs().year();
  const [year, setYear] = useState(currentYear);
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [designKind, setDesignKind] = useState<DesignKindFilter>('');
  // #408 — 영업거래처·영업담당자 조회 조건. 서버 재조회 없이 받은 행에서 걸러낸다(옵션도 행에서 파생).
  const [partnerCdFilter, setPartnerCdFilter] = useState<string>();
  const [salesEmpNoFilter, setSalesEmpNoFilter] = useState<string>();
  const [detailTarget, setDetailTarget] = useState<DesignSalesRow | null>(null);

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['design-sales', startDate, endDate, teamCd, partCd],
    queryFn: () => getDesignSales({ startDate, endDate, teamCd, partCd }),
    retry: false,
  });
  const result = data?.data?.data;

  // ── 구분 필터 적용된 원본 행 ──
  const filteredRows = useMemo(() => {
    const sourceRows = result?.rows ?? [];
    return sourceRows.filter((row) =>
      (!designKind || row.designType === designKind)
      && (!partnerCdFilter || (row.partnerCd || row.partnerName) === partnerCdFilter)
      && (!salesEmpNoFilter || (row.salesEmpNo || row.salesEmpName) === salesEmpNoFilter));
  }, [result?.rows, designKind, partnerCdFilter, salesEmpNoFilter]);

  // 거래처·담당자 드롭다운 — 현재 팀/파트 범위의 행에서 중복 제거(코드 없으면 이름을 키로).
  const partnerFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (result?.rows ?? []).forEach((row) => { const key = row.partnerCd || row.partnerName; if (key && !seen.has(key)) seen.set(key, row.partnerName || key); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [result?.rows]);
  const salesEmpFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (result?.rows ?? []).forEach((row) => { const key = row.salesEmpNo || row.salesEmpName; if (key && !seen.has(key)) seen.set(key, row.salesEmpName || key); });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [result?.rows]);

  // ── 월별 합계(12칸) — 푸터·비중 계산의 기준 ──
  const monthTotals = useMemo(() => Array.from({ length: 12 }, (_, monthIndex) =>
    filteredRows.reduce((sum, row) => sum + (row.monthlyAmounts?.[monthIndex] ?? 0), 0)), [filteredRows]);
  const grandTotal = useMemo(() => monthTotals.reduce((sum, value) => sum + value, 0), [monthTotals]);

  // ── 표 열(월 12개) ──
  const periodColumns = useMemo<PeriodColumn[]>(() =>
    Array.from({ length: 12 }, (_, monthIndex) => ({ key: `m${monthIndex + 1}`, label: `${monthIndex + 1}월`, monthIndexes: [monthIndex] })), []);

  const sumByColumn = (monthlyAmounts: number[] | undefined, column: PeriodColumn) =>
    column.monthIndexes.reduce((sum, monthIndex) => sum + (monthlyAmounts?.[monthIndex] ?? 0), 0);
  const rowTotal = (row: DesignSalesRow) => (row.monthlyAmounts ?? []).reduce((sum, value) => sum + value, 0);

  // ── 파트 그룹 묶기 (팀 → 파트 → 담당자 → 거래처 순) ──
  const partGroups = useMemo<PartGroup[]>(() => {
    const groupMap = new Map<string, PartGroup>();
    filteredRows.forEach((row) => {
      const groupKey = `${row.teamCd}|${row.partCd}`;
      const group = groupMap.get(groupKey) ?? {
        groupKey, teamName: row.teamName, partName: row.partName, partnerCount: 0, rows: [],
        columnAmounts: [], totalAmount: 0,
      };
      group.rows.push(row);
      groupMap.set(groupKey, group);
    });
    return Array.from(groupMap.values()).map((group) => {
      const sortedRows = [...group.rows].sort((first, second) =>
        first.salesEmpName.localeCompare(second.salesEmpName, 'ko')
        || first.partnerName.localeCompare(second.partnerName, 'ko')
        || first.designType.localeCompare(second.designType));
      return {
        ...group,
        rows: sortedRows,
        partnerCount: new Set(sortedRows.map((row) => row.partnerCd || row.partnerName)).size,
        columnAmounts: periodColumns.map((column) => sortedRows.reduce((sum, row) => sum + sumByColumn(row.monthlyAmounts, column), 0)),
        totalAmount: sortedRows.reduce((sum, row) => sum + rowTotal(row), 0),
      };
    });
  }, [filteredRows, periodColumns]);

  const columnTotals = useMemo(() => periodColumns.map((column) =>
    column.monthIndexes.reduce((sum, monthIndex) => sum + monthTotals[monthIndex], 0)), [periodColumns, monthTotals]);
  const totalRowCount = filteredRows.length;
  const sharePercent = (value: number, digits = 1) => grandTotal ? `${(value / grandTotal * 100).toFixed(digits)}%` : '0.0%';

  // ── 엑셀 ──
  const excelRows = useMemo(() => partGroups.flatMap((group) => group.rows.map((row) => {
    const excelRow: Record<string, unknown> = {
      teamName: row.teamName, partName: row.partName, partnerName: row.partnerName,
      businessNo: formatBusinessNo(row.businessNo), salesEmpName: row.salesEmpName, designTypeLabel: row.designTypeLabel,
    };
    periodColumns.forEach((column) => { excelRow[column.key] = sumByColumn(row.monthlyAmounts, column); });
    excelRow.totalAmount = rowTotal(row);
    excelRow.share = sharePercent(rowTotal(row));
    return excelRow;
  })), [partGroups, periodColumns, grandTotal]);
  const excelColumns = [
    { header: '팀', key: 'teamName' }, { header: '파트', key: 'partName' }, { header: '거래처', key: 'partnerName' },
    { header: '사업자번호', key: 'businessNo' }, { header: '영업담당', key: 'salesEmpName' }, { header: '구분', key: 'designTypeLabel' },
    ...periodColumns.map((column) => ({ header: column.label, key: column.key })),
    { header: '합계', key: 'totalAmount' }, { header: '비중', key: 'share' },
  ];

  // ── 거래처 드릴다운 명세 ──
  const detailDesignType = detailTarget && detailTarget.designType !== 'T' ? detailTarget.designType : undefined;
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['design-sales-detail', startDate, endDate, detailTarget?.partnerCd, detailTarget?.partCd, detailTarget?.salesEmpNo, detailDesignType],
    queryFn: () => getDesignSalesDetail({
      startDate, endDate, partnerCd: detailTarget!.partnerCd, partCd: detailTarget!.partCd,
      salesEmpNo: detailTarget!.salesEmpNo, designType: detailDesignType,
    }),
    enabled: !!detailTarget,
    retry: false,
  });
  const detailRows = detailData?.data?.data ?? [];
  const detailTotal = detailRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  // 명세 팝업 — 합계 줄에 쓸 주문 건수. 표는 아래 JSX 의 자체 HTML 표(본문 표와 같은 톤, 가로 스크롤 없이 폭에 맞춤).
  const detailOrderCount = new Set(detailRows.map((row) => row.orderNo)).size;
  const formatDetailDate = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD') : '-');
  // ── 명세 팝업 열 폭 (#420, 2026-09-10 백미연) — 헤더 오른쪽 가장자리를 끌어 사용자가 조절. 브라우저(localStorage)에 개인별 저장.
  //   기본값: 고정 폭 열(날짜·번호·작업처·담당·구분·금액)은 아래 숫자, 나머지(제목·세부품목명·거래처·부서)는 팝업 폭에서 남는 폭을 나눠 갖는다.
  //   사용자가 조절한 열은 그 px 를 그대로 쓰고, 표 폭 = 열 폭 합 → 팝업보다 넓히면 가로 스크롤이 생긴다.
  const DETAIL_COLUMNS: { key: string; label: string; align: 'left' | 'center' | 'right'; width?: number }[] = [
    { key: 'orderDate', label: '주문일자', align: 'left', width: 112 },
    { key: 'orderNo', label: '주문번호', align: 'left', width: 164 },
    { key: 'title', label: '제목', align: 'left' },
    { key: 'itemName', label: '세부품목명', align: 'left' },
    { key: 'workPlace', label: '작업처', align: 'left', width: 104 },
    { key: 'partner', label: '거래처', align: 'left' },
    { key: 'dept', label: '영업부서', align: 'left' },
    { key: 'salesEmp', label: '영업담당', align: 'left', width: 92 },
    { key: 'kind', label: '구분', align: 'center', width: 80 },
    { key: 'amount', label: '금액 (VAT 별도)', align: 'right', width: 140 },
  ];
  const DETAIL_COL_STORAGE_KEY = 'design-sales-detail-colw';
  const [detailColWidths, setDetailColWidths] = useState<Record<string, number>>(() => {
    try { const raw = localStorage.getItem(DETAIL_COL_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(DETAIL_COL_STORAGE_KEY, JSON.stringify(detailColWidths)); } catch { /* 저장 실패 무시 */ }
  }, [detailColWidths]);
  // 팝업 표 영역 폭 — 유동 열의 기본 폭 계산용. 팝업이 열릴 때마다 div 가 새로 붙으므로 callback ref 로 관찰을 걸고 푼다.
  const [detailScrollWidth, setDetailScrollWidth] = useState(0);
  const detailObserverRef = useRef<ResizeObserver | null>(null);
  const detailScrollRef = useCallback((node: HTMLDivElement | null) => {
    detailObserverRef.current?.disconnect();
    detailObserverRef.current = null;
    if (!node) return;
    const observer = new ResizeObserver((entries) => setDetailScrollWidth(Math.floor(entries[0]?.contentRect.width ?? 0)));
    observer.observe(node);
    detailObserverRef.current = observer;
  }, []);
  const detailEffectiveWidths = useMemo(() => {
    const fixedSum = DETAIL_COLUMNS.reduce((sum, column) => sum + (detailColWidths[column.key] ?? column.width ?? 0), 0);
    const flexCount = DETAIL_COLUMNS.filter((column) => column.width == null && detailColWidths[column.key] == null).length;
    const flexWidth = flexCount > 0 ? Math.max(120, Math.floor((detailScrollWidth - fixedSum) / flexCount)) : 0;
    return DETAIL_COLUMNS.map((column) => detailColWidths[column.key] ?? column.width ?? flexWidth);
  }, [detailColWidths, detailScrollWidth]);
  const detailTableWidth = detailEffectiveWidths.reduce((sum, width) => sum + width, 0);
  const hasDetailColOverride = Object.keys(detailColWidths).length > 0;
  const startDetailColResize = (index: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const key = DETAIL_COLUMNS[index].key;
    const startX = event.clientX;
    const startWidth = detailEffectiveWidths[index];
    const onMove = (moveEvent: MouseEvent) => setDetailColWidths((prev) => ({ ...prev, [key]: Math.max(60, startWidth + (moveEvent.clientX - startX)) }));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── 스타일 ──
  const filterSelectStyle: React.CSSProperties = { height: 36 };
  // 세로 스크롤 시 헤더·파트 그룹행·총합계가 고정되도록 sticky. 헤더 높이를 고정값으로 두어 그룹행의 top 오프셋을 맞춘다.
  const HEADER_ROW_HEIGHT = 32;
  const headerCellStyle: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: '#5b6b78', whiteSpace: 'nowrap',
    background: HEAD_BG, borderBottom: 'none', boxShadow: `inset 0 -1px 0 ${LINE_COLOR}`,
    position: 'sticky', top: 0, zIndex: 3, height: HEADER_ROW_HEIGHT, boxSizing: 'border-box',
  };
  // 파트 그룹행 — 헤더 바로 아래에 붙는다. 다음 파트가 올라오면 자연스럽게 밀려난다.
  //   고정된 동안 본문이 바로 밑을 지나가므로 아래 경계선이 있어야 행이 겹쳐 보이지 않는다.
  //   top 을 헤더 높이보다 1px 위로 겹쳐 붙여 서브픽셀 틈(실선 깜빡임)을 없앤다 — z-index 는 헤더가 위라 가려진다.
  const partGroupCellStyle: React.CSSProperties = {
    position: 'sticky', top: HEADER_ROW_HEIGHT - 1, zIndex: 2, background: '#f0fdfa',
    borderBottom: '1px solid #b7ddd6',
  };
  // 총합계 — 화면 아래에 붙는다.
  const footerCellStyle: React.CSSProperties = {
    position: 'sticky', bottom: 0, zIndex: 3, background: '#e5f8f5',
  };
  const numberCellStyle: React.CSSProperties = {
    padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', width: PERIOD_COLUMN_WIDTH,
  };
  const kindTabStyle = (active: boolean): React.CSSProperties => ({
    height: 30, padding: '0 13px', border: 'none', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', background: active ? '#fff' : 'transparent', color: active ? ACCENT_COLOR : '#64748b',
    boxShadow: active ? '0 1px 3px rgba(15,23,42,.12)' : 'none', transition: 'all .15s',
  });
  const kindPill = (designType: DesignSalesRow['designType']) => designType === 'I'
    ? <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT_COLOR, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>내부</span>
    : <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>외부</span>;

  // ── 열(세로) 호버 ──
  //  어느 달 칸인지 헷갈린다는 피드백 → 마우스가 올라간 기간 열 전체(헤더·파트행·본문·총합계)를 밝힌다.
  //  리렌더 없이 스크롤 컨테이너의 data-hover-col 만 바꾸고, 매칭은 CSS 가 한다(행 수가 많아도 부담 없음).
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const handleColumnHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-col]');
    const container = scrollRef.current;
    if (!container) return;
    const next = cell?.dataset.col;
    // 값이 그대로면 DOM 을 건드리지 않는다 — 속성이 바뀔 때마다 표 전체 스타일이 다시 계산되므로.
    if (container.dataset.hoverCol === next) return;
    if (next) container.dataset.hoverCol = next;
    else delete container.dataset.hoverCol;
  };
  const clearColumnHover = () => {
    if (scrollRef.current) delete scrollRef.current.dataset.hoverCol;
  };

  // ── 스크롤 중 파트 전환 ──
  //  sticky 파트행은 다음 파트가 툭 밀어내서 바뀐 걸 알아채기 어렵다는 피드백.
  //  지금 상단에 고정된 파트행에 data-stuck 을 달아, 파트가 바뀔 때만 라벨이 페이드+슬라이드로 들어오게 한다.
  //  rAF 로 묶고 바뀐 두 행만 건드려 스크롤 성능에 영향이 없게 한다.
  const stuckGroupRef = React.useRef<HTMLElement | null>(null);
  const stuckFrameRef = React.useRef<number | null>(null);
  // 스크롤 중에는 호버 계산을 끈다 — 행/열/교차 호버가 커서 아래를 지나는 셀마다 스타일을 다시 계산해 끊김을 만든다.
  //   data-scrolling 이 켜진 동안 CSS 가 tbody 의 포인터 이벤트를 막고, 멈추고 120ms 뒤 다시 켠다.
  const scrollIdleTimerRef = React.useRef<number | null>(null);
  const markScrolling = (container: HTMLDivElement) => {
    if (container.dataset.scrolling !== 'true') {
      container.dataset.scrolling = 'true';
      delete container.dataset.hoverCol;
    }
    if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = window.setTimeout(() => {
      scrollIdleTimerRef.current = null;
      delete container.dataset.scrolling;
    }, 120);
  };
  const handleScrollStuckGroup = () => {
    if (scrollRef.current) markScrolling(scrollRef.current);
    if (stuckFrameRef.current !== null) return;
    stuckFrameRef.current = requestAnimationFrame(() => {
      stuckFrameRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      // sticky 가 걸리는 선 = 컨테이너 상단 + 헤더 높이. 그 선에 닿은 파트행 중 마지막 것이 지금 고정된 파트.
      const stickyLine = container.getBoundingClientRect().top + HEADER_ROW_HEIGHT + 1;
      let current: HTMLElement | null = null;
      container.querySelectorAll<HTMLElement>('.design-sales-group').forEach((groupRow) => {
        if (groupRow.getBoundingClientRect().top <= stickyLine) current = groupRow;
      });
      if (current === stuckGroupRef.current) return;
      if (stuckGroupRef.current) delete stuckGroupRef.current.dataset.stuck;
      if (current) (current as HTMLElement).dataset.stuck = 'true';
      stuckGroupRef.current = current;
    });
  };
  React.useEffect(() => () => {
    if (stuckFrameRef.current !== null) cancelAnimationFrame(stuckFrameRef.current);
    if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
  }, []);

  const isEmpty = !isLoading && partGroups.length === 0;
  const yearOptions = Array.from({ length: 4 }, (_, offset) => currentYear - offset).map((optionYear) => ({ label: `${optionYear}년`, value: optionYear }));
  const tableMinWidth = PARTNER_COLUMN_WIDTH + SALES_EMP_COLUMN_WIDTH + KIND_COLUMN_WIDTH
    + periodColumns.length * PERIOD_COLUMN_WIDTH + TOTAL_COLUMN_WIDTH + SHARE_COLUMN_WIDTH;

  return (
    <PageLayout>
      {/* 페이지 전체를 화면 높이에 맞춰 두고 표가 남는 공간을 채우게 한다 — 바깥(브라우저) 스크롤 없이
          표 안에서만 스크롤되도록. 158px = 상단 헤더(70) + 본문 상하 여백 + 브레드크럼. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: 'calc(100vh - 158px)', minHeight: 0 }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>디자인매출통계</h1>
            <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT_COLOR, background: '#ccfbf1', padding: '4px 9px', borderRadius: 6 }}>파트 · 거래처별</span>
          </div>
          {/* 설명과 '산출 기준' 배지를 한 줄에 — 배지는 툴팁 트리거(옛 안내 블록 대체). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#5a6b7a', lineHeight: 1.6 }}>
              디자인팀 파트/부서별 디자인 매출을 별도로 집계해, 품목별·부대비용 실적에서는 볼 수 없던{' '}
              <strong style={{ color: '#334155', fontWeight: 600 }}>파트 → 고객사(거래처)</strong> 단위 매출까지 확인합니다.
            </p>
            <Tooltip
              placement="bottom"
              overlayStyle={{ maxWidth: 360 }}
              title={(
                <div style={{ fontSize: 12, lineHeight: 1.75 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>산출 기준</div>
                  <div><strong>내부</strong> = 작업처 디자인 + 일반 주문의 디자인비</div>
                  <div><strong>외부</strong> = 상품구매 중 품목구분 '디자인'</div>
                  <div>금액은 매출확정 기준 공급가 (VAT 별도)</div>
                  <div>거래처를 클릭하면 주문 명세가 열립니다.</div>
                </div>
              )}>
              <span style={{
                height: 21, padding: '0 9px 0 6px', borderRadius: 999, background: '#e4f2ef', color: ACCENT_COLOR,
                fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
                cursor: 'help', border: '1px solid #bcdfd9', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', background: ACCENT_COLOR, color: '#fff',
                  fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>i</span>
                산출 기준
              </span>
            </Tooltip>
          </div>
        </div>

        {/* ── 필터 ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${LINE_COLOR}`, boxShadow: '0 1px 3px rgba(15,23,42,.05)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* 기간 — 연도만. 월별 고정(분기 보기는 사용자 요청으로 제외). 나머지 필터와 같은 높이로 한 줄 정렬. */}
            <Select value={year} onChange={setYear} style={{ ...filterSelectStyle, width: 104 }} options={yearOptions} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="팀 전체" value={teamCd}
              onChange={(value) => { setTeamCd(value); setPartCd(undefined); }} style={{ ...filterSelectStyle, width: 150 }} options={result?.teams ?? []} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="파트 전체" value={partCd}
              onChange={setPartCd} style={{ ...filterSelectStyle, width: 190 }} options={result?.parts ?? []} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="영업거래처 전체" value={partnerCdFilter}
              onChange={setPartnerCdFilter} style={{ ...filterSelectStyle, width: 220 }} options={partnerFilterOptions} />
            <Select allowClear showSearch optionFilterProp="label" placeholder="영업담당자 전체" value={salesEmpNoFilter}
              onChange={setSalesEmpNoFilter} style={{ ...filterSelectStyle, width: 150 }} options={salesEmpFilterOptions} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 3, background: '#f1f5f9', borderRadius: 10 }}>
              {([['', '구분 전체'], ['I', '내부'], ['O', '외부']] as [DesignKindFilter, string][]).map(([kindValue, kindLabel]) => (
                <button key={kindValue || 'all'} type="button" onClick={() => setDesignKind(kindValue)} style={kindTabStyle(designKind === kindValue)}>{kindLabel}</button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <ExcelDownloadBtn data={excelRows} columns={excelColumns} fileName={`디자인매출통계_${year}`} />
            </div>
          </div>
        </div>

        {/* ── KPI 카드 · 월별 추이 · 파트별 비중 — 1차 제외 (디자인 시안의 "KPI" / "추이 + 파트 랭킹" 블록).
            검수 후 넣을 때 필요한 값: grandTotal, 내부/외부 합계와 비중, 최근 확정월·전월 매출, 거래처 수, 매출 1위 파트, 월별 내부/외부 추이. ── */}

        {/* ── 테이블 ── */}
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${LINE_COLOR}`, boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 14px 34px -22px rgba(15,23,42,.16)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px 12px', borderBottom: `1px solid ${LINE_COLOR}`, background: '#fbfdfd', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>파트 · 거래처별 상세</span>
              <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '3px 9px', borderRadius: 6, fontWeight: 600 }}>총 {totalRowCount}건</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: '#6d7f8c' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ACCENT_COLOR }} />내부</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />외부</span>
              <span style={{ color: '#8fa2ae' }}>|</span>
              <span>0원은 <span style={{ color: '#8fa2ae', fontWeight: 700 }}>–</span> 로 표기</span>
            </div>
          </div>

          {/* 세로도 이 안에서 스크롤 — 헤더·파트행·총합계 sticky 가 동작하려면 스크롤 컨테이너가 표를 감싸야 한다. */}
          <div
            ref={scrollRef}
            className="design-sales-scroll"
            style={{ overflow: 'auto', flex: '1 1 auto', minHeight: 0 }}
            onMouseOver={handleColumnHover}
            onMouseLeave={clearColumnHover}
            onScroll={handleScrollStuckGroup}
          >
            <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: PARTNER_COLUMN_WIDTH }} />
                <col style={{ width: SALES_EMP_COLUMN_WIDTH }} />
                <col style={{ width: KIND_COLUMN_WIDTH }} />
                {periodColumns.map((column) => <col key={column.key} style={{ width: PERIOD_COLUMN_WIDTH }} />)}
                <col style={{ width: TOTAL_COLUMN_WIDTH }} />
                <col style={{ width: SHARE_COLUMN_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...headerCellStyle, padding: '7px 14px', textAlign: 'left', left: 0, zIndex: 5 }}>거래처</th>
                  <th style={{ ...headerCellStyle, textAlign: 'left' }}>영업담당</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>구분</th>
                  {periodColumns.map((column) => <th key={column.key} data-col={column.key} style={headerCellStyle}>{column.label}</th>)}
                  <th data-col="total" style={{ ...headerCellStyle, fontWeight: 800, color: ACCENT_COLOR, background: '#e3f1ee' }}>합계</th>
                  <th data-col="share" style={headerCellStyle}>비중</th>
                </tr>
              </thead>
              {partGroups.map((group) => (
                <tbody key={group.groupKey}>
                  <tr className="design-sales-group" style={{ background: '#f0fdfa' }}>
                    <td colSpan={3} style={{ ...partGroupCellStyle, padding: '12px 14px', left: 0, zIndex: 4, borderTop: '1px solid #c9e8e2' }}>
                      <div className="design-sales-group-label" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: ACCENT_COLOR, background: '#ccfbf1', padding: '2px 7px', borderRadius: 5, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{group.teamName || '-'}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.partName}</span>
                        <span style={{ fontSize: 11.5, color: '#3f7a72', whiteSpace: 'nowrap' }}>거래처 {group.partnerCount}곳</span>
                      </div>
                    </td>
                    {group.columnAmounts.map((columnAmount, columnIndex) => (
                      <td key={periodColumns[columnIndex].key} data-col={periodColumns[columnIndex].key} style={{ ...numberCellStyle, ...partGroupCellStyle, borderTop: '1px solid #c9e8e2', fontSize: 12.5, fontWeight: 700, color: columnAmount ? ACCENT_COLOR : '#9dc3bd' }}>
                        {columnAmount ? formatAmount(columnAmount) : '–'}
                      </td>
                    ))}
                    <td data-col="total" style={{ ...numberCellStyle, ...partGroupCellStyle, width: TOTAL_COLUMN_WIDTH, borderTop: '1px solid #c9e8e2', fontSize: 13, fontWeight: 800, color: ACCENT_COLOR, background: '#e5f8f5' }}>{formatAmount(group.totalAmount)}</td>
                    <td data-col="share" style={{ ...numberCellStyle, ...partGroupCellStyle, width: SHARE_COLUMN_WIDTH, borderTop: '1px solid #c9e8e2' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <span style={{ width: 40, height: 6, borderRadius: 4, background: '#d9f2ee', overflow: 'hidden', display: 'inline-block' }}>
                          <span style={{ display: 'block', height: '100%', width: sharePercent(group.totalAmount), background: ACCENT_COLOR, borderRadius: 4 }} />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT_COLOR, minWidth: 36, textAlign: 'right' }}>{sharePercent(group.totalAmount, 0)}</span>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map((row, rowIndex) => {
                    // sticky 첫 열은 배경을 명시해야 가로 스크롤 시 뒤 내용이 비치지 않는다 — 본문 색과 같게 둔다.
                    const cellBorder = `1px solid ${LINE_COLOR}`;
                    return (
                    <tr key={`${row.partnerCd}-${row.salesEmpNo}-${row.designType}-${rowIndex}`} className="design-sales-row" style={{ background: ROW_BG }}>
                      <td style={{ padding: '6px 14px', position: 'sticky', left: 0, background: ROW_BG, zIndex: 1, borderTop: cellBorder }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <EllipsisText text={row.partnerName}>
                            <a onClick={() => setDetailTarget(row)}
                              style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                              {row.partnerName || '-'}
                            </a>
                          </EllipsisText>
                          <span style={{ fontSize: 11, color: '#6d7f8c', fontVariantNumeric: 'tabular-nums' }}>{formatBusinessNo(row.businessNo) || row.partnerCd || '-'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '6px 12px', fontSize: 12.5, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderTop: cellBorder }}>{row.salesEmpName || row.salesEmpNo || '-'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', borderTop: cellBorder }}>{kindPill(row.designType)}</td>
                      {periodColumns.map((column) => {
                        const cellAmount = sumByColumn(row.monthlyAmounts, column);
                        return (
                          <td key={column.key} data-col={column.key} style={{ ...numberCellStyle, padding: '6px 12px', borderTop: cellBorder }}>
                            {cellAmount
                              ? <span style={{ fontSize: 12.5, fontWeight: 500, color: '#1e293b' }}>{formatAmount(cellAmount)}</span>
                              : <span style={{ fontSize: 12.5, color: '#a3b6c0' }}>–</span>}
                          </td>
                        );
                      })}
                      <td data-col="total" style={{ ...numberCellStyle, padding: '6px 12px', width: TOTAL_COLUMN_WIDTH, borderTop: cellBorder, fontSize: 12.5, fontWeight: 700, color: '#0f172a', background: TOTAL_COL_BG }}>{formatAmount(rowTotal(row))}</td>
                      <td data-col="share" style={{ ...numberCellStyle, padding: '6px 12px', width: SHARE_COLUMN_WIDTH, borderTop: cellBorder, fontSize: 12, color: '#6d7f8c' }}>{sharePercent(rowTotal(row))}</td>
                    </tr>
                    );
                  })}
                </tbody>
              ))}
              {!isEmpty && (
                <tfoot>
                  {/* 총합계 — 파트 헤더와 같은 민트 계열로(시안의 검정 푸터는 화면 톤과 안 맞아 교체). 위쪽 진한 선으로 구분. */}
                  <tr style={{ background: '#e5f8f5' }}>
                    <td colSpan={3} style={{ ...footerCellStyle, padding: '10px 14px', left: 0, zIndex: 5, borderTop: `2px solid ${ACCENT_COLOR}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_COLOR }} />총합계
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3f7a72' }}>총 {totalRowCount}건</span>
                      </span>
                    </td>
                    {columnTotals.map((columnTotal, columnIndex) => (
                      <td key={periodColumns[columnIndex].key} data-col={periodColumns[columnIndex].key} style={{ ...numberCellStyle, ...footerCellStyle, padding: '10px 12px', borderTop: `2px solid ${ACCENT_COLOR}`, fontSize: 12.5, fontWeight: 700, color: columnTotal ? '#0f172a' : '#8bb8b1' }}>
                        {columnTotal ? formatAmount(columnTotal) : '–'}
                      </td>
                    ))}
                    <td data-col="total" style={{ ...numberCellStyle, ...footerCellStyle, padding: '10px 12px', width: TOTAL_COLUMN_WIDTH, borderTop: `2px solid ${ACCENT_COLOR}`, fontSize: 14.5, fontWeight: 800, color: ACCENT_COLOR, background: '#d5f3ee' }}>{formatAmount(grandTotal)}</td>
                    <td data-col="share" style={{ ...numberCellStyle, ...footerCellStyle, padding: '10px 12px', width: SHARE_COLUMN_WIDTH, borderTop: `2px solid ${ACCENT_COLOR}`, fontSize: 12, fontWeight: 700, color: '#3f7a72' }}>100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {isLoading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: '#6d7f8c' }}>집계 중...</div>
          )}
          {isEmpty && (
            <div style={{ padding: '56px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{isError ? '집계를 불러오지 못했습니다' : '조건에 맞는 디자인 매출이 없습니다'}</span>
              <span style={{ fontSize: 12.5, color: '#6d7f8c' }}>{isError ? '백엔드 배포 상태를 확인해 주세요.' : '팀 · 파트 · 구분 필터를 조정해 보세요.'}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 거래처 드릴다운 명세 ──
          Ant Table 대신 자체 HTML 표 — 본문 표와 같은 톤을 맞추고, 열 폭을 팝업 폭에 비례 배분해 가로 스크롤을 없앤다.
          머리(거래처·소속·담당·구분) → 표(세로 스크롤, 헤더·합계 고정) */}
      <Modal
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={null}
        closable
        width="min(1560px, calc(100vw - 40px))"
        style={{ top: 28 }}
        styles={{ content: { padding: 0, borderRadius: 16, overflow: 'hidden' }, body: { padding: 0 } }}
      >
        {detailTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 56px)' }}>
            {/* 머리 */}
            <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${LINE_COLOR}`, background: 'linear-gradient(180deg,#f6fbfa 0%,#fff 100%)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT_COLOR, letterSpacing: '0.06em', marginBottom: 6 }}>디자인 매출 명세</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingRight: 36 }}>
                <span style={{ fontSize: 21, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{detailTarget.partnerName || '(거래처 미지정)'}</span>
                <span style={{ fontSize: 12.5, color: '#6d7f8c', fontVariantNumeric: 'tabular-nums' }}>{formatBusinessNo(detailTarget.businessNo) || detailTarget.partnerCd || ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {[
                  { label: '소속', value: [detailTarget.teamName, detailTarget.partName].filter(Boolean).join(' · ') || '-' },
                  { label: '영업담당', value: detailTarget.salesEmpName || detailTarget.salesEmpNo || '-' },
                  { label: '기간', value: `${year}년` },
                ].map((chip) => (
                  <span key={chip.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 8, background: '#f1f5f7', fontSize: 12, color: '#334155' }}>
                    <span style={{ color: '#6d7f8c', fontWeight: 600 }}>{chip.label}</span>
                    <span style={{ fontWeight: 600 }}>{chip.value}</span>
                  </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 26 }}>{kindPill(detailTarget.designType)}</span>
                {hasDetailColOverride && (
                  <button type="button" onClick={() => setDetailColWidths({})}
                    style={{ marginLeft: 'auto', height: 26, padding: '0 10px', borderRadius: 8, border: `1px solid ${LINE_COLOR}`, background: '#fff', fontSize: 12, color: '#6d7f8c', cursor: 'pointer' }}>
                    열 너비 초기화
                  </button>
                )}
              </div>
            </div>

            {/* 표 */}
            <div ref={detailScrollRef} className="design-sales-detail-scroll" style={{ overflow: 'auto', flex: '1 1 auto', minHeight: 0 }}>
              <table style={{ width: detailTableWidth || '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                <colgroup>
                  {DETAIL_COLUMNS.map((column, index) => <col key={column.key} style={{ width: detailEffectiveWidths[index] }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {DETAIL_COLUMNS.map((column, index) => (
                      <th key={column.key} style={{
                        position: 'sticky', top: 0, zIndex: 2, background: HEAD_BG, boxShadow: `inset 0 -1px 0 ${LINE_COLOR}`,
                        padding: '9px 12px', fontSize: 11.5, fontWeight: 700, color: '#5b6b78', textAlign: column.align, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {column.label}
                        {/* 열 너비 조절 핸들 — 오른쪽 가장자리 8px 를 끌면 이 열의 폭이 바뀐다 (#420). */}
                        <span
                          onMouseDown={(event) => startDetailColResize(index, event)}
                          onClick={(event) => event.stopPropagation()}
                          className="design-sales-detail-resize-handle"
                          style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 8, cursor: 'col-resize', userSelect: 'none', touchAction: 'none', zIndex: 3 }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailLoading && (
                    <tr><td colSpan={10} style={{ padding: '44px 20px', textAlign: 'center', fontSize: 13, color: '#6d7f8c' }}>명세를 불러오는 중…</td></tr>
                  )}
                  {!detailLoading && detailRows.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: '44px 20px', textAlign: 'center', fontSize: 13, color: '#6d7f8c' }}>조건에 맞는 주문이 없습니다.</td></tr>
                  )}
                  {!detailLoading && detailRows.map((row, index) => {
                    const cell: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, color: '#1e293b', borderTop: index === 0 ? 'none' : `1px solid ${LINE_COLOR}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: ROW_BG };
                    return (
                      <tr key={`${row.orderNo}-${row.orderSq}-${row.designType}-${index}`} className="design-sales-detail-row">
                        <td style={{ ...cell, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{formatDetailDate(row.orderDate)}</td>
                        <td style={{ ...cell, fontVariantNumeric: 'tabular-nums' }}>
                          <EllipsisText text={`${row.orderNo}-${row.orderSq}`}>
                            <span style={{ fontWeight: 600 }}>{row.orderNo}</span>
                            <span style={{ color: '#8a9aa6' }}>-{row.orderSq}</span>
                          </EllipsisText>
                        </td>
                        <td style={cell}><EllipsisText text={row.orderTitle} /></td>
                        <td style={{ ...cell, color: '#475569' }}><EllipsisText text={row.itemName} /></td>
                        <td style={{ ...cell, color: '#475569' }}>{row.workPlaceName || '-'}</td>
                        <td style={cell}><EllipsisText text={row.partnerName} /></td>
                        <td style={{ ...cell, color: '#475569' }}><EllipsisText text={row.departmentName} /></td>
                        <td style={{ ...cell, color: '#475569' }}>{row.salesEmpName || '-'}</td>
                        <td style={{ ...cell, textAlign: 'center' }}>{kindPill(row.designType)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', background: TOTAL_COL_BG }}>{formatAmount(row.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* 합계 — 본문과 같은 한 가지 톤에 위쪽 선만 진하게. 왼쪽에 건수, 오른쪽 금액. */}
                {!detailLoading && detailRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={9} style={{ position: 'sticky', bottom: 0, zIndex: 2, background: HEAD_BG, borderTop: `2px solid ${ACCENT_COLOR}`, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        합계
                        <span style={{ marginLeft: 8, fontWeight: 600, color: '#6d7f8c' }}>주문 {detailOrderCount}건 · 작업 {detailRows.length}건</span>
                      </td>
                      <td style={{ position: 'sticky', bottom: 0, zIndex: 2, background: HEAD_BG, borderTop: `2px solid ${ACCENT_COLOR}`, padding: '10px 12px', textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: ACCENT_COLOR, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatAmount(detailTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </Modal>
      <style>{`
        /* 세로(열) 호버 — data-hover-col 과 같은 data-col 을 가진 칸 전체를 밝힌다. 인라인 배경을 덮어야 하므로 !important. */
        ${[...periodColumns.map((column) => column.key), 'total', 'share'].map((columnKey) => `.design-sales-scroll[data-hover-col="${columnKey}"] [data-col="${columnKey}"] { background: #e4f1ef !important; }`).join('\n        ')}
        /* 첫 열(거래처)은 sticky 라 인라인 배경을 갖는다 → !important 로 hover 를 덮어야 행 전체가 같이 밝아진다.
           행 규칙을 뒤에 둬서 가로·세로가 만나는 칸은 행 색이 이긴다. */
        .design-sales-row:hover > td { background: #e9f4f2 !important; }
        /* 파트 전환 — 새로 고정된 파트행의 라벨만 살짝 아래로 미끄러지며 나타난다(부서가 바뀐 걸 알리는 신호). */
        .design-sales-group[data-stuck="true"] .design-sales-group-label { animation: dsGroupEnter .26s ease-out; }
        @keyframes dsGroupEnter {
          from { opacity: 0; transform: translateY(-7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .design-sales-group[data-stuck="true"] .design-sales-group-label { animation: none; }
        }
        /* 가로·세로가 만나는 칸 = 지금 마우스가 있는 칸. 테두리와 진한 색으로 집어준다.
           안쪽 자식(span)까지 따라가는 규칙은 hover 마다 하위 전체를 다시 계산해 느려지므로 쓰지 않는다.
           outline 은 레이아웃에 영향이 없어 box-shadow 보다 다시 그리는 비용이 작다. */
        .design-sales-scroll td[data-col]:hover {
          background: #bfe2da !important;
          outline: 1.5px solid #3f9c90;
          outline-offset: -1.5px;
        }
        .design-sales-row > td:first-child a { transition: color .12s; }
        .design-sales-row:hover > td:first-child a { color: ${ACCENT_COLOR}; text-decoration: underline; }
        /* 스크롤 중 호버 정지 — 포인터 이벤트를 막아 행·열·교차 호버의 스타일 재계산과 툴팁 깜빡임을 없앤다. */
        .design-sales-scroll[data-scrolling="true"] tbody,
        .design-sales-scroll[data-scrolling="true"] tfoot { pointer-events: none; }
        /* 항상 고정된 헤더·총합계는 합성 레이어로 올려 스크롤 프레임마다 다시 그리지 않게 한다. */
        .design-sales-scroll thead th, .design-sales-scroll tfoot td { will-change: transform; }
        .design-sales-scroll { overscroll-behavior: contain; scrollbar-gutter: stable; }
        .design-sales-detail-row:hover > td { background: #e9f4f2 !important; }
        .design-sales-detail-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        /* 열 너비 핸들 — 평소엔 안 보이고, 헤더에 마우스를 올리면 얇은 세로선으로 위치를 알려준다 (#420). */
        .design-sales-detail-resize-handle::after { content: ''; position: absolute; right: 3px; top: 25%; height: 50%; width: 2px; border-radius: 2px; background: transparent; }
        .design-sales-detail-scroll th:hover .design-sales-detail-resize-handle::after { background: #b9cdc9; }
        .design-sales-detail-resize-handle:hover::after { background: ${ACCENT_COLOR} !important; }
        .design-sales-detail-scroll::-webkit-scrollbar-thumb { background: #a9b8c2; border-radius: 8px; }
        .design-sales-detail-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .design-sales-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
        .design-sales-scroll::-webkit-scrollbar-thumb { background: #a9b8c2; border-radius: 8px; }
        .design-sales-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 8px; }
      `}</style>
    </PageLayout>
  );
};

export default DesignSalesPage;
