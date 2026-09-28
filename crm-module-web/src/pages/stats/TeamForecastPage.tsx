import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, Button, Skeleton, Table, Select, Segmented, Tag, Space, theme, Radio,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import AnimatedNumber from '@/components/common/AnimatedNumber';
import { T } from '@/theme/designTokens';
import { getSalesTrend, getIntegratedDashboard, getIntegratedAnnualGoal } from '@/api/stats.api';
import type { IntegratedDashboardDto, IntegratedRow, SalesTrendDto, ViewMode } from '@/types/stats';
import apiClient from '@/api/client';
import type { ApiResponse } from '@/types/common';
import StatsDateRangePicker from './components/StatsDateRangePicker';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { useToken } = theme;

const NAVY = '#003957';
const TEAL = '#0096A2';
const POSITIVE_COLOR = '#cf1322';
const NEGATIVE_COLOR = '#1677ff';

interface DepartmentOptionSource {
  deptCd: number;
  deptNm: string;
  upDeptCd?: number | null;
}

type UnitMode = 'million' | 'won';

const unitValue = (value: number | undefined, unit: UnitMode) => {
  const n = value ?? 0;
  // 백만단위는 소수 첫째자리까지 (21.1). 원단위는 그대로.
  return unit === 'million' ? Math.round(n / 100_000) / 10 : n;
};

const fmtNum = (v: number | undefined, unit: UnitMode) => {
  if (v == null) return '-';
  const val = unitValue(v, unit);
  // 백만단위는 소수 첫째자리 고정 표시(21.0, 21.1). 원단위는 그대로.
  return unit === 'million'
    ? val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : val.toLocaleString();
};
const fmtRate = (v: number | undefined) => v != null ? `${v.toFixed(1)}%` : '-';
const rateColor = (v: number) => (v >= 100 ? 'red' : 'blue');

const BS1_TOTAL_LABEL = 'BS1팀합계';
const BS2_TOTAL_LABEL = 'BS2팀합계';
const BS3_TOTAL_LABEL = 'BS3팀합계';
const HQ_SALES_LABEL = '본부매출';
const BS1_PARTS = ['역삼1파트', '역삼2파트', '강남파트', '대치파트'];
const BS2_PARTS = ['시청파트', '을지로파트', '서소문1파트', '서소문2파트', '구로파트', '여의도파트', '보라매파트'];
const BS3_PARTS = ['전략사업파트'];   // BS3팀(up_dept_cd 9911) 소속 파트. 파트 추가 시 여기에 추가.
const FIXED_ORG_ORDER = [...BS1_PARTS, BS1_TOTAL_LABEL, ...BS2_PARTS, BS2_TOTAL_LABEL, ...BS3_PARTS, BS3_TOTAL_LABEL, HQ_SALES_LABEL];
const DIRECT_DEPT_KEYWORD = '직속';

/** 콤보차트 X축 조직 라벨 — 길면 줄여 표시하되, 마우스오버 시 전체 조직명 노출(SVG <title>). */
function OrgAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const full = String(payload?.value ?? '');
  const label = full.length > 8 ? full.slice(0, 7) + '…' : full;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#6B7280" fontSize={10}>
        {label}
        <title>{full}</title>
      </text>
    </g>
  );
}

function expandSummaryRows(rows: IntegratedRow[]) {
  const result: Array<IntegratedRow & { _label: string; _groupIdx: number }> = [];
  rows.forEach((row, idx) => {
    result.push({ ...row, _label: '총실적', _groupIdx: idx });
    result.push({ ...row, _label: '내부실적', monthGoal: row.innerMonthGoal, monthActual: row.innerMonthActual, monthRate: row.innerMonthRate, cumulativeGoal: row.innerCumulativeGoal, cumulativeActual: row.innerCumulativeActual, cumulativeRate: row.innerCumulativeRate, cumulativePrevYearActual: (row as any).innerCumulativePrevYearActual ?? 0, prevYearActual: row.innerPrevYearActual, yoyRate: row.innerYoyRate, yoyDiff: (row.innerMonthActual ?? 0) - (row.innerPrevYearActual ?? 0), _groupIdx: idx } as any);
    result.push({ ...row, _label: '외부실적', monthGoal: row.outerMonthGoal, monthActual: row.outerMonthActual, monthRate: row.outerMonthRate, cumulativeGoal: row.outerCumulativeGoal, cumulativeActual: row.outerCumulativeActual, cumulativeRate: row.outerCumulativeRate, cumulativePrevYearActual: (row as any).outerCumulativePrevYearActual ?? 0, prevYearActual: row.outerPrevYearActual, yoyRate: row.outerYoyRate, yoyDiff: (row.outerMonthActual ?? 0) - (row.outerPrevYearActual ?? 0), _groupIdx: idx } as any);
  });
  return result;
}

const TeamForecastPage: React.FC = () => {
  const { token } = useToken();
  const { data: departments = [] } = useQuery({
    queryKey: ['stats-departments'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DepartmentOptionSource[]>>('/departments');
      return response.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // 조회기간(기간 선택). 기본 = 이번 달 1일 ~ 오늘.
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [startDate, endDate] = dateRange;
  const selYear = startDate.year();
  const periodLabel = `${startDate.format('M/D')}~${endDate.format('M/D')}`;
  const cumLabel = `1/1~${endDate.format('M/D')}`;
  const [unitMode, setUnitMode] = useState<UnitMode>('million');
  const [viewMode,  setViewMode]  = useState<ViewMode>('summary');
  // 월보기/누계 토글 숨김 — 표는 선택기간·누적을 항상 함께 보여줘서 periodType 불필요.
  // (복원 시 periodType 상태 + 토글 셀렉트 함께 되살리면 됨)
  const [teamCd,    setTeamCd]    = useState<string>();
  const [partCd,    setPartCd]    = useState<string>();
  const [integrated, setIntegrated] = useState<IntegratedDashboardDto | null>(null);
  const [annualGoal, setAnnualGoal] = useState(0);
  // 차트 전용 — 부서 스코프 무시(전체 파트). 카드·표는 스코프된 integrated 사용.
  const [integratedAll, setIntegratedAll] = useState<IntegratedDashboardDto | null>(null);
  const [trendData,  setTrendData]  = useState<SalesTrendDto | null>(null);
  const [loading,    setLoading]    = useState(false);

  // 품목별실적(ItemPerfPage)과 동일한 팀/파트 조회조건.
  // 팀 = 다른 부서(파트)가 up_dept_cd 로 참조하는 상위부서(임원 제외).
  const teamOptions = useMemo(() => {
    const parentCds = new Set(
      departments.map((d) => d.upDeptCd).filter((v): v is number => v != null),
    );
    return departments
      .filter((d) => parentCds.has(d.deptCd) && (d.deptNm ?? '').trim() !== '임원')
      .map((d) => ({ value: String(d.deptCd), label: d.deptNm }));
  }, [departments]);
  // 파트 = 선택한 팀을 up_dept_cd 로 가진 하위부서 (팀 미선택 시 빈 목록).
  const partOptions = useMemo(() => {
    if (!teamCd) return [];
    return departments
      .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
      .map((d) => ({ value: String(d.deptCd), label: d.deptNm }));
  }, [departments, teamCd]);

  useEffect(() => {
    if (partCd && !partOptions.some((option) => option.value === partCd)) {
      setPartCd(undefined);
    }
  }, [partCd, partOptions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const startStr = startDate.format('YYYY-MM-DD');
    const endStr = endDate.format('YYYY-MM-DD');
    const [intRes, annualRes] = await Promise.allSettled([
      // 카드·표용 — 데이터분석은 전체 조회(allDepts=true). 팀/파트로만 좁힘.
      getIntegratedDashboard(startStr, endStr, undefined, teamCd, partCd, true),
      // 연간(전체목표) — 그해 1/1~12/31.
      getIntegratedAnnualGoal(selYear, undefined, teamCd, partCd, true),
    ]);
    if (intRes.status === 'fulfilled' && intRes.value.data.success) {
      setIntegrated(intRes.value.data.data);
      setIntegratedAll(intRes.value.data.data);
    }
    if (annualRes.status === 'fulfilled' && annualRes.value.data.success) setAnnualGoal(annualRes.value.data.data ?? 0);
    setLoading(false);
  }, [startDate, endDate, selYear, teamCd, partCd]);

  useEffect(() => { loadData(); }, [loadData]);

  // 매출 트렌드 차트는 필터와 무관(전사 12개월) → 최초 1회만 조회(필터 변경마다 재호출하던 낭비 제거).
  useEffect(() => {
    getSalesTrend()
      .then((res) => { if (res.data.success) setTrendData(res.data.data); })
      .catch(() => { /* 트렌드 조회 실패는 무시 */ });
  }, []);

  const rows   = integrated?.rows ?? [];
  const hqRow  = rows.find((r) => r.rowType === 'hq');
  const selectedTeamName = useMemo(
    () => teamCd ? departments.find((d) => String(d.deptCd) === teamCd)?.deptNm : undefined,
    [departments, teamCd],
  );
  const selectedPartName = useMemo(
    () => partCd ? departments.find((d) => String(d.deptCd) === partCd)?.deptNm : undefined,
    [departments, partCd],
  );

  const displayOrgOrder = useMemo(() => {
    const normalizeName = (name?: string) => name?.includes(DIRECT_DEPT_KEYWORD) ? HQ_SALES_LABEL : name;

    if (selectedPartName) {
      const normalizedPart = normalizeName(selectedPartName);
      return normalizedPart ? [normalizedPart] : [];
    }

    if (selectedTeamName) {
      const normalizedTeam = normalizeName(selectedTeamName);
      if (normalizedTeam === HQ_SALES_LABEL) return [HQ_SALES_LABEL];
      if (selectedTeamName.includes('BS1')) return [...BS1_PARTS, BS1_TOTAL_LABEL];
      if (selectedTeamName.includes('BS2')) return [...BS2_PARTS, BS2_TOTAL_LABEL];
      if (selectedTeamName.includes('BS3') || selectedTeamName.includes('전략사업')) return [...BS3_PARTS, BS3_TOTAL_LABEL];
      return normalizedTeam ? [normalizedTeam] : [];
    }

    return FIXED_ORG_ORDER;
  }, [selectedPartName, selectedTeamName]);

  // 파트(item) 행들을 소속 팀(up_dept_cd)별로 묶어 "{팀명} 소계" 행을 끼워넣는다.
  // 부서계층: 파트.up_dept_cd = 팀.dept_cd, 팀.up_dept_cd = 본부. 팀이 본부 아래에 있을 때만 소계 생성
  // (본부 직속/팀레벨 부서·임원 등 상위가 본부인 행은 표준 나열).
  const rowsWithSubtotals = useMemo<IntegratedRow[]>(() => {
    const items = rows.filter((r) => r.rowType === 'item');
    const others = rows.filter((r) => r.rowType !== 'item' && !teamCd && !partCd);
    if (items.length === 0) return rows;

    const deptByName = new Map(departments.map((d) => [d.deptNm, d]));
    const nameByCd = new Map(departments.map((d) => [d.deptCd, d.deptNm]));
    const ADDITIVE: (keyof IntegratedRow)[] = [
      'monthGoal', 'monthActual', 'cumulativeGoal', 'cumulativeActual', 'prevYearActual', 'cumulativePrevYearActual',
      'innerMonthGoal', 'innerMonthActual', 'innerCumulativeGoal', 'innerCumulativeActual', 'innerPrevYearActual', 'innerCumulativePrevYearActual',
      'outerMonthGoal', 'outerMonthActual', 'outerCumulativeGoal', 'outerCumulativeActual', 'outerPrevYearActual', 'outerCumulativePrevYearActual',
    ];
    const rate = (a: number, b: number) => (b > 0 ? Math.round((a * 1000) / b) / 10 : 0);

    const order: (number | null)[] = [];
    const groups = new Map<number | null, IntegratedRow[]>();
    for (const it of items) {
      const teamCd = deptByName.get(it.orgName)?.upDeptCd ?? null;
      const teamDept = teamCd != null ? departments.find((d) => d.deptCd === teamCd) : undefined;
      const key = teamDept && teamDept.upDeptCd != null ? teamCd : null; // null = 소계 미생성
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(it);
    }

    const result: IntegratedRow[] = [];
    for (const key of order) {
      const grp = groups.get(key)!;
      result.push(...grp);
      if (key != null) {
        const sub = { orgName: `${nameByCd.get(key) ?? '팀'} 소계`, rowType: 'team' } as Record<string, unknown>;
        ADDITIVE.forEach((k) => { sub[k] = grp.reduce((s, r) => s + ((r[k] as number) ?? 0), 0); });
        sub.monthRate = rate(sub.monthActual as number, sub.monthGoal as number);
        sub.cumulativeRate = rate(sub.cumulativeActual as number, sub.cumulativeGoal as number);
        sub.yoyDiff = (sub.monthActual as number) - (sub.prevYearActual as number);
        sub.yoyRate = rate(sub.monthActual as number, sub.prevYearActual as number);
        sub.innerMonthRate = rate(sub.innerMonthActual as number, sub.innerMonthGoal as number);
        sub.innerCumulativeRate = rate(sub.innerCumulativeActual as number, sub.innerCumulativeGoal as number);
        sub.innerYoyRate = rate(sub.innerMonthActual as number, sub.innerPrevYearActual as number);
        sub.outerMonthRate = rate(sub.outerMonthActual as number, sub.outerMonthGoal as number);
        sub.outerCumulativeRate = rate(sub.outerCumulativeActual as number, sub.outerCumulativeGoal as number);
        sub.outerYoyRate = rate(sub.outerMonthActual as number, sub.outerPrevYearActual as number);
        result.push(sub as unknown as IntegratedRow);
      }
    }
    result.push(...others);
    return result;
  }, [rows, departments]);
  void rowsWithSubtotals;

  const orderedRowsWithSubtotals = useMemo<IntegratedRow[]>(() => {
    const sourceItems = rows
      .filter((r) => r.rowType === 'item')
      .map((row) => ({
        ...row,
        orgName: row.orgName.includes(DIRECT_DEPT_KEYWORD) ? HQ_SALES_LABEL : row.orgName,
      }));
    const others = rows.filter((r) => r.rowType !== 'item' && !teamCd && !partCd);
    if (sourceItems.length === 0) return others;

    const additiveKeys: (keyof IntegratedRow)[] = [
      'monthGoal', 'monthActual', 'cumulativeGoal', 'cumulativeActual', 'prevYearActual', 'cumulativePrevYearActual',
      'innerMonthGoal', 'innerMonthActual', 'innerCumulativeGoal', 'innerCumulativeActual', 'innerPrevYearActual', 'innerCumulativePrevYearActual',
      'outerMonthGoal', 'outerMonthActual', 'outerCumulativeGoal', 'outerCumulativeActual', 'outerPrevYearActual', 'outerCumulativePrevYearActual',
    ];
    const rate = (actual: number, goal: number) => (goal > 0 ? Math.round((actual * 1000) / goal) / 10 : 0);
    const orderKey = (name: string) => name.replace(/^BS[123]팀\s*/, '');
    const byName = new Map(sourceItems.map((item) => [orderKey(item.orgName), item]));

    const makeSubtotal = (label: string, names: string[]) => {
      const groupRows = names.map((name) => byName.get(name)).filter(Boolean) as IntegratedRow[];
      if (groupRows.length === 0) return null;
      const sub = { orgName: label, rowType: 'team' } as Record<string, unknown>;
      additiveKeys.forEach((key) => { sub[key] = groupRows.reduce((sum, row) => sum + ((row[key] as number) ?? 0), 0); });
      sub.monthRate = rate(sub.monthActual as number, sub.monthGoal as number);
      sub.cumulativeRate = rate(sub.cumulativeActual as number, sub.cumulativeGoal as number);
      sub.yoyDiff = (sub.monthActual as number) - (sub.prevYearActual as number);
      sub.yoyRate = rate(sub.monthActual as number, sub.prevYearActual as number);
      sub.innerMonthRate = rate(sub.innerMonthActual as number, sub.innerMonthGoal as number);
      sub.innerCumulativeRate = rate(sub.innerCumulativeActual as number, sub.innerCumulativeGoal as number);
      sub.innerYoyRate = rate(sub.innerMonthActual as number, sub.innerPrevYearActual as number);
      sub.outerMonthRate = rate(sub.outerMonthActual as number, sub.outerMonthGoal as number);
      sub.outerCumulativeRate = rate(sub.outerCumulativeActual as number, sub.outerCumulativeGoal as number);
      sub.outerYoyRate = rate(sub.outerMonthActual as number, sub.outerPrevYearActual as number);
      return sub as unknown as IntegratedRow;
    };

    const result: IntegratedRow[] = [];
    for (const orgName of displayOrgOrder) {
      if (orgName === BS1_TOTAL_LABEL) {
        const subtotal = partCd ? null : makeSubtotal(orgName, BS1_PARTS);
        if (subtotal) result.push(subtotal);
        continue;
      }
      if (orgName === BS2_TOTAL_LABEL) {
        const subtotal = partCd ? null : makeSubtotal(orgName, BS2_PARTS);
        if (subtotal) result.push(subtotal);
        continue;
      }
      if (orgName === BS3_TOTAL_LABEL) {
        const subtotal = partCd ? null : makeSubtotal(orgName, BS3_PARTS);
        if (subtotal) result.push(subtotal);
        continue;
      }
      const row = byName.get(orderKey(orgName));
      if (row) result.push(row);
    }

    const fixedNames = new Set([...displayOrgOrder, ...BS1_PARTS, ...BS2_PARTS, ...BS3_PARTS].map(orderKey));
    sourceItems
      .filter((row) => !fixedNames.has(orderKey(row.orgName)))
      .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ko'))
      .forEach((row) => result.push(row));
    result.push(...others);
    return result;
  }, [rows, displayOrgOrder, partCd, teamCd]);

  const visibleTotalRow = useMemo<IntegratedRow | undefined>(() => {
    if (!teamCd && !partCd) return hqRow;
    const visibleRows = orderedRowsWithSubtotals.filter((r) => r.rowType === 'item');
    if (visibleRows.length === 0) return hqRow;

    const sum = (key: keyof IntegratedRow) =>
      visibleRows.reduce((total, row) => total + ((row[key] as number) ?? 0), 0);
    const monthGoal = sum('monthGoal');
    const monthActual = sum('monthActual');
    const cumulativeGoal = sum('cumulativeGoal');
    const cumulativeActual = sum('cumulativeActual');

    return {
      ...visibleRows[0],
      orgName: selectedPartName ?? selectedTeamName ?? visibleRows[0].orgName,
      rowType: 'team',
      monthGoal,
      monthActual,
      monthRate: monthGoal > 0 ? Math.round(monthActual * 1000 / monthGoal) / 10 : 0,
      cumulativeGoal,
      cumulativeActual,
      cumulativeRate: cumulativeGoal > 0 ? Math.round(cumulativeActual * 1000 / cumulativeGoal) / 10 : 0,
    };
  }, [hqRow, orderedRowsWithSubtotals, partCd, selectedPartName, selectedTeamName, teamCd]);

  const monthlySalesArr = trendData?.monthlySales ?? [];
  const lastMonthAmt    = monthlySalesArr.length > 0 ? monthlySalesArr[monthlySalesArr.length - 1].amount : 0;

  const monthActual      = visibleTotalRow?.monthActual      ?? lastMonthAmt;
  const cumulativeActual = visibleTotalRow?.cumulativeActual ?? 0;
  const cumulativeGoalAmt = annualGoal || visibleTotalRow?.cumulativeGoal || 0;
  const derivedCumulativeRate = cumulativeGoalAmt > 0
    ? Math.round(cumulativeActual * 1000 / cumulativeGoalAmt) / 10 : 0;

  // ── 콤보 차트 데이터 (파트별) — 전체 파트(integratedAll), 달성률(당월실적/당월목표) 높은 순 정렬 ──
  const chartPartRows = useMemo(() => (
    (integratedAll?.rows ?? [])
      .filter((r) => r.rowType === 'item' && (r.monthActual > 0 || r.monthGoal > 0))
      .slice()
      .sort((a, b) => {
        const ra = a.monthGoal > 0 ? a.monthActual / a.monthGoal : -1;
        const rb = b.monthGoal > 0 ? b.monthActual / b.monthGoal : -1;
        return rb - ra;
      })
  ), [integratedAll]);

  const chartData = useMemo(() =>
    chartPartRows.map((r) => ({
      name:  r.orgName.length > 7 ? r.orgName.substring(0, 7) + '…' : r.orgName,
      목표:   unitValue(Math.max(0, r.monthGoal   ?? 0), unitMode),
      실적:   unitValue(Math.max(0, r.monthActual ?? 0), unitMode),
      전년:   unitValue(Math.max(0, r.prevYearActual ?? 0), unitMode),
      달성률: r.monthRate ?? 0,
    })),
    [chartPartRows, unitMode],
  );

  // ── 종합 뷰 컬럼 ──
  const summaryColumns: ColumnsType<ReturnType<typeof expandSummaryRows>[number]> = [
    {
      title: '조직', dataIndex: 'orgName', width: 160, fixed: 'left',
      onCell: (_, idx) => idx == null ? {} : idx % 3 === 0 ? { rowSpan: 3 } : { rowSpan: 0 },
      render: (v: string, record) => (
        <span style={{ fontWeight: record.rowType === 'hq' ? 900 : record.rowType === 'team' ? 800 : 700, color: record.rowType === 'hq' ? '#26378a' : undefined }}>
          {v}
        </span>
      ),
    },
    { title: '구분', dataIndex: '_label', width: 80, align: 'center' },
    {
      title: `선택기간: ${periodLabel}`,
      children: [
        { title: '목표', dataIndex: 'monthGoal', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '실적', dataIndex: 'monthActual', width: 110, align: 'right', render: (v: number) => <span style={{ color: TEAL, fontWeight: 700 }}>{fmtNum(v, unitMode)}</span> },
        { title: '달성률', dataIndex: 'monthRate', width: 80, align: 'center', render: (v: number) => <Tag color={rateColor(v)}>{fmtRate(v)}</Tag> },
        { title: '전년도실적', dataIndex: 'prevYearActual', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '증감', dataIndex: 'yoyDiff', width: 110, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{v != null ? (v >= 0 ? '▲' : '▼') + fmtNum(Math.abs(v), unitMode) : '-'}</span> },
        { title: '증감률', dataIndex: 'yoyRate', width: 80, align: 'center', render: (v: number) => <Tag color={v >= 100 ? 'red' : 'blue'}>{fmtRate(v)}</Tag> },
      ],
    },
    {
      title: `누적: ${selYear}년 ${cumLabel}`,
      children: [
        { title: '실적', dataIndex: 'cumulativeActual', width: 110, align: 'right', render: (v: number) => <span style={{ color: TEAL, fontWeight: 700 }}>{fmtNum(v, unitMode)}</span> },
        { title: '달성률', dataIndex: 'cumulativeRate', width: 80, align: 'center', render: (v: number) => <Tag color={rateColor(v)}>{fmtRate(v)}</Tag> },
        { title: '전년동기간실적', dataIndex: 'cumulativePrevYearActual', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '증감률', dataIndex: 'yoyRate', width: 80, align: 'center', render: (v: number) => <Tag color={v >= 100 ? 'red' : 'blue'}>{fmtRate(v)}</Tag> },
      ],
    },
  ];

  // ── 실적 뷰 컬럼 ──
  const perfColumns: ColumnsType<IntegratedRow> = [
    {
      title: '조직', dataIndex: 'orgName', width: 160, fixed: 'left',
      render: (v: string, record) => (
        <span style={{ fontWeight: record.rowType === 'hq' ? 900 : record.rowType === 'team' ? 800 : 700, color: record.rowType === 'hq' ? '#26378a' : undefined }}>
          {v}
        </span>
      ),
    },
    {
      title: periodLabel,
      children: [
        { title: '목표', dataIndex: 'monthGoal', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '실적', dataIndex: 'monthActual', width: 110, align: 'right', render: (v: number) => <span style={{ color: TEAL, fontWeight: 700 }}>{fmtNum(v, unitMode)}</span> },
        { title: '전년실적', dataIndex: 'prevYearActual', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '증감', dataIndex: 'yoyDiff', width: 110, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{fmtNum(v, unitMode)}</span> },
        { title: '증감률', dataIndex: 'yoyRate', width: 80, align: 'center', render: (v: number) => <Tag color={v >= 100 ? 'red' : 'blue'}>{fmtRate(v)}</Tag> },
        { title: '달성률', dataIndex: 'monthRate', width: 80, align: 'center', render: (v: number) => <Tag color={rateColor(v)}>{fmtRate(v)}</Tag> },
      ],
    },
    {
      title: '누적',
      children: [
        { title: '누적목표', dataIndex: 'cumulativeGoal', width: 110, align: 'right', render: (v: number) => fmtNum(v, unitMode) },
        { title: '누적실적', dataIndex: 'cumulativeActual', width: 110, align: 'right', render: (v: number) => <span style={{ color: TEAL, fontWeight: 700 }}>{fmtNum(v, unitMode)}</span> },
        { title: '달성률', dataIndex: 'cumulativeRate', width: 80, align: 'center', render: (v: number) => <Tag color={rateColor(v)}>{fmtRate(v)}</Tag> },
      ],
    },
  ];

  const perfTotal = useMemo(() => rows.find((r) => r.rowType === 'hq'), [rows]);

  // ── 엑셀 ──
  const excelColumns = viewMode === 'summary'
    ? [
        { header: '조직', key: 'orgName' }, { header: '구분', key: '_label' },
        { header: `${periodLabel} 목표`, key: 'monthGoal' }, { header: `${periodLabel} 실적`, key: 'monthActual' },
        { header: '달성률', key: 'monthRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
        { header: '누적목표', key: 'cumulativeGoal' }, { header: '누적실적', key: 'cumulativeActual' },
        { header: '누적달성률', key: 'cumulativeRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
      ]
    : [
        { header: '조직', key: 'orgName' }, { header: '목표', key: 'monthGoal' }, { header: '실적', key: 'monthActual' },
        { header: '달성률', key: 'monthRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
        { header: '누적목표', key: 'cumulativeGoal' }, { header: '누적실적', key: 'cumulativeActual' },
        { header: '누적달성률', key: 'cumulativeRate', formatter: (v: unknown) => `${(v as number)?.toFixed(1)}%` },
        { header: '전년실적', key: 'prevYearActual' }, { header: '증감액', key: 'yoyDiff' },
      ];
  const excelData = (viewMode === 'summary' ? expandSummaryRows(orderedRowsWithSubtotals) : orderedRowsWithSubtotals) as unknown as Record<string, unknown>[];

  return (
    <PageLayout>

      {/* ── 타이틀 ── */}
      <div className="sm-rise" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, color: NAVY, lineHeight: 1.12, fontFamily: token.fontFamily }}>
            통합 실적
          </div>
        </div>
        <Button size="middle" icon={<ReloadOutlined />} loading={loading} onClick={loadData}
          style={{ fontWeight: 500, fontSize: 12, color: NAVY, borderColor: '#d1d5db' }}>
          새로고침
        </Button>
      </div>

      {/* ── 필터 ── */}
      <Space wrap style={{ marginBottom: 16 }}>
        <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
        <Select
          placeholder="팀 전체"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 130 }}
          value={teamCd}
          onChange={(value) => { setTeamCd(value); setPartCd(undefined); }}
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
        {/* 월보기/누계 토글 — 항상 월 단위로만 보므로 숨김(주석). 필요 시 periodType 상태와 함께 복원.
        <Select
          value={periodType}
          onChange={(v) => setPeriodType(v as PeriodType)}
          style={{ width: 100 }}
          options={[{ label: '월 보기', value: 'month' }, { label: '누계', value: 'cumulative' }]}
        /> */}
        <Radio.Group
          value={unitMode}
          onChange={(event) => setUnitMode(event.target.value)}
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: '백만단위', value: 'million' },
            { label: '원단위', value: 'won' },
          ]}
        />
        <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>
          조회 기준: {periodLabel}
        </Tag>
        <Segmented value={viewMode} onChange={(v) => setViewMode(v as ViewMode)}
          options={[{ label: '종합', value: 'summary' }, { label: '실적', value: 'performance' }]} />
        <ExcelDownloadBtn data={excelData} columns={excelColumns} fileName={`통합실적_${startDate.format('YYYYMMDD')}_${endDate.format('YYYYMMDD')}`} />
      </Space>

      {/* ── KPI 행 ── */}
      {loading ? (
        <div className="sm-rise" style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', marginBottom: 24 }}>
          <Skeleton active paragraph={{ rows: 1 }} />
        </div>
      ) : (
        <div className="sm-rise" style={{ display: 'flex', gap: 12, marginBottom: 24, animationDelay: '60ms', fontFamily: T.font }}>

          {/* 네이비 박스 — 당월실적 / 당월목표 / 달성률 */}
          <div style={{ background: NAVY, borderRadius: 14, padding: '20px 20px', display: 'flex', alignItems: 'stretch', gap: 12, flex: 3.5, boxShadow: '0 8px 24px rgba(0,57,87,0.30), 0 2px 6px rgba(0,57,87,0.15)' }}>
            <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{periodLabel} 실적</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                  <AnimatedNumber value={unitValue(monthActual, unitMode)} duration={900} />
                </span>
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', marginLeft: 6 }}>{unitMode === 'million' ? '백만원' : '원'}</span>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{periodLabel} 목표</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={unitValue(visibleTotalRow?.monthGoal, unitMode)} />
                </span>
                <span style={{ fontSize: 14, color: NAVY, marginLeft: 4 }}>{unitMode === 'million' ? '백만원' : '원'}</span>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', flex: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>달성률</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 900, color: (visibleTotalRow?.monthRate ?? 0) >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR, lineHeight: 1 }}>
                  {(visibleTotalRow?.monthRate ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: (visibleTotalRow?.monthRate ?? 0) >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR, marginLeft: 3 }}>%</span>
              </div>
            </div>
          </div>

          {/* 흰색 박스 — 누적실적 / 전체목표 / 누적달성률 */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px 20px', display: 'flex', alignItems: 'stretch', gap: 12, flex: 3.5, boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
            <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 8px' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{cumLabel} 누적실적</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 38, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={unitValue(cumulativeActual, unitMode)} duration={900} />
                </span>
                <span style={{ fontSize: 16, color: NAVY, marginLeft: 5 }}>{unitMode === 'million' ? '백만원' : '원'}</span>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f0f0f0' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{selYear}년 전체목표</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={unitValue(cumulativeGoalAmt, unitMode)} />
                </span>
                <span style={{ fontSize: 14, color: NAVY, marginLeft: 4 }}>{unitMode === 'million' ? '백만원' : '원'}</span>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', flex: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f0f0f0' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>누적달성률</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 900, color: derivedCumulativeRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR, lineHeight: 1 }}>
                  {derivedCumulativeRate.toFixed(1)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: derivedCumulativeRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR, marginLeft: 3 }}>%</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── 콤보 차트 (목표/실적/전년 Bar + 달성률 Line) ── */}
      <Card
        className="sm-card sm-rise"
        title={<span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>목표 / 실적 / 전년 비교</span>}
        extra={<span style={{ fontSize: 12, color: '#9CA3AF' }}>파트 기준 · {periodLabel} · 조직 간 목표/실적/전년 비교 + 달성률 꺾은선</span>}
        variant="borderless"
        style={{ borderRadius: 12, boxShadow: token.boxShadow, border: '1px solid #e5e7eb', marginBottom: 16, animationDelay: '120ms' }}
        styles={{ body: { padding: '12px 24px 16px' } }}
      >
        {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 60, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={<OrgAxisTick />} />
              {/* AM별 실적과 동일 형식: 좌축=달성률(%) 기준 프레임(15% 여유), 우축=금액(60% 여유로 막대가 라인 아래에서 놀게) */}
              <YAxis yAxisId="rate" axisLine={false} tickLine={false} width={44}
                tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={(v: number) => `${v}%`}
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]} />
              <YAxis
                yAxisId="amt" orientation="right" axisLine={false} tickLine={false} width={56}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.6)]}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }}
                formatter={(v: number, name: string) => name === '달성률' ? [`${v.toFixed(1)}%`] : [`${unitMode === 'million' ? v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : v.toLocaleString()}${unitMode === 'million' ? '백만' : '원'}`]}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 12 }} iconType="square" iconSize={10} />
              <Bar yAxisId="amt" dataKey="목표" fill={NAVY}    radius={[3, 3, 0, 0]} />
              <Bar yAxisId="amt" dataKey="실적" fill={TEAL}    radius={[3, 3, 0, 0]} />
              <Bar yAxisId="amt" dataKey="전년" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
              <Line yAxisId="rate" dataKey="달성률" type="monotone" stroke={POSITIVE_COLOR} strokeWidth={2}
                dot={{ r: 4, fill: POSITIVE_COLOR, strokeWidth: 0 }}
                label={{ position: 'top', fontSize: 10, fill: POSITIVE_COLOR, formatter: (v: number) => `${v.toFixed(1)}%` }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── 데이터 그리드 ── */}
      {viewMode === 'summary' && (
        <Table
          columns={summaryColumns}
          dataSource={expandSummaryRows(orderedRowsWithSubtotals)}
          rowKey={(_, idx) => `s-${idx}`}
          loading={loading}
          pagination={false}
          bordered
          size="middle"
          scroll={{ x: 1400 }}
          rowClassName={(record) => {
            if ((record as IntegratedRow).rowType === 'hq') return 'stats-row-hq';
            if ((record as IntegratedRow).rowType === 'team') return 'stats-row-team';
            return '';
          }}
        />
      )}
      {viewMode === 'performance' && (
        <Table
          columns={perfColumns}
          dataSource={orderedRowsWithSubtotals}
          rowKey={(_, idx) => `p-${idx}`}
          loading={loading}
          pagination={false}
          bordered
          size="middle"
          scroll={{ x: 1200 }}
          rowClassName={(record) => {
            if (record.rowType === 'hq') return 'stats-row-hq';
            if (record.rowType === 'team') return 'stats-row-team';
            return '';
          }}
          summary={() => perfTotal ? (
            <Table.Summary.Row className="stats-row-hq">
              <Table.Summary.Cell index={0}><strong>총합계</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><strong>{fmtNum(perfTotal.monthGoal, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><strong style={{ color: TEAL }}>{fmtNum(perfTotal.monthActual, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><strong>{fmtNum(perfTotal.prevYearActual, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><strong style={{ color: perfTotal.yoyDiff >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{fmtNum(perfTotal.yoyDiff, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="center"><Tag color={perfTotal.yoyRate >= 100 ? 'red' : 'blue'}>{fmtRate(perfTotal.yoyRate)}</Tag></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="center"><Tag color={rateColor(perfTotal.monthRate)}>{fmtRate(perfTotal.monthRate)}</Tag></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><strong>{fmtNum(perfTotal.cumulativeGoal, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right"><strong style={{ color: TEAL }}>{fmtNum(perfTotal.cumulativeActual, unitMode)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="center"><Tag color={rateColor(perfTotal.cumulativeRate)}>{fmtRate(perfTotal.cumulativeRate)}</Tag></Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      )}

      <style>{`
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .sm-rise { animation: smRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes smRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .sm-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .sm-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -4px rgba(0,57,87,0.12) !important; }
        .stats-row-hq td { background: #eef3ff !important; font-weight: 900; color: #26378a; }
        .stats-row-team td { background: #f8fafc !important; font-weight: 800; }
        @media (prefers-reduced-motion: reduce) { .sm-rise { animation: none; } .sm-card { transition: none; } }
      `}</style>
    </PageLayout>
  );
};

export default TeamForecastPage;
