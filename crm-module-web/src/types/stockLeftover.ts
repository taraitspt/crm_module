/**
 * 매출 후 잔여재고 — 매출은 등록됐는데 오늘 기준 재고가 남은 주문 라인(배치 = 주문번호-순번). 서버는 Map(camelCase)으로 내려준다.
 * 재고는 ERP 재고자산 현황(현재고 − 오늘 전표), 매출은 SD_BILL(배치번호 기준). 자재유형 반제품(14)은 서버에서 제외.
 */
export type LeftoverRow = Record<string, string | number | null | undefined>;

export interface LeftoverCol {
  id: string;
  label: string;
  width: number;
  kind?: 'num' | 'date' | 'status';
  align?: 'right' | 'center';
  fixed?: 'left';
}
const tx = (id: string, label: string, width: number): LeftoverCol => ({ id, label, width });
const num = (id: string, label: string, width = 90): LeftoverCol => ({ id, label, width, kind: 'num', align: 'right' });
const dt = (id: string, label: string, width = 100): LeftoverCol => ({ id, label, width, kind: 'date', align: 'center' });

export const LEFTOVER_COLS: LeftoverCol[] = [
  { ...tx('batchNo', '배치(주문-순번)', 170), fixed: 'left' },
  { id: 'billSt', label: '매출상태', width: 90, kind: 'status', align: 'center' },
  num('stockQt', '잔여재고', 100),
  { ...tx('stdUnitCd', '단위', 52), align: 'center' },
  num('ordQt', '주문수량', 90),
  num('billQt', '매출수량', 90),
  num('unbilledQt', '미매출수량', 96),
  num('billCnt', '매출건수', 72),
  dt('lastBillDt', '마지막 매출일'),
  dt('firstBillDt', '첫 매출일'),
  tx('partnerNm', '거래처', 160),
  tx('orddocNm', '주문명', 220),
  tx('spcfcsItemNm', '세부품목명', 220),
  tx('bizrsptEmpnoNm', '담당자', 80),
  tx('deptNm', '부서', 110),
  dt('ordDt', '주문일'),
  dt('dlvshDts', '납기일'),
  tx('acctFgNms', '자재유형', 90),
  tx('slNms', '창고', 140),
  tx('itemNms', '재고 품목', 200),
  num('stockRows', '재고 행', 64),
  tx('billdocNos', '매출번호', 220),
];

/** 매출상태 — FULL: 매출수량 ≥ 주문수량인데 재고가 남음(정리 대상), PARTIAL: 분할매출 진행 중(남은 재고가 정상일 수 있음) */
export const BILL_STATUS: Record<string, { label: string; color: string; desc: string }> = {
  FULL: { label: '전량 매출', color: 'error', desc: '매출수량이 주문수량 이상인데 재고가 남아 있음 — 재고 정리(출고/폐기) 대상' },
  PARTIAL: { label: '부분 매출', color: 'processing', desc: '아직 매출이 덜 된 라인 — 남은 재고는 추가 매출 예정일 수 있음' },
};

export const fmtQty = (v?: string | number | null) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
};
