import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { Notice, NoticeFile, NoticeSaveRequest } from '@/types/notice';

/** 공지사항 — 읽기 전원, 쓰기 ADMIN(서버에서 막는다). */
export const noticeApi = {
  list: async () => (await apiClient.get<ApiResponse<Notice[]>>('/notices')).data.data,
  /** 오늘 팝업 기간에 걸린 공지 */
  popups: async () => (await apiClient.get<ApiResponse<Notice[]>>('/notices/popups')).data.data,
  create: async (req: NoticeSaveRequest) => (await apiClient.post<ApiResponse<Notice>>('/notices', req)).data.data,
  update: async (id: number, req: NoticeSaveRequest) => (await apiClient.put<ApiResponse<Notice>>(`/notices/${id}`, req)).data.data,
  remove: async (id: number) => { await apiClient.delete(`/notices/${id}`); },
  /** 첨부 한 건 올리기(관리자) — 큰 파일이 있어 타임아웃을 넉넉히 */
  addFile: async (id: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return (await apiClient.post<ApiResponse<NoticeFile>>(`/notices/${id}/files`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600_000,
    })).data.data;
  },
  removeFile: async (id: number, fileId: string) => { await apiClient.delete(`/notices/${id}/files/${fileId}`); },
  /** 몇 분짜리 서명 다운로드 경로(/api/public/notice-files/...) */
  fileLink: async (id: number, fileId: string) =>
    (await apiClient.get<ApiResponse<{ url: string }>>(`/notices/${id}/files/${fileId}/link`)).data.data.url,
};
