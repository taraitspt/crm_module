/** 생산계획현황 탭 — ERP 화면 탭 순서(인쇄·제판·후가공·접지·제본). 백엔드 ProductionPlanDto.Tab 소문자. */
export type ProductionPlanTab = 'print' | 'plate' | 'process' | 'fold' | 'bind';

/** 탭별 라벨과 "수량" 컬럼 — 합계 줄·대시보드가 탭마다 다른 수량(판수/작업수량)을 집계한다. */
export const PRODUCTION_TABS: { key: ProductionPlanTab; label: string; qtyField: keyof ProductionPlanRow; qtyLabel: string }[] = [
  { key: 'print', label: '인쇄', qtyField: 'plateCount', qtyLabel: '판수' },
  { key: 'plate', label: '제판', qtyField: 'plateCount', qtyLabel: '판수' },
  { key: 'process', label: '후가공', qtyField: 'procQty', qtyLabel: '작업수량' },
  { key: 'fold', label: '접지', qtyField: 'orderQty', qtyLabel: '작업수량' },
  { key: 'bind', label: '제본', qtyField: 'orderQty', qtyLabel: '작업수량' },
];

/**
 * 생산계획현황 한 행 (백엔드 ProductionPlanDto.Row). 다섯 탭 컬럼의 합집합이라
 * 탭에 없는 값은 undefined — 어느 탭이 뭘 쓰는지는 ProductionPlanPage 의 컬럼 정의가 안다.
 */
export interface ProductionPlanRow {
  planNo: string;
  planSq?: number;
  planLowSq?: number;
  planDate?: string;
  orderNo?: string;
  orderName?: string;
  orderSq?: number;
  partnerName?: string;
  itemCd?: string;
  itemName?: string;
  detailItemName?: string;
  /** 주문수량 — 접지·제본에선 작업수량 */
  orderQty?: number;
  configName?: string;
  processName?: string;
  /** 계열 — 제판 탭에는 없음 */
  seriesName?: string;
  workName?: string;
  pressSq?: number;
  /** 설비명 — 외주 발주가 있으면 발주 업체명으로 바꿔 내려준다(getProductionPlan). 원래 설비명은 equipmentRawName. */
  equipmentName?: string;
  /** ERP 설비명 그대로(외주면 "외주(톰슨)" 같은 자리표시). */
  equipmentRawName?: string;
  /** 외주 발주 업체 — 발주 없으면 없음. */
  vendorName?: string;
  /** 외주 발주 납기요청일(= 입고요청일) yyyy-MM-dd. */
  poReqDate?: string;
  cutSize?: string;
  imposition?: string;
  pages?: number;
  cutCount?: number;
  workUnitPrice?: number;
  workAmount?: number;
  stdUnitPrice?: number;
  stdAmount?: number;
  pressCloseYn?: string;
  /** 완료 = 대수마감 Y 또는 외부입고 설비 (서버 ProductionRules — 주문 타임라인와 같은 기준) */
  doneYn?: 'Y' | 'N';
  /** 설비가 외부입고(…) */
  extYn?: 'Y' | 'N';
  resultStatusCd?: string;
  resultStatusName?: string;
  resultDate?: string;
  // 인쇄·제판
  materialCd?: string;
  materialName?: string;
  generalFront?: number;
  generalBack?: number;
  spotFront?: number;
  spotBack?: number;
  plateCount?: number;
  groupParentYn?: string;
  groupChildYn?: string;
  groupSq?: number;
  // 인쇄
  startPage?: number;
  endPage?: number;
  plateInfoName?: string;
  netReam?: number;
  spareReam?: number;
  fullReam?: number;
  adjReam?: number;
  cutTimes?: number;
  netSheets?: number;
  spareSheets?: number;
  fullSheets?: number;
  adjSheets?: number;
  adjSheetsSum?: number;
  tongCount?: number;
  groupNet?: number;
  groupSpare?: number;
  groupAdj?: number;
  // 후가공
  procQty?: number;
  // 접지·제본
  orderUnitCd?: string;
  // 제본
  fullPressCount?: number;
  fullPageCount?: number;
  totalPages?: number;
  lastYn?: string;
}
