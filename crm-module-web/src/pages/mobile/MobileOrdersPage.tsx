import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Segmented, Select, Spin, Tag } from 'antd';
import { LeftOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { getOrderProgress } from '@/api/production.api';
import { STAGE_LABEL, stageColor, stageGroup, ymd } from '@/types/orderProgress';
import { T } from '@/theme/designTokens';
import { KV, MCard, MEmpty, fmtCompact, fmtNum } from './mobileKit';

const PAGE = 40;
const GROUP_COLOR = { todo: T.t3, doing: T.primary700, shipped: T.bl, done: T.ok } as const;

/**
 * 주문 — 주문진행현황을 조회연월 단위로 카드로. 주문번호·주문명·담당자·수량·진행상태(굵게, 단계 색).
 * 기본은 내 담당(사번) 주문. 카드를 누르면 세부품목·납품예정·작업처·수주/매출번호가 펼쳐진다.
 * 펼친 카드에서 바로 작업지시서(이 순번 / 주문 전체)를 연다 — 생산 탭의 별도 작업지시서 검색 화면은 이걸로 대체(사용자 2026-10-06).
 * 버튼은 생산계획조회(/production/plan-register) 메뉴 권한이 있을 때만.
 */
const MobileOrdersPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { menuKeys } = useMenuAccess();
  const canWorkOrder = menuKeys == null || menuKeys.has('/production/plan-register');
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [mine, setMine] = useState(!!user?.employeeNo);
  const [dept, setDept] = useState<string>();
  const [stage, setStage] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const startDate = month.format('YYYY-MM-DD');
  const endDate = month.endOf('month').format('YYYY-MM-DD');
  const { data, isFetching, error } = useQuery({
    queryKey: ['order-progress', startDate, endDate],
    queryFn: () => getOrderProgress({ startDate, endDate }),
    staleTime: 60_000,
  });
  const all = useMemo(() => data?.data?.data ?? [], [data]);

  const depts = useMemo(() => Array.from(new Set(all.map((r) => String(r.deptNm ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [all]);
  const myEmp = user?.employeeNo?.trim();

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((r) =>
      (!mine || !myEmp || String(r.bizrsptEmpnoCd ?? '').trim() === myEmp)
      && (!dept || r.deptNm === dept)
      && (!stage || stageGroup(r.progNm) === stage)
      && (!kw || ['orddocNo', 'orddocNm', 'partnerNm', 'spcfcsItemNm'].some((k) => String(r[k] ?? '').toLowerCase().includes(kw))));
  }, [all, mine, myEmp, dept, stage, keyword]);

  const counts = useMemo(() => {
    const base = all.filter((r) => (!mine || !myEmp || String(r.bizrsptEmpnoCd ?? '').trim() === myEmp) && (!dept || r.deptNm === dept));
    const c = { todo: 0, doing: 0, shipped: 0, done: 0 };
    for (const r of base) c[stageGroup(r.progNm)]++;
    return c;
  }, [all, mine, myEmp, dept]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => { setMonth((m) => m.subtract(1, 'month')); setLimit(PAGE); }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, minWidth: 96, textAlign: 'center' }}>{month.format('YYYY년 M월')}</span>
        <Button size="small" type="text" icon={<RightOutlined />} onClick={() => { setMonth((m) => m.add(1, 'month')); setLimit(PAGE); }} />
        <div style={{ flex: 1 }} />
        {myEmp && (
          <Segmented size="small" value={mine ? 'mine' : 'all'} onChange={(v) => { setMine(v === 'mine'); setLimit(PAGE); }}
            options={[{ value: 'mine', label: '내 주문' }, { value: 'all', label: '전체' }]} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select allowClear placeholder="부서 전체" value={dept} onChange={(v) => { setDept(v); setLimit(PAGE); }}
          options={depts.map((d) => ({ value: d, label: d }))} style={{ flex: '0 0 46%' }} />
        <Input.Search allowClear placeholder="거래처·주문명·주문번호" onSearch={(v) => { setKeyword(v); setLimit(PAGE); }}
          onChange={(e) => { if (!e.target.value) setKeyword(''); }} style={{ flex: 1 }} />
      </div>

      {/* 단계 칩 — 접수 → 진행 중 → 출고 → 완료 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['todo', 'doing', 'shipped', 'done'] as const).map((g) => {
          const on = stage === g;
          return (
            <button key={g} type="button" onClick={() => { setStage(on ? undefined : g); setLimit(PAGE); }} style={{
              flex: 1, border: `1px solid ${on ? GROUP_COLOR[g] : T.border1}`, background: on ? T.surface : T.surface, borderRadius: 10,
              padding: '6px 4px', cursor: 'pointer', fontFamily: T.font, boxShadow: on ? `0 0 0 2px ${GROUP_COLOR[g]}33` : 'none',
            }}>
              <div style={{ fontSize: 11, color: T.t3 }}>{STAGE_LABEL[g]}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: GROUP_COLOR[g] }}>{counts[g]}</div>
            </button>
          );
        })}
      </div>

      {!!error && <Alert type="error" showIcon message="주문진행현황을 가져오지 못했습니다." />}
      {isFetching && !data && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}
      {data && (
        <div style={{ fontSize: 13, color: T.t3 }}>총 <b style={{ color: T.primary700, fontSize: 15 }}>{fmtNum(rows.length)}</b> 건</div>
      )}
      {data && rows.length === 0 && <MEmpty text={mine ? '내 담당 주문이 없습니다. "전체"로 바꿔 보세요.' : '해당하는 주문이 없습니다.'} />}

      {rows.slice(0, limit).map((r) => {
        const key = `${r.orddocNo}-${r.orddocSq}`;
        const g = stageGroup(r.progNm);
        const expanded = open === key;
        return (
          <MCard key={key} onClick={() => setOpen(expanded ? null : key)} style={{ borderLeft: `4px solid ${GROUP_COLOR[g]}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.t1, letterSpacing: '-0.01em' }}>
              {r.orddocNo}{Number(r.orddocSq) > 1 ? <span style={{ fontSize: 12, color: T.t3, fontWeight: 500 }}> -{String(r.orddocSq)}</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 13 }}>
              <span style={{ flex: '0 0 44px', color: T.t3 }}>주문명</span>
              <span style={{ flex: 1, color: T.t1, minWidth: 0, overflow: expanded ? 'visible' : 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>{r.orddocNm}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 13 }}>
              <span style={{ flex: '0 0 44px', color: T.t3 }}>담당자</span>
              <span style={{ color: T.t1, flex: '0 0 auto' }}>{r.bizrsptEmpnoNm ?? '-'}</span>
              <span style={{ color: T.t3, marginLeft: 6 }}>수량</span>
              <span className="tabular-nums" style={{ color: T.t1 }}>{fmtNum(Number(r.ordQt ?? 0))}</span>
              <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: GROUP_COLOR[g], whiteSpace: 'nowrap' }}>{r.progNm ?? '-'}</span>
            </div>
            {expanded && (
              <div style={{ marginTop: 8, paddingTop: 4, borderTop: `1px solid ${T.border3}` }}>
                <KV label="거래처">{r.partnerNm}{r.pasgnrNm ? ` (${r.pasgnrNm})` : ''}</KV>
                <KV label="세부품목">{r.spcfcsItemNm}</KV>
                <KV label="진행">
                  <Tag color={stageColor(r.progNm)} style={{ marginInlineEnd: 4 }}>{String(r.progNm ?? '-')}</Tag>
                  {r.progDt ? `${ymd(r.progDt)} 처리` : ''}
                </KV>
                <KV label="주문일">{ymd(r.ordDt)}{r.dlvshDts ? ` · 납품예정 ${ymd(r.dlvshDts)}` : ''}</KV>
                <KV label="작업처">{r.prplNm}{r.ppProcNm ? ` · 생산 ${r.ppProcNm}` : ''}{r.puProcNm ? ` · ${r.puProcNm}` : ''}</KV>
                <KV label="금액">{r.sumAmt != null ? `${fmtCompact(Number(r.sumAmt))}원` : '-'}</KV>
                {(r.sodocNo || r.billdocNo) && <KV label="수주/매출">{[r.sodocNo, r.billdocNo].filter(Boolean).join(' · ')}</KV>}
                <KV label="부서">{r.deptNm}</KV>
                {r.rmkTxt && <KV label="비고"><span style={{ whiteSpace: 'pre-wrap' }}>{String(r.rmkTxt)}</span></KV>}
                {canWorkOrder && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/production/work-order/${encodeURIComponent(String(r.orddocNo))}/${r.orddocSq}`)}>이 순번 작업지시서</Button>
                    <Button size="small" type="text" onClick={() => navigate(`/production/work-order/${encodeURIComponent(String(r.orddocNo))}`)}>주문 전체</Button>
                  </div>
                )}
              </div>
            )}
          </MCard>
        );
      })}
      {rows.length > limit && <Button block onClick={() => setLimit((l) => l + PAGE)}>더 보기 ({rows.length - limit}건 남음)</Button>}
    </div>
  );
};

export default MobileOrdersPage;
