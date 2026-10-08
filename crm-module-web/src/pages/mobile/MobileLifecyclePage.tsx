import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Segmented, Select, Spin } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, LeftOutlined, PrinterOutlined, RightOutlined, WarningFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { getLifecycleLines, getLifecycleStages } from '@/api/production.api';
import {
  STAGES, lineProgress, lineStatus, stageCounts, stageRowStatus,
  type LifecycleLine, type LifecycleStage, type LifecycleStageRow, type LineStatus,
} from '@/types/lifecycle';
import { T } from '@/theme/designTokens';
import { KV, MCard, MEmpty, fmtNum } from './mobileKit';

const PAGE = 40;
const md = (v?: string | number | null) => {
  const s = v == null ? '' : String(v);
  return /^\d{8}$/.test(s) ? `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))}` : '';
};
const STATUS: Record<LineStatus, { label: string; color: string }> = {
  progress: { label: '진행 중', color: T.primary700 },
  late: { label: '지연', color: T.er },
  done: { label: '완성', color: T.ok },
};

/** 공정 다섯 칸 — 다 끝난 공정은 공정 색으로 채우고, 일부면 테두리 + 분수, 계획 없으면 흐린 칸. */
const StageTrack: React.FC<{ line: LifecycleLine }> = ({ line }) => {
  const c = stageCounts(line);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 8 }}>
      {STAGES.map((s, i) => {
        const [n, d] = c[s.key];
        const all = n > 0 && d >= n;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ flex: '0 0 6px', height: 2, background: n ? s.head : T.border3 }} />}
            <div style={{
              flex: 1, minWidth: 0, textAlign: 'center', borderRadius: 8, padding: '3px 0', fontSize: 11, lineHeight: 1.25,
              color: !n ? T.t4 : all ? '#fff' : s.color, background: !n ? T.surface : all ? s.color : s.bg,
              border: `1px solid ${!n ? T.border3 : all ? s.color : s.head}`,
            }}>
              <div style={{ fontWeight: 700 }}>{s.label}</div>
              <div className="tabular-nums">{!n ? '—' : all ? '✓' : `${d}/${n}`}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const RowStatus: React.FC<{ r: LifecycleStageRow }> = ({ r }) => {
  const st = stageRowStatus(r);
  if (st === 'done') return <span style={{ color: T.ok, fontWeight: 700, whiteSpace: 'nowrap' }}><CheckCircleFilled /> 완료</span>;
  if (st === 'late') return <span style={{ color: T.er, fontWeight: 700, whiteSpace: 'nowrap' }}><WarningFilled /> 지연</span>;
  return <span style={{ color: T.t4, whiteSpace: 'nowrap' }}><ClockCircleOutlined /> 대기</span>;
};

/** 펼친 카드 — 공정 순서대로 계획 행을 세로로. 행 = 구성·대수 · 작업 · 설비(외주면 발주 업체) · 계획일/입고요청일 · 상태. */
const StageDetail: React.FC<{ line: LifecycleLine }> = ({ line }) => {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['lifecycle-stages', line.orderNo, line.orderSq],
    queryFn: () => getLifecycleStages(line.orderNo, line.orderSq),
    staleTime: 60_000,
  });
  const rows = useMemo(() => data?.data?.data ?? [], [data]);
  if (isFetching && !data) return <div style={{ textAlign: 'center', padding: 12 }}><Spin size="small" /></div>;
  if (isError) return <Alert type="error" showIcon message="공정 상세를 가져오지 못했습니다." />;
  if (!rows.length) return <div style={{ color: T.t3, fontSize: 12, padding: 6 }}>계획 행이 없습니다.</div>;

  const by = (k: LifecycleStage) => rows.filter((r) => r.stage === k);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {STAGES.map((s) => {
        const list = by(s.key);
        if (!list.length) return null;
        const done = list.filter((r) => r.closeYn === 'Y').length;
        return (
          <div key={s.key} style={{ borderLeft: `3px solid ${s.color}`, background: s.bg, borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: s.color }}>
              {s.label}<span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600 }}>{done}/{list.length}</span>
            </div>
            {list.map((r) => {
              const head = [r.configNm, r.prpcntSq ? `${r.prpcntSq}대` : '', s.key === 'BIND' ? (r.lastYn === 'Y' ? '완성품' : '보충') : ''].filter(Boolean).join(' ');
              const work = r.wrkNm && r.wrkNm !== r.opNm ? `${r.opNm ?? ''} · ${r.wrkNm}` : r.opNm;
              return (
                <div key={`${r.planLowSq}-${r.procsSq ?? 0}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, padding: '4px 0', borderTop: `1px dashed ${s.head}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.t1 }}><b>{head || '-'}</b>{work ? <span style={{ color: T.t2 }}> · {work}</span> : null}</div>
                    <div style={{ color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.vendorNm ? <b style={{ color: T.t1 }}>{r.vendorNm}</b> : r.eqpNm}
                      {r.vendorNm && r.eqpNm ? ` (${r.eqpNm})` : ''}
                      {r.qty ? ` · ${fmtNum(r.qty)}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: '0 0 auto', lineHeight: 1.35 }}>
                    <RowStatus r={r} />
                    <div style={{ color: T.t3 }}>{md(r.planDt)}{r.reqDt ? <span style={{ color: T.bl }}> · 입고 {md(r.reqDt)}</span> : null}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * 주문 타임라인(모바일) — PC 주문 타임라인와 같은 API. 순번(제품 하나)마다 제판→인쇄→후가공→접지→제본 진행을 카드로.
 * 주문 탭(주문진행현황)과 나란히 두고 어느 쪽을 쓸지 비교 중(사용자 2026-10-08). 기간 = 계획일 기준 한 달(서버 한도 31일).
 * 완료 기준은 PC 와 같다 — 대수마감 Y 또는 외부입고 설비(ProductionRules). 외주 공정은 설비 대신 발주 업체.
 */
const MobileLifecyclePage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { menuKeys } = useMenuAccess();
  const canWorkOrder = menuKeys == null || menuKeys.has('/production/plan-register');
  const myEmp = user?.employeeNo?.trim();
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [mine, setMine] = useState(!!myEmp);
  const [dept, setDept] = useState<string>();
  const [status, setStatus] = useState<LineStatus>();
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const startDate = month.format('YYYY-MM-DD');
  const endDate = month.endOf('month').format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['lifecycle-lines', startDate, endDate],
    queryFn: () => getLifecycleLines({ startDate, endDate }),
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const depts = useMemo(() => Array.from(new Set(all.map((l) => l.deptNm ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [all]);

  const base = useMemo(() => all.filter((l) =>
    (!mine || !myEmp || (l.empNo ?? '').trim() === myEmp) && (!dept || l.deptNm === dept)), [all, mine, myEmp, dept]);
  const counts = useMemo(() => {
    const c: Record<LineStatus, number> = { progress: 0, late: 0, done: 0 };
    for (const l of base) c[lineStatus(l)] += 1;
    return c;
  }, [base]);
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return base.filter((l) => (!status || lineStatus(l) === status)
      && (!kw || [l.orderNo, l.orderNm, l.partnerNm, l.detailItemNm].some((v) => v?.toLowerCase().includes(kw))));
  }, [base, status, keyword]);

  const reset = () => setLimit(PAGE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => { setMonth((m) => m.subtract(1, 'month')); reset(); }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, minWidth: 96, textAlign: 'center' }}>{month.format('YYYY년 M월')}</span>
        <Button size="small" type="text" icon={<RightOutlined />} onClick={() => { setMonth((m) => m.add(1, 'month')); reset(); }} />
        <div style={{ flex: 1 }} />
        {myEmp && (
          <Segmented size="small" value={mine ? 'mine' : 'all'} onChange={(v) => { setMine(v === 'mine'); reset(); }}
            options={[{ value: 'mine', label: '내 주문' }, { value: 'all', label: '전체' }]} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select allowClear placeholder="부서 전체" value={dept} onChange={(v) => { setDept(v); reset(); }}
          options={depts.map((d) => ({ value: d, label: d }))} style={{ flex: '0 0 46%' }} />
        <Input.Search allowClear placeholder="거래처·주문명·주문번호" onSearch={(v) => { setKeyword(v); reset(); }}
          onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ flex: 1 }} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {(['progress', 'late', 'done'] as const).map((k) => {
          const on = status === k;
          return (
            <button key={k} type="button" onClick={() => { setStatus(on ? undefined : k); reset(); }} style={{
              flex: 1, border: `1px solid ${on ? STATUS[k].color : T.border1}`, background: T.surface, borderRadius: 10,
              padding: '6px 4px', cursor: 'pointer', fontFamily: T.font, boxShadow: on ? `0 0 0 2px ${STATUS[k].color}33` : 'none',
            }}>
              <div style={{ fontSize: 11, color: T.t3 }}>{STATUS[k].label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: STATUS[k].color }}>{fmtNum(counts[k])}</div>
            </button>
          );
        })}
      </div>

      {!!error && <Alert type="error" showIcon message="주문 타임라인를 가져오지 못했습니다." />}
      {isFetching && !data && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}
      {data && (
        <div style={{ fontSize: 13, color: T.t3 }}>
          총 <b style={{ color: T.primary700, fontSize: 15 }}>{fmtNum(rows.length)}</b> 순번 <span style={{ fontSize: 11 }}>· 이 달에 계획일이 있는 것</span>
        </div>
      )}
      {data && rows.length === 0 && <MEmpty text={mine ? '내 담당 주문이 없습니다. "전체"로 바꿔 보세요.' : '해당하는 주문이 없습니다.'} />}

      {rows.slice(0, limit).map((l) => {
        const key = `${l.orderNo}-${l.orderSq}`;
        const st = lineStatus(l);
        const pct = lineProgress(l);
        const expanded = open === key;
        return (
          <MCard key={key} onClick={() => setOpen(expanded ? null : key)} style={{ borderLeft: `4px solid ${STATUS[st].color}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.t1, letterSpacing: '-0.01em' }}>
                {l.orderNo}<span style={{ fontSize: 12, color: T.t3, fontWeight: 500 }}> -{l.orderSq}</span>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: STATUS[st].color, whiteSpace: 'nowrap' }}>{STATUS[st].label}</span>
            </div>
            <div style={{ fontSize: 13, color: T.t1, marginTop: 4, overflow: expanded ? 'visible' : 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
              {l.detailItemNm || l.orderNm}
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: T.t3, marginTop: 2 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{l.partnerNm ?? '-'}</span>
              <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {l.empNm ?? ''}{l.finishDt ? ` · ${l.finishOpNm ?? '제본'} ${md(l.finishDt)}` : ''}
              </span>
            </div>
            <StageTrack line={l} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 5, background: T.border3, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: STATUS[st].color }} />
              </div>
              <span className="tabular-nums" style={{ fontSize: 11, color: T.t3, flex: '0 0 30px', textAlign: 'right' }}>{pct}%</span>
            </div>
            {expanded && (
              <div style={{ marginTop: 8, paddingTop: 4, borderTop: `1px solid ${T.border3}` }} onClick={(e) => e.stopPropagation()}>
                <KV label="주문명">{l.orderNm}</KV>
                <KV label="수량">{l.ordQt != null ? fmtNum(l.ordQt) : '-'}</KV>
                <KV label="일정">{md(l.firstDt)} ~ {md(l.lastDt)}{l.dueDts ? ` · 납기 ${md(l.dueDts)}` : ''}</KV>
                {l.deptNm && <KV label="부서">{l.deptNm}</KV>}
                <StageDetail line={l} />
                {canWorkOrder && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button size="small" icon={<PrinterOutlined />}
                      onClick={() => navigate(`/production/work-order/${encodeURIComponent(l.orderNo)}/${l.orderSq}`)}>이 순번 작업지시서</Button>
                  </div>
                )}
              </div>
            )}
          </MCard>
        );
      })}
      {rows.length > limit && <Button block onClick={() => setLimit((n) => n + PAGE)}>더 보기 ({rows.length - limit}건 남음)</Button>}
    </div>
  );
};

export default MobileLifecyclePage;
