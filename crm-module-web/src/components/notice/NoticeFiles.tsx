import React, { useState } from 'react';
import { App } from 'antd';
import { DownloadOutlined, LoadingOutlined, PaperClipOutlined } from '@ant-design/icons';
import { Capacitor } from '@capacitor/core';
import { noticeApi } from '@/api/notice.api';
import type { NoticeFile } from '@/types/notice';
import { T } from '@/theme/designTokens';

export const fmtSize = (b?: number | null) => {
  if (b == null) return '';
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
};

/**
 * 공지 첨부 내려받기 — 서버에서 몇 분짜리 서명 주소를 받아 연다.
 * 모바일 앱(Capacitor WebView)은 파일 받기를 못 해서 같은 주소를 http 로 바꿔 넘긴다 — 앱 주소(https)와 scheme 이 다르면
 * Capacitor 가 폰 기본 브라우저로 열고, 서버 nginx 가 https 로 돌려보내 브라우저가 받는다(APK 재빌드 없이).
 */
export async function downloadNoticeFile(noticeId: number, f: NoticeFile) {
  const path = await noticeApi.fileLink(noticeId, f.fileId);
  if (Capacitor.isNativePlatform()) {
    window.location.href = `http://${window.location.host}${path}`;
    return;
  }
  const a = document.createElement('a');
  a.href = path;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 첨부 목록 — 이름을 누르면 받는다. 상세·팝업 공용. */
const NoticeFiles: React.FC<{ noticeId: number; files: NoticeFile[]; compact?: boolean }> = ({ noticeId, files, compact }) => {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  if (!files?.length) return null;
  const get = async (f: NoticeFile) => {
    if (busy) return;
    setBusy(f.fileId);
    try { await downloadNoticeFile(noticeId, f); } catch { message.error('첨부파일을 받지 못했습니다.'); } finally { setBusy(null); }
  };
  return (
    <div style={{ border: `1px solid ${T.border1}`, borderRadius: 8, background: T.border3, padding: compact ? '6px 10px' : '8px 12px' }}>
      <div style={{ fontSize: 12, color: T.t3, marginBottom: 4 }}><PaperClipOutlined /> 첨부파일 {files.length}</div>
      {files.map((f) => (
        <button key={f.fileId} type="button" onClick={() => get(f)} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 0,
          padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: compact ? 13 : 14, color: T.primary700,
        }}>
          {busy === f.fileId ? <LoadingOutlined /> : <DownloadOutlined />}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>{f.name}</span>
          <span style={{ fontSize: 12, color: T.t4, flex: '0 0 auto' }}>{fmtSize(f.size)}</span>
        </button>
      ))}
    </div>
  );
};

export default NoticeFiles;
