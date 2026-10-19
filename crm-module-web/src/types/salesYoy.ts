/** 전년 매출 비교 — 백엔드 SalesYoyDto 와 1:1. cur/prev 는 1~12월 공급가액(원), 인덱스 0 = 1월. */
export interface SalesYoyRow {
  partnerCd: string;
  partnerNm?: string | null;
  /** 비용센터(영업팀) — 매출 라인 값 */
  ccCd: string;
  ccNm?: string | null;
  /** 영업담당 사번·이름 — 매출 라인 값 */
  empNo: string;
  empNm?: string | null;
  cur: number[];
  prev: number[];
  /** 본부 — 비용센터의 부서(없으면 영업담당 부서) → 조직도 본부 */
  hqCd?: number | null;
  hqNm?: string | null;
  hqSort?: number | null;
}

export interface SalesYoyResponse {
  year: number;
  rows: SalesYoyRow[];
  erpAvailable: boolean;
  erpMessage?: string | null;
  /** 데이터 범위(본인·부서) 때문에 뺀 줄 수 */
  hiddenByScope: number;
}
