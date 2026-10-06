import React, { useMemo, useState } from 'react';
import { Alert, Card, Col, Input, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getStockLeftover } from '@/api/stats.api';
import { BILL_STATUS, LEFTOVER_COLS, fmtQty, type LeftoverCol, type LeftoverRow } from '@/types/stockLeftover';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

const cell = (col: LeftoverCol, v: LeftoverRow[string]) => {
  if (col.kind === 'num') return fmtQty(v);
  if (col.kind === 'date') return ymd(v);
  if (col.kind === 'status') {
    const m = BILL_STATUS[String(v ?? '')];
    return m ? <Tooltip title={m.desc}><Tag color={m.color} style={{ margin: 0 }}>{m.label}</Tag></Tooltip> : '';
  }
  return v == null ? '' : String(v);
};

/**
 * 매출 후 잔여재고 — 매출은 등록됐는데 오늘 기준 재고자산이 남아 있는 주문 라인(배치 = 주문번호-순번).
 * 기본은 전체(마지막 매출일 제한 없음). "전량 매출"(매출수량 ≥ 주문수량)인데 재고가 남은 것이 정리 대상이고, "부분 매출"은 분할매출 진행 중일 수 있다.
 */
const StockLeftoverPage: React.FC = () => {
  const [useRange, setUseRange] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(3, 'month').startOf('month'), dayjs()]);
  const [status, setStatus] = useState<'all' | 'FULL' | 'PARTIAL'>('all');
  const [dept, setDept] = useState<string>();
  const [keyword, setKeyword] = useState('');

  const billFrom = useRange ? range[0].format('YYYY-MM-DD') : undefined;
  const billTo = useRange ? range[1].format('YYYY-MM-DD') : undefined;
  const { data, isFetching, error, dataUpdatedAt } = useQuery({
    queryKey: ['stock-leftover', billFrom, billTo],
    queryFn: () => getStockLeftover({ billFrom, billTo }),
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const depts = useMemo(() => Array.from(new Set(all.map((r) => String(r.deptNm ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [all]);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((r) => (status === 'all' || r.billSt === status)
      && (!dept || r.deptNm === dept)
      && (!kw || ['batchNo', 'orddocNm', 'partnerNm', 'spcfcsItemNm', 'bizrsptEmpnoNm', 'itemNms', 'slNms', 'billdocNos'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [all, status, dept, keyword]);

  const sum = (list: LeftoverRow[], k: string) => list.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const full = all.filter((r) => r.billSt === 'FULL');
  const partial = all.filter((r) => r.billSt === 'PARTIAL');
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '재고를 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;

  const columns = useMemo<ColumnsType<LeftoverRow>>(() => [
    { title: 'No', key: '_no', width: 48, align: 'center', fixed: 'left', render: (_: unknown, __: LeftoverRow, i: number) => <span style={{ color: T.t4 }}>{i + 1}</span> },
    ...LEFTOVER_COLS.map((c) => ({ title: c.label, dataIndex: c.id, key: c.id, width: c.width, align: c.align, fixed: c.fixed, ellipsis: true, render: (v: LeftoverRow[string]) => cell(c, v) })),
  ], []);
  const excelColumns = LEFTOVER_COLS.map((c) => ({ header: c.label, key: c.id, formatter: c.kind === 'date' ? (v: unknown) => ymd(v as string) : c.kind === 'status' ? (v: unknown) => BILL_STATUS[String(v ?? '')]?.label ?? '' : undefined }));

  return (
    <PageLayout>
      <PageHeader title="매출 후 잔여재고" sub="매출은 등록됐는데 오늘 기준 재고자산이 남아 있는 주문(배치 = 주문번호-순번). ERP 재고자산 현황 기준." />

      <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
        <Col xs={12} md={6}><Kpi label="재고 남은 매출 배치" value={`${all.length.toLocaleString()}건`} sub={`재고 ${fmtQty(sum(all, 'stockQt'))}`} /></Col>
        <Col xs={12} md={6}><Kpi label="전량 매출인데 재고 남음" value={`${full.length.toLocaleString()}건`} color={full.length ? T.er : T.t1} sub={`재고 ${fmtQty(sum(full, 'stockQt'))} · 정리 대상`} /></Col>
        <Col xs={12} md={6}><Kpi label="부분 매출" value={`${partial.length.toLocaleString()}건`} color={T.bl} sub={`미매출 ${fmtQty(sum(partial, 'unbilledQt'))}`} /></Col>
        <Col xs={12} md={6}><Kpi label="기준" value={dayjs().format('M/D')} sub={dataUpdatedAt ? `조회 ${dayjs(dataUpdatedAt).format('HH:mm')} · 현재고 − 오늘 전표` : '현재고 − 오늘 전표'} /></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap size={[12, 8]} align="center">
          <Segmented value={status} onChange={(v) => setStatus(v as 'all' | 'FULL' | 'PARTIAL')}
            options={[{ value: 'all', label: `전체 ${all.length}` }, { value: 'FULL', label: `전량 매출 ${full.length}` }, { value: 'PARTIAL', label: `부분 매출 ${partial.length}` }]} />
          <Select allowClear placeholder="부서 전체" value={dept} onChange={setDept} style={{ width: 150 }} options={depts.map((d) => ({ value: d, label: d }))} />
          <Segmented value={useRange ? 'range' : 'all'} onChange={(v) => setUseRange(v === 'range')} options={[{ value: 'all', label: '마지막 매출일 전체' }, { value: 'range', label: '기간 지정' }]} />
          {useRange && <StatsDateRangePicker value={range} onChange={setRange} width={250} />}
          <Input.Search allowClear placeholder="배치·주문명·거래처·품목·담당자·창고·매출번호" style={{ width: 320 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <span style={{ fontSize: 12, color: T.t3 }}>{rows.length.toLocaleString()}건 · 재고 <b>{fmtQty(sum(rows, 'stockQt'))}</b></span>
          <ExcelDownloadBtn data={rows} columns={excelColumns} fileName={`매출후잔여재고_${dayjs().format('YYYYMMDD')}`} />
        </Space>
        {errMsg && <Alert type="error" showIcon style={{ marginTop: 8 }} message={errMsg} />}
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<LeftoverRow>
          size="small" bordered rowKey={(r) => String(r.batchNo)} dataSource={rows} columns={columns} loading={isFetching} pagination={false}
          scroll={{ x: LEFTOVER_COLS.reduce((s, c) => s + c.width, 48), y: 'calc(100vh - 400px)' }}
          rowClassName={(r) => (r.billSt === 'FULL' ? 'leftover-row-full' : '')}
          locale={{ emptyText: '매출 등록 후 재고가 남은 배치가 없습니다' }}
        />
      </Card>
      <style>{`
        .leftover-row-full > td { background: ${T.erBg} !important; }
        .ant-table-small .ant-table-thead > tr > th { font-size: 12px; padding: 5px 6px !important; white-space: nowrap; }
        .ant-table-small .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 6px !important; }
      `}</style>
    </PageLayout>
  );
};

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
      <Text style={{ fontSize: 12, color: T.t3 }}>{label}</Text>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

export default StockLeftoverPage;
