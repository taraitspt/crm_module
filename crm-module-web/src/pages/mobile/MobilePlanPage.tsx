import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Segmented, Spin, Tag } from 'antd';
import { PrinterOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getPlanOrderDetail, getPlanOrders } from '@/api/production.api';
import { PLAN_MODES, fmtNum, planStatusColor, type PlanMode, type PlanRow } from '@/types/planRegister';
import { ymd } from '@/types/orderProgress';
import { T } from '@/theme/designTokens';
import { MCard, MEmpty } from './mobileKit';

const PAGE = 30;
/** 서버 한도(31일) 안에서 고르는 기간 */
const RANGES = [{ value: 7, label: '최근 7일' }, { value: 14, label: '최근 2주' }, { value: 30, label: '최근 30일' }];

/**
 * 생산 > 작업지시서(모바일) — 생산계획조회의 축소판. 주문/의뢰를 고르고 번호·주문명·거래처로 찾은 뒤
 * 주문을 펼쳐 상세 순번(라인)을 고르면 그 라인의 작업지시서(/production/work-order/:no/:sq)를 연다. 작업지시서는 라인 하나당 한 장.
 */
const MobilePlanPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PlanMode>('order');
  const [days, setDays] = useState(7);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const doc = PLAN_MODES.find((m) => m.value === mode)!.doc;

  const endDate = dayjs().format('YYYY-MM-DD');
  const startDate = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['plan-register-orders', mode, startDate, endDate],
    queryFn: () => getPlanOrders({ startDate, endDate, mode }),
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((r) => (!status || r.planStNm === status)
      && (!kw || ['orddocNo', 'orddocNm', 'partnerNm', 'bizrsptEmpnoNm', 'planNo'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [all, keyword, status]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) { const k = String(r.planStNm ?? ''); c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [all]);

  const openWorkOrder = (no: string, sq: PlanRow[string]) => navigate(`/production/work-order/${encodeURIComponent(no)}/${sq}?mode=${mode}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Segmented size="small" value={mode} onChange={(v) => { setMode(v as PlanMode); setOpen(null); setLimit(PAGE); }}
          options={PLAN_MODES.map((m) => ({ value: m.value, label: m.label }))} />
        <Segmented size="small" value={days} onChange={(v) => { setDays(Number(v)); setLimit(PAGE); }} options={RANGES} />
      </div>
      <Input.Search allowClear placeholder={`${doc}번호·${doc}명·거래처·담당자·계획번호`} onSearch={(v) => { setKeyword(v); setLimit(PAGE); }}
        onChange={(e) => { if (!e.target.value) setKeyword(''); }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {['미작성', '작성중', '작성 완료'].map((s) => {
          const on = status === s;
          return (
            <button key={s} type="button" onClick={() => { setStatus(on ? undefined : s); setLimit(PAGE); }} style={{
              flex: 1, border: `1px solid ${on ? T.primary : T.border1}`, background: on ? T.primary50 : T.surface, borderRadius: 10, padding: '6px 0',
              fontFamily: T.font, cursor: 'pointer', color: on ? T.primary700 : T.t2, fontSize: 12,
            }}>
              {s} <b>{counts[s] ?? 0}</b>
            </button>
          );
        })}
      </div>
      {error && <Alert type="error" showIcon message={`${doc}리스트를 가져오지 못했습니다.`} />}
      {isFetching && all.length === 0 && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}
      {!isFetching && rows.length === 0 && <MEmpty text={`${startDate} ~ ${endDate} ${doc}이 없습니다`} />}

      {rows.slice(0, limit).map((r) => {
        const no = String(r.orddocNo);
        const isOpen = open === no;
        return (
          <MCard key={no} onClick={() => setOpen(isOpen ? null : no)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: T.t3 }}>{no}</span>
              <span style={{ flex: 1 }} />
              <Tag color={planStatusColor(r.planStNm)} style={{ margin: 0 }}>{String(r.planStNm ?? '')}</Tag>
              <RightOutlined style={{ color: T.t4, fontSize: 11, transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.t1, marginTop: 2 }}>{String(r.orddocNm ?? '')}</div>
            <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>
              {String(r.partnerNm ?? '')} · {String(r.bizrsptEmpnoNm ?? '')} · {ymd(r.ordDt)}
              {r.cnfmNList ? <span style={{ color: T.wa }}> · 미확정 {String(r.cnfmNList)}</span> : null}
            </div>
            {isOpen && <Lines orderNo={no} planNo={r.planNo ? String(r.planNo) : undefined} mode={mode} onOpen={(sq) => openWorkOrder(no, sq)} />}
          </MCard>
        );
      })}
      {rows.length > limit && <Button block onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({rows.length - limit}건 남음)</Button>}
    </div>
  );
};

/** 펼친 주문의 상세 순번(라인) — 줄마다 작업지시서 버튼. */
function Lines({ orderNo, planNo, mode, onOpen }: { orderNo: string; planNo?: string; mode: PlanMode; onOpen: (sq: PlanRow[string]) => void }) {
  const { data, isFetching, error } = useQuery({
    queryKey: ['plan-register-detail', mode, orderNo, planNo],
    queryFn: () => getPlanOrderDetail(orderNo, planNo, mode),
    staleTime: 60_000,
  });
  const lines = data?.data?.data ?? [];
  return (
    <div style={{ marginTop: 10, borderTop: `1px dashed ${T.border1}`, paddingTop: 8 }} onClick={(e) => e.stopPropagation()}>
      {isFetching && lines.length === 0 && <div style={{ textAlign: 'center', padding: 10 }}><Spin size="small" /></div>}
      {error && <Alert type="error" showIcon message="상세를 가져오지 못했습니다." />}
      {!isFetching && lines.length === 0 && !error && <div style={{ fontSize: 12, color: T.t4 }}>라인이 없습니다</div>}
      {lines.map((l) => (
        <div key={String(l.orddocSq)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border3}` }}>
          <span style={{ fontSize: 11, color: T.t4, minWidth: 22 }}>#{String(l.orddocSq)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(l.spcfcsItemNm ?? l.itemNm ?? '')}</div>
            <div style={{ fontSize: 11, color: T.t3 }}>{fmtNum(l.ordQt)}{String(l.ordUnitCd ?? '')} · {String(l.bbndInfoNm ?? '')}{l.dlvshDts ? ` · 납기 ${ymd(l.dlvshDts)}` : ''}</div>
          </div>
          <Button size="small" type="primary" ghost icon={<PrinterOutlined />} onClick={() => onOpen(l.orddocSq)}>지시서</Button>
        </div>
      ))}
      {!planNo && lines.length > 0 && <div style={{ fontSize: 11, color: T.t4, marginTop: 6 }}>생산계획이 아직 없는 {mode === 'order' ? '주문' : '의뢰'}이라 지시서에 인쇄 계획·용지현황은 비어 나옵니다.</div>}
    </div>
  );
}

export default MobilePlanPage;
