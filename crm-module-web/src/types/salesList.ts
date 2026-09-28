/** 매출리스트 한 줄 — ERP 매출 상세(매출번호·순번). 백엔드 SalesListDto.Row. */
export interface SalesListRow {
  billDate: string;
  billNo: string;
  billSq?: number;
  billType?: string;
  billTypeName?: string;
  plantCd?: string;
  partnerCd?: string;
  partnerName?: string;
  bizNo?: string;
  salesDeptCd?: string;
  salesDeptName?: string;
  ccCd?: string;
  salesEmpNo?: string;
  salesEmpName?: string;
  itemCd?: string;
  itemName?: string;
  qty?: number;
  unitPrice?: number;
  supplyAmt: number;
  taxAmt: number;
  totalAmt: number;
  soNo?: string;
  soSq?: number;
  docuNo?: string;
  remark?: string;
}

export interface SalesListResponse {
  rows: SalesListRow[];
  /** 데이터 범위 때문에 빠진 줄 수 */
  hiddenByScope: number;
}
