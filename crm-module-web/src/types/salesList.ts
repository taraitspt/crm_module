/** 매출리스트 한 줄 — GROW 월매출리스트(매출번호 × 수주순번 × 주문). 백엔드 SalesListDto.Row. */
export interface SalesListRow {
  billDate: string;
  billNo: string;
  plantCd?: string;
  deptCd?: string;
  deptName?: string;
  salesEmpNo?: string;
  salesEmpName?: string;
  partnerCd?: string;
  partnerName?: string;
  itemCd?: string;
  itemName?: string;
  detailItemName?: string;
  qty?: number;
  /** 매출액 */
  salesAmt: number;
  /** 정산공임 / 정산용지 / 정산합계 — 주문 정산 금액(분할매출이면 줄마다 반복) */
  laborAmt?: number;
  paperAmt?: number;
  settleAmt?: number;
  soType?: string;
  soTypeName?: string;
  soNo?: string;
  soSq?: number;
  orderType?: string;
  orderNo?: string;
  orderSq?: number;
  workPlaceCd?: string;
  workPlaceName?: string;
  inOut?: string;
  itemAcGroupCd?: string;
  bindInfo?: string;
  makeEmpName?: string;
  salesGroupCd?: string;
  salesGroupName?: string;
  ccCd?: string;
  ccName?: string;
}

export interface SalesListResponse {
  rows: SalesListRow[];
  /** 데이터 범위 때문에 빠진 줄 수 */
  hiddenByScope: number;
}
