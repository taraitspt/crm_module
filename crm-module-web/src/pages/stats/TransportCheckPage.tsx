import React, { useMemo, useState } from 'react';
import { Alert, Card, Col, Input, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getTransportDeptCheck } from '@/api/stats.api';
import { DEPT_MATCH, TRANSPORT_COLS, fmtNum, type TransportCol, type TransportRow } from '@/types/transportCheck';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

const { Text } = Typography;
/** 서버와 같은 한도 — TransportDeptController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 93;
const SUB = '운송정보입력에 넣은 부서(의 비용센터)와, 같은 주문번호·순번에 걸린 수주 라인의 비용센터를 대조합니다. 운송정보엔 비용센터가 없어 부서로 비교합니다.';

const cell = (col: TransportCol, v: TransportRow[string]) => {
  if (col.kind === 'num') return fmtNum(v);
  if (col.kind === 'date') return ymd(v);
  if (col.kind === 'match') {
    const m = DEPT_MATCH[String(v ?? '')];
    return m ? <Tooltip title={m.desc}><Tag color={m.color} style={{ margin: 0 }}>{m.label}</Tag></Tooltip> : '';
  }
  return v == null ? '' : String(v);
};

/**
 * 운송정보 부서 점검 — 데이터 점검 탭. 기본은 이번 달 등록분, "불일치"만.
 * 수주 없음(NO_SO)은 운송정보가 수주보다 먼저 들어가는 흐름상 흔하므로 기본 보기에서 뺀다.
 */
const TransportCheckPage: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [status, setStatus] = useState<string>('MISMATCH');
  const [emp, setEmp] = useState<string>();
  const [dept, setDept] = useState<string>();
  const [keyword, setKeyword] = useState('');

  const startDate = range[0].format('YYYY-MM-DD');
  const endDate = range[1].format('YYYY-MM-DD');
  const rangeTooLong = range[1].diff(range[0], 'day') >= MAX_RANGE_DAYS;
  const { data, isFetching, error } = useQuery({
    queryKey: ['transport-dept-check', startDate, endDate],
    queryFn: () => getTransportDeptCheck({ startDate, endDate }),
    enabled: !rangeTooLong,
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { MISMATCH: 0, MATCH: 0, NO_SO: 0, SO_MIXED: 0, NO_DEPT_CC: 0 };
    for (const r of all) c[String(r.deptMatch)] = (c[String(r.deptMatch)] ?? 0) + 1;
    return c;
  }, [all]);
  const withSo = all.length - counts.NO_SO;
  const opts = (k: string) => Array.from(new Set(all.map((r) => String(r[k] ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ value: v, label: v }));

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((r) => (status === 'all' || r.deptMatch === status)
      && (!emp || r.bizrsptEmpnoNm === emp)
      && (!dept || r.deptNm === dept)
      && (!kw || ['insertNo', 'orddocNo', 'orddocNm', 'sodocNo', 'saleprtnNm', 'bizrsptEmpnoNm', 'deptNm', 'soCcNm', 'delivPlace'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [all, status, emp, dept, keyword]);

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.deptMatch === 'MISMATCH') { const k = `${r.deptNm ?? r.deptCd}`; m.set(k, (m.get(k) ?? 0) + 1); }
    return Array.from(m, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [all]);

  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '운송정보를 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;
  const columns = useMemo<ColumnsType<TransportRow>>(() => [
    { title: 'No', key: '_no', width: 48, align: 'center', fixed: 'left', render: (_: unknown, __: TransportRow, i: number) => <span style={{ color: T.t4 }}>{i + 1}</span> },
    ...TRANSPORT_COLS.map((c) => ({ title: c.label, dataIndex: c.id, key: c.id, width: c.width, align: c.align, fixed: c.fixed, ellipsis: true, render: (v: TransportRow[string]) => cell(c, v) })),
  ], []);
  const excelColumns = TRANSPORT_COLS.map((c) => ({ header: c.label, key: c.id, formatter: c.kind === 'date' ? (v: unknown) => ymd(v as string) : c.kind === 'match' ? (v: unknown) => DEPT_MATCH[String(v ?? '')]?.label ?? '' : undefined }));

  const body = (
    <>
      <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
        <Col xs={12} md={6}><Kpi label="기간 운송정보" value={`${all.length.toLocaleString()}건`} sub={`${startDate} ~ ${endDate} 등록 · 수주 있음 ${withSo.toLocaleString()}건`} /></Col>
        <Col xs={12} md={6}><Kpi label="불일치" value={`${counts.MISMATCH.toLocaleString()}건`} color={counts.MISMATCH ? T.er : T.t1} sub={withSo ? `수주 있는 건의 ${Math.round((counts.MISMATCH / withSo) * 1000) / 10}%` : undefined} /></Col>
        <Col xs={12} md={6}><Kpi label="수주 없음 / CC 상이 / 부서 CC 없음" value={`${counts.NO_SO} / ${counts.SO_MIXED} / ${counts.NO_DEPT_CC}`} color={counts.SO_MIXED + counts.NO_DEPT_CC ? T.wa : T.t1} sub="수주 없음은 아직 수주 전이면 정상" /></Col>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '10px 14px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
            <Text style={{ fontSize: 12, color: T.t3 }}>불일치 많은 부서(운송)</Text>
            <div style={{ fontSize: 12, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {byDept.length === 0 ? <span style={{ color: T.t4 }}>없음</span> : byDept.map((e) => <Tag key={e.name} color="error" style={{ margin: 0, cursor: 'pointer' }} onClick={() => { setDept(e.name); setStatus('MISMATCH'); }}>{e.name} {e.n}</Tag>)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap size={[12, 8]} align="center">
          <span style={{ fontSize: 12, color: T.t3 }}>등록일</span>
          <StatsDateRangePicker value={range} onChange={setRange} width={250} />
          <Segmented value={status} onChange={(v) => setStatus(String(v))}
            options={[{ value: 'MISMATCH', label: `불일치 ${counts.MISMATCH}` }, { value: 'SO_MIXED', label: `수주 CC 상이 ${counts.SO_MIXED}` }, { value: 'NO_DEPT_CC', label: `부서 CC 없음 ${counts.NO_DEPT_CC}` }, { value: 'MATCH', label: `일치 ${counts.MATCH}` }, { value: 'NO_SO', label: `수주 없음 ${counts.NO_SO}` }, { value: 'all', label: `전체 ${all.length}` }]} />
          <Select allowClear showSearch placeholder="영업담당 전체" value={emp} onChange={setEmp} style={{ width: 140 }} options={opts('bizrsptEmpnoNm')} />
          <Select allowClear showSearch placeholder="부서(운송) 전체" value={dept} onChange={setDept} style={{ width: 150 }} options={opts('deptNm')} />
          <Input.Search allowClear placeholder="등록번호·주문번호·주문명·수주번호·거래처·납품처" style={{ width: 300 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <span style={{ fontSize: 12, color: T.t3 }}>{rows.length.toLocaleString()}건</span>
          <ExcelDownloadBtn data={rows} columns={excelColumns} fileName={`운송정보부서점검_${startDate}_${endDate}`} />
        </Space>
        {rangeTooLong && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`} />}
        {errMsg && <Alert type="error" showIcon style={{ marginTop: 8 }} message={errMsg} />}
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<TransportRow>
          size="small" bordered rowKey={(r) => String(r.insertNo)} dataSource={rows} columns={columns} loading={isFetching} pagination={false}
          scroll={{ x: TRANSPORT_COLS.reduce((s, c) => s + c.width, 48), y: 'calc(100vh - 400px)' }}
          rowClassName={(r) => (r.deptMatch === 'MISMATCH' ? 'trsp-row-mismatch' : r.deptMatch === 'SO_MIXED' || r.deptMatch === 'NO_DEPT_CC' ? 'trsp-row-unknown' : '')}
          locale={{ emptyText: status === 'MISMATCH' ? '기간 안에 부서가 어긋난 운송정보가 없습니다' : '해당하는 운송정보가 없습니다' }}
        />
      </Card>
      <style>{`
        .trsp-row-mismatch > td { background: ${T.erBg} !important; }
        .trsp-row-unknown > td { background: ${T.waBg} !important; }
        .ant-table-small .ant-table-thead > tr > th { font-size: 12px; padding: 5px 6px !important; white-space: nowrap; }
        .ant-table-small .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 6px !important; }
      `}</style>
    </>
  );
  if (embedded) return body;
  return (
    <PageLayout>
      <PageHeader title="운송정보 부서 점검" sub={SUB} />
      {body}
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

export default TransportCheckPage;
