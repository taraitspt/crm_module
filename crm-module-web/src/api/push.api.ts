import apiClient from './client';
import type { ApiResponse } from '@/types/common';

/** 웹 푸시(활동 알림) — 서버 VAPID 공개키·구독 등록/해지·테스트. */
export const pushApi = {
  vapidKey: async () => (await apiClient.get<ApiResponse<{ enabled: boolean; publicKey: string | null }>>('/push/vapid-public-key')).data.data,
  subscribe: (body: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => apiClient.post('/push/subscriptions', body),
  unsubscribe: (endpoint: string) => apiClient.delete('/push/subscriptions', { params: { endpoint } }),
  mine: async () => (await apiClient.get<ApiResponse<{ count: number }>>('/push/subscriptions/me')).data.data,
  test: async () => (await apiClient.post<ApiResponse<{ count: number }>>('/push/test')).data.data,
};
