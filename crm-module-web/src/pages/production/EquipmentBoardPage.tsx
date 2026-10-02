import React, { useState } from 'react';
import { Alert, Card, Col, Row, Segmented, Space, Switch, Tag, Typography } from 'antd';
import { CheckCircleOutlined, PauseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { PageHeader, PageLayout } from '@/components/layout';
import { WORK_CENTERS, type WorkCenter } from '@/types/equipmentPerf';
import { elapsed, fmtQty, useEquipmentBoard } from './useEquipmentBoard';
import { T } from '@/theme/designTokens';

const { Text } = Typography;
const fmtNum = fmtQty;

/**
 * 설비 가동 현황 — 설비마다 지금 무엇을 돌리고 있는지(작업시작시간은 있고 종료시간이 없는 실적) 한눈에.
 * 데이터·판정은 useEquipmentBoard(모바일 설비 화면과 공용). 60초마다 자동 갱신.
 */
const EquipmentBoardPage: React.FC = () => {
  const [workCenter, setWorkCenter] = useState<WorkCenter>('WC20');
  const [auto, setAuto] = useState(true);
  const { now, states, kpi, isFetching, errMsg, dataUpdatedAt } = useEquipmentBoard(workCenter, auto);

  return (
    <PageLayout>
      <PageHeader title="설비 가동 현황" titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f' }} />
      <Card size="small" style={{ marginBottom: 10 }}>
        <Space wrap size={12}>
          <Segmented value={workCenter} onChange={(v) => setWorkCenter(v as WorkCenter)} options={WORK_CENTERS} />
          <Space size={6}><Switch size="small" checked={auto} onChange={setAuto} /><span style={{ fontSize: 12, color: T.t3 }}>60초 자동 갱신</span></Space>
          <span style={{ fontSize: 12, color: T.t3 }}>
            {isFetching ? <><SyncOutlined spin /> 갱신 중</> : dataUpdatedAt ? `마지막 갱신 ${dayjs(dataUpdatedAt).format('HH:mm:ss')}` : ''}
            {' · '}기준: 어제~오늘 실적 · 행 단위는 <Link to="/production/equipment-perf">설비별 작업실적</Link>
          </span>
        </Space>
      </Card>
      {errMsg && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={errMsg} />}

      <Row gutter={[10, 10]} style={{ marginBottom: 10 }}>
        <Col xs={12} md={6}><Kpi label="가동 중" value={`${kpi.running} / ${kpi.total}대`} color={kpi.running > 0 ? T.primary700 : T.t1} /></Col>
        <Col xs={12} md={6}><Kpi label="대기" value={`${kpi.total - kpi.running}대`} /></Col>
        <Col xs={12} md={6}><Kpi label="오늘 생산수량" value={fmtNum(kpi.todayQty)} sub={`완료 ${kpi.todayDone}건`} /></Col>
        <Col xs={12} md={6}><Kpi label="미종료 24시간 초과" value={`${kpi.stale}건`} color={kpi.stale > 0 ? T.wa : T.t1} sub={kpi.stale > 0 ? '실적 마감 확인 필요' : undefined} /></Col>
      </Row>

      <Row gutter={[10, 10]}>
        {states.map((s) => {
          const job = s.running ?? s.last;
          const border = s.running ? (s.stale ? T.wa : T.primary) : T.border2;
          return (
            <Col key={s.eqpCd} xs={24} sm={12} lg={8} xl={6}>
              <Card variant="borderless" styles={{ body: { padding: '12px 14px' } }}
                style={{ borderRadius: 12, border: `1px solid ${border}`, borderLeft: `5px solid ${border}`, height: '100%',
                  background: s.running ? (s.stale ? T.waBg : T.surface) : T.surface, opacity: s.running ? 1 : 0.8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text strong style={{ fontSize: 15, color: T.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.eqpNm}</Text>
                  {s.running
                    ? <Tag icon={<SyncOutlined spin />} color={s.stale ? 'warning' : 'processing'} style={{ marginInlineEnd: 0 }}>{s.stale ? '미종료' : '가동중'}</Tag>
                    : <Tag icon={<PauseCircleOutlined />} style={{ marginInlineEnd: 0, color: T.t3 }}>대기</Tag>}
                </div>
                {job ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: T.t2, lineHeight: 1.7 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(job.spcfcsItemNm ?? '')}>
                      {job.spcfcsItemNm ?? '-'}
                    </div>
                    <div style={{ color: T.t3 }}>{job.partnerNm ?? '-'} · {job.orddocNo}</div>
                    <div>
                      {/* 인쇄: 구성·대수·앞/뒤·도수 / 제본: 공정·페이지·전체대수 — 있는 값만 */}
                      {job.opNm && <Tag color="default" style={{ marginInlineEnd: 4 }}>{String(job.opNm)}</Tag>}
                      {job.configNm && <Tag style={{ marginInlineEnd: 4 }}>{String(job.configNm)}</Tag>}
                      {job.prpcntSq != null && <span>{String(job.prpcntSq)}대</span>}
                      {job.pacVr1 && <span> · {String(job.pacVr1)}</span>}
                      {job.gnrlPrwQt && <span> · 도수 {String(job.gnrlPrwQt)}</span>}
                      {job.totPgs != null && <span>{String(job.totPgs)}p</span>}
                      {job.fullPrpcntQt != null && <span> · {String(job.fullPrpcntQt)}대</span>}
                      {job.shiftNm && <span> · {String(job.shiftNm)}</span>}
                    </div>
                    {s.running ? (
                      <div style={{ color: s.stale ? T.wa : T.primary700, fontWeight: 600 }}>
                        {dayjs(String(job.startDts)).format('M/D HH:mm')} 시작 · {elapsed(String(job.startDts), now)} 경과
                      </div>
                    ) : (
                      <div style={{ color: T.t3 }}><CheckCircleOutlined /> {job.endDts ? `${dayjs(String(job.endDts)).format('M/D HH:mm')} 종료` : '종료'} · 생산 {fmtNum(job.wrkQt)}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 12, color: T.t4 }}>어제~오늘 실적 없음</div>
                )}
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${T.border3}`, fontSize: 11, color: T.t3, display: 'flex', gap: 10 }}>
                  <span>오늘 생산 <b className="tabular-nums" style={{ color: T.t2 }}>{fmtNum(s.todayQty)}</b></span>
                  <span>완료 <b className="tabular-nums" style={{ color: T.t2 }}>{s.todayDone}</b>건</span>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </PageLayout>
  );
};

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
      <Text style={{ fontSize: 12, color: T.t3 }}>{label}</Text>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

export default EquipmentBoardPage;
