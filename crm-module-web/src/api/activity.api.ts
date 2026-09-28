import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { AttentionResponse } from '@/types/attention';
import type {
  ActivityItem, ActivitySaveRequest, Board, CalendarDay, PartnerHistory,
} from '@/types/activity';

const BASE = '/activities';

export interface ActivityQuery {
  from: string;
  to: string;
  salesEmpId?: string;
  partnerCd?: string;
  activityType?: string;
  keyword?: string;
}

export const activityApi = {
  list: async (q: ActivityQuery) => {
    const res = await apiClient.get<ApiResponse<ActivityItem[]>>(BASE, {
      params: {
        from: q.from,
        to: q.to,
        salesEmpId: q.salesEmpId || undefined,
        partnerCd: q.partnerCd || undefined,
        activityType: q.activityType || undefined,
        keyword: q.keyword || undefined,
      },
    });
    return res.data.data ?? [];
  },

  calendar: async (year: number, month: number, salesEmpId?: string, partnerCd?: string) => {
    const res = await apiClient.get<ApiResponse<CalendarDay[]>>(`${BASE}/calendar`, {
      params: { year, month, salesEmpId: salesEmpId || undefined, partnerCd: partnerCd || undefined },
    });
    return res.data.data ?? [];
  },

  board: async (from: string, to: string, groupBy: 'EMP' | 'PARTNER', salesEmpId?: string, partnerCd?: string) => {
    const res = await apiClient.get<ApiResponse<Board>>(`${BASE}/board`, {
      params: { from, to, groupBy, salesEmpId: salesEmpId || undefined, partnerCd: partnerCd || undefined },
    });
    return res.data.data;
  },

  /** 팔로업 예정 — nextActionDt 기준(활동일 기준이 아님). */
  followUps: async (from: string, to: string, salesEmpId?: string) => {
    const res = await apiClient.get<ApiResponse<ActivityItem[]>>(`${BASE}/follow-ups`, {
      params: { from, to, salesEmpId: salesEmpId || undefined },
    });
    return res.data.data ?? [];
  },

  partnerHistory: async (partnerCd: string) => {
    const res = await apiClient.get<ApiResponse<PartnerHistory>>(`${BASE}/partner/${encodeURIComponent(partnerCd)}`);
    return res.data.data;
  },

  create: async (payload: ActivitySaveRequest) => {
    const res = await apiClient.post<ApiResponse<number>>(BASE, payload);
    return res.data.data;
  },

  update: async (id: number, payload: ActivitySaveRequest) => {
    await apiClient.put(`${BASE}/${id}`, payload);
  },

  remove: async (id: number) => {
    await apiClient.delete(`${BASE}/${id}`);
  },
};

// ── 관리 필요 거래처 ──
export const attentionApi = {
  /** ERP 왕복 2회(올해/작년)라 수 초 걸릴 수 있다. */
  find: async (params: {
    year: number; fromMm?: number; toMm?: number; minAmt?: number; noContactDays?: number;
    growthRate?: number; vipTopN?: number; reason?: string; deptCd?: string; plantCd?: string;
  }) => {
    const res = await apiClient.get<ApiResponse<AttentionResponse>>(`${BASE}/attention`, {
      params: {
        year: params.year,
        fromMm: params.fromMm,
        toMm: params.toMm,
        minAmt: params.minAmt,
        noContactDays: params.noContactDays,
        growthRate: params.growthRate,
        vipTopN: params.vipTopN,
        reason: params.reason || undefined,
        deptCd: params.deptCd || undefined,
        // 빈 문자열은 '전체'를 뜻하므로 그대로 보낸다(undefined 면 서버 기본값 1000 이 적용됨).
        plantCd: params.plantCd ?? undefined,
      },
      timeout: 5 * 60 * 1000,
    });
    return res.data.data;
  },
};
