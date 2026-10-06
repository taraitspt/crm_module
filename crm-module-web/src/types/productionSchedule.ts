/**
 * 생산일정현황 — ERP 인쇄·제본·코팅 생산일정현황 이식. 서버는 컬럼명(camelCase) → 값 Map 으로 내려준다.
 * 라벨은 ERP 화면 그리드(사용자 제공 2026-10-06)를 따른다.
 */
export type ScheduleRow = Record<string, string | number | null | undefined>;

export type ScheduleTab = 'print' | 'bind' | 'coat';
// 코팅 수량 라벨은 "매수"가 아니라 계획정미/작업/잔여로 — 단위가 꼭 매가 아니라서(사용자 지적 2026-10-06)

/** 설비 유형(PM_EQ_DTL.EQP_TP_CD) — 탭마다 고를 수 있는 목록. 코팅은 하나라 선택을 숨긴다. */
export const SCHEDULE_TABS: { key: ScheduleTab; label: string; eqpTypes: { value: string; label: string }[]; qtyLabel: string }[] = [
  { key: 'print', label: '인쇄', qtyLabel: '통수', eqpTypes: [{ value: '201', label: '매엽' }, { value: '202', label: '국윤전' }, { value: '203', label: '46윤전' }] },
  { key: 'bind', label: '제본', qtyLabel: '부수', eqpTypes: [
    { value: '401', label: '무선' }, { value: '402', label: '중철' }, { value: '403', label: '양장' }, { value: '404', label: '링' },
    { value: '405', label: '재단' }, { value: '406', label: '접지' }, { value: '407', label: '기타제본' }, { value: '408', label: '수작업' },
  ] },
  { key: 'coat', label: '코팅', qtyLabel: '계획정미', eqpTypes: [{ value: '301', label: '코팅' }] },
];

export interface ScheduleCol {
  id: string;
  label: string;
  width: number;
  /** num: 천단위 오른쪽, date: yyyyMMdd → yyyy-MM-dd, yn: Y/N 가운데 */
  kind?: 'num' | 'date' | 'yn';
  align?: 'right' | 'center';
  fixed?: 'left';
}
const tx = (id: string, label: string, width: number): ScheduleCol => ({ id, label, width });
const num = (id: string, label: string, width = 72): ScheduleCol => ({ id, label, width, kind: 'num', align: 'right' });
const dt = (id: string, label: string, width = 100): ScheduleCol => ({ id, label, width, kind: 'date', align: 'center' });
const yn = (id: string, label: string, width = 56): ScheduleCol => ({ id, label, width, kind: 'yn', align: 'center' });

const HEAD: ScheduleCol[] = [
  { ...dt('planDt', '계획일자'), fixed: 'left' },
  { ...num('schdulSq', '작업순서', 64), align: 'center' },
  yn('cnfmYn', '확정'),
  yn('prpcntCloseYn', '마감'),
];
const PLAN: ScheduleCol[] = [tx('planNo', '계획번호', 150), { ...num('planSq', '순번', 52), align: 'center' }, { ...num('planLowSq', '하위', 52), align: 'center' }, tx('orddocNo', '주문번호', 150)];
const ITEM: ScheduleCol[] = [tx('partnerNm', '거래처', 150), tx('itemNm', '제품명', 120), tx('spcfcsItemNm', '세부품목명', 240)];

/** 탭별 컬럼 — ERP 생산일정현황 각 화면의 열 순서. */
export const SCHEDULE_COLS: Record<ScheduleTab, ScheduleCol[]> = {
  print: [
    ...HEAD, yn('prwIssueYn', '진행', 52), yn('issueYn', '실적'), yn('purwrhsngQtYn', '용지입고', 68), yn('ispcYn', '감리'), yn('cmptYn', '원고'),
    ...PLAN, { ...num('orddocSq', '주문순번', 68), align: 'center' }, ...ITEM,
    tx('configNm', '구성', 64), tx('plmkNm', '제판', 70), num('prpcntSq', '대수', 52), tx('eqpNm', '설비', 110),
    tx('mtrilNm', '용지명', 220), tx('dtlSizeDc', '재단규격', 90), { ...tx('gnrlQt', '색도', 56), align: 'center' },
    num('netPpcntQt', '정미매수', 80), num('pageNo', '쪽수', 52), num('tongCnt', '통수', 80), num('workCnt', '작업통수', 80), num('reTongCnt', '잔여통수', 80),
    tx('opNm', '제본공정', 70), tx('bndPartnerNm', '제본처', 120), tx('wrkNm', '후가공', 160),
    num('wrkTmCnt', '소요시간', 72), num('wrkUm', '작업단가', 80), num('wrkAmt', '작업금액', 100),
    dt('cnfmDts', '확정일'), dt('rcptPrrgDts', '원고입고예정'), dt('dlvshDts', '납기일'), tx('prRmkDc', '생산전달사항', 200),
  ],
  bind: [
    ...HEAD, yn('planprwYn', '인쇄'), yn('planorgmYn', '접지'), yn('issueYn', '실적'), yn('wrkCd', '완료'),
    ...PLAN, { ...num('orddocSq', '주문순번', 68), align: 'center' }, ...ITEM,
    yn('ordBbndInfoNm', '제본추가', 68), tx('eqpNm', '설비', 110), tx('bbndEqpNm', '제본처', 120), tx('bbndInfoNm', '제본정보', 110), tx('plteKndNm', '판형', 70),
    num('fullPrpcntQt', '콤마수', 64), num('fullPageCnt', '전체페이지', 80), tx('sizeDc', '사이즈', 90),
    num('ordQt', '부수', 80), num('arltQt', '작업부수', 80), num('restQt', '잔여부수', 80),
    num('wrkTmCnt', '소요시간', 72), num('wrkUm', '단가', 72), num('wrkAmt', '금액', 100),
    tx('packMthdNm', '포장방법', 100), tx('packUnitDc', '포장단위', 72),
    dt('cnfmDts', '수주확정일'), dt('dlvshDts', '납기일'), tx('prRmkDc', '생산전달사항', 200),
  ],
  coat: [
    ...HEAD, yn('issueYn', '발행'), yn('prpcntCloseYn', '인쇄완료', 68),
    ...PLAN, { ...num('orddocSq', '주문순번', 68), align: 'center' }, tx('itemNm', '주문명', 120), tx('spcfcsItemNm', '세부품목명', 240),
    tx('configNm', '구성', 64), num('prpcntSq', '대수', 52), tx('opNm', '공정', 70), tx('intltshNm', '계열', 56), tx('wrkNm', '작업', 170),
    tx('eqpNm', '설비', 110), tx('prwEqpNm', '인쇄설비', 110), dt('prwPlanDt', '인쇄계획일'),
    tx('mtrilNm', '용지명', 220), tx('dtlSizeDc', '재단규격', 90), tx('dtlDc', '터잡기', 90),
    num('procQt', '수량(연)', 72), num('netPpcntQt', '계획정미', 80), num('prodQt', '작업', 72), num('reQt', '잔여', 72),
    num('wrkUm', '작업단가', 80), num('wrkAmt', '작업금액', 100), tx('procWrkNm', '후가공(전체)', 200), tx('bndPartnerNm', '제본처', 120),
    { ...tx('inoutcomFg', '사내외', 56), align: 'center' }, tx('prRmkDc', '생산전달사항', 200),
  ],
};

/** 코팅 탭 "마감" 자리는 인쇄 완료 여부라 HEAD 의 prpcntCloseYn 과 겹친다 — 코팅은 HEAD 에서 마감을 빼고 쓴다. */
SCHEDULE_COLS.coat = SCHEDULE_COLS.coat.filter((c, i, arr) => !(c.id === 'prpcntCloseYn' && arr.findIndex((x) => x.id === 'prpcntCloseYn') !== i));

export const fmtQty = (v?: string | number | null, digits = 2) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('ko-KR', { maximumFractionDigits: digits });
};
