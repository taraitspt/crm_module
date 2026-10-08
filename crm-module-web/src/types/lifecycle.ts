/**
 * 주문별 생애주기 — 주문 순번(제품 하나)이 제판 → 인쇄 → 후가공 → 접지 → 제본으로 가는 과정.
 * 백엔드 OracleLifecycleRepository (ERP 생산계획 다섯 테이블). 진행상태 = 대수마감(closeYn).
 */
export type LifecycleStage = 'PLATE' | 'PRINT' | 'PROC' | 'FOLD' | 'BIND';

/** 공정 표시 순서·이름·색 (엑셀 예시의 색 띠: 제판 주황, 인쇄 초록, 후가공 하늘, 접지 분홍, 제본 보라). */
export const STAGES: { key: LifecycleStage; label: string; color: string; bg: string; head: string }[] = [
  { key: 'PLATE', label: '제판', color: '#E8772E', bg: '#FFF4EC', head: '#F8CBAD' },
  { key: 'PRINT', label: '인쇄', color: '#3E9B4F', bg: '#F0F8F1', head: '#C6E0B4' },
  { key: 'PROC', label: '후가공', color: '#2B8CC4', bg: '#EEF7FC', head: '#BDD7EE' },
  { key: 'FOLD', label: '접지', color: '#C2477E', bg: '#FCEFF5', head: '#F4C7DD' },
  { key: 'BIND', label: '제본', color: '#7B5CC4', bg: '#F4F1FC', head: '#D9CFF2' },
];

/** 목록 한 줄 = 주문(의뢰) 순번 하나. 공정별 행 수(N)와 대수마감 수(Done). */
export interface LifecycleLine {
  orderNo: string;
  orderSq: number;
  planNo: string;
  planSq: number;
  orderNm?: string;
  /** 영업담당 사번·이름, 부서 — 주문(TOR) 또는 의뢰(PQE) 머리 */
  empNo?: string;
  empNm?: string;
  deptNm?: string;
  partnerNm?: string;
  detailItemNm?: string;
  ordQt?: number;
  dueDts?: string | number;
  /** 계획 상세 입고예정일(주문 건에만, 의뢰 건은 비어 있음) */
  rcptDts?: string | number;
  plateN: number; plateDone: number;
  printN: number; printDone: number;
  procN: number; procDone: number;
  foldN: number; foldDone: number;
  bindN: number; bindDone: number;
  /** 첫·마지막 계획일 yyyyMMdd */
  firstDt?: string;
  lastDt?: string;
  /** 완성품 제본(마지막 공정) 계획일·마감·공정명 */
  finishDt?: string;
  finishDone?: 'Y' | 'N';
  finishOpNm?: string;
}

/** 상세 한 행 = 공정 계획 행 하나. keyValNm 으로 인쇄 행(구성×대수)에 묶인다 — 제본 행은 keyValNm 이 없다. */
export interface LifecycleStageRow {
  stage: LifecycleStage;
  orderNo: string;
  orderSq: number;
  planNo: string;
  planSq: number;
  planLowSq: number;
  procsSq?: number;
  keyValNm?: string | null;
  configCd?: string;
  configNm?: string;
  prpcntSq?: number;
  opNm?: string;
  wrkNm?: string;
  eqpNm?: string;
  /** 외주 발주 업체 — 설비가 "외주(…)" 자리표시일 때 실제 업체. 화면은 설비 자리에 이걸 먼저 보여준다. */
  vendorNm?: string;
  qty?: number;
  mtrilNm?: string;
  gnrlPrwBefQt?: number;
  gnrlPrwAftrQt?: number;
  spclrPrwBefQt?: number;
  spclrPrwAftrQt?: number;
  planDt?: string;
  cnfmYn?: 'Y' | 'N';
  issueYn?: 'Y' | 'N';
  /** 완료 여부 = 대수마감 Y 또는 외부입고 설비(서버 판정) */
  closeYn?: 'Y' | 'N';
  /** ERP 대수마감 원래 값 */
  rawCloseYn?: 'Y' | 'N';
  /** 설비가 외부입고(…) — 대수마감 없이 완료로 본다 */
  extYn?: 'Y' | 'N';
  suppYn?: 'Y' | 'N';
  lastYn?: 'Y' | 'N';
  arltQt?: number;
  resultSt?: string;
  /** MES 실적 완료일 yyyyMMdd */
  resultDt?: string;
  /** 외주 발주 납기요청일(= 입고요청일) yyyyMMdd · 발주번호 — 외주 공정에만 */
  reqDt?: string;
  purdocNo?: string;
}

/** 목록 한 줄의 공정별 [행 수, 마감 수]. */
export const stageCounts = (l: LifecycleLine): Record<LifecycleStage, [number, number]> => ({
  PLATE: [l.plateN, l.plateDone],
  PRINT: [l.printN, l.printDone],
  PROC: [l.procN, l.procDone],
  FOLD: [l.foldN, l.foldDone],
  BIND: [l.bindN, l.bindDone],
});

/** 오늘 yyyyMMdd — 지연 판정 기준. */
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

export type LineStatus = 'done' | 'late' | 'progress';
/** 순번 상태 — 완성품 제본이 완료면 완성, 그 계획일이 지났으면 지연, 아니면 진행 중. PC·모바일 공용. */
export const lineStatus = (l: LifecycleLine): LineStatus =>
  l.finishDone === 'Y' ? 'done' : l.finishDt && l.finishDt < todayYmd() ? 'late' : 'progress';
/** 전체 공정 행 중 완료 비율(%). */
export const lineProgress = (l: LifecycleLine) => {
  const c = Object.values(stageCounts(l));
  const n = c.reduce((s, [a]) => s + a, 0);
  const d = c.reduce((s, [, b]) => s + b, 0);
  return n ? Math.round((d / n) * 100) : 0;
};
/** 공정 행 하나의 상태 — 완료 / 지연(기한 = 계획일, 외주 입고요청일이 더 늦으면 그날) / 대기. */
export const stageRowStatus = (r: LifecycleStageRow): 'done' | 'late' | 'wait' => {
  if (r.closeYn === 'Y') return 'done';
  const due = r.reqDt && (!r.planDt || r.reqDt > r.planDt) ? r.reqDt : r.planDt;
  return due && due < todayYmd() ? 'late' : 'wait';
};
