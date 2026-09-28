/** 월매출계획 / 매출현황 타입 — 백엔드 SalesPlanDto 와 1:1 */

export interface SalesPlanMonth {
  planMm: string;
  laborAmt: number;
  paperAmt: number;
}

export interface SalesPlanRow {
  salesEmpId: string;
  empNm: string;
  deptCd: number | null;
  deptNm: string | null;
  partnerCd: string;
  partnerNm: string | null;
  months: SalesPlanMonth[];
}

export interface SalesPlanSaveRequest {
  planYy: string;
  /** 이 담당자들의 해당 연도 계획이 rows 로 통째로 교체된다 (rows 에 없는 거래처는 삭제). */
  salesEmpIds: string[];
  rows: SalesPlanRow[];
}

export interface SalesPlanUserOption {
  id: string;
  name: string;
  deptCd: number | null;
  deptNm: string | null;
}

export interface SalesStatusMonth {
  planMm: string;
  /** 공임 + 용지 */
  planAmt: number;
  planLaborAmt: number;
  planPaperAmt: number;
  /** ERP 매출전표에는 공임/용지 구분이 없어 합계만 내려온다. */
  actualAmt: number;
}

export interface SalesStatusRow {
  deptCd: number | null;
  deptNm: string | null;
  salesEmpId: string;
  empNm: string;
  partnerCd: string;
  partnerNm: string | null;
  months: SalesStatusMonth[];
  planTotal: number;
  actualTotal: number;
}

export interface SalesStatusResponse {
  rows: SalesStatusRow[];
  planTotal: number;
  actualTotal: number;
  erpAvailable: boolean;
  erpMessage: string | null;
}
