import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getEquipmentPerf, getEquipments } from '@/api/production.api';
import { isRunning, type EquipmentPerfRow, type WorkCenter } from '@/types/equipmentPerf';

export const BOARD_REFRESH_MS = 60_000;
/** 시작한 지 이만큼 지났는데 종료가 없으면 실적 마감이 안 된 것일 가능성이 크다 — 색을 바꿔 알려준다. */
export const STALE_HOURS = 24;

export const fmtQty = (v?: number | string | null) => Math.round(Number(v ?? 0)).toLocaleString('ko-KR');
export const elapsed = (start: string, now: dayjs.Dayjs) => {
  const m = now.diff(dayjs(start), 'minute');
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}시간 ${m % 60}분` : `${Math.floor(h / 24)}일 ${h % 24}시간`;
};

export interface EqpState {
  eqpCd: string;
  eqpNm: string;
  /** 가동 중인 작업(시작 있고 종료 없음) — 가장 최근 시작한 것 */
  running: EquipmentPerfRow | null;
  /** 가동 중이 아닐 때 마지막으로 끝낸 작업 */
  last: EquipmentPerfRow | null;
  /** 오늘 생산수량·완료 건수 */
  todayQty: number;
  todayDone: number;
  stale: boolean;
}

/**
 * 설비 가동 현황 데이터 — PC 보드(EquipmentBoardPage)와 모바일(MobileEquipmentPage)이 같이 쓴다.
 * 어제~오늘 실적(설비별 작업실적 쿼리)에 설비 목록을 깔아 설비마다 가동중/대기·오늘 생산·미종료 24시간 초과를 계산한다.
 * "대기(매엽)·외부입고(…)·외주(…)" 는 기계가 아니라 작업장 자리표시라 실적이 있을 때만 포함한다.
 */
export function useEquipmentBoard(workCenter: WorkCenter, auto: boolean) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => { const t = setInterval(() => setNow(dayjs()), 30_000); return () => clearInterval(t); }, []);

  const today = now.format('YYYY-MM-DD');
  const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
  // ERP 작업일자(WRK_DT)는 yyyyMMdd 문자열 — 오늘 실적 판정은 이 형식으로 비교한다
  const todayBasic = now.format('YYYYMMDD');

  const { data: eqpData } = useQuery({
    queryKey: ['equipments', workCenter],
    queryFn: () => getEquipments(workCenter),
    staleTime: 10 * 60_000,
  });
  const { data, isFetching, error, dataUpdatedAt } = useQuery({
    queryKey: ['equipment-perf', workCenter, yesterday, today],
    queryFn: () => getEquipmentPerf({ startDate: yesterday, endDate: today, workCenter }),
    refetchInterval: auto ? BOARD_REFRESH_MS : false,
    staleTime: 30_000,
  });
  const rows = useMemo(() => data?.data?.data ?? [], [data]);
  const equipments = useMemo(() => eqpData?.data?.data ?? [], [eqpData]);

  const states = useMemo<EqpState[]>(() => {
    const byEqp = new Map<string, EquipmentPerfRow[]>();
    for (const r of rows) {
      const k = String(r.eqpCd ?? '');
      if (!byEqp.has(k)) byEqp.set(k, []);
      byEqp.get(k)!.push(r);
    }
    const placeholder = (nm: string) => /^(대기|외부입고|외주)\(/.test(nm);
    const codes = new Map<string, string>(equipments.map((e) => [e.eqpCd, e.eqpNm ?? e.eqpCd]));
    for (const [k, list] of byEqp) if (!codes.has(k)) codes.set(k, String(list[0].eqpNm ?? k));
    return Array.from(codes).filter(([eqpCd, eqpNm]) => !placeholder(eqpNm) || (byEqp.get(eqpCd)?.length ?? 0) > 0).map(([eqpCd, eqpNm]) => {
      const list = byEqp.get(eqpCd) ?? [];
      const runningList = list.filter(isRunning).sort((a, b) => String(b.startDts).localeCompare(String(a.startDts)));
      const running = runningList[0] ?? null;
      const done = list.filter((r) => !isRunning(r)).sort((a, b) => String(b.endDts ?? '').localeCompare(String(a.endDts ?? '')));
      const todays = list.filter((r) => String(r.wrkDt) === todayBasic);
      return {
        eqpCd, eqpNm,
        running,
        last: running ? null : (done[0] ?? null),
        todayQty: todays.reduce((s, r) => s + Number(r.wrkQt ?? 0), 0),
        todayDone: todays.filter((r) => !isRunning(r)).length,
        stale: !!running && now.diff(dayjs(String(running.startDts)), 'hour') >= STALE_HOURS,
      };
    }).sort((a, b) => (a.running ? 0 : 1) - (b.running ? 0 : 1) || a.eqpNm.localeCompare(b.eqpNm, 'ko'));
  }, [rows, equipments, todayBasic, now]);

  const kpi = {
    total: states.length,
    running: states.filter((s) => s.running).length,
    stale: states.filter((s) => s.stale).length,
    todayQty: states.reduce((s, x) => s + x.todayQty, 0),
    todayDone: states.reduce((s, x) => s + x.todayDone, 0),
  };
  const errMsg = error ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? '설비 실적을 가져오지 못했습니다.') : null;

  return { now, states, kpi, isFetching, errMsg, dataUpdatedAt };
}
