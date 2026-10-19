/** 월매출계획 / 매출현황 타입 — 백엔드 SalesPlanDto 와 1:1 */

export interface SalesPlanMonth {
  planMm: string;
  laborAmt: number;
  paperAmt: number;
  /** 매출 이월/증감 사유(월 메모) */
  memo?: string | null;
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
  /** 매출 이월/증감 사유(월 메모) */
  memo?: string | null;
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
  /** 신규(목표) 가상 거래처 줄만 — 실적에 합친 거래처(그 해 월매출계획에 없는 거래처) 이름 */
  newPartners?: string[] | null;
}

export interface SalesStatusResponse {
  rows: SalesStatusRow[];
  planTotal: number;
  actualTotal: number;
  erpAvailable: boolean;
  erpMessage: string | null;
}
