import React, { useMemo, useState } from 'react';
import { Alert, Card, Input, Segmented, Select, Space, Table, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getProductionSchedule } from '@/api/production.api';
import { SCHEDULE_COLS, SCHEDULE_TABS, fmtQty, type ScheduleCol, type ScheduleRow, type ScheduleTab } from '@/types/productionSchedule';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

/** 서버와 같은 한도 — ProductionScheduleController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

const cell = (col: ScheduleCol, v: ScheduleRow[string]) => {
  if (col.kind === 'num') return fmtQty(v);
  if (col.kind === 'date') return ymd(v);
  if (col.kind === 'yn') {
    if (v == null || v === '') return '';
    // 인쇄 탭 진행(prwIssueYn)은 실적 행 수라 숫자가 온다 — 0 이면 비움, 1 이상이면 Y 로
    const s = typeof v === 'number' ? (v > 0 ? 'Y' : '') : String(v);
    return s ? <span style={{ color: s === 'Y' ? T.ok : T.t4, fontWeight: s === 'Y' ? 700 : 400 }}>{s}</span> : '';
  }
  return v == null ? '' : String(v);
};

/**
 * 생산일정현황 — ERP 인쇄·제본·코팅 생산일정현황 이식. 계획일 기간(기본 오늘~7일) + 탭 안에서 설비 유형(매엽/국윤전/46윤전, 무선/중철/…)을 고른다.
 * 행 색: 마감(회색) · 미확정(주황). 숫자 요약은 탭의 대표 수량(통수/부수/매수)과 잔여 합.
 */
const ProductionSchedulePage: React.FC = () => {
  const [tab, setTab] = useState<ScheduleTab>('print');
  const [eqpTp, setEqpTp] = useState<Record<ScheduleTab, string>>({ print: '201', bind: '401', coat: '301' });
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs().add(7, 'day')]);
  const [keyword, setKeyword] = useState('');
  // 설비 선택 — 조회된 행의 설비명(코팅1호기·코팅2호기·외주(코팅) …)에서 고른다. 탭마다 따로 기억.
  const [eqp, setEqp] = useState<Record<ScheduleTab, string | undefined>>({ print: undefined, bind: undefined, coat: undefined });

  const meta = SCHEDULE_TABS.find((t) => t.key === tab)!;
  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const rangeTooLong = dateRange[1].diff(dateRange[0], 'day') >= MAX_RANGE_DAYS;
  const cur = eqpTp[tab];

  const { data, isFetching, error } = useQuery({
    queryKey: ['production-schedule', tab, cur, startDate, endDate],
    queryFn: () => getProductionSchedule(tab, { startDate, endDate, eqpTp: cur || undefined }),
    enabled: !rangeTooLong,
    staleTime: 60_000,
  });
  const allRows = useMemo<ScheduleRow[]>(() => {
    const list = data?.data?.data ?? [];
    const seen = new Map<string, number>();
    return list.map((r) => {
      const base = [r.planNo, r.planSq, r.planLowSq, r.orddocNo, r.orddocSq, r.eqpCd].map((v) => v ?? '').join('|');
      const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
      return { ...r, _key: n === 1 ? base : `${base}#${n}` } as ScheduleRow;
    });
  }, [data]);
  const eqpOptions = useMemo(() => Array.from(new Set(allRows.map((r) => String(r.eqpNm ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [allRows]);
  const curEqp = eqp[tab];
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allRows.filter((r) => (!curEqp || String(r.eqpNm ?? '') === curEqp)
      && (!kw || ['planNo', 'orddocNo', 'partnerNm', 'spcfcsItemNm', 'itemNm', 'eqpNm', 'mtrilNm'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [allRows, keyword, curEqp]);

  const cols = SCHEDULE_COLS[tab];
  const columns = useMemo<ColumnsType<ScheduleRow>>(() => [
    { title: 'No', key: '_no', width: 48, align: 'center', fixed: 'left', render: (_: unknown, __: ScheduleRow, i: number) => <span style={{ color: T.t4 }}>{i + 1}</span> },
    ...cols.map((c) => ({ title: c.label, dataIndex: c.id, key: c.id, width: c.width, align: c.align, fixed: c.fixed, ellipsis: true, render: (v: ScheduleRow[string]) => cell(c, v) })),
  ], [cols]);

  // 요약 — 탭 대표 수량·잔여, 마감/미확정 건수
  const qtyKey = tab === 'print' ? 'tongCnt' : tab === 'bind' ? 'ordQt' : 'netPpcntQt';
  const restKey = tab === 'print' ? 'reTongCnt' : tab === 'bind' ? 'restQt' : 'reQt';
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const closed = rows.filter((r) => r.prpcntCloseYn === 'Y').length;
  const unconfirmed = rows.filter((r) => r.cnfmYn !== 'Y').length;
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '생산일정을 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;

  const excelColumns = cols.map((c) => ({ header: c.label, key: c.id, formatter: c.kind === 'date' ? (v: unknown) => ymd(v as string) : undefined }));

  return (
    <PageLayout>
      <PageHeader title="생산일정현황" sub="ERP 인쇄·제본·코팅 생산일정현황 — 계획일 기간과 설비 유형으로 봅니다." />
      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: '0 12px 10px' } }}>
        <Tabs activeKey={tab} onChange={(k) => setTab(k as ScheduleTab)}
          items={SCHEDULE_TABS.map((t) => ({ key: t.key, label: t.label }))} />
        <Space wrap size={[12, 8]} align="center">
          {meta.eqpTypes.length > 1 && (
            <Segmented value={cur} onChange={(v) => setEqpTp((s) => ({ ...s, [tab]: String(v) }))}
              options={[...meta.eqpTypes.map((e) => ({ value: e.value, label: e.label })), { value: '', label: '전체' }]} />
          )}
          <Select allowClear showSearch placeholder="설비 전체" value={curEqp} onChange={(v) => setEqp((s) => ({ ...s, [tab]: v }))} style={{ width: 170 }}
            options={eqpOptions.map((e) => ({ value: e, label: `${e} (${allRows.filter((r) => String(r.eqpNm ?? '') === e).length})` }))} />
          <span style={{ fontSize: 12, color: T.t3 }}>계획일</span>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} width={250} />
          <Input.Search allowClear placeholder="계획번호·주문번호·거래처·품목·설비·용지" style={{ width: 300 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <span style={{ fontSize: 12, color: T.t3 }}>
            {rows.length.toLocaleString()}건 · {meta.qtyLabel} <b>{fmtQty(sum(qtyKey), 0)}</b> · 잔여 <b>{fmtQty(sum(restKey), 0)}</b>
            {' · '}<Tag color="default" style={{ margin: 0 }}>마감 {closed}</Tag> <Tag color="warning" style={{ margin: 0 }}>미확정 {unconfirmed}</Tag>
          </span>
          <ExcelDownloadBtn data={rows} columns={excelColumns} fileName={`생산일정현황_${meta.label}_${startDate}_${endDate}`} />
        </Space>
        {rangeTooLong && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`} />}
        {errMsg && <Alert type="error" showIcon style={{ marginTop: 8 }} message={errMsg} />}
      </Card>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<ScheduleRow>
          size="small" bordered rowKey={(r) => String(r._key)}
          dataSource={rows} columns={columns} loading={isFetching} pagination={false}
          scroll={{ x: cols.reduce((s, c) => s + c.width, 48), y: 'calc(100vh - 330px)' }}
          rowClassName={(r) => (r.prpcntCloseYn === 'Y' ? 'sched-row-closed' : r.cnfmYn !== 'Y' ? 'sched-row-unconfirmed' : '')}
          locale={{ emptyText: `${startDate} ~ ${endDate} ${meta.label} 일정이 없습니다` }}
        />
      </Card>
      <style>{`
        .sched-row-closed > td { background: ${T.border3} !important; color: ${T.t3}; }
        .sched-row-unconfirmed > td { background: ${T.waBg} !important; }
        .ant-table-small .ant-table-thead > tr > th { font-size: 12px; padding: 5px 6px !important; white-space: nowrap; }
        .ant-table-small .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 6px !important; }
      `}</style>
    </PageLayout>
  );
};

export default ProductionSchedulePage;
