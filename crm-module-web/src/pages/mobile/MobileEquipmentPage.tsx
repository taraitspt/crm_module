import React, { useState } from 'react';
import { Alert, Segmented, Tag } from 'antd';
import { CheckCircleOutlined, PauseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { WORK_CENTERS, type WorkCenter } from '@/types/equipmentPerf';
import { elapsed, fmtQty, useEquipmentBoard } from '@/pages/production/useEquipmentBoard';
import { T } from '@/theme/designTokens';
import { KpiTile, MCard, MEmpty } from './mobileKit';

/**
 * 생산 > 설비 가동 현황(모바일) — PC 보드와 같은 데이터(useEquipmentBoard). 인쇄/제본 작업장을 고르면 설비마다
 * 가동중(시작은 있고 종료가 없는 실적)/대기와 지금 돌리는 작업, 오늘 생산량을 카드로. 60초 자동 갱신.
 */
const MobileEquipmentPage: React.FC = () => {
  const [workCenter, setWorkCenter] = useState<WorkCenter>('WC20');
  const { now, states, kpi, isFetching, errMsg, dataUpdatedAt } = useEquipmentBoard(workCenter, true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Segmented size="small" value={workCenter} onChange={(v) => setWorkCenter(v as WorkCenter)} options={WORK_CENTERS} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.t3 }}>
          {isFetching ? <><SyncOutlined spin /> 갱신 중</> : dataUpdatedAt ? `${dayjs(dataUpdatedAt).format('HH:mm')} 갱신` : ''}
        </span>
      </div>
      {errMsg && <Alert type="error" showIcon message={errMsg} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KpiTile label="가동 중" value={`${kpi.running} / ${kpi.total}대`} color={kpi.running > 0 ? T.primary700 : T.t1} />
        <KpiTile label="오늘 생산" value={fmtQty(kpi.todayQty)} sub={`완료 ${kpi.todayDone}건`} />
      </div>
      {kpi.stale > 0 && <Alert type="warning" showIcon message={`시작 후 24시간 넘게 종료가 없는 설비 ${kpi.stale}대 — 실적 마감 확인`} />}

      {states.length === 0 && !isFetching && <MEmpty text="설비 실적이 없습니다" />}
      {states.map((s) => {
        const job = s.running ?? s.last;
        const border = s.running ? (s.stale ? T.wa : T.primary) : T.border1;
        return (
          <MCard key={s.eqpCd} style={{ borderLeft: `5px solid ${border}`, background: s.running && s.stale ? T.waBg : T.surface, opacity: s.running ? 1 : 0.85 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.eqpNm}</span>
              {s.running
                ? <Tag icon={<SyncOutlined spin />} color={s.stale ? 'warning' : 'processing'} style={{ marginInlineEnd: 0 }}>{s.stale ? '미종료' : '가동중'}</Tag>
                : <Tag icon={<PauseCircleOutlined />} style={{ marginInlineEnd: 0, color: T.t3 }}>대기</Tag>}
            </div>
            {job ? (
              <div style={{ marginTop: 6, fontSize: 12, color: T.t2, lineHeight: 1.7 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.spcfcsItemNm ?? '-'}</div>
                <div style={{ color: T.t3 }}>{job.partnerNm ?? '-'} · {job.orddocNo}</div>
                <div>
                  {job.opNm && <Tag style={{ marginInlineEnd: 4 }}>{String(job.opNm)}</Tag>}
                  {job.configNm && <Tag style={{ marginInlineEnd: 4 }}>{String(job.configNm)}</Tag>}
                  {job.prpcntSq != null && <span>{String(job.prpcntSq)}대</span>}
                  {job.gnrlPrwQt && <span> · 도수 {String(job.gnrlPrwQt)}</span>}
                  {job.totPgs != null && <span>{String(job.totPgs)}p</span>}
                  {job.fullPrpcntQt != null && <span> · {String(job.fullPrpcntQt)}대</span>}
                </div>
                {s.running
                  ? <div style={{ color: s.stale ? T.wa : T.primary700, fontWeight: 600 }}>{dayjs(String(job.startDts)).format('M/D HH:mm')} 시작 · {elapsed(String(job.startDts), now)} 경과</div>
                  : <div style={{ color: T.t3 }}><CheckCircleOutlined /> {job.endDts ? `${dayjs(String(job.endDts)).format('M/D HH:mm')} 종료` : '종료'} · 생산 {fmtQty(job.wrkQt)}</div>}
              </div>
            ) : <div style={{ marginTop: 6, fontSize: 12, color: T.t4 }}>어제~오늘 실적 없음</div>}
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border3}`, fontSize: 11, color: T.t3, display: 'flex', gap: 10 }}>
              <span>오늘 생산 <b style={{ color: T.t2 }}>{fmtQty(s.todayQty)}</b></span>
              <span>완료 <b style={{ color: T.t2 }}>{s.todayDone}</b>건</span>
            </div>
          </MCard>
        );
      })}
    </div>
  );
};

export default MobileEquipmentPage;
