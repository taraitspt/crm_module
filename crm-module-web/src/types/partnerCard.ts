/** 거래처 카드(360도) 타입 — 백엔드 PartnerOverviewDto / PartnerContactDto 와 1:1 */

import type { ActivityItem } from './activity';
import type { DealItem } from './deal';

export interface PartnerProfile {
  partnerCd: string;
  partnerNm: string | null;
  bizrNo: string | null;
  ceoNm: string | null;
  bizType: string | null;
  bizItem: string | null;
  address: string | null;
  telNo: string | null;
  faxNo: string | null;
  erpContactNm: string | null;
  erpContactDeptNm: string | null;
  erpContactPosition: string | null;
  erpContactPhone: string | null;
  erpContactTel: string | null;
  erpContactEmail: string | null;
}

export interface MonthPoint {
  planMm: string;
  planAmt: number;
  actualAmt: number;
}

export interface PartnerPerformance {
  year: number;
  planAmt: number;
  planLaborAmt: number;
  planPaperAmt: number;
  ownerEmpId: string | null;
  ownerNm: string | null;
  curAmt: number;
  prevAmt: number;
  changeRate: number | null;
  lastBillDt: string | null;
  months: MonthPoint[];
  erpAvailable: boolean;
  erpMessage: string | null;
}

export interface PartnerContact {
  contactId: number;
  partnerCd: string;
  name: string;
  positionNm: string | null;
  deptNm: string | null;
  phone: string | null;
  tel: string | null;
  email: string | null;
  primary: boolean;
  memo: string | null;
}

export interface PartnerContactSaveRequest {
  partnerCd: string;
  name: string;
  positionNm?: string | null;
  deptNm?: string | null;
  phone?: string | null;
  tel?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  memo?: string | null;
}

export interface PartnerOverview {
  profile: PartnerProfile;
  performance: PartnerPerformance;
  contacts: PartnerContact[];
  deals: DealItem[];
  activities: ActivityItem[];
  activityCount: number;
  lastActivityDt: string | null;
}
