// === 사업자 ===
export interface BizOwnerListItem {
  id: number;
  companyName: string;
  bizNo: string;
  ceoNm: string;
  bizType: string;
  bizItem: string;
  address: string;
  partnerCd: string;
  deptCd: number | null;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
}

export interface BizOwnerDetail {
  id: number;
  companyName: string;
  bizNo: string;
  bizType: string;
  bizItem: string;
  address: string;
  partnerCd: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  deptCd: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BizOwnerForm {
  companyName: string;
  bizNo: string;
  bizType: string;
  bizItem: string;
  address: string;
  partnerCd: string;
  representativeName: string;
  representativeEmail: string;
  representativePhone: string;
  deptCd: number | null;
}

// === 목표 ===
export interface PartGoalItem {
  deptCd: string;
  deptNm: string;
  goalAmt: number;
}

export interface AmGoalItem {
  salesEmpId: string;
  empNm: string;
  deptNm: string;
  goalAmt: number;
}

export interface MonthGoal {
  planMm: string;
  /** 시트 #5 0511_2 — 목표금액(사용자 입력). outerAmt = max(0, goalAmt - innerAmt) 자동 */
  goalAmt: number;
  innerAmt: number;
  outerAmt: number;
}

export interface AmGoalYearlyItem {
  salesEmpId: string;
  empNm: string;
  deptCd: string;
  deptNm: string;
  months: MonthGoal[];
  /** ODTY_CD='200': 파트장. goalAmt = 부서목표 - 일반담당자합계 자동계산 */
  partLeader?: boolean;
}
