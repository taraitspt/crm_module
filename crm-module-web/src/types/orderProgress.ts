import type { ColType } from '@/components/table/columnFilterKit';

/** 주문진행현황 한 행 — GROW "주문별진행현황" 쿼리 컬럼(camelCase) → 값. 백엔드 OracleOrderProgressRepository. */
export type OrderProgressRow = Record<string, string | number | null | undefined>;

export interface OrderProgressCol {
  id: string; label: string; type?: ColType; width: number; align?: 'right' | 'center'; fixed?: 'left'; hidden?: boolean;
}
const num = (id: string, label: string, width = 100): OrderProgressCol => ({ id, label, type: 'amount', width, align: 'right' });
const en = (id: string, label: string, width: number, align?: 'center'): OrderProgressCol => ({ id, label, type: 'enum', width, align });
const tx = (id: string, label: string, width: number): OrderProgressCol => ({ id, label, width });
const code = (id: string, label: string, width: number): OrderProgressCol => ({ id, label, width, hidden: true });

/** PC 표 컬럼 — 진행상태를 앞에 두고, 코드 컬럼은 기본 숨김. */
export const ORDER_PROGRESS_COLS: OrderProgressCol[] = [
  { id: 'orddocNo', label: '주문번호', width: 150, fixed: 'left' },
  { ...num('orddocSq', '순번', 60), align: 'center', fixed: 'left' },
  en('progNm', '진행상태', 110, 'center'),
  tx('progDt', '처리일자', 100),
  tx('ordDt', '주문일', 100),
  tx('orddocNm', '주문명', 260),
  en('partnerNm', '거래처', 170),
  en('deptNm', '영업담당부서', 110),
  en('bizrsptEmpnoNm', '영업담당자', 90),
  tx('pasgnrNm', '거래처담당자', 100),
  tx('spcfcsItemNm', '세부품목명', 240),
  code('itemCd', '품목코드', 110), en('itemNm', '품목명', 110),
  num('ordQt', '주문수량', 90), num('sumAmt', '합계금액', 110),
  en('prplNm', '작업처', 90), en('prwFgNm', '인쇄구분', 90), en('wrkFgNm', '주문구분', 90), en('orddocStNm', '주문상태', 80, 'center'),
  tx('dlvshDts', '납품예정일', 100),
  en('etcDcNm', '영업유형', 90), en('taxafsCdNm', '세무구분', 90), en('billFgNm', '매출구분', 80),
  tx('ppPlanNo', '생산계획번호', 150), en('ppProcNm', '생산단계', 90), tx('ppProcDt', '생산처리일', 100),
  en('puProcNm', '구매단계', 90), tx('puProcNo', '구매번호', 140), tx('puProcDt', '구매처리일', 100),
  tx('sodocNo', '정산수주번호', 150), tx('billdocNo', '매출번호', 140), tx('srcOrddocNo', '원천주문번호', 150),
  en('userNm', '등록자', 80), num('lacoAmt', '공임금액', 100), num('mtrilAmt', '자재금액', 100),
  tx('rmkTxt', '추가정보사항', 300),
  code('companyCd', '회사코드', 70), code('plantCd', '공장코드', 70), code('prplCd', '작업처코드', 80), code('prwFg', '인쇄구분코드', 80),
  code('wrkFg', '작업구분코드', 80), code('deptCd', '부서코드', 80), code('bizrsptEmpnoCd', '담당자사번', 90), code('partnerCd', '거래처코드', 90),
  code('orddocSt', '주문상태코드', 80), code('taxafsCd', '세무코드', 70), code('billFg', '매출구분코드', 80), code('insertId', '등록자ID', 90),
  code('rel1Cd', '작업장', 70), code('wc40Yn', '제본완료여부', 80), code('issCmptYn', '출고완료여부', 80), code('rqstNo', '제작의뢰번호', 140),
];

/**
 * 진행 단계 순서 — 색을 단계 구간으로 묶는다. 쿼리의 PROG_NM 외에 POD 단계명(제판대기중 등)처럼 모르는 값은 "진행 중" 색.
 *   접수(회색) → 생산·구매·외주(청록) → 출고(파랑) → 정산·수주·매출(초록)
 */
const STAGE_GROUP: Record<string, 'todo' | 'doing' | 'shipped' | 'done'> = {
  주문입력: 'todo', 주문처리: 'todo',
  생산계획중: 'doing', 제판: 'doing', 인쇄: 'doing', 제본: 'doing', 제본완료: 'doing', 생산완료: 'doing',
  구매발주: 'doing', 구매입고: 'doing', 외주발주: 'doing',
  출고처리: 'shipped',
  정산입력: 'done', 수주입력: 'done', 매출등록: 'done',
};
export const stageGroup = (progNm?: string | number | null) => STAGE_GROUP[String(progNm ?? '')] ?? 'doing';
/** antd Tag color */
export const stageColor = (progNm?: string | number | null) =>
  ({ todo: 'default', doing: 'processing', shipped: 'blue', done: 'success' } as const)[stageGroup(progNm)];
/** 디자인 토큰 색(모바일 카드 글자색용) */
export const STAGE_LABEL: Record<ReturnType<typeof stageGroup>, string> = { todo: '접수', doing: '진행 중', shipped: '출고', done: '완료' };

/** ERP yyyyMMdd → yyyy-MM-dd. 이미 하이픈이 있거나 형식이 다르면 그대로. */
export const ymd = (v?: string | number | null) => {
  const s = String(v ?? '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
};
