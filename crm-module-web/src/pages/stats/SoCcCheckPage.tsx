import React, { useMemo, useState } from 'react';
import { Alert, Card, Col, Input, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import { getSoCcCheck } from '@/api/stats.api';
import { CC_MATCH, SO_CC_COLS, fmtAmt, type SoCcCol, type SoCcRow } from '@/types/soCcCheck';
import { ymd } from '@/types/orderProgress';
import StatsDateRangePicker from '@/pages/stats/components/StatsDateRangePicker';
import { T } from '@/theme/designTokens';

const { Text } = Typography;
/** 서버와 같은 한도 — SoCostCenterController.MAX_RANGE_DAYS. */
const MAX_RANGE_DAYS = 93;

const cell = (col: SoCcCol, v: SoCcRow[string]) => {
  if (col.kind === 'num') return fmtAmt(v);
  if (col.kind === 'date') return ymd(v);
  if (col.kind === 'match') {
    const m = CC_MATCH[String(v ?? '')];
    return m ? <Tooltip title={m.desc}><Tag color={m.color} style={{ margin: 0 }}>{m.label}</Tag></Tooltip> : '';
  }
  return v == null ? '' : String(v);
};

/**
 * 수주 담당팀 점검 — 수주(ERP SD_SO_MST)의 비용센터와 영업담당자 소속(CRM users.cc_cd)을 대조해 다른 것을 찾는다.
 * 기본은 이번 달, "불일치"만 보기. 담당자·수주 CC·담당자 CC 로 더 좁힐 수 있다.
 */
const SoCcCheckPage: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [status, setStatus] = useState<string>('MISMATCH');
  const [emp, setEmp] = useState<string>();
  const [cc, setCc] = useState<string>();
  const [keyword, setKeyword] = useState('');

  const startDate = range[0].format('YYYY-MM-DD');
  const endDate = range[1].format('YYYY-MM-DD');
  const rangeTooLong = range[1].diff(range[0], 'day') >= MAX_RANGE_DAYS;
  const { data, isFetching, error } = useQuery({
    queryKey: ['so-cc-check', startDate, endDate],
    queryFn: () => getSoCcCheck({ startDate, endDate }),
    enabled: !rangeTooLong,
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { MISMATCH: 0, MATCH: 0, NO_USER: 0, NO_CC: 0, MIXED: 0 };
    for (const r of all) c[String(r.ccMatch)] = (c[String(r.ccMatch)] ?? 0) + 1;
    return c;
  }, [all]);
  const opts = (k: string) => Array.from(new Set(all.map((r) => String(r[k] ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')).map((v) => ({ value: v, label: v }));

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((r) => (status === 'all' || r.ccMatch === status)
      && (!emp || r.bizrsptEmpnoNm === emp)
      && (!cc || r.ccNm === cc)
      && (!kw || ['sodocNo', 'purdocNo', 'orddocNm', 'saleprtnNm', 'bizrsptEmpnoNm', 'ccNm', 'empCcNm'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [all, status, emp, cc, keyword]);

  // 담당자별 불일치 요약 — 누가 자주 틀리는지
  const byEmp = useMemo(() => {
    const m = new Map<string, { n: number; amt: number }>();
    for (const r of all) if (r.ccMatch === 'MISMATCH') { const k = `${r.bizrsptEmpnoNm ?? r.bizrsptEmpnoCd}`; const o = m.get(k) ?? { n: 0, amt: 0 }; o.n++; o.amt += Number(r.soAmt ?? 0); m.set(k, o); }
    return Array.from(m, ([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [all]);

  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '수주를 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;
  const columns = useMemo<ColumnsType<SoCcRow>>(() => [
    { title: 'No', key: '_no', width: 48, align: 'center', fixed: 'left', render: (_: unknown, __: SoCcRow, i: number) => <span style={{ color: T.t4 }}>{i + 1}</span> },
    ...SO_CC_COLS.map((c) => ({ title: c.label, dataIndex: c.id, key: c.id, width: c.width, align: c.align, fixed: c.fixed, ellipsis: true, render: (v: SoCcRow[string]) => cell(c, v) })),
  ], []);
  const excelColumns = SO_CC_COLS.map((c) => ({ header: c.label, key: c.id, formatter: c.kind === 'date' ? (v: unknown) => ymd(v as string) : c.kind === 'match' ? (v: unknown) => CC_MATCH[String(v ?? '')]?.label ?? '' : undefined }));

  const body = (
    <>
      <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
        <Col xs={12} md={6}><Kpi label="기간 수주" value={`${all.length.toLocaleString()}건`} sub={`${startDate} ~ ${endDate}`} /></Col>
        <Col xs={12} md={6}><Kpi label="불일치" value={`${counts.MISMATCH.toLocaleString()}건`} color={counts.MISMATCH ? T.er : T.t1} sub={all.length ? `${Math.round((counts.MISMATCH / all.length) * 1000) / 10}%` : undefined} /></Col>
        <Col xs={12} md={6}><Kpi label="담당자 미등록 / CC 없음" value={`${counts.NO_USER} / ${counts.NO_CC}`} color={counts.NO_USER + counts.NO_CC ? T.wa : T.t1} sub="ERP 사원정보에 담당자·비용센터가 없는 수주" /></Col>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '10px 14px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
            <Text style={{ fontSize: 12, color: T.t3 }}>불일치 많은 담당자</Text>
            <div style={{ fontSize: 12, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {byEmp.length === 0 ? <span style={{ color: T.t4 }}>없음</span> : byEmp.map((e) => <Tag key={e.name} color="error" style={{ margin: 0, cursor: 'pointer' }} onClick={() => { setEmp(e.name); setStatus('MISMATCH'); }}>{e.name} {e.n}</Tag>)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 10 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap size={[12, 8]} align="center">
          <span style={{ fontSize: 12, color: T.t3 }}>수주일</span>
          <StatsDateRangePicker value={range} onChange={setRange} width={250} />
          <Segmented value={status} onChange={(v) => setStatus(String(v))}
            options={[{ value: 'MISMATCH', label: `불일치 ${counts.MISMATCH}` }, { value: 'NO_USER', label: `담당자 미등록 ${counts.NO_USER}` }, { value: 'NO_CC', label: `CC 없음 ${counts.NO_CC}` }, { value: 'MIXED', label: `라인별 상이 ${counts.MIXED}` }, { value: 'MATCH', label: `일치 ${counts.MATCH}` }, { value: 'all', label: `전체 ${all.length}` }]} />
          <Select allowClear showSearch placeholder="영업담당 전체" value={emp} onChange={setEmp} style={{ width: 140 }} options={opts('bizrsptEmpnoNm')} />
          <Select allowClear showSearch placeholder="수주 비용센터 전체" value={cc} onChange={setCc} style={{ width: 170 }} options={opts('ccNm')} />
          <Input.Search allowClear placeholder="수주번호·주문번호·주문명·판매처·담당자" style={{ width: 280 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <span style={{ fontSize: 12, color: T.t3 }}>{rows.length.toLocaleString()}건 · 수주금액 <b>{fmtAmt(rows.reduce((s, r) => s + Number(r.soAmt ?? 0), 0))}</b></span>
          <ExcelDownloadBtn data={rows} columns={excelColumns} fileName={`수주담당팀점검_${startDate}_${endDate}`} />
        </Space>
        {rangeTooLong && <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.`} />}
        {errMsg && <Alert type="error" showIcon style={{ marginTop: 8 }} message={errMsg} />}
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<SoCcRow>
          size="small" bordered rowKey={(r) => String(r.sodocNo)} dataSource={rows} columns={columns} loading={isFetching} pagination={false}
          scroll={{ x: SO_CC_COLS.reduce((s, c) => s + c.width, 48), y: 'calc(100vh - 400px)' }}
          rowClassName={(r) => (r.ccMatch === 'MISMATCH' ? 'socc-row-mismatch' : r.ccMatch === 'NO_USER' || r.ccMatch === 'NO_CC' ? 'socc-row-unknown' : '')}
          locale={{ emptyText: status === 'MISMATCH' ? '기간 안에 비용센터가 어긋난 수주가 없습니다' : '해당하는 수주가 없습니다' }}
        />
      </Card>
      <style>{`
        .socc-row-mismatch > td { background: ${T.erBg} !important; }
        .socc-row-unknown > td { background: ${T.waBg} !important; }
        .ant-table-small .ant-table-thead > tr > th { font-size: 12px; padding: 5px 6px !important; white-space: nowrap; }
        .ant-table-small .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 6px !important; }
      `}</style>
    </>
  );
  // 데이터 점검 탭 안에서는 바깥이 레이아웃·제목을 그린다.
  if (embedded) return body;
  return (
    <PageLayout>
      <PageHeader title="수주 담당팀 점검" sub="수주 라인에 찍힌 비용센터와 영업담당자의 실제 소속을 대조합니다. 2팀 담당자가 1팀으로 올린 수주 같은 오등록을 찾습니다." />
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

export default SoCcCheckPage;
