import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Radio, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQueries, useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { getPlanOrderDetail, getPlanOrders, getPlanTabRows } from '@/api/production.api';
import {
  ORDER_DETAIL_COLS, ORDER_LIST_COLS, PLAN_MODES, PLAN_STATUS, PLAN_TABS, PLAN_TAB_COLS, fmtNum, planStatusColor, relabel,
  type PlanCol, type PlanMode, type PlanRow, type PlanTab,
} from '@/types/planRegister';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

/** 서버와 같은 한도 — PlanRegisterController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 31;

const cell = (col: PlanCol, v: PlanRow[string]) => {
  if (col.kind === 'num') return fmtNum(v, 2);
  if (col.kind === 'date') return ymd(v);
  if (col.kind === 'yn') {
    if (v == null || v === '') return '';
    return <span style={{ color: v === 'Y' ? T.ok : T.t4, fontWeight: v === 'Y' ? 700 : 400 }}>{String(v)}</span>;
  }
  return v == null ? '' : String(v);
};

const toColumns = (cols: PlanCol[], withNo = true): ColumnsType<PlanRow> => [
  ...(withNo ? [{ title: 'No', key: '_no', width: 48, align: 'center' as const, fixed: 'left' as const,
    render: (_: unknown, __: PlanRow, i: number) => <span style={{ color: T.t4 }}>{i + 1}</span> }] : []),
  ...cols.map((c) => ({
    title: c.label, dataIndex: c.id, key: c.id, width: c.width, align: c.align, ellipsis: true,
    render: (v: PlanRow[string]) => cell(c, v),
  })),
];
const widthOf = (cols: PlanCol[]) => cols.reduce((s, c) => s + c.width, 48);

/**
 * 생산계획조회 — ERP "생산계획등록(타라)" 화면을 조회 전용으로 옮긴 것.
 * 조회 방향은 주문적용(TOR…)/의뢰적용(PQE…) 둘 — ERP 화면의 라디오와 같다. 공정 탭 쿼리는 같고 리스트·상세·작업지시서 머리만 테이블이 다르다.
 * 위: 주문리스트(주문일 기간) + 선택한 주문의 상세정보·공정별특이사항·생산 전달사항. 아래: 그 주문 계획의 인쇄·제판·후가공·접지·제본 탭.
 * 작업지시서는 주문상세 순번(라인) 하나당 한 장 — 상세 행을 고르고 버튼(또는 상세 행 더블클릭)으로 /production/work-order/:orderNo/:sq 를 새 탭에 연다.
 */
const PlanRegisterPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [mode, setMode] = useState<PlanMode>('order');
  const doc = PLAN_MODES.find((m) => m.value === mode)!.doc;
  const [status, setStatus] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [selectedNo, setSelectedNo] = useState<string>();
  const [selectedSq, setSelectedSq] = useState<number>();
  const [tab, setTab] = useState<PlanTab>('print');
  const [memoTab, setMemoTab] = useState<'proc' | 'plan'>('proc');

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');
  const rangeTooLong = dateRange[1].diff(dateRange[0], 'day') >= MAX_RANGE_DAYS;

  const ordersQ = useQuery({
    queryKey: ['plan-register-orders', mode, startDate, endDate],
    queryFn: () => getPlanOrders({ startDate, endDate, mode }),
    enabled: !rangeTooLong,
    staleTime: 60_000,
  });
  const allOrders = useMemo(() => ordersQ.data?.data?.data ?? [], [ordersQ.data]);

  const orders = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allOrders.filter((r) =>
      (!status || r.planStNm === status)
      && (!kw || ['orddocNo', 'orddocNm', 'partnerNm', 'bizrsptEmpnoNm', 'planNo', 'deptNm'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [allOrders, status, keyword]);

  // 목록이 바뀌면 선택이 목록 밖이면 첫 행으로
  useEffect(() => {
    if (!orders.length) { setSelectedNo(undefined); return; }
    if (!selectedNo || !orders.some((o) => o.orddocNo === selectedNo)) setSelectedNo(String(orders[0].orddocNo));
  }, [orders, selectedNo]);

  const selected = orders.find((o) => o.orddocNo === selectedNo);
  const orderNo = selected ? String(selected.orddocNo) : undefined;
  const planNo = selected?.planNo ? String(selected.planNo) : undefined;

  const detailQ = useQuery({
    queryKey: ['plan-register-detail', mode, orderNo, planNo],
    queryFn: () => getPlanOrderDetail(orderNo!, planNo, mode),
    enabled: !!orderNo,
    staleTime: 60_000,
  });
  const lines = useMemo(() => detailQ.data?.data?.data ?? [], [detailQ.data]);
  // 상세가 바뀌면 선택 라인이 없거나 목록 밖이면 첫 줄로
  useEffect(() => {
    if (!lines.length) { setSelectedSq(undefined); return; }
    if (selectedSq == null || !lines.some((l) => Number(l.orddocSq) === selectedSq)) setSelectedSq(Number(lines[0].orddocSq));
  }, [lines, selectedSq]);
  const selectedLine = lines.find((l) => Number(l.orddocSq) === selectedSq);

  const tabQs = useQueries({
    queries: PLAN_TABS.map((t) => ({
      queryKey: ['plan-register-tab', planNo, t.key, orderNo],
      queryFn: () => getPlanTabRows(planNo!, t.key, orderNo),
      enabled: !!planNo,
      staleTime: 60_000,
    })),
  });
  const tabIdx = PLAN_TABS.findIndex((t) => t.key === tab);
  const tabRows = useMemo(() => tabQs[tabIdx]?.data?.data?.data ?? [], [tabQs, tabIdx]);
  const tabErr = tabQs[tabIdx]?.error as Error | undefined;

  // 공정별특이사항 = 주문 라인 비고(SD_ORDER_DTL.RMK_TXT). 생산 전달사항 = 계획 비고(PP_PLAN_MST.RMK_TXT, 주문리스트 rmkTxt).
  const procRemarks = lines.filter((l) => l.rmkTxt);
  const planRemark = selected?.rmkTxt ? String(selected.rmkTxt) : '';

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of allOrders) { const k = String(o.planStNm ?? ''); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [allOrders]);

  const orderColumns = useMemo<ColumnsType<PlanRow>>(() => toColumns(relabel(ORDER_LIST_COLS, mode)).map((c) =>
    (c.key === 'planStNm'
      ? { ...c, render: (v: PlanRow[string]) => (v ? <Tag color={planStatusColor(v)} style={{ margin: 0 }}>{String(v)}</Tag> : '') }
      : c.key === 'cnfmNList'
        ? { ...c, render: (v: PlanRow[string]) => (v ? <span style={{ color: T.wa }}>{String(v)}</span> : '') }
        : c)), [mode]);

  const openWorkOrder = (no?: string, sq?: number) => {
    if (!no || sq == null) return;
    window.open(`/production/work-order/${encodeURIComponent(no)}/${sq}?mode=${mode}`, '_blank', 'noopener');
  };

  return (
    <PageLayout>
      <PageHeader
        title="생산계획조회"
        sub="ERP 생산계획등록 화면의 조회 전용 — 주문을 고르면 상세와 공정별(인쇄·제판·후가공·접지·제본) 계획이 나옵니다."
        actions={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => ordersQ.refetch()} loading={ordersQ.isFetching}>새로고침</Button>
            <Tooltip title={selectedLine ? `${orderNo} #${selectedSq} ${String(selectedLine.spcfcsItemNm ?? '')} 작업지시서를 새 탭으로 엽니다 (라인 하나당 한 장)` : '주문상세에서 라인을 선택하세요'}>
              <Button type="primary" icon={<PrinterOutlined />} disabled={!selectedLine} onClick={() => openWorkOrder(orderNo, selectedSq)}>
                작업지시서{selectedSq != null ? ` #${selectedSq}` : ''}
              </Button>
            </Tooltip>
          </Space>
        )}
      />

      {/* 조회 조건 */}
      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap size={[12, 8]} align="center">
          <Radio.Group size="small" optionType="button" buttonStyle="solid" value={mode}
            onChange={(e) => { setMode(e.target.value as PlanMode); setSelectedNo(undefined); setKeyword(''); }}
            options={PLAN_MODES.map((m) => ({ value: m.value, label: m.label }))} />
          <span style={{ fontSize: 12, color: T.t3 }}>{doc}일자</span>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} width={250} />
          <span style={{ fontSize: 12, color: T.t3 }}>계획상태</span>
          <Select allowClear placeholder="전체" style={{ width: 130 }} value={status} onChange={setStatus}
            options={PLAN_STATUS.map((s) => ({ value: s, label: `${s} (${statusCounts.get(s) ?? 0})` }))} />
          <Input.Search allowClear placeholder={`${doc}번호·${doc}명·거래처·담당자·계획번호`} style={{ width: 300 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <span style={{ fontSize: 12, color: T.t3 }}>{orders.length.toLocaleString()}건 / 전체 {allOrders.length.toLocaleString()}건</span>
        </Space>
        {rangeTooLong && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`} />}
        {ordersQ.error && <Alert type="error" showIcon style={{ marginTop: 8 }} message={`${doc}리스트를 가져오지 못했습니다. ${(ordersQ.error as Error).message}`} />}
      </Card>

      {/* 주문리스트 + 주문상세 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 11fr) minmax(0, 13fr)', gap: 10, marginBottom: 10 }}>
        <Card size="small" title={<span style={{ fontWeight: 700 }}>{doc}리스트</span>} styles={{ body: { padding: 0 } }}>
          <Table<PlanRow>
            size="small" bordered rowKey={(r) => String(r.orddocNo)} dataSource={orders} columns={orderColumns}
            loading={ordersQ.isFetching} pagination={false} scroll={{ x: widthOf(ORDER_LIST_COLS), y: 300 }}
            onRow={(r) => ({ onClick: () => setSelectedNo(String(r.orddocNo)), style: { cursor: 'pointer' } })}
            rowClassName={(r) => (r.orddocNo === selectedNo ? 'plan-row-selected' : '')}
            locale={{ emptyText: <Empty description={`기간 안에 ${doc}이 없습니다`} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </Card>
        <Card size="small" styles={{ body: { padding: 0 } }}
          title={(
            <Space size={8}>
              <span style={{ fontWeight: 700 }}>{doc}상세정보</span>
              {selected && <span style={{ fontSize: 12, color: T.t3 }}>{String(selected.orddocNo)} · {String(selected.orddocNm ?? '')}</span>}
              {selected && <span style={{ fontSize: 11, color: T.t4 }}>행을 고르고 더블클릭하면 그 라인 작업지시서</span>}
              {selected && (planNo
                ? <Tag color="blue" style={{ margin: 0 }}>{planNo}</Tag>
                : <Tag style={{ margin: 0 }}>계획 미작성</Tag>)}
            </Space>
          )}>
          <Table<PlanRow>
            size="small" bordered rowKey={(r) => `${r.orddocNo}-${r.orddocSq}`} dataSource={lines} columns={toColumns(relabel(ORDER_DETAIL_COLS, mode))}
            loading={detailQ.isFetching} pagination={false} scroll={{ x: widthOf(ORDER_DETAIL_COLS), y: 160 }}
            onRow={(r) => ({ onClick: () => setSelectedSq(Number(r.orddocSq)), onDoubleClick: () => openWorkOrder(orderNo, Number(r.orddocSq)), style: { cursor: 'pointer' } })}
            rowClassName={(r) => (Number(r.orddocSq) === selectedSq ? 'plan-row-selected' : '')}
            locale={{ emptyText: <Empty description={selected ? '라인이 없습니다' : `${doc}을 선택하세요`} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
          <Tabs size="small" activeKey={memoTab} onChange={(k) => setMemoTab(k as 'proc' | 'plan')} style={{ padding: '0 12px' }}
            items={[
              { key: 'proc', label: `공정별특이사항${procRemarks.length ? ` (${procRemarks.length})` : ''}`, children: (
                <div style={{ minHeight: 64, maxHeight: 120, overflow: 'auto', fontSize: 12, color: T.t2, paddingBottom: 8 }}>
                  {procRemarks.length === 0
                    ? <span style={{ color: T.t4 }}>입력된 특이사항이 없습니다.</span>
                    : procRemarks.map((l) => (
                      <div key={String(l.orddocSq)} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: `1px dashed ${T.border2}` }}>
                        <span style={{ color: T.t4, minWidth: 28 }}>#{String(l.orddocSq)}</span>
                        <span style={{ color: T.t3, minWidth: 140 }}>{String(l.spcfcsItemNm ?? '')}</span>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{String(l.rmkTxt)}</span>
                      </div>
                    ))}
                </div>
              ) },
              { key: 'plan', label: '생산 전달사항', children: (
                <div style={{ minHeight: 64, maxHeight: 120, overflow: 'auto', fontSize: 12, color: T.t2, whiteSpace: 'pre-wrap', paddingBottom: 8 }}>
                  {planRemark || <span style={{ color: T.t4 }}>입력된 전달사항이 없습니다.</span>}
                </div>
              ) },
            ]} />
        </Card>
      </div>

      {/* 공정 탭 */}
      <Card size="small" styles={{ body: { padding: '0 12px 12px' } }}>
        <Tabs
          activeKey={tab} onChange={(k) => setTab(k as PlanTab)}
          items={PLAN_TABS.map((t, i) => {
            const n = tabQs[i]?.data?.data?.data?.length;
            return { key: t.key, label: <span>{t.label}{planNo && n != null ? <span style={{ color: T.t4, marginLeft: 4, fontSize: 12 }}>{n}</span> : null}</span> };
          })}
          tabBarExtraContent={selected && (
            <span style={{ fontSize: 12, color: T.t3 }}>
              {planNo ? <>계획 {planNo} · {String(selected.planStNm ?? '')}{selected.cnfmNList ? <span style={{ color: T.wa }}> · 미확정: {String(selected.cnfmNList)}</span> : null}</> : `이 ${doc}은 아직 생산계획이 없습니다.`}
            </span>
          )}
        />
        {tabErr && <Alert type="error" showIcon style={{ marginBottom: 8 }} message={`${PLAN_TABS[tabIdx].label} 탭을 가져오지 못했습니다. ${tabErr.message}`} />}
        <Table<PlanRow>
          size="small" bordered rowKey={(r) => [r.planNo, r.planSq, r.planLowSq, r.pageSq, r.lineSq, r.procsSq, r.keyValNm].map((v) => v ?? '').join('|')}
          dataSource={planNo ? tabRows : []} columns={toColumns(PLAN_TAB_COLS[tab])}
          loading={!!planNo && !!tabQs[tabIdx]?.isFetching} pagination={false} scroll={{ x: widthOf(PLAN_TAB_COLS[tab]), y: 360 }}
          rowClassName={(r) => (r.cnfmYn === 'N' ? 'plan-row-unconfirmed' : '')}
          locale={{ emptyText: <Empty description={!selected ? `${doc}을 선택하세요` : !planNo ? '계획 미작성' : `${PLAN_TABS[tabIdx].label} 계획 행이 없습니다`} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>
      <style>{`
        .plan-row-selected > td { background: ${T.primary50} !important; }
        .plan-row-unconfirmed > td { background: ${T.waBg} !important; }
        .ant-table-small .ant-table-thead > tr > th { font-size: 12px; padding: 5px 6px !important; white-space: nowrap; }
        .ant-table-small .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 6px !important; }
      `}</style>
    </PageLayout>
  );
};

export default PlanRegisterPage;
