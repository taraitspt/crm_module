/** 관리 필요 거래처 타입 — 백엔드 AttentionDto 와 1:1 */

export type AttentionReason =
  | 'CHURN' | 'DECLINE' | 'NO_PLAN' | 'NO_CONTACT'
  | 'VIP' | 'GROWTH' | 'NEW' | 'PROSPECT';

/** 신호 묶음 — 주의(문제)와 기회(잘 되는 곳)를 같은 화면에서 나눠 본다. */
export type ReasonGroup = 'RISK' | 'OPPORTUNITY';

/** 사유 메타 — 라벨/색/설명. 색은 상태(위험도·기회) 의미라 브랜드 계열이 아닌 시맨틱 색을 쓴다. */
export const REASONS: {
  value: AttentionReason; label: string; color: string; desc: string; group: ReasonGroup;
}[] = [
  { value: 'CHURN', label: '이탈', color: '#B91C1C', desc: '작년엔 거래했는데 올해 매출이 없음', group: 'RISK' },
  { value: 'DECLINE', label: '급감', color: '#E06C00', desc: '올해 매출이 작년의 절반 미만', group: 'RISK' },
  { value: 'NO_PLAN', label: '계획없음', color: '#1E40AF', desc: '올해 매출이 있는데 월매출계획에 없음', group: 'RISK' },
  { value: 'NO_CONTACT', label: '미접촉', color: '#7C3AED', desc: '계획에 있는데 최근 영업활동 기록이 없음', group: 'RISK' },
  { value: 'VIP', label: 'VIP', color: '#B45309', desc: '올해 매출 상위 거래처', group: 'OPPORTUNITY' },
  { value: 'GROWTH', label: '성장', color: '#15803D', desc: '작년 대비 매출 증가', group: 'OPPORTUNITY' },
  { value: 'NEW', label: '신규', color: '#0891B2', desc: '작년 거래 없이 올해 발생', group: 'OPPORTUNITY' },
  // 매출·계획이 없어도 활동이 있으면 관리필요에 올린다 — 모바일에서 활동을 이어 쓰기 위해(2026-10-06). 담당은 마지막 활동 담당자(의 부서).
  { value: 'PROSPECT', label: '발굴 중', color: '#0F766E', desc: '매출은 아직 없지만 영업활동을 진행 중', group: 'OPPORTUNITY' },
];

export const RISK_REASONS = REASONS.filter((r) => r.group === 'RISK');
export const OPPORTUNITY_REASONS = REASONS.filter((r) => r.group === 'OPPORTUNITY');

/** ERP 사업부문(PLANT_CD). 빈 값은 전체. */
export const PLANTS = [
  { value: '1000', label: '타라티피에스' },
  { value: '2000', label: '그래픽스사업부문' },
  { value: '3000', label: 'PM사업부문' },
  { value: 'ALL', label: '전체 사업부문' },
];

export const reasonMeta = (r: string) =>
  REASONS.find((x) => x.value === r)
  ?? { value: r as AttentionReason, label: r, color: '#94A3B8', desc: '', group: 'RISK' as ReasonGroup };

/** 거래처에 매출을 올린 부서 한 곳 */
export interface DeptShare {
  deptCd: number | null;
  deptNm: string | null;
  ccCd: string | null;
  amt: number;
}

export interface AttentionItem {
  partnerCd: string;
  partnerNm: string;
  /** 담당부서 — 매출을 올린 부서들(매출 큰 순). 여러 부서가 한 거래처를 할 수 있다. */
  depts: DeptShare[];
  /** 올해 전표가 없어 작년 전표에서 부서를 가져온 경우 (이탈 거래처) */
  deptFromPrevYear: boolean;
  /** depts 를 쉼표로 이은 표시용 문자열 */
  deptNm: string | null;
  prevAmt: number;
  curAmt: number;
  changeRate: number | null;
  lastBillDt: string | null;
  hasPlan: boolean;
  planAmt: number;
  ownerEmpId: string | null;
  ownerNm: string | null;
  lastActivityDt: string | null;
  daysSinceActivity: number | null;
  /** 올해 매출 순위 (1 = 최대) */
  salesRank: number | null;
  reasons: AttentionReason[];
}

export interface AttentionResponse {
  items: AttentionItem[];
  byReason: Record<string, number>;
  total: number;
  noContactDays: number;
  minAmt: number;
  growthRate: number;
  vipTopN: number;
  erpAvailable: boolean;
  erpMessage: string | null;
}
