/** 공지사항 — 백엔드 NoticeDto 와 1:1 (V165). 본문은 일반 텍스트(줄바꿈 유지). */
export type NoticeCategory = 'UPDATE' | 'NOTICE';

/** 첨부파일 — 받을 땐 noticeApi.fileLink 로 몇 분짜리 주소를 받는다. */
export interface NoticeFile {
  fileId: string;
  name: string;
  size?: number | null;
}

export interface Notice {
  noticeId: number;
  category: NoticeCategory;
  title: string;
  content: string;
  pinned: boolean;
  popupYn: boolean;
  /** yyyy-MM-dd */
  popupStart?: string | null;
  popupEnd?: string | null;
  authorName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  files: NoticeFile[];
}

export interface NoticeSaveRequest {
  category: NoticeCategory;
  title: string;
  content: string;
  pinned: boolean;
  popupYn: boolean;
  popupStart?: string | null;
  popupEnd?: string | null;
}

export const NOTICE_CATEGORY: Record<NoticeCategory, { label: string; color: string }> = {
  UPDATE: { label: '업데이트', color: 'blue' },
  NOTICE: { label: '공지', color: 'green' },
};
