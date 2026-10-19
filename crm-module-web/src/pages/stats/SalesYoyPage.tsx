import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Input, Row, Select, Space, Spin, Table, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { ExcelDownloadBtn } from '@/components/table';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { getSalesYoy } from '@/api/salesYoy.api';
import type { SalesYoyRow } from '@/types/salesYoy';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` }));
// 올해 = 브랜드 청록, 작년 = 맑은 하늘색 — 회색이면 화면 전체가 가라앉아 보여서(사용자 의견 2026-10-19) 둘 다 채도 있는 색으로
const CUR_COLOR = T.primary;
const CUR_LIGHT = '#2CC4CE';
const PREV_COLOR = '#7FA8F0';
const PREV_LIGHT = '#B9D0FA';
/** 위 숫자 칸 색 묶음 — 연한 바탕 + 같은 계열 글자 */
const TONES = {
  cur: { bg: T.primary50, bd: T.primary100, fg: T.primary700 },
  prev: { bg: '#EEF4FF', bd: '#D6E4FF', fg: '#3B6FD8' },
  up: { bg: T.okBg, bd: T.okBd, fg: '#059669' },
  down: { bg: T.erBg, bd: T.erBd, fg: '#DC2626' },
  flat: { bg: T.surface, bd: T.border2, fg: T.t1 },
} as const;
type Tone = keyof typeof TONES;

const fmtNum = (v: number) => Math.round(v).toLocaleString('ko-KR');
const fmtEok2 = (v: number) => `${(v / 1e8).toFixed(2)}억`;
/** 증감률 — 작년이 0 이면 비교 불가(신규) */
const rate = (cur: number, prev: number): number | null => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);
const rateText = (r: number | null, cur: number) => (r == null ? (cur > 0 ? '신규' : '-') : `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`);
const diffColor = (d: number) => (d > 0 ? T.ok : d < 0 ? T.er : T.t3);
const sumRange = (arr: number[], lo: number, hi: number) => arr.slice(lo - 1, hi).reduce((s, v) => s + v, 0);

interface AggRow { key: string; name: string; sub?: string; cur: number; prev: number; diff: number; rate: number | null; hqNm?: string }

/** 본부 키·순서 — 조직도 본부(HqResolver). 없으면 빈 키 */
const hqKey = (r: SalesYoyRow) => (r.hqCd != null ? String(r.hqCd) : '');
/**
 * 본부 순서 — 영업 본부(올해+작년 매출이 전체의 1% 이상)를 먼저, 그 안에서 조직도 순(사용자 2026-10-19).
 * 구매팀(경영지원본부)·품질개선팀(생산본부)처럼 매출이 조금 잡히는 본부는 뒤로 간다.
 */
const hqSortOf = (rows: SalesYoyRow[]) => {
  const org = new Map<string, number>();
  const amt = new Map<string, number>();
  let total = 0;
  rows.forEach((r) => {
    if (r.hqCd == null) return;
    const k = String(r.hqCd);
    org.set(k, r.hqSort ?? r.hqCd);
    const v = r.cur.reduce((s, x) => s + Math.abs(x), 0) + r.prev.reduce((s, x) => s + Math.abs(x), 0);
    amt.set(k, (amt.get(k) ?? 0) + v);
    total += v;
  });
  const m = new Map<string, number>();
  org.forEach((o, k) => m.set(k, ((amt.get(k) ?? 0) >= total * 0.01 ? 0 : 1_000_000) + o));
  return m;
};

/** 코드→이름 선택지(이름순) */
const optionsOf = (list: SalesYoyRow[], code: (r: SalesYoyRow) => string, name: (r: SalesYoyRow) => string) => {
  const m = new Map<string, string>();
  list.forEach((r) => { const c = code(r); if (c) m.set(c, name(r) || c); });
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([value, label]) => ({ value, label }));
};
/**
 * 고른 기간에 올해·작년 합계가 둘 다 0원인 값은 뺀다 — 잘못 넣었다 같은 금액으로 되돌린 전표(예: 그래픽스 비용센터로 들어갔다
 * 취소된 2025년 매출)만 있는 본부·부서·담당자가 선택 목록에 나오던 문제(사용자 2026-10-19).
 */
const liveRows = (list: SalesYoyRow[], code: (r: SalesYoyRow) => string, lo: number, hi: number) => {
  const sum = new Map<string, [number, number]>();
  list.forEach((r) => {
    const k = code(r);
    const v = sum.get(k) ?? [0, 0];
    v[0] += sumRange(r.cur, lo, hi);
    v[1] += sumRange(r.prev, lo, hi);
    sum.set(k, v);
  });
  return list.filter((r) => { const v = sum.get(code(r)); return !!v && (v[0] !== 0 || v[1] !== 0); });
};
/** 묶어서 기간 합계 — 부서별·담당자별 표 공용. 올해 기간 매출 큰 순 */
const groupBy = (list: SalesYoyRow[], code: (r: SalesYoyRow) => string, name: (r: SalesYoyRow) => string, empty: string, lo: number, hi: number): AggRow[] => {
  const m = new Map<string, AggRow>();
  list.forEach((r) => {
    const k = code(r) || '(없음)';
    const a = m.get(k) ?? { key: k, name: name(r) || code(r) || empty, sub: code(r), cur: 0, prev: 0, diff: 0, rate: null };
    a.cur += sumRange(r.cur, lo, hi);
    a.prev += sumRange(r.prev, lo, hi);
    m.set(k, a);
  });
  return [...m.values()].map((a) => ({ ...a, diff: a.cur - a.prev, rate: rate(a.cur, a.prev) }))
    .filter((a) => a.cur !== 0 || a.prev !== 0)
    .sort((a, b) => b.cur - a.cur);
};
/** 거래처 한 줄의 대표 팀·담당 — 기간 매출이 가장 큰 쪽, 여럿이면 "외 n" */
const pickTop = (mm: Map<string, number>) => {
  const top = [...mm.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n);
  return top.length > 1 ? `${top[0]} 외 ${top.length - 1}` : top[0] ?? '';
};

/**
 * 매출관리 › 전년 매출 비교 (2026-10-19) — 계획 없이 순수 매출을 작년 같은 달과 비교한다.
 * 원천은 매출현황(계획 대비)과 같은 ERP 매출전표(공급가액, 타라티피에스). 서버는 거래처·영업부서·월만 주고 기간 합산·증감은 여기서 계산한다.
 * 기간은 올해와 작년에 같은 달을 적용한다(연초~당월이면 작년도 1월~같은 달).
 */
export default function SalesYoyPage() {
  const navigate = useNavigate();
  const { menuKeys } = useMenuAccess();
  const canSalesList = menuKeys == null || menuKeys.has('/stats/sales-list');
  const thisYear = dayjs().year();
  const thisMonth = dayjs().month() + 1;
  /** 마감된 마지막 달 — 이번 달은 매출 등록이 진행 중이라(10/19 기준 10월 1.3억 vs 작년 61.7억) 기본 비교에서 뺀다 */
  const prevMonth = Math.max(thisMonth - 1, 1);

  const [year, setYear] = useState(thisYear);
  const [fromMm, setFromMm] = useState(1);
  // 기본 연초~전월 — 진행 중인 이번 달까지 넣으면 올해만 덜 잡혀 감소로 보인다
  const [toMm, setToMm] = useState(prevMonth);
  /** 부서·담당자 — 여러 개 고를 수 있다(사용자 2026-10-19). 비우면 전체. */
  const [ccs, setCcs] = useState<string[]>([]);
  /** 본부 — 여러 개, 비우면 전체(사용자 2026-10-19). 부서 선택지는 고른 본부 안에서 */
  const [hqs, setHqs] = useState<string[]>([]);
  const [emps, setEmps] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');

  const { data, isFetching, isError } = useQuery({
    queryKey: ['sales-yoy', year],
    queryFn: () => getSalesYoy(year),
    staleTime: 5 * 60_000,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const [lo, hi] = fromMm <= toMm ? [fromMm, toMm] : [toMm, toMm];
  const periodLabel = lo === hi ? `${lo}월` : `${lo}~${hi}월`;
  const setRange = (from: number, to: number) => { setFromMm(from); setToMm(to); };
  const pickYear = (y: number) => { setYear(y); setRange(1, y === thisYear ? prevMonth : 12); };
  /** 올해 중 아직 안 온 달 — 그래프에서 올해 막대를 비운다 */
  const lastClosedMonth = year === thisYear ? thisMonth : year < thisYear ? 12 : 0;

  const hqOrder = useMemo(() => hqSortOf(rows), [rows]);
  const hqOptions = useMemo(() => optionsOf(liveRows(rows, hqKey, lo, hi), hqKey, (r) => r.hqNm ?? '')
    .sort((a, b) => (hqOrder.get(a.value) ?? 0) - (hqOrder.get(b.value) ?? 0)), [rows, hqOrder, lo, hi]);
  const inHqs = (r: SalesYoyRow) => !hqs.length || hqs.includes(hqKey(r));
  const ccOptions = useMemo(() => optionsOf(liveRows(rows.filter(inHqs), (r) => r.ccCd, lo, hi), (r) => r.ccCd, (r) => r.ccNm ?? ''), [rows, hqs, lo, hi]);
  // 담당자 목록은 고른 본부·부서 안에서만
  const inCcs = (r: SalesYoyRow) => inHqs(r) && (!ccs.length || ccs.includes(r.ccCd));
  const empOptions = useMemo(() => optionsOf(liveRows(rows.filter(inCcs), (r) => r.empNo, lo, hi), (r) => r.empNo, (r) => r.empNm ?? ''), [rows, hqs, ccs, lo, hi]);
  const scoped = useMemo(() => rows.filter((r) => inCcs(r) && (!emps.length || emps.includes(r.empNo))), [rows, hqs, ccs, emps]);

  // 월별(1~12) 합계 — 그래프용
  const monthly = useMemo(() => {
    const cur = Array(12).fill(0) as number[];
    const prev = Array(12).fill(0) as number[];
    scoped.forEach((r) => { for (let i = 0; i < 12; i += 1) { cur[i] += r.cur[i] ?? 0; prev[i] += r.prev[i] ?? 0; } });
    let cc = 0;
    let cp = 0;
    return cur.map((c, i) => {
      cc += c; cp += prev[i];
      const open = i + 1 <= lastClosedMonth;
      return {
        month: `${i + 1}월`,
        cur: open ? c : null,
        prev: prev[i],
        cumCur: open ? cc : null,
        cumPrev: cp,
        inRange: i + 1 >= lo && i + 1 <= hi,
      };
    });
  }, [scoped, lastClosedMonth, lo, hi]);

  const totals = useMemo(() => {
    let cur = 0;
    let prev = 0;
    scoped.forEach((r) => { cur += sumRange(r.cur, lo, hi); prev += sumRange(r.prev, lo, hi); });
    return { cur, prev, diff: cur - prev, rate: rate(cur, prev) };
  }, [scoped, lo, hi]);

  // 본부별 — 조직도 순서
  const byHq = useMemo(() => groupBy(rows, hqKey, (r) => r.hqNm ?? '', '(본부 없음)', lo, hi)
    .sort((a, b) => (hqOrder.get(a.key) ?? 1e9) - (hqOrder.get(b.key) ?? 1e9)), [rows, lo, hi, hqOrder]);
  // 부서별 — 본부로 묶어 본부 순서 → 그 안에서 올해 매출 큰 순(사용자 2026-10-19)
  const byCc = useMemo(() => {
    const hqOfCc = new Map<string, { nm: string; sort: number }>();
    rows.forEach((r) => { if (r.ccCd && r.hqCd != null && !hqOfCc.has(r.ccCd)) hqOfCc.set(r.ccCd, { nm: r.hqNm ?? '', sort: hqOrder.get(String(r.hqCd)) ?? 1e9 }); });
    return groupBy(rows.filter(inHqs), (r) => r.ccCd, (r) => r.ccNm ?? '', '(부서 없음)', lo, hi)
      .map((a) => ({ ...a, hqNm: hqOfCc.get(a.key)?.nm ?? '' }))
      .sort((a, b) => ((hqOfCc.get(a.key)?.sort ?? 1e9) - (hqOfCc.get(b.key)?.sort ?? 1e9)) || (b.cur - a.cur));
  }, [rows, hqs, lo, hi, hqOrder]);
  const byEmp = useMemo(() => groupBy(rows.filter(inCcs), (r) => r.empNo, (r) => r.empNm ?? '', '(담당 없음)', lo, hi), [rows, hqs, ccs, lo, hi]);

  const byPartner = useMemo<AggRow[]>(() => {
    const m = new Map<string, AggRow & { depts: Map<string, number>; emps: Map<string, number> }>();
    scoped.forEach((r) => {
      const k = r.partnerCd || '(없음)';
      const a = m.get(k) ?? { key: k, name: r.partnerNm || r.partnerCd || '(거래처 없음)', sub: r.partnerCd, cur: 0, prev: 0, diff: 0, rate: null, depts: new Map(), emps: new Map() };
      const c = sumRange(r.cur, lo, hi);
      a.cur += c;
      a.prev += sumRange(r.prev, lo, hi);
      const team = r.ccNm || r.ccCd;
      if (team) a.depts.set(team, (a.depts.get(team) ?? 0) + c);
      const who = r.empNm || r.empNo;
      if (who) a.emps.set(who, (a.emps.get(who) ?? 0) + c);
      m.set(k, a);
    });
    const kw = keyword.trim().toLowerCase();
    return [...m.values()]
      .map(({ depts, emps, ...a }) => ({ ...a, diff: a.cur - a.prev, rate: rate(a.cur, a.prev), ccNm: pickTop(depts), empNm: pickTop(emps) }) as AggRow & { ccNm: string; empNm: string })
      .filter((a) => (a.cur !== 0 || a.prev !== 0) && (!kw || a.name.toLowerCase().includes(kw) || (a.sub ?? '').toLowerCase().includes(kw)))
      .sort((a, b) => b.cur - a.cur);
  }, [scoped, lo, hi, keyword]);

  const moneyCols = (curTitle: string, prevTitle: string): ColumnsType<AggRow> => [
    { title: prevTitle, dataIndex: 'prev', width: 150, align: 'right', render: (v: number) => <span className="tabular-nums" style={{ color: T.t3 }}>{fmtNum(v)}</span>, sorter: (a, b) => a.prev - b.prev },
    { title: curTitle, dataIndex: 'cur', width: 150, align: 'right', render: (v: number) => <b className="tabular-nums">{fmtNum(v)}</b>, sorter: (a, b) => a.cur - b.cur, defaultSortOrder: 'descend' },
    { title: '증감액', dataIndex: 'diff', width: 150, align: 'right', render: (v: number) => <span className="tabular-nums" style={{ color: diffColor(v) }}>{v > 0 ? '+' : ''}{fmtNum(v)}</span>, sorter: (a, b) => a.diff - b.diff },
    { title: '증감률', dataIndex: 'rate', width: 90, align: 'right', render: (v: number | null, r) => <span className="tabular-nums" style={{ color: diffColor(r.diff), fontWeight: 600 }}>{rateText(v, r.cur)}</span>, sorter: (a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity) },
  ];
  const curTitle = `${year}년 ${periodLabel}`;
  const prevTitle = `${year - 1}년 ${periodLabel}`;

  // 부서별·담당자별 표는 이름만 — 부서코드·사번은 화면에서 안 봐도 된다(사용자 2026-10-19)
  const nameCol = (title: string): ColumnsType<AggRow>[number] => ({
    title, dataIndex: 'name', ellipsis: true,
  });
  // 본부별은 영업 본부 → 조직도 순서 그대로(매출 큰 순 기본 정렬 없음)
  const hqColumns: ColumnsType<AggRow> = [nameCol('본부'), ...moneyCols(curTitle, prevTitle).map((c) => ({ ...c, defaultSortOrder: undefined }))];
  const ccColumns: ColumnsType<AggRow> = [
    // 같은 본부 부서끼리 본부 칸을 합친다(정렬을 바꾸면 합치지 않음)
    { title: '본부', dataIndex: 'hqNm', width: 140, ellipsis: true,
      onCell: (r, i) => {
        const idx = i ?? 0;
        if (idx > 0 && byCc[idx - 1]?.hqNm === r.hqNm) return { rowSpan: 0 };
        let n = 1;
        while (byCc[idx + n] && byCc[idx + n].hqNm === r.hqNm) n += 1;
        return { rowSpan: n };
      },
      render: (v: string) => v || <Text type="secondary">(본부 없음)</Text> },
    nameCol('부서'), ...moneyCols(curTitle, prevTitle).map((c) => ({ ...c, sorter: undefined, defaultSortOrder: undefined })),
  ];
  const empColumns: ColumnsType<AggRow> = [nameCol('영업담당'), ...moneyCols(curTitle, prevTitle)];
  const partnerColumns: ColumnsType<AggRow> = [
    { title: '거래처', dataIndex: 'name', ellipsis: true, render: (v: string, r) => <span>{v} <Text type="secondary" style={{ fontSize: 12 }}>{r.sub}</Text></span> },
    { title: '부서', dataIndex: 'ccNm', width: 160, ellipsis: true },
    { title: '영업담당', dataIndex: 'empNm', width: 110, ellipsis: true },
    ...moneyCols(curTitle, prevTitle),
  ];

  const excelColumns = [
    { header: '거래처코드', key: 'sub' },
    { header: '거래처', key: 'name' },
    { header: '부서', key: 'ccNm' },
    { header: '영업담당', key: 'empNm' },
    { header: prevTitle, key: 'prev' },
    { header: curTitle, key: 'cur' },
    { header: '증감액', key: 'diff' },
    { header: '증감률(%)', key: 'rate', formatter: (v: unknown) => (v == null ? '' : Number(v).toFixed(1)) },
  ];

  const tile = (label: string, value: string, sub: string, tone: Tone) => {
    const c = TONES[tone];
    return (
      <Card variant="borderless" style={{ borderRadius: 14, border: `1px solid ${c.bd}`, background: c.bg, height: '100%' }} styles={{ body: { padding: '14px 18px' } }}>
        <div style={{ fontSize: 12.5, color: T.t2, fontWeight: 600 }}>{label}</div>
        <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 800, color: c.fg, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{value}</div>
        <div className="tabular-nums" style={{ fontSize: 12, color: T.t3 }}>{sub}</div>
      </Card>
    );
  };
  const trend: Tone = totals.diff > 0 ? 'up' : totals.diff < 0 ? 'down' : 'flat';

  const eokTick = (v: number) => (v === 0 ? '0' : `${Math.round(v / 1e8)}억`);
  const tipFmt = (v: unknown) => (v == null ? '-' : `${fmtNum(Number(v))}원`);

  return (
    <PageLayout>
      <PageHeader
        title="전년 매출 비교"
        actions={canSalesList && (
          <Button icon={<UnorderedListOutlined />} onClick={() => navigate('/stats/sales-list')}>매출리스트</Button>
        )}
      />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }} style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Select value={year} onChange={pickYear} style={{ width: 100 }}
              options={[thisYear - 2, thisYear - 1, thisYear].map((y) => ({ value: y, label: `${y}년` }))} />
          </Col>
          <Col>
            <Space.Compact>
              <Select value={lo} onChange={(v) => setFromMm(v)} options={MONTH_OPTIONS} style={{ width: 82 }} />
              <Select value={hi} onChange={(v) => setToMm(v)} options={MONTH_OPTIONS} style={{ width: 82 }} />
            </Space.Compact>
          </Col>
          <Col>
            <Space size={4}>
              <Button size="small" type={lo === 1 && hi === 12 ? 'primary' : 'default'} onClick={() => setRange(1, 12)}>연간</Button>
              <Button size="small" type={lo === 1 && hi === prevMonth ? 'primary' : 'default'} onClick={() => setRange(1, prevMonth)}>연초~전월</Button>
              <Button size="small" type={lo === 1 && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(1, thisMonth)}>연초~당월</Button>
              <Button size="small" type={lo === thisMonth && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(thisMonth, thisMonth)}>당월</Button>
            </Space>
          </Col>
          <Col>
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="본부 전체" value={hqs} options={hqOptions} style={{ width: 180 }}
              onChange={(v: string[]) => { setHqs(v); setCcs([]); setEmps([]); }}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col>
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="부서 전체" value={ccs} options={ccOptions} style={{ width: 200 }}
              onChange={(v: string[]) => { setCcs(v); setEmps([]); }}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col>
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="담당자 전체" value={emps} options={empOptions} style={{ width: 220 }}
              onChange={(v: string[]) => setEmps(v)}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>타라티피에스 · ERP 매출전표 공급가액 · 작년도 같은 달끼리 비교</Text>
          </Col>
        </Row>
      </Card>

      {year === thisYear && hi >= thisMonth && rows.length > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`${thisMonth}월은 아직 매출 등록이 진행 중이라 작년 ${thisMonth}월(한 달 전체)보다 적게 보입니다. 마감된 달끼리 보려면 [연초~전월]을 누르세요.`} />
      )}
      {data && !data.erpAvailable && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="매출을 불러오지 못했습니다." description={data.erpMessage ?? undefined} />}
      {isError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="매출을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요." />}

      {isFetching && !data ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : !rows.length ? (
        <Empty description="해당 조건의 매출이 없습니다." style={{ padding: '48px 0' }} />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} lg={6}>{tile(`${year}년 매출 (${periodLabel})`, fmtEok2(totals.cur), `${fmtNum(totals.cur)}원`, 'cur')}</Col>
            <Col xs={12} lg={6}>{tile(`${year - 1}년 같은 기간`, fmtEok2(totals.prev), `${fmtNum(totals.prev)}원`, 'prev')}</Col>
            <Col xs={12} lg={6}>{tile('증감액', `${totals.diff > 0 ? '+' : ''}${fmtEok2(totals.diff)}`, `${totals.diff > 0 ? '+' : ''}${fmtNum(totals.diff)}원`, trend)}</Col>
            <Col xs={12} lg={6}>{tile('증감률', rateText(totals.rate, totals.cur), totals.diff >= 0 ? '전년 같은 기간보다 늘었습니다' : '전년 같은 기간보다 줄었습니다', trend)}</Col>
          </Row>

          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} lg={14}>
              <Card size="small" title="월별 매출" extra={<Text type="secondary" style={{ fontSize: 12 }}>선택 기간: {periodLabel}</Text>} style={{ borderRadius: 12, height: '100%' }}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="22%">
                      <defs>
                        <linearGradient id="yoyCur" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CUR_LIGHT} /><stop offset="100%" stopColor={CUR_COLOR} /></linearGradient>
                        <linearGradient id="yoyPrev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PREV_LIGHT} /><stop offset="100%" stopColor={PREV_COLOR} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border1} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: T.t3 }} />
                      <YAxis tickFormatter={eokTick} tick={{ fontSize: 12, fill: T.t3 }} width={48} />
                      <Tooltip formatter={tipFmt} />
                      <Legend />
                      {/* 선택 기간 밖의 달은 흐리게 — 위 숫자가 어느 달을 합친 건지 보이게 */}
                      <Bar dataKey="prev" name={`${year - 1}년`} fill="url(#yoyPrev)" radius={[5, 5, 0, 0]}>
                        {monthly.map((m) => <Cell key={m.month} fillOpacity={m.inRange ? 1 : 0.35} />)}
                      </Bar>
                      <Bar dataKey="cur" name={`${year}년`} fill="url(#yoyCur)" radius={[5, 5, 0, 0]}>
                        {monthly.map((m) => <Cell key={m.month} fillOpacity={m.inRange ? 1 : 0.35} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card size="small" title="누적 매출" extra={<Text type="secondary" style={{ fontSize: 12 }}>1월부터 쌓은 합계</Text>} style={{ borderRadius: 12, height: '100%' }}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="yoyCum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CUR_LIGHT} stopOpacity={0.35} /><stop offset="100%" stopColor={CUR_LIGHT} stopOpacity={0.02} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border1} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: T.t3 }} />
                      <YAxis tickFormatter={eokTick} tick={{ fontSize: 12, fill: T.t3 }} width={48} />
                      <Tooltip formatter={tipFmt} />
                      <Legend />
                      <Line type="monotone" dataKey="cumPrev" name={`${year - 1}년 누적`} stroke={PREV_COLOR} strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                      <Area type="monotone" dataKey="cumCur" name={`${year}년 누적`} stroke={CUR_COLOR} strokeWidth={3} fill="url(#yoyCum)"
                        dot={{ r: 3.5, fill: '#fff', stroke: CUR_COLOR, strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>

          <Tabs
            defaultActiveKey="partner"
            items={[
              {
                key: 'partner',
                label: `거래처별 (${byPartner.length.toLocaleString()})`,
                children: (
                  <Card size="small" style={{ borderRadius: 12 }}
                    title={<Input.Search allowClear placeholder="거래처명·코드 검색" style={{ width: 260 }} onSearch={setKeyword} onChange={(e) => { if (!e.target.value) setKeyword(''); }} />}
                    extra={<ExcelDownloadBtn data={byPartner as unknown as Record<string, unknown>[]} columns={excelColumns} fileName={`전년매출비교_거래처별_${year}_${lo}-${hi}월`} />}>
                    <Table<AggRow> rowKey="key" size="small" columns={partnerColumns} dataSource={byPartner}
                      pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 900 }} />
                  </Card>
                ),
              },
              {
                key: 'hq',
                label: `본부별 (${byHq.length})`,
                children: (
                  <Card size="small" style={{ borderRadius: 12 }} extra={<Text type="secondary" style={{ fontSize: 12 }}>부서 관리 조직도 기준 · 줄을 누르면 그 본부만(다시 누르면 해제)</Text>}>
                    <Table<AggRow> rowKey="key" size="small" columns={hqColumns} dataSource={byHq} pagination={false} scroll={{ x: 760 }}
                      onRow={(r) => ({ onClick: () => { setHqs(r.key === '(없음)' || (hqs.length === 1 && hqs[0] === r.key) ? [] : [r.key]); setCcs([]); setEmps([]); }, style: { cursor: 'pointer' } })} />
                  </Card>
                ),
              },
              {
                key: 'cc',
                label: `부서별 (${byCc.length})`,
                children: (
                  <Card size="small" style={{ borderRadius: 12 }} extra={<Text type="secondary" style={{ fontSize: 12 }}>{hqs.length ? '고른 본부 안' : '전체 부서'} · 본부별로 묶음 · 줄을 누르면 그 부서만(다시 누르면 해제)</Text>}>
                    <Table<AggRow> rowKey="key" size="small" columns={ccColumns} dataSource={byCc} pagination={false} scroll={{ x: 760 }}
                      onRow={(r) => ({ onClick: () => { setCcs(r.key === '(없음)' || (ccs.length === 1 && ccs[0] === r.key) ? [] : [r.key]); setEmps([]); }, style: { cursor: 'pointer' } })} />
                  </Card>
                ),
              },
              {
                key: 'emp',
                label: `담당자별 (${byEmp.length})`,
                children: (
                  <Card size="small" style={{ borderRadius: 12 }} extra={<Text type="secondary" style={{ fontSize: 12 }}>{ccs.length ? '고른 부서 안' : '전체'} · 매출 라인의 영업담당 기준 · 줄을 누르면 그 담당만(다시 누르면 해제)</Text>}>
                    <Table<AggRow> rowKey="key" size="small" columns={empColumns} dataSource={byEmp} pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 760 }}
                      onRow={(r) => ({ onClick: () => setEmps(r.key === '(없음)' || (emps.length === 1 && emps[0] === r.key) ? [] : [r.key]), style: { cursor: 'pointer' } })} />
                  </Card>
                ),
              },
            ]}
          />
        </>
      )}
    </PageLayout>
  );
}
