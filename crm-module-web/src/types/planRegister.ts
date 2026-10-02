/**
 * 생산계획조회 — ERP "생산계획등록(타라)" 화면 조회 이식. 서버는 컬럼명(camelCase) → 값 Map 으로 내려준다.
 * 라벨·순서는 ERP 화면 그리드(사용자 제공 필드 목록 2026-10-02)를 따른다.
 */
export type PlanRow = Record<string, string | number | null | undefined>;

export type PlanTab = 'print' | 'plate' | 'process' | 'fold' | 'bind';
export const PLAN_TABS: { key: PlanTab; label: string }[] = [
  { key: 'print', label: '인쇄' },
  { key: 'plate', label: '제판' },
  { key: 'process', label: '후가공' },
  { key: 'fold', label: '접지' },
  { key: 'bind', label: '제본' },
];

export interface PlanCol {
  id: string;
  label: string;
  width: number;
  /** num: 천단위 오른쪽 정렬, date: yyyyMMdd → yyyy-MM-dd, yn: Y/N 가운데 */
  kind?: 'num' | 'date' | 'yn';
  align?: 'right' | 'center';
}
const tx = (id: string, label: string, width: number): PlanCol => ({ id, label, width });
const num = (id: string, label: string, width = 70): PlanCol => ({ id, label, width, kind: 'num', align: 'right' });
const dt = (id: string, label: string, width = 100): PlanCol => ({ id, label, width, kind: 'date', align: 'center' });
const yn = (id: string, label: string, width = 64): PlanCol => ({ id, label, width, kind: 'yn', align: 'center' });

/** 주문리스트 */
export const ORDER_LIST_COLS: PlanCol[] = [
  tx('orddocNo', '주문번호', 150),
  tx('orddocNm', '주문명', 220),
  dt('ordDt', '주문일'),
  tx('bizrsptEmpnoNm', '담당자', 80),
  tx('deptNm', '부서', 110),
  tx('partnerNm', '거래처', 150),
  tx('planNo', '계획번호', 150),
  tx('planFgNm', '계획구분', 80),
  { ...tx('planStNm', '계획상태', 90), align: 'center' },
  tx('cnfmNList', '미확정 공정', 150),
  tx('wrkFgNm', '작업구분', 110),
  tx('rmkTxt', '생산 전달사항', 200),
];

/** 주문상세정보 */
export const ORDER_DETAIL_COLS: PlanCol[] = [
  { ...num('orddocSq', '순번', 56), align: 'center' },
  tx('itemCd', '제품코드', 110),
  tx('itemNm', '제품명', 150),
  tx('spcfcsItemNm', '세부품목명', 240),
  num('hrznQt', '가로', 64),
  num('vtclQt', '세로', 64),
  num('hghQt', '높이', 64),
  { ...tx('ordUnitCd', '단위', 56), align: 'center' },
  num('ordQt', '수량', 80),
  tx('bbndInfoNm', '제본정보', 110),
  tx('packMthdNm', '포장방법', 100),
  tx('packUnitDc', '포장수량', 80),
  dt('rcptPrrgDts', '원고입고예정일'),
  { ...tx('rcptPrrgDts2', '시각', 56), align: 'center' },
  dt('dlvshDts', '납품예정일'),
  { ...tx('dlvshDts2', '시각', 56), align: 'center' },
  num('custSampCps', '가제본부수', 84),
  num('custSampCps2', 'A급제본부수', 92),
  num('cloCps', '교차부수', 72),
  tx('prplNm', '작업처', 70),
  { ...num('planSq', '계획순번', 72), align: 'center' },
];

/** 모든 탭 공통 머리 — 계획순번·하위순번·주문순번. */
const HEAD: PlanCol[] = [
  { ...num('planSq', '계획순번', 72), align: 'center' },
  { ...num('planLowSq', '하위순번', 72), align: 'center' },
  { ...num('orddocSq', '주문순번', 72), align: 'center' },
];
const ITEM: PlanCol[] = [tx('itemCd', '제품코드', 110), tx('itemNm', '제품명', 120), tx('spcfcsItemNm', '세부품목명', 240)];
const SHEET: PlanCol[] = [tx('mtrilCd', '원자재코드', 110), tx('mtrilNm', '원자재명', 220), tx('dtlSizeDc', '재단규격', 90)];
const SCHED: PlanCol[] = [tx('eqpNm', '설비명', 120), dt('planDt', '계획일'), num('wrkTmCnt', '작업시간(분)', 90)];

/** 탭별 컬럼 — ERP 생산계획등록 각 탭의 열 순서. */
export const PLAN_TAB_COLS: Record<PlanTab, PlanCol[]> = {
  print: [
    yn('cnfmYn', '인쇄확정', 72), yn('cnfmYn2', '제판확정', 72), yn('prpcntCloseYn', '대수마감', 72),
    ...HEAD, ...ITEM,
    tx('configNm', '구성', 70), yn('poCnclYn', '용지발주', 72), tx('opNm', '공정', 70), tx('intltshNm', '계열', 60), tx('wrkNm', '작업', 100),
    num('prpcntSq', '대수', 56), num('startPageCnt', '페이지시작', 84), num('endPageCnt', '페이지끝', 80),
    ...SCHED, ...SHEET, tx('plmkNm', '제판정보', 90),
    num('pgs', '면수', 56), tx('dtlDc', '터잡기', 100), num('pprDivdQt', '절수', 56),
    num('gnrlPrwBefQt', '앞', 48), num('gnrlPrwAftrQt', '뒤', 48), num('spclrPrwBefQt', '별색앞', 64), tx('itemCdFront', '품목(앞)', 120),
    num('spclrPrwAftrQt', '별색뒤', 64), tx('itemCdBack', '품목(뒤)', 120), num('plteCntSumQt', '판수', 56),
    num('netQt', '정미', 64), num('spreQt', '여분', 64), num('fullQt', '합계', 64),
    num('netPpcntQt', '정미매수', 80), num('sprePpcntQt', '여분매수', 80), num('fullPpcntQt', '매수합계', 80), num('tongCnt', '통수', 72),
    tx('procsNm', '후가공정보', 200), { ...tx('stdUnitCd', '기준단위', 70), align: 'center' }, { ...tx('ordUnitCd', '오더단위', 70), align: 'center' }, num('ordQt', '오더수량', 80),
    tx('rmkTxt', '비고', 160),
    num('adjtQt', '조정수량', 72), num('adjtPpcntQt', '조정여분매수', 96), num('adjtPpcntSumQt', '조정매수합계', 96),
    yn('grpgYn', 'P', 40), yn('grpYn', 'C', 40), { ...num('grpSq', '순번', 56), align: 'center' },
    num('vnrNetQt', '정미수량', 72), num('vnrSpreQt', '여분수량', 72), num('vnrAdjtQt', '조정수량', 72),
    num('reqnCnt', '구매요청', 72), num('divdCnt', '재단횟수', 72), tx('keyValNm', '키값', 190),
  ],
  plate: [
    yn('cnfmYn', '확정', 56), yn('issueYn', '진행', 56),
    ...HEAD, ...ITEM,
    tx('configNm', '구성', 70), tx('opNm', '공정', 70), tx('intltshNm', '계열', 60), tx('wrkNm', '작업', 100),
    num('prpcntSq', '대수', 56), num('startPageCnt', '페이지시작', 84), num('endPageCnt', '페이지끝', 80),
    ...SCHED, ...SHEET,
    num('pgs', '면수', 56), tx('dtlDc', '터잡기', 100), num('pprDivdQt', '절수', 56),
    num('gnrlPrwBefQt', '앞', 48), num('gnrlPrwAftrQt', '뒤', 48), num('spclrPrwBefQt', '별색앞', 64), num('spclrPrwAftrQt', '별색뒤', 64), num('plteCntSumQt', '판수', 56),
    tx('rmkTxt', '비고', 160), yn('grpgYn', 'P', 40), yn('grpYn', 'C', 40), { ...num('grpSq', '순번', 56), align: 'center' },
    yn('suppYn', '추가', 56), tx('keyValNm', '키값', 190),
  ],
  process: [
    yn('cnfmYn', '확정', 56), yn('issueYn', '진행', 56), yn('prpcntCloseYn', '대수마감', 72),
    ...HEAD, { ...num('procsSq', '가공순번', 72), align: 'center' }, ...ITEM,
    tx('configNm', '구성', 70), tx('opNm', '공정', 80), tx('intltshNm', '계열', 60), tx('procsCd', '작업코드', 80), tx('procsNm', '작업', 160),
    num('prpcntSq', '대수', 56), num('startPageCnt', '페이지시작', 84), num('endPageCnt', '페이지끝', 80),
    ...SCHED, ...SHEET,
    num('pgs', '면수', 56), tx('dtlDc', '터잡기', 120), num('pprDivdQt', '절수', 56),
    num('procQt', '수량', 72), { ...tx('baseUnitCd', '단위', 56), align: 'center' }, tx('rmkTxt', '비고', 160), tx('keyValNm', '키값', 190),
  ],
  fold: [
    yn('cnfmYn', '확정', 56), yn('issueYn', '진행', 56),
    ...HEAD, ...ITEM, tx('itemSpecDc', '규격', 90),
    tx('configNm', '구성', 70), tx('opNm', '공정', 70), tx('intltshNm', '계열', 60), tx('wrkNm', '작업', 100),
    num('prpcntSq', '대수', 56), num('fullPrpcntQt', '전체대수', 72), num('fullPageCnt', '전체페이지', 84),
    ...SCHED, ...SHEET,
    num('totPgs', '면수', 56), tx('dtlDc', '터잡기', 120), num('pprDivdQt', '절수', 56),
    num('ordQt', '수량', 72), { ...tx('ordUnitCd', '단위', 56), align: 'center' }, tx('rmkTxt', '비고', 160), tx('keyValNm', '키값', 190),
  ],
  bind: [
    yn('cnfmYn', '확정', 56), yn('prpcntCloseYn', '대수마감', 72),
    ...HEAD, ...ITEM, tx('itemSpecDc', '규격', 90),
    tx('configNm', '구성', 70), tx('opNm', '공정', 70), tx('intltshNm', '계열', 60), tx('wrkNm', '작업', 110),
    num('fullPrpcntQt', '전체대수', 72), num('fullPageCnt', '전체페이지', 84), num('totPgs', '전체면수', 72), num('prpcntSq', '대수', 56),
    ...SCHED,
    num('ordQt', '수량', 72), { ...tx('ordUnitCd', '단위', 56), align: 'center' },
    yn('lastYn', '제품', 56), yn('suppYn', '추가', 56), tx('rmkTxt', '비고', 160),
  ],
};

/** 조회 방향 — 주문적용(SD_ORDER, TOR…) / 의뢰적용(PP_PREORD, PQE…). 공정 탭은 둘이 같다. */
export type PlanMode = 'order' | 'request';
export const PLAN_MODES: { value: PlanMode; label: string; doc: string }[] = [
  { value: 'order', label: '주문적용', doc: '주문' },
  { value: 'request', label: '의뢰적용', doc: '의뢰' },
];
/** 주문리스트·상세 컬럼 라벨의 "주문" 을 방향에 맞춰 바꾼다(주문번호 → 의뢰번호). */
export const relabel = (cols: PlanCol[], mode: PlanMode): PlanCol[] =>
  (mode === 'order' ? cols : cols.map((c) => ({ ...c, label: c.label.replace(/^주문/, '의뢰') })));

/** 계획상태 — 주문리스트 PLAN_ST_NM 값 그대로. */
export const PLAN_STATUS = ['미작성', '작성중', '작성 완료'] as const;
export const planStatusColor = (st?: string | number | null) =>
  st === '작성 완료' ? 'success' : st === '작성중' ? 'processing' : 'default';

/** 작업지시서 응답 */
export interface WorkOrderData {
  head: PlanRow;
  lines: PlanRow[];
  printRows: PlanRow[];
}

export const fmtNum = (v?: string | number | null, digits = 0) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
};
