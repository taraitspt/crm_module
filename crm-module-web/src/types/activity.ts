/** 영업활동 타입 — 백엔드 ActivityDto 와 1:1 */

export type ActivityType = 'VISIT' | 'CALL' | 'MAIL' | 'QUOTE' | 'CONTRACT' | 'ETC';

/** 유형 메타 — 라벨과 색. 색은 dataviz 검증을 거친 계열에서 뽑았다. */
export const ACTIVITY_TYPES: { value: ActivityType; label: string; color: string }[] = [
  { value: 'VISIT', label: '방문', color: '#0096A2' },
  { value: 'CALL', label: '전화', color: '#3B82F6' },
  { value: 'MAIL', label: '메일', color: '#8B5CF6' },
  { value: 'QUOTE', label: '견적', color: '#E06C00' },
  { value: 'CONTRACT', label: '계약', color: '#15803D' },
  { value: 'ETC', label: '기타', color: '#94A3B8' },
];

export const typeMeta = (t?: string) =>
  ACTIVITY_TYPES.find((x) => x.value === t) ?? { value: 'ETC' as ActivityType, label: t ?? '-', color: '#94A3B8' };

export interface ActivityItem {
  activityId: number;
  activityDt: string;
  salesEmpId: string;
  empNm: string;
  deptCd: number | null;
  deptNm: string | null;
  partnerCd: string | null;
  partnerNm: string | null;
  activityType: ActivityType;
  title: string;
  content: string | null;
  nextActionDt: string | null;
  nextAction: string | null;
  amount: number | null;
  /** 연결된 영업기회 — 없으면 null */
  dealId: number | null;
  dealTitle: string | null;
  dealStage: string | null;
}

export interface ActivitySaveRequest {
  activityDt: string;
  salesEmpId: string;
  partnerCd?: string | null;
  partnerNm?: string | null;
  activityType: ActivityType;
  title: string;
  content?: string | null;
  nextActionDt?: string | null;
  nextAction?: string | null;
  amount?: number | null;
  dealId?: number | null;
}

export interface CalendarDay {
  date: string;
  total: number;
  byType: Record<string, number>;
  followUps: number;
  /** 그날 마감 예정인 영업기회 건수 */
  dealCloses: number;
}

export interface BoardRow {
  rowKey: string;
  rowLabel: string;
  subLabel: string | null;
  counts: Record<string, number>;
  total: number;
}

export interface Board {
  dates: string[];
  rows: BoardRow[];
  dateTotals: Record<string, number>;
  total: number;
}

export interface PartnerHistory {
  partnerCd: string;
  partnerNm: string | null;
  totalCount: number;
  firstDt: string | null;
  lastDt: string | null;
  byType: Record<string, number>;
  items: ActivityItem[];
}
