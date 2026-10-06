import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Segmented, Select, Spin, Tag } from 'antd';
import { LeftOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { getProductionSchedule } from '@/api/production.api';
import { SCHEDULE_TABS, fmtQty, type ScheduleRow, type ScheduleTab } from '@/types/productionSchedule';
import { ymd } from '@/types/orderProgress';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { T } from '@/theme/designTokens';
import { KV, KpiTile, MCard, MEmpty } from './mobileKit';

const PAGE = 40;
const SPANS = [{ value: 1, label: '하루' }, { value: 3, label: '3일' }, { value: 7, label: '1주' }];

/** 탭마다 카드에 보여줄 수량 세 개(전체/작업/잔여)와 펼침 항목. 열 이름은 PC 의 SCHEDULE_COLS 와 같다. */
const QTY: Record<ScheduleTab, { total: string; done: string; rest: string; unit: string }> = {
  print: { total: 'tongCnt', done: 'workCnt', rest: 'reTongCnt', unit: '통' },
  bind: { total: 'ordQt', done: 'arltQt', rest: 'restQt', unit: '부' },
  coat: { total: 'netPpcntQt', done: 'prodQt', rest: 'reQt', unit: '' },
};
const FLAGS: Record<ScheduleTab, { id: string; label: string }[]> = {
  print: [{ id: 'cnfmYn', label: '확정' }, { id: 'prwIssueYn', label: '진행' }, { id: 'issueYn', label: '실적' }, { id: 'purwrhsngQtYn', label: '용지입고' }, { id: 'cmptYn', label: '원고' }, { id: 'prpcntCloseYn', label: '마감' }],
  bind: [{ id: 'cnfmYn', label: '확정' }, { id: 'planprwYn', label: '인쇄' }, { id: 'planorgmYn', label: '접지' }, { id: 'issueYn', label: '실적' }, { id: 'wrkCd', label: '완료' }, { id: 'prpcntCloseYn', label: '마감' }],
  coat: [{ id: 'cnfmYn', label: '확정' }, { id: 'issueYn', label: '발행' }, { id: 'prpcntCloseYn', label: '인쇄완료' }],
};
const DETAIL: Record<ScheduleTab, { id: string; label: string; kind?: 'date' | 'num' }[]> = {
  print: [
    { id: 'itemNm', label: '제품' }, { id: 'configNm', label: '구성' }, { id: 'plmkNm', label: '제판' }, { id: 'prpcntSq', label: '대수', kind: 'num' },
    { id: 'mtrilNm', label: '용지' }, { id: 'dtlSizeDc', label: '재단규격' }, { id: 'gnrlQt', label: '색도' }, { id: 'netPpcntQt', label: '정미매수', kind: 'num' }, { id: 'pageNo', label: '쪽수', kind: 'num' },
    { id: 'opNm', label: '제본공정' }, { id: 'bndPartnerNm', label: '제본처' }, { id: 'wrkNm', label: '후가공' }, { id: 'wrkTmCnt', label: '소요시간', kind: 'num' },
    { id: 'rcptPrrgDts', label: '원고입고', kind: 'date' }, { id: 'dlvshDts', label: '납기일', kind: 'date' }, { id: 'prRmkDc', label: '전달사항' },
  ],
  bind: [
    { id: 'itemNm', label: '제품' }, { id: 'bbndEqpNm', label: '제본처' }, { id: 'bbndInfoNm', label: '제본정보' }, { id: 'plteKndNm', label: '판형' }, { id: 'sizeDc', label: '사이즈' },
    { id: 'fullPrpcntQt', label: '콤마수', kind: 'num' }, { id: 'fullPageCnt', label: '전체페이지', kind: 'num' }, { id: 'packMthdNm', label: '포장' }, { id: 'packUnitDc', label: '포장단위' },
    { id: 'wrkTmCnt', label: '소요시간', kind: 'num' }, { id: 'dlvshDts', label: '납기일', kind: 'date' }, { id: 'prRmkDc', label: '전달사항' },
  ],
  coat: [
    { id: 'itemNm', label: '주문명' }, { id: 'opNm', label: '공정' }, { id: 'wrkNm', label: '작업' }, { id: 'intltshNm', label: '계열' }, { id: 'prpcntSq', label: '대수', kind: 'num' },
    { id: 'prwEqpNm', label: '인쇄설비' }, { id: 'prwPlanDt', label: '인쇄계획일', kind: 'date' }, { id: 'mtrilNm', label: '용지' }, { id: 'dtlSizeDc', label: '재단규격' }, { id: 'dtlDc', label: '터잡기' },
    { id: 'procQt', label: '수량(연)', kind: 'num' }, { id: 'procWrkNm', label: '후가공(전체)' }, { id: 'bndPartnerNm', label: '제본처' }, { id: 'prRmkDc', label: '전달사항' },
  ],
};
const n = (v: ScheduleRow[string]) => (v == null || v === '' ? 0 : Number(v) || 0);

/**
 * 생산 > 생산일정현황(모바일) — PC 생산일정현황과 같은 API(/api/production/schedule/{tab}). 기준일부터 하루/3일/1주를 보고
 * 설비유형·검색어로 좁힌다. 계획일마다 묶어 작업순서대로 카드. 카드 = 설비·순서·거래처·세부품목·수량(전체/작업/잔여 막대)·상태 플래그,
 * 누르면 용지·제본처·후가공·납기 같은 상세가 펼쳐지고 그 라인의 작업지시서로 갈 수 있다(생산계획조회 권한).
 */
const MobileSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const { menuKeys } = useMenuAccess();
  const canWorkOrder = menuKeys == null || menuKeys.has('/production/plan-register');
  const [tab, setTab] = useState<ScheduleTab>('print');
  const [base, setBase] = useState<Dayjs>(() => dayjs().startOf('day'));
  const [span, setSpan] = useState(1);
  const [eqpTp, setEqpTp] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const meta = SCHEDULE_TABS.find((t) => t.key === tab)!;
  const startDate = base.format('YYYY-MM-DD');
  const endDate = base.add(span - 1, 'day').format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['m-schedule', tab, startDate, endDate, eqpTp ?? ''],
    queryFn: () => getProductionSchedule(tab, { startDate, endDate, eqpTp }),
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return all;
    return all.filter((r) => ['planNo', 'orddocNo', 'partnerNm', 'itemNm', 'spcfcsItemNm', 'eqpNm', 'mtrilNm', 'bndPartnerNm'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw)));
  }, [all, keyword]);
  const q = QTY[tab];
  const kpi = useMemo(() => ({
    cnt: rows.length,
    cnfm: rows.filter((r) => r.cnfmYn === 'Y').length,
    closed: rows.filter((r) => r.prpcntCloseYn === 'Y').length,
    rest: rows.reduce((s, r) => s + Math.max(0, n(r[q.rest])), 0),
  }), [rows, q.rest]);
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '생산일정을 가져오지 못했습니다. ERP(오라클) 연결을 확인하세요.') : null;

  // 계획일별 묶음 — 서버가 계획일·작업순서로 정렬해 주므로 순서대로 자르기만 한다.
  const groups = useMemo(() => {
    const out: { date: string; items: { row: ScheduleRow; key: string }[] }[] = [];
    rows.slice(0, limit).forEach((row, i) => {
      const d = ymd(row.planDt) || '-';
      if (!out.length || out[out.length - 1].date !== d) out.push({ date: d, items: [] });
      out[out.length - 1].items.push({ row, key: `${tab}-${i}` });
    });
    return out;
  }, [rows, limit, tab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Segmented block value={tab} onChange={(v) => { setTab(v as ScheduleTab); setEqpTp(undefined); setOpen(null); setLimit(PAGE); }} options={SCHEDULE_TABS.map((t) => ({ value: t.key, label: t.label }))} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => { setBase((b) => b.subtract(span, 'day')); setLimit(PAGE); }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: T.t1, flex: 1, textAlign: 'center' }}>
          {base.format('M/D(dd)')}{span > 1 ? ` ~ ${base.add(span - 1, 'day').format('M/D(dd)')}` : ''}
          {!base.isSame(dayjs(), 'day') && <Button size="small" type="link" style={{ padding: '0 4px', fontSize: 12 }} onClick={() => setBase(dayjs().startOf('day'))}>오늘</Button>}
        </span>
        <Button size="small" type="text" icon={<RightOutlined />} onClick={() => { setBase((b) => b.add(span, 'day')); setLimit(PAGE); }} />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Segmented size="small" value={span} onChange={(v) => { setSpan(Number(v)); setLimit(PAGE); }} options={SPANS} />
        {meta.eqpTypes.length > 1 && (
          <Select size="small" allowClear placeholder="설비유형 전체" value={eqpTp} onChange={(v) => { setEqpTp(v); setLimit(PAGE); }} style={{ flex: 1, minWidth: 0 }} options={meta.eqpTypes} />
        )}
      </div>
      <Input.Search allowClear size="small" placeholder="계획·주문번호·거래처·품목·설비·용지" onSearch={(v) => { setKeyword(v); setLimit(PAGE); }} onChange={(e) => { if (!e.target.value) setKeyword(''); }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <KpiTile label="계획" value={`${kpi.cnt}건`} sub={`확정 ${kpi.cnfm}`} />
        <KpiTile label={tab === 'coat' ? '인쇄완료' : '마감'} value={`${kpi.closed}건`} color={kpi.closed === kpi.cnt && kpi.cnt > 0 ? T.ok : T.t1} />
        <KpiTile label={`잔여${q.unit ? `(${q.unit})` : ''}`} value={fmtQty(kpi.rest, 0)} color={kpi.rest > 0 ? T.wa : T.t1} />
      </div>
      {errMsg && <Alert type="error" showIcon message={errMsg} />}
      {isFetching && !data && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
      {data && rows.length === 0 && <MEmpty text={`${meta.label} 계획이 없습니다`} />}

      {groups.map((g) => (
        <div key={g.date}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.t3, margin: '4px 2px 6px' }}>{g.date} <span style={{ fontWeight: 400 }}>· {g.items.length}건</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.items.map(({ row: r, key }) => {
              const expanded = open === key;
              const total = n(r[q.total]); const done = Math.min(n(r[q.done]), total); const rest = n(r[q.rest]);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const closed = r.prpcntCloseYn === 'Y';
              return (
                <MCard key={key} onClick={() => setOpen(expanded ? null : key)} style={{ borderLeft: `4px solid ${closed ? T.ok : r.cnfmYn === 'Y' ? T.primary : T.border1}`, opacity: closed ? 0.8 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.t1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.eqpNm ?? r.eqpCd ?? '-')}</span>
                    {r.schdulSq != null && <span style={{ fontSize: 12, color: T.t3 }}>#{String(r.schdulSq)}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: T.t3, whiteSpace: 'nowrap' }}>{String(r.orddocNo ?? '')}{r.orddocSq != null ? `-${String(r.orddocSq)}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.t1, marginTop: 4, overflow: expanded ? 'visible' : 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
                    <span style={{ color: T.t3 }}>{String(r.partnerNm ?? '')}</span>{r.partnerNm ? ' · ' : ''}{String(r.spcfcsItemNm ?? r.itemNm ?? '')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 6, background: T.border2, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? T.ok : T.primary }} />
                    </div>
                    <span className="tabular-nums" style={{ fontSize: 12, color: T.t2, whiteSpace: 'nowrap' }}>
                      {fmtQty(done, 0)} / {fmtQty(total, 0)}{q.unit}{rest > 0 && <span style={{ color: T.wa }}> · 잔여 {fmtQty(rest, 0)}</span>}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {FLAGS[tab].map((f) => (
                      <Tag key={f.id} color={r[f.id] === 'Y' ? (f.id === 'prpcntCloseYn' || f.id === 'wrkCd' ? 'success' : 'processing') : 'default'} style={{ margin: 0, fontSize: 11, lineHeight: '18px', opacity: r[f.id] === 'Y' ? 1 : 0.55 }}>{f.label}</Tag>
                    ))}
                  </div>
                  {expanded && (
                    <div style={{ marginTop: 8, paddingTop: 4, borderTop: `1px solid ${T.border3}` }}>
                      <KV label="계획">{String(r.planNo ?? '')}{r.planSq != null ? ` · ${String(r.planSq)}` : ''}{r.planLowSq != null ? `-${String(r.planLowSq)}` : ''}</KV>
                      {DETAIL[tab].filter((d) => r[d.id] != null && r[d.id] !== '').map((d) => (
                        <KV key={d.id} label={d.label}>{d.kind === 'date' ? ymd(r[d.id]) : d.kind === 'num' ? fmtQty(r[d.id]) : <span style={{ whiteSpace: 'pre-wrap' }}>{String(r[d.id])}</span>}</KV>
                      ))}
                      {canWorkOrder && r.orddocNo && (
                        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                          <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/production/work-order/${encodeURIComponent(String(r.orddocNo))}${r.orddocSq != null ? `/${r.orddocSq}` : ''}`)}>작업지시서</Button>
                        </div>
                      )}
                    </div>
                  )}
                </MCard>
              );
            })}
          </div>
        </div>
      ))}
      {rows.length > limit && <Button block onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({rows.length - limit}건 남음)</Button>}
    </div>
  );
};

export default MobileSchedulePage;
