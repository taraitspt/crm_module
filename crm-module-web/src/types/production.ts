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
  equipmentName?: string;
  cutSize?: string;
  imposition?: string;
  pages?: number;
  cutCount?: number;
  workUnitPrice?: number;
  workAmount?: number;
  stdUnitPrice?: number;
  stdAmount?: number;
  pressCloseYn?: string;
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
