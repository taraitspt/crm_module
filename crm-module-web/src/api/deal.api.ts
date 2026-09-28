import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { DealSaveRequest, Pipeline } from '@/types/deal';
import type { PartnerContactSaveRequest, PartnerOverview, PartnerContact } from '@/types/partnerCard';

export const dealApi = {
  pipeline: async (params: { salesEmpId?: string; partnerCd?: string; stage?: string; keyword?: string }) => {
    const res = await apiClient.get<ApiResponse<Pipeline>>('/deals', {
      params: {
        salesEmpId: params.salesEmpId || undefined,
        partnerCd: params.partnerCd || undefined,
        stage: params.stage || undefined,
        keyword: params.keyword || undefined,
      },
    });
    return res.data.data;
  },
  create: async (payload: DealSaveRequest) => {
    const res = await apiClient.post<ApiResponse<number>>('/deals', payload);
    return res.data.data;
  },
  update: async (id: number, payload: DealSaveRequest) => {
    await apiClient.put(`/deals/${id}`, payload);
  },
  /** 칸반에서 단계만 옮길 때 */
  changeStage: async (id: number, stage: string, lostReason?: string | null) => {
    await apiClient.patch(`/deals/${id}/stage`, { stage, lostReason: lostReason ?? null });
  },
  remove: async (id: number) => {
    await apiClient.delete(`/deals/${id}`);
  },
};

export const partnerCardApi = {
  /** ERP 조회가 섞여 있어 수 초 걸릴 수 있다. */
  overview: async (partnerCd: string, year?: number) => {
    const res = await apiClient.get<ApiResponse<PartnerOverview>>(
      `/partners/${encodeURIComponent(partnerCd)}/overview`,
      { params: { year }, timeout: 3 * 60 * 1000 },
    );
    return res.data.data;
  },
  contacts: async (partnerCd: string) => {
    const res = await apiClient.get<ApiResponse<PartnerContact[]>>(
      `/partners/${encodeURIComponent(partnerCd)}/contacts`);
    return res.data.data ?? [];
  },
  createContact: async (payload: PartnerContactSaveRequest) => {
    const res = await apiClient.post<ApiResponse<number>>('/partners/contacts', payload);
    return res.data.data;
  },
  updateContact: async (id: number, payload: PartnerContactSaveRequest) => {
    await apiClient.put(`/partners/contacts/${id}`, payload);
  },
  removeContact: async (id: number) => {
    await apiClient.delete(`/partners/contacts/${id}`);
  },
};
