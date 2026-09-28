// ── Dashboard ──

export interface SalesTrendDto {
  monthlySales: MonthlyAmount[];
  trendLine: MonthlyAmount[];
}

export interface MonthlyAmount {
  month: string;   // "2025-04"
  amount: number;
}

export interface DashboardSummaryDto {
  totalSalesAmount: number;
  newOrderCount: number;
  activeCustomerCount: number;
  avgMarginRate: number;
  confirmedSalesAmount: number;
  unprocessedSalesCount: number;
  unSettledSalesCount: number;
}

// ── 통합 실적 대시보드 (20·21·22번 통합) ──

export type RowType = 'item' | 'team' | 'hq';
export type ViewMode = 'summary' | 'performance';
export type PeriodType = 'month' | 'cumulative';

export interface IntegratedDashboardDto {
  year: number;
  month: number;
  rows: IntegratedRow[];
  /** 서버 응답이 이미 '전체 부서' 기준이면 true — 대시보드가 전체부서용 재호출을 생략하는 데 사용. */
  scopeAll?: boolean;
}

export interface IntegratedRow {
  orgName: string;
  rowType: RowType;
  // 월 실적
  monthGoal: number;
  monthActual: number;
  monthRate: number;
  // 누적
  cumulativeGoal: number;
  cumulativeActual: number;
  cumulativeRate: number;
  cumulativePrevYearActual: number;   // 전년 동기간(1~월) 누적 실적
  // 전년
  prevYearActual: number;
  yoyRate: number;
  yoyDiff: number;
  // 내부 실적 (종합뷰용)
  innerMonthGoal: number;
  innerMonthActual: number;
  innerMonthRate: number;
  innerCumulativeGoal: number;
  innerCumulativeActual: number;
  innerCumulativeRate: number;
  innerCumulativePrevYearActual: number;
  innerPrevYearActual: number;
  innerYoyRate: number;
  // 외부 실적 (종합뷰용)
  outerMonthGoal: number;
  outerMonthActual: number;
  outerMonthRate: number;
  outerCumulativeGoal: number;
  outerCumulativeActual: number;
  outerCumulativeRate: number;
  outerCumulativePrevYearActual: number;
  outerPrevYearActual: number;
  outerYoyRate: number;
}

// ── 1. 본부/팀 예상매출 (하위호환) ──

export interface TeamForecastDto {
  year: number;
  month: number;
  divisions: DivisionForecast[];
}

export interface DivisionForecast {
  divisionName: string;
  forecastAmount: number;
  teams: TeamDetail[];
}

export interface TeamDetail {
  teamName: string;
  pendingAmount: number;
  inProgressAmount: number;
  forecastAmount: number;
}

// ── 2. 본부/팀 목표 및 실적 ──

export interface TeamGoalActualDto {
  year: number;
  divisions: DivisionGoalActual[];
}

export interface DivisionGoalActual {
  divisionName: string;
  monthly: MonthlyGoalActual[];
  yearlyGoal: number;
  yearlyActual: number;
  yearlyRate: number;
}

export interface MonthlyGoalActual {
  month: number;
  goal: number;
  actual: number;
  rate: number;
}

// ── 3. 파트별 전년대비 ──

export interface PartGoalYoyDto {
  year: number;
  parts: PartYoyRow[];
}

export interface PartYoyRow {
  partName: string;
  prevYearActual: number;
  currentGoal: number;
  currentActual: number;
  goalRate: number;
  yoyRate: number;
}

// ── 4. AM별 매출목표/실적 (통합 구조) ──

export interface AmDashboardDto {
  year: number;
  month: number;
  rows: AmRow[];
}

export interface AmRow {
  amName: string;
  teamName?: string;
  partName?: string;
  rowType: RowType;
  // 월 실적
  monthGoal: number;
  monthActual: number;
  monthRate: number;
  // 누적
  cumulativeGoal: number;
  cumulativeActual: number;
  cumulativeRate: number;
  // 전년
  prevYearActual: number;
  yoyRate: number;
  yoyDiff: number;
  // 내부 실적 (종합뷰용)
  innerMonthGoal: number;
  innerMonthActual: number;
  innerMonthRate: number;
  innerCumulativeGoal: number;
  innerCumulativeActual: number;
  innerCumulativeRate: number;
  innerPrevYearActual: number;
  innerYoyRate: number;
  // 외부 실적 (종합뷰용)
  outerMonthGoal: number;
  outerMonthActual: number;
  outerMonthRate: number;
  outerCumulativeGoal: number;
  outerCumulativeActual: number;
  outerCumulativeRate: number;
  outerPrevYearActual: number;
  outerYoyRate: number;
}

// 하위호환용
export interface AmGoalYoyDto {
  year: number;
  managers: AmYoyRow[];
}

export interface AmYoyRow {
  managerName: string;
  partName: string;
  prevYearActual: number;
  currentGoal: number;
  currentActual: number;
  goalRate: number;
  yoyRate: number;
}

// ── 5. 품목별 실적 ──

export interface ItemPerformanceDto {
  categories: CategoryPerformance[];
  grandTotal: number;
}

export interface CategoryPerformance {
  category: string;
  categoryLabel: string;
  categoryCode: string;
  classification: string;
  totalAmount: number;
  costAmount: number;
  marginAmount: number;
  marginRate: number;
  orderCount: number;
  shareRate: number;
  topVendor: string;
}

export interface ItemPartPerformanceDto {
  rows: ItemPartPerformanceRow[];
  grandTotal: number;
}

export interface ItemPartPerformanceRow {
  departmentCd: string;
  departmentName?: string;
  designAmount: number;
  manualWorkAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  totalSalesCount: number;
  noExtraCostCount: number;
  designCount: number;
  manualWorkCount: number;
  deliveryCount: number;
  orderCount: number;
}

// ── 6. 거래처별 마진 ──

export interface VendorMarginDto {
  vendors: VendorMarginRow[];
}

export interface VendorMarginRow {
  vendorName: string;
  departmentName: string;
  orderAmount: number;
  outsourcingAmount: number;
  marginAmount: number;
  marginRate: number;
  prevMonthMarginRate: number;
  marginRateChange: number;
  orderCount: number;
  remark: string;
}

// ── 7. 주문건별 마진 ──

export interface OrderMarginDto {
  orders: OrderMarginRow[];
}

export interface StatsSelectOption {
  value: string;
  label: string;
}

export interface CustomerYearlySalesRow {
  partnerCd: string;
  partnerName: string;
  businessNo: string;
  departmentCd: string;
  departmentName: string;
  monthlyAmounts: number[];
  totalAmount: number;
}

export interface CustomerYearlySalesDto {
  rows: CustomerYearlySalesRow[];
  departments: StatsSelectOption[];
  partners: StatsSelectOption[];
}

export interface CustomerYearlySalesDetailRow {
  partnerCd: string;
  partnerName: string;
  businessNo: string;
  departmentCd: string;
  departmentName: string;
  salesEmpNo: string;
  salesEmpName: string;
  inOutType: 'I' | 'O' | 'T';
  inOutLabel: '내부' | '외부' | '합계';
  monthlyAmounts: number[];
  totalAmount: number;
}

export interface CustomerYearlySalesDetailDto {
  rows: CustomerYearlySalesDetailRow[];
  departments: StatsSelectOption[];
  partners: StatsSelectOption[];
  employees: StatsSelectOption[];
}

export interface PodProductionRow {
  workPlaceCd?: string;
  workPlaceName?: string;
  /** CRM 주문번호 — ERP주문번호(orderNo)+순번 라인단위 매핑. 미매칭 시 없음. */
  growOrderNo?: string;
  /** CRM 내부 작업 순번. */
  growOrderSq?: number;
  orderNo: string;
  orderSq: number;
  orderName?: string;
  orderDate?: string;
  salesDepartmentCd?: string;
  salesDepartmentName?: string;
  salesEmployeeName?: string;
  itemType?: string;
  itemCd?: string;
  itemName?: string;
  detailItemName?: string;
  orderQty?: number;
  totalPages?: number;
  imposePages?: number;
  imposedTotalPages?: number;
  amount?: number;
  size?: string;
  packingMethod?: string;
  printDirection?: string;
  deliveryDueAt?: string;
  productionEmployeeName?: string;
  productionStatus?: string;
  completedAt?: string;
}

export interface PodProductionDetail {
  process?: string;
  composition?: string;
  workMethod?: string;
  workPlace?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  option4?: string;
  option5?: string;
  materialCd?: string;
  materialName?: string;
  quantity?: number;
  pages?: number;
  unitPrice?: number;
  amount?: number;
  size?: string;
  remark?: string;
}

/** POD 전체 작업사양 (주문일 기준 flat) — GRP생산내역 하단을 기간 전체로 펼친 행. */
export interface PodProductionSpecRow {
  orderNo: string;
  orderSq?: number;
  lineSq?: number;
  orderDate?: string;
  deptCd?: string;
  deptName?: string;
  productionStatus?: string;
  itemCd?: string;
  workCd?: string;
  workName?: string;
  configCd?: string;
  configName?: string;
  option1Cd?: string;
  option1Name?: string;
  option2Cd?: string;
  option2Name?: string;
  workPlaceCd?: string;
  workPlaceName?: string;
  wcFg?: string;
  horizontal?: number;
  vertical?: number;
  pageQty?: number;
  imposePages?: string;
  orderQty?: number;
  unitAmount?: number;
  amount?: number;
}

export interface OrderMarginRow {
  orderNo: string;
  orderSq?: number;
  orderKey?: string;
  vendorName: string;
  departmentName: string;
  managerName: string;
  workName: string;
  orderAmount: number;
  outsourcingAmount: number;
  marginAmount: number;
  marginRate: number;
  salesDate: string;
  remark: string;
}

export interface GrpProfitRow {
  salesDate?: string;
  departmentName: string;
  salesEmployeeName: string;
  salesNo: string;
  salesTitle: string;
  salesPartnerName: string;
  orderPartnerName: string;
  orderNo: string;
  orderSq: number;
  workPlace: string;
  itemCategory: string;
  detailItemName: string;
  breakdown: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  salesType: string;
  division: string;
  accountingDate: string;
  productPurchaseAmount: number;
  outsourcingAmount: number;
  podProductionAmount: number;
  purchaseTotalAmount: number;
  grossProfitAmount: number;
  marginRate: number;
  remark: string;
}

export interface GrpProfitDto { rows: GrpProfitRow[] }

// ── 디자인매출통계 (데이터분석 > 디자인매출통계, 2026-09 신설) ──
/** 디자인 매출 구분 — I: 내부(작업처 디자인 S003 + 일반 주문 디자인비), O: 외부(상품구매 G9999 + 품목구분 디자인 G10S001009), T: 합계(프론트 계산) */
export type DesignSalesType = 'I' | 'O' | 'T';

export interface DesignSalesRow {
  teamCd: string;
  teamName: string;
  partCd: string;
  partName: string;
  salesEmpNo: string;
  salesEmpName: string;
  partnerCd: string;
  partnerName: string;
  businessNo: string;
  designType: DesignSalesType;
  designTypeLabel: '내부' | '외부' | '합계';
  /** 1~12월 공급가(VAT 별도). 기간 지정 조회여도 월 칸은 12개 고정. */
  monthlyAmounts: number[];
  totalAmount: number;
}

export interface DesignSalesDto {
  rows: DesignSalesRow[];
  teams: StatsSelectOption[];
  parts: StatsSelectOption[];
}

/** 거래처 드릴다운 — 주문 순번 단위 명세 */
export interface DesignSalesDetailRow {
  orderDate: string;
  orderNo: string;
  orderSq: number;
  orderTitle: string;
  itemName: string;
  workPlaceName: string;
  partnerName: string;
  departmentName: string;
  salesEmpName: string;
  designType: 'I' | 'O';
  designTypeLabel: '내부' | '외부';
  /** 디자인 매출액(공급가). 내부 작업처(S003)는 순번 공급가, 일반 주문은 디자인비 컬럼. */
  amount: number;
}

// ── 채권연령분석(관리자) — 더존 채권원장 기준일 시점 잔액, 행 단위는 더존 화면과 동일 ──
/** 사업부 — 계정으로 결정: TPS=국내외상매출금 10801, GRP=그래픽스외상매출금 10805, PM=PM사업외상매출금 10804. */
export type ReceivableDivision = 'TPS' | 'GRP' | 'PM';
export interface ReceivableAgingRow {
  pcCd: string;            // 회계단위 (참고용 — 사업부 구분에는 안 쓴다)
  pcNm?: string;
  division: ReceivableDivision;
  wrtDeptCd?: string;      // 작성부서
  wrtDeptNm?: string;
  wrtEmpNo?: string;       // 작성자
  wrtKorNm?: string;
  partnerCd?: string;      // 거래처코드
  partnerNm?: string;      // 거래처명
  bizrNo?: string;         // 사업자등록번호
  terpayCd?: string;       // 결제조건코드
  terpayNm?: string;       // 결제예정일(결제조건명)
  acctCd?: string;         // 계정
  acctNm?: string;         // 계정명
  amHjan: number;          // 기준일 시점 잔액
  inDay30: number;         // 30일이내
  inDay60: number;         // 60일이내
  inDay90: number;         // 90일이내
  inDay120: number;        // 120일이내
  outDay121: number;       // 121일이상
}
// 채권율·회수기한용 매출(분모) 창은 산식 확정 전이라 두지 않는다(2026-09-28) — 서버 ReceivableAgingController 주석 참고.
export interface ReceivableAgingDto {
  baseDate: string;
  rows: ReceivableAgingRow[];
  /** 전년 비교 기준일 — 기준일의 정확히 1년 전 */
  prevBaseDate: string;
  /** 전년 기준일 시점 사업부별 잔액 */
  prevTotals: Record<ReceivableDivision, number>;
}
