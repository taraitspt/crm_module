import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnsType } from 'antd/es/table';
import { Button, Card, Radio, Select, Space, Table, Tag, message, Segmented } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAmDashboard } from '@/api/stats.api';
import { lookupApi } from '@/api/info.api';
import { ExcelDownloadBtn } from '@/components/table';
import { PageHeader, PageLayout } from '@/components/layout';
import { useAuthStore } from '@/store/authStore';
import type { AmDashboardDto, AmRow, ViewMode } from '@/types/stats';
import StatsDateRangePicker from './components/StatsDateRangePicker';

type UnitMode = 'million' | 'won';

const CHART_VISIBLE_COUNT = 12;
const CHART_ITEM_WIDTH = 112;
const CHART_AXIS_WIDTH = 96;

const chartColors = {
  goal: '#064964',
  actual: '#0797a6',
  prev: '#b9c8d0',
  rate: '#cf1322',
};

const POSITIVE_COLOR = '#cf1322';
const NEGATIVE_COLOR = '#1677ff';

const safeRate = (actual?: number, goal?: number) => (goal ? ((actual ?? 0) / goal) * 100 : 0);
const formatRate = (value?: number) => `${(value ?? 0).toFixed(1)}%`;
const rateColor = (value?: number) => {
  return (value ?? 0) >= 100 ? 'red' : 'blue';
};

const unitValue = (value: number | undefined, unit: UnitMode) => {
  const n = value ?? 0;
  // 백만단위는 소수 첫째자리까지 (21.1). 원단위는 그대로.
  return unit === 'million' ? Math.round(n / 100_000) / 10 : n;
};

const formatAmount = (value: number | undefined, unit: UnitMode) => {
  if (value == null) return '-';
  const v = unitValue(value, unit);
  // 백만단위는 소수 첫째자리 고정 표시(21.0, 21.1). 원단위는 그대로.
  return unit === 'million'
    ? v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : v.toLocaleString();
};

type SummaryAmRow = AmRow & { _label: string; _groupIdx: number };

function expandAmSummaryRows(rows: AmRow[], showInternalExternal: boolean): SummaryAmRow[] {
  const result: SummaryAmRow[] = [];
  rows.forEach((row, idx) => {
    result.push({ ...row, _label: '총실적', _groupIdx: idx });
    if (!showInternalExternal) return;
    result.push({
      ...row,
      _label: '내부실적',
      monthGoal: row.innerMonthGoal,
      monthActual: row.innerMonthActual,
      monthRate: row.innerMonthRate,
      cumulativeGoal: row.innerCumulativeGoal,
      cumulativeActual: row.innerCumulativeActual,
      cumulativeRate: row.innerCumulativeRate,
      prevYearActual: row.innerPrevYearActual,
      yoyRate: row.innerYoyRate,
      yoyDiff: (row.innerMonthActual ?? 0) - (row.innerPrevYearActual ?? 0),
      _groupIdx: idx,
    });
    result.push({
      ...row,
      _label: '외부실적',
      monthGoal: row.outerMonthGoal,
      monthActual: row.outerMonthActual,
      monthRate: row.outerMonthRate,
      cumulativeGoal: row.outerCumulativeGoal,
      cumulativeActual: row.outerCumulativeActual,
      cumulativeRate: row.outerCumulativeRate,
      prevYearActual: row.outerPrevYearActual,
      yoyRate: row.outerYoyRate,
      yoyDiff: (row.outerMonthActual ?? 0) - (row.outerPrevYearActual ?? 0),
      _groupIdx: idx,
    });
  });
  return result;
}

const AmGoalActualYoyPage: React.FC = () => {
  const { user } = useAuthStore();
  const isManager = user?.role === 'MANAGER';
  // 조회기간(기간 선택). 기본 = 이번 달 1일 ~ 오늘.
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [startDate, endDate] = dateRange;
  const periodLabel = `${startDate.format('M/D')}~${endDate.format('M/D')}`;
  const [unitMode, setUnitMode] = useState<UnitMode>('million');
  const [viewMode, setViewMode] = useState<ViewMode>('performance');
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [salesEmpNos, setSalesEmpNos] = useState<string[]>([]);
  const [departments, setDepartments] = useState<{ deptCd: number; deptNm: string; upDeptCd: number | null }[]>([]);
  const [salesEmpOptions, setSalesEmpOptions] = useState<{ label: string; value: string }[]>([]);
  const [data, setData] = useState<AmDashboardDto | null>(null);
  const [loading, setLoading] = useState(false);

  const teamOptions = useMemo(() => {
    const parentCds = new Set(departments.map((d) => d.upDeptCd).filter((v): v is number => v != null));
    return departments
      .filter((d) => parentCds.has(d.deptCd) && d.deptNm.trim() !== '임원')
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [departments]);

  const partOptions = useMemo(() => {
    if (!teamCd) return [];
    return departments
      .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [departments, teamCd]);

  const deptCds = useMemo(() => {
    if (partCd) return [partCd];
    if (!teamCd) return [];
    return [teamCd, ...departments
      .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
      .map((d) => String(d.deptCd))];
  }, [departments, partCd, teamCd]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: response } = await getAmDashboard(startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD'), deptCds, salesEmpNos);
      if (response.success) setData(response.data);
    } catch {
      message.error('AM별 실적을 조회하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, deptCds, salesEmpNos]);

  useEffect(() => {
    lookupApi.getDeptTree()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  // MANAGER는 서버에서도 본인 파트로만 제한된다. 팀/파트 조회조건도 동일하게 고정한다.
  useEffect(() => {
    if (!isManager || user?.deptCd == null || departments.length === 0) return;
    const ownPart = departments.find((d) => d.deptCd === user.deptCd);
    setPartCd(String(user.deptCd));
    setTeamCd(ownPart?.upDeptCd != null ? String(ownPart.upDeptCd) : undefined);
  }, [departments, isManager, user?.deptCd]);

  const handleSalesEmpSearch = async (value: string) => {
    if (!value.trim()) return;
    const items = await lookupApi.searchEmployees(value.trim());
    const allowedDeptCds = new Set(deptCds);
    const filteredItems = allowedDeptCds.size > 0
      ? items.filter((item) => item.deptCd != null && allowedDeptCds.has(String(item.deptCd)))
      : items;
    setSalesEmpOptions(filteredItems.map((item) => ({
      label: [item.name || item.employeeNo, item.departmentName ? `(${item.departmentName})` : '']
        .filter(Boolean)
        .join(' '),
      value: item.employeeNo,
    })));
  };

  const rows = useMemo(() => {
    const items = (data?.rows ?? []).filter((row) => row.rowType === 'item');
    return [...items].sort((a, b) => {
      const rateDiff = (b.monthRate ?? 0) - (a.monthRate ?? 0);
      if (rateDiff !== 0) return rateDiff;
      const actualDiff = (b.monthActual ?? 0) - (a.monthActual ?? 0);
      if (actualDiff !== 0) return actualDiff;
      return (a.amName ?? '').localeCompare(b.amName ?? '', 'ko');
    });
  }, [data?.rows]);

  const totals = useMemo(() => {
    const monthGoal = rows.reduce((sum, row) => sum + row.monthGoal, 0);
    const monthActual = rows.reduce((sum, row) => sum + row.monthActual, 0);
    const prevYearActual = rows.reduce((sum, row) => sum + row.prevYearActual, 0);
    const cumulativeGoal = rows.reduce((sum, row) => sum + row.cumulativeGoal, 0);
    const cumulativeActual = rows.reduce((sum, row) => sum + row.cumulativeActual, 0);
    const innerMonthGoal = rows.reduce((sum, row) => sum + row.innerMonthGoal, 0);
    const innerMonthActual = rows.reduce((sum, row) => sum + row.innerMonthActual, 0);
    const innerPrevYearActual = rows.reduce((sum, row) => sum + row.innerPrevYearActual, 0);
    const innerCumulativeGoal = rows.reduce((sum, row) => sum + row.innerCumulativeGoal, 0);
    const innerCumulativeActual = rows.reduce((sum, row) => sum + row.innerCumulativeActual, 0);
    const outerMonthGoal = rows.reduce((sum, row) => sum + row.outerMonthGoal, 0);
    const outerMonthActual = rows.reduce((sum, row) => sum + row.outerMonthActual, 0);
    const outerPrevYearActual = rows.reduce((sum, row) => sum + row.outerPrevYearActual, 0);
    const outerCumulativeGoal = rows.reduce((sum, row) => sum + row.outerCumulativeGoal, 0);
    const outerCumulativeActual = rows.reduce((sum, row) => sum + row.outerCumulativeActual, 0);
    return {
      monthGoal,
      monthActual,
      monthRate: safeRate(monthActual, monthGoal),
      prevYearActual,
      yoyDiff: monthActual - prevYearActual,
      yoyRate: prevYearActual ? (monthActual / prevYearActual) * 100 : 0,
      cumulativeGoal,
      cumulativeActual,
      cumulativeRate: safeRate(cumulativeActual, cumulativeGoal),
      innerMonthGoal,
      innerMonthActual,
      innerMonthRate: safeRate(innerMonthActual, innerMonthGoal),
      innerPrevYearActual,
      innerYoyDiff: innerMonthActual - innerPrevYearActual,
      innerCumulativeGoal,
      innerCumulativeActual,
      innerCumulativeRate: safeRate(innerCumulativeActual, innerCumulativeGoal),
      outerMonthGoal,
      outerMonthActual,
      outerMonthRate: safeRate(outerMonthActual, outerMonthGoal),
      outerPrevYearActual,
      outerYoyDiff: outerMonthActual - outerPrevYearActual,
      outerCumulativeGoal,
      outerCumulativeActual,
      outerCumulativeRate: safeRate(outerCumulativeActual, outerCumulativeGoal),
    };
  }, [rows]);

  // 종합 토글은 항상 총/내부/외부 3줄로 표시 — 통합실적(TeamForecastPage)과 동일(시점 게이팅 없음).
  const showInternalExternal = true;
  const summaryGroupSize = showInternalExternal ? 3 : 1;
  const summaryRows = useMemo(
    () => expandAmSummaryRows(rows, showInternalExternal),
    [rows, showInternalExternal],
  );

  // 실적·목표가 모두 0인(0원) AM 은 차트에서 제외 — 통합실적 차트와 동일 규칙.
  //  (매출등록 후 취소돼 실적 0이 된 건도 목표까지 0이면 차트에 안 뜬다.)
  const chartData = useMemo(() => rows
    .filter((row) => (row.monthActual ?? 0) > 0 || (row.monthGoal ?? 0) > 0)
    .map((row) => ({
      name: row.amName,
      목표: unitValue(row.monthGoal, unitMode),
      실적: unitValue(row.monthActual, unitMode),
      전년: unitValue(row.prevYearActual, unitMode),
      달성률: Number((row.monthRate ?? 0).toFixed(1)),
    })), [rows, unitMode]);
  const chartWidth = Math.max(CHART_VISIBLE_COUNT, chartData.length) * CHART_ITEM_WIDTH + CHART_AXIS_WIDTH;

  const columns: ColumnsType<AmRow> = [
    {
      title: 'AM',
      dataIndex: 'amName',
      fixed: 'left',
      width: 120,
      render: (value: string) => <strong>{value}</strong>,
    },
    { title: '팀', dataIndex: 'teamName', width: 110, render: (value) => value || '-' },
    { title: '파트', dataIndex: 'partName', width: 130, render: (value) => value || '-' },
    {
      title: periodLabel,
      children: [
        { title: '목표', dataIndex: 'monthGoal', width: 110, align: 'right', render: (value) => formatAmount(value, unitMode) },
        { title: '실적', dataIndex: 'monthActual', width: 110, align: 'right', className: 'am-actual-cell', render: (value) => formatAmount(value, unitMode) },
        {
          title: '달성률',
          dataIndex: 'monthRate',
          width: 86,
          align: 'center',
          render: (value: number) => <Tag color={rateColor(value)}>{formatRate(value)}</Tag>,
        },
      ],
    },
    { title: '전년', dataIndex: 'prevYearActual', width: 110, align: 'right', render: (value) => formatAmount(value, unitMode) },
    {
      title: '증감',
      dataIndex: 'yoyDiff',
      width: 110,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR, fontWeight: 800 }}>
          {value >= 0 ? '+' : ''}{formatAmount(value, unitMode)}
        </span>
      ),
    },
    { title: '누적목표', dataIndex: 'cumulativeGoal', width: 120, align: 'right', render: (value) => formatAmount(value, unitMode) },
    { title: '누적실적', dataIndex: 'cumulativeActual', width: 120, align: 'right', className: 'am-actual-cell', render: (value) => formatAmount(value, unitMode) },
    {
      title: '누적달성률',
      dataIndex: 'cumulativeRate',
      width: 100,
      align: 'center',
      render: (value: number) => <Tag color={rateColor(value)}>{formatRate(value)}</Tag>,
    },
  ];

  const summaryColumns: ColumnsType<SummaryAmRow> = [
    {
      title: 'AM',
      dataIndex: 'amName',
      fixed: 'left',
      width: 120,
      onCell: (_, index) => (index == null ? {} : index % summaryGroupSize === 0 ? { rowSpan: summaryGroupSize } : { rowSpan: 0 }),
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: '팀',
      dataIndex: 'teamName',
      width: 110,
      onCell: (_, index) => (index == null ? {} : index % summaryGroupSize === 0 ? { rowSpan: summaryGroupSize } : { rowSpan: 0 }),
      render: (value) => value || '-',
    },
    {
      title: '파트',
      dataIndex: 'partName',
      width: 130,
      onCell: (_, index) => (index == null ? {} : index % summaryGroupSize === 0 ? { rowSpan: summaryGroupSize } : { rowSpan: 0 }),
      render: (value) => value || '-',
    },
    { title: '구분', dataIndex: '_label', width: 88, align: 'center' },
    {
      title: periodLabel,
      children: [
        { title: '목표', dataIndex: 'monthGoal', width: 110, align: 'right', render: (value) => formatAmount(value, unitMode) },
        { title: '실적', dataIndex: 'monthActual', width: 110, align: 'right', className: 'am-actual-cell', render: (value) => formatAmount(value, unitMode) },
        {
          title: '달성률',
          dataIndex: 'monthRate',
          width: 86,
          align: 'center',
          render: (value: number) => <Tag color={rateColor(value)}>{formatRate(value)}</Tag>,
        },
      ],
    },
    { title: '전년', dataIndex: 'prevYearActual', width: 110, align: 'right', render: (value) => formatAmount(value, unitMode) },
    {
      title: '증감',
      dataIndex: 'yoyDiff',
      width: 110,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR, fontWeight: 800 }}>
          {value >= 0 ? '+' : ''}{formatAmount(value, unitMode)}
        </span>
      ),
    },
    { title: '누적목표', dataIndex: 'cumulativeGoal', width: 120, align: 'right', render: (value) => formatAmount(value, unitMode) },
    { title: '누적실적', dataIndex: 'cumulativeActual', width: 120, align: 'right', className: 'am-actual-cell', render: (value) => formatAmount(value, unitMode) },
    {
      title: '누적달성률',
      dataIndex: 'cumulativeRate',
      width: 100,
      align: 'center',
      render: (value: number) => <Tag color={rateColor(value)}>{formatRate(value)}</Tag>,
    },
  ];

  const excelColumns = [
    { header: 'AM', key: 'amName' },
    ...(viewMode === 'summary' ? [{ header: '구분', key: '_label' }] : []),
    { header: '팀', key: 'teamName' },
    { header: '파트', key: 'partName' },
    { header: `${periodLabel} 목표`, key: 'monthGoal' },
    { header: `${periodLabel} 실적`, key: 'monthActual' },
    { header: '달성률', key: 'monthRate', formatter: (value: unknown) => formatRate(Number(value)) },
    { header: '전년', key: 'prevYearActual' },
    { header: '증감', key: 'yoyDiff' },
    { header: '누적목표', key: 'cumulativeGoal' },
    { header: '누적실적', key: 'cumulativeActual' },
    { header: '누적달성률', key: 'cumulativeRate', formatter: (value: unknown) => formatRate(Number(value)) },
  ];

  const renderPerformanceSummary = () => (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0} colSpan={3}><strong>?⑷퀎</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={3} align="right"><strong>{formatAmount(totals.monthGoal, unitMode)}</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={4} align="right"><strong>{formatAmount(totals.monthActual, unitMode)}</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={5} align="center">
        <strong style={{ color: totals.monthRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(totals.monthRate)}</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={6} align="right"><strong>{formatAmount(totals.prevYearActual, unitMode)}</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={7} align="right">
        <strong style={{ color: totals.yoyDiff >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatAmount(totals.yoyDiff, unitMode)}</strong>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={8} align="right"><strong>{formatAmount(totals.cumulativeGoal, unitMode)}</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={9} align="right"><strong>{formatAmount(totals.cumulativeActual, unitMode)}</strong></Table.Summary.Cell>
      <Table.Summary.Cell index={10} align="center">
        <strong style={{ color: totals.cumulativeRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(totals.cumulativeRate)}</strong>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  );

  void renderPerformanceSummary;

  const summaryTotalRows = [
    {
      label: '총실적',
      monthGoal: totals.monthGoal,
      monthActual: totals.monthActual,
      monthRate: totals.monthRate,
      prevYearActual: totals.prevYearActual,
      yoyDiff: totals.yoyDiff,
      cumulativeGoal: totals.cumulativeGoal,
      cumulativeActual: totals.cumulativeActual,
      cumulativeRate: totals.cumulativeRate,
    },
    {
      label: '내부실적',
      monthGoal: totals.innerMonthGoal,
      monthActual: totals.innerMonthActual,
      monthRate: totals.innerMonthRate,
      prevYearActual: totals.innerPrevYearActual,
      yoyDiff: totals.innerYoyDiff,
      cumulativeGoal: totals.innerCumulativeGoal,
      cumulativeActual: totals.innerCumulativeActual,
      cumulativeRate: totals.innerCumulativeRate,
    },
    {
      label: '외부실적',
      monthGoal: totals.outerMonthGoal,
      monthActual: totals.outerMonthActual,
      monthRate: totals.outerMonthRate,
      prevYearActual: totals.outerPrevYearActual,
      yoyDiff: totals.outerYoyDiff,
      cumulativeGoal: totals.outerCumulativeGoal,
      cumulativeActual: totals.outerCumulativeActual,
      cumulativeRate: totals.outerCumulativeRate,
    },
  ].filter((row) => showInternalExternal || row.label === '총실적');

  const renderSummaryTotal = () => (
    <>
      {summaryTotalRows.map((row, index) => (
        <Table.Summary.Row key={row.label}>
          {index === 0 && <Table.Summary.Cell index={0} colSpan={3} rowSpan={summaryTotalRows.length}><strong>합계</strong></Table.Summary.Cell>}
          <Table.Summary.Cell index={3} align="center"><strong>{row.label}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={4} align="right"><strong>{formatAmount(row.monthGoal, unitMode)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={5} align="right"><strong>{formatAmount(row.monthActual, unitMode)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="center">
            <strong style={{ color: row.monthRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(row.monthRate)}</strong>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={7} align="right"><strong>{formatAmount(row.prevYearActual, unitMode)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={8} align="right">
            <strong style={{ color: row.yoyDiff >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatAmount(row.yoyDiff, unitMode)}</strong>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={9} align="right"><strong>{formatAmount(row.cumulativeGoal, unitMode)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={10} align="right"><strong>{formatAmount(row.cumulativeActual, unitMode)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell index={11} align="center">
            <strong style={{ color: row.cumulativeRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(row.cumulativeRate)}</strong>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      ))}
    </>
  );

  const excelData = (viewMode === 'summary' ? summaryRows : rows) as unknown as Record<string, unknown>[];

  return (
    <PageLayout>
      <PageHeader
        title="AM별 실적"
        titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }}
        actions={(
          <Space wrap>
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
            <Segmented<ViewMode>
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: '실적', value: 'performance' },
                { label: '종합', value: 'summary' },
              ]}
            />
          </Space>
        )}
      />

      <div className="am-page-subtitle">전년도 포함 영업담당자별 실적 확인</div>

      <Card className="am-filter-card" bordered={false}>
        <Space wrap size={8}>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
          <Select
            placeholder="팀 전체"
            allowClear={!isManager}
            disabled={isManager}
            showSearch
            optionFilterProp="label"
            style={{ width: 150 }}
            value={teamCd}
            onChange={(value) => {
              setTeamCd(value);
              setPartCd(undefined);
              setSalesEmpNos([]);
            }}
            options={teamOptions}
          />
          <Select
            placeholder="파트 전체"
            allowClear={!isManager}
            disabled={isManager || !teamCd}
            showSearch
            optionFilterProp="label"
            style={{ width: 190 }}
            value={partCd}
            onChange={(value) => {
              setPartCd(value);
              setSalesEmpNos([]);
            }}
            options={partOptions}
          />
          <Select
            mode="multiple"
            placeholder="영업담당자 검색"
            allowClear
            showSearch
            maxTagCount="responsive"
            filterOption={false}
            style={{ width: 220 }}
            value={salesEmpNos}
            onChange={setSalesEmpNos}
            onSearch={handleSalesEmpSearch}
            options={salesEmpOptions}
          />
          <Button type="primary" ghost>
            조회 기준: {periodLabel}
          </Button>
          <ExcelDownloadBtn
            data={excelData}
            columns={excelColumns}
            fileName={`AM별_실적_${startDate.format('YYYYMMDD')}_${endDate.format('YYYYMMDD')}`}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            새로고침
          </Button>
        </Space>
      </Card>

      <Card
        title="AM별 목표 / 실적 / 전년 비교"
        bordered={false}
        className="am-chart-card"
      >
        <div className="am-chart-scroll">
          <div className="am-chart-inner" style={{ width: chartWidth }}>
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 22, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#edf2f4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={54} />
                {/* 좌축=달성률(%) 기준 프레임(상단 15% 여유 → 라인이 상단에 위치).
                    우축=금액은 여유를 더 크게(60%) 줘서 막대가 달성률 라인 아래에서 놀게 한다. */}
                <YAxis
                  yAxisId="rate"
                  tickFormatter={(value: number) => `${value}%`}
                  tick={{ fontSize: 11 }}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                />
                <YAxis
                  yAxisId="amount"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.6)]}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === '달성률'
                      ? `${value}%`
                      : `${unitMode === 'million' ? value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : value.toLocaleString()}${unitMode === 'million' ? '백만' : '원'}`,
                    name,
                  ]}
                />
                <Legend />
                <Bar yAxisId="amount" dataKey="목표" fill={chartColors.goal} barSize={14} />
                <Bar yAxisId="amount" dataKey="실적" fill={chartColors.actual} barSize={14} />
                <Bar yAxisId="amount" dataKey="전년" fill={chartColors.prev} barSize={14} />
                <Line yAxisId="rate" type="monotone" dataKey="달성률" stroke={chartColors.rate} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList
                    dataKey="달성률"
                    position="top"
                    offset={8}
                    formatter={(value: number) => `${value}%`}
                    style={{ fontSize: 10, fill: chartColors.rate }}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Table<AmRow | SummaryAmRow>
        columns={(viewMode === 'summary' ? summaryColumns : columns) as ColumnsType<AmRow | SummaryAmRow>}
        dataSource={viewMode === 'summary' ? summaryRows : rows}
        rowKey={(row, index) => `${row.amName}-${'_label' in row ? row._label : '실적'}-${index}`}
        loading={loading}
        pagination={false}
        bordered
        size="middle"
        scroll={{ x: viewMode === 'summary' ? 1280 : 1180 }}
        className="am-performance-table"
        summary={() => viewMode === 'summary' ? renderSummaryTotal() : (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><strong>합계</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right"><strong>{formatAmount(totals.monthGoal, unitMode)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><strong>{formatAmount(totals.monthActual, unitMode)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="center">
              <strong style={{ color: totals.monthRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(totals.monthRate)}</strong>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right"><strong>{formatAmount(totals.prevYearActual, unitMode)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <strong style={{ color: totals.yoyDiff >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatAmount(totals.yoyDiff, unitMode)}</strong>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right"><strong>{formatAmount(totals.cumulativeGoal, unitMode)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={9} align="right"><strong>{formatAmount(totals.cumulativeActual, unitMode)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={10} align="center">
              <strong style={{ color: totals.cumulativeRate >= 100 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatRate(totals.cumulativeRate)}</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />

      <style>{`
        .am-page-subtitle {
          margin-top: -12px;
          margin-bottom: 12px;
          color: #5f7784;
          font-size: 12px;
          font-weight: 700;
        }

        .am-filter-card {
          margin-bottom: 12px;
          border-radius: 6px;
          box-shadow: 0 1px 4px rgba(0, 33, 45, 0.06);
        }

        .am-filter-card .ant-card-body {
          padding: 12px;
        }

        .am-chart-card {
          margin-bottom: 12px;
          border-radius: 6px;
          box-shadow: 0 1px 4px rgba(0, 33, 45, 0.06);
        }

        .am-chart-card .ant-card-head {
          min-height: 42px;
        }

        .am-chart-card .ant-card-head-title {
          font-size: 14px;
          font-weight: 900;
          color: #0b2742;
        }

        .am-chart-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 4px;
        }

        .am-chart-inner {
          min-width: 100%;
        }

        .am-performance-table .ant-table {
          font-size: 12px;
          color: #0b2742;
        }

        .am-performance-table .ant-table-thead > tr > th {
          background: #e8f3f8;
          color: #0b2742;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
          padding: 8px 10px;
          border-color: #d7e5ed;
        }

        .am-performance-table .ant-table-tbody > tr > td,
        .am-performance-table .ant-table-summary > tr > td {
          padding: 8px 10px;
          border-color: #e5edf2;
          font-weight: 700;
        }

        .am-performance-table .am-actual-cell {
          background: #fff8d8;
        }

        .am-performance-table .ant-table-summary > tr > td {
          background: #f7fbfd;
          font-weight: 900;
        }

        .am-performance-table .ant-tag {
          min-width: 58px;
          text-align: center;
          border-radius: 999px;
          font-weight: 900;
          margin-inline-end: 0;
        }
      `}</style>
    </PageLayout>
  );
};

export default AmGoalActualYoyPage;
