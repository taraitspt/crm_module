/** 수주 추진(딜) 타입 — 백엔드 DealDto 와 1:1 */

export type DealStage = 'LEAD' | 'QUALIFIED' | 'QUOTE' | 'NEGOTIATION' | 'WON' | 'LOST';

/**
 * 파이프라인 단계. open=false 는 종료 단계(수주/실패)로 가중 파이프라인에서 빠진다.
 * 색은 진행 정도를 나타내는 단일 색상 램프(연한 → 진한 브랜드 틸) + 종료 2색.
 */
export const STAGES: {
  value: DealStage; label: string; color: string; probability: number; open: boolean;
}[] = [
  { value: 'LEAD', label: '발굴', color: '#9FD3D8', probability: 10, open: true },
  { value: 'QUALIFIED', label: '검토', color: '#66B8C1', probability: 25, open: true },
  { value: 'QUOTE', label: '견적', color: '#3AA3AF', probability: 50, open: true },
  { value: 'NEGOTIATION', label: '협상', color: '#0096A2', probability: 75, open: true },
  { value: 'WON', label: '수주', color: '#15803D', probability: 100, open: false },
  { value: 'LOST', label: '실패', color: '#B91C1C', probability: 0, open: false },
];

export const stageMeta = (s: string) =>
  STAGES.find((x) => x.value === s)
  ?? { value: s as DealStage, label: s, color: '#94A3B8', probability: 0, open: true };

export interface DealItem {
  dealId: number;
  partnerCd: string | null;
  partnerNm: string | null;
  salesEmpId: string;
  empNm: string;
  deptNm: string | null;
  title: string;
  stage: DealStage;
  expectedAmt: number;
  probability: number;
  weightedAmt: number;
  expectedCloseDt: string | null;
  closedDt: string | null;
  lostReason: string | null;
  content: string | null;
  overdue: boolean;
  /** 이 딜에 달린 영업활동 */
  activityCount: number;
  lastActivityDt: string | null;
}

export interface DealSaveRequest {
  partnerCd?: string | null;
  partnerNm?: string | null;
  salesEmpId: string;
  title: string;
  stage: DealStage;
  expectedAmt?: number | null;
  probability?: number | null;
  expectedCloseDt?: string | null;
  lostReason?: string | null;
  content?: string | null;
}

export interface StageSummary {
  stage: string;
  count: number;
  expectedAmt: number;
  weightedAmt: number;
}

export interface Pipeline {
  items: DealItem[];
  byStage: Record<string, StageSummary>;
  openCount: number;
  openAmt: number;
  weightedAmt: number;
  wonCount: number;
  wonAmt: number;
  lostCount: number;
  lostAmt: number;
}
