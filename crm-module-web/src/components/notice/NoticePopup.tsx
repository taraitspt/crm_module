import React, { useMemo, useState } from 'react';
import { Grid, Tag } from 'antd';
import { CloseOutlined, NotificationOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { noticeApi } from '@/api/notice.api';
import { NOTICE_CATEGORY, type Notice } from '@/types/notice';
import { useAuthStore } from '@/store/authStore';
import { T } from '@/theme/designTokens';
import NoticeFiles from './NoticeFiles';

/** "오늘 하루 보지 않기" — 공지별로 그날 날짜를 저장(이 기기 브라우저에만). */
const HIDE_KEY = (id: number) => `notice-popup-hide:${id}`;
/** 이번 접속(탭)에서 이미 닫은 공지 — 화면을 옮길 때마다 다시 뜨지 않게. */
const SEEN_KEY = 'notice-popup-seen';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const read = (k: string, s: Storage) => { try { return s.getItem(k); } catch { return null; } };
const write = (k: string, v: string, s: Storage) => { try { s.setItem(k, v); } catch { /* 저장소를 못 쓰면 그냥 매번 뜬다 */ } };
const seenIds = (): number[] => { try { return JSON.parse(read(SEEN_KEY, sessionStorage) || '[]'); } catch { return []; } };

const HEADER_H = 70;   // PageLayout 상단 헤더 높이
const PC_W = 620;
const CASCADE = 36;    // 여러 장이 옆으로 다 안 들어가면 비스듬히 겹쳐 놓는 간격
const GAP = 16;        // 옆으로 나란히 놓을 때 창 사이

/** 공지 한 장 — 머리띠(분류·제목) · 본문 · 아래띠(오늘 하루 보지 않기 / 닫기). */
const NoticeWindow: React.FC<{ n: Notice; style: React.CSSProperties; onClose: (hideToday: boolean) => void; onFocus?: () => void }> = ({ n, style, onClose, onFocus }) => {
  const cat = NOTICE_CATEGORY[n.category] ?? NOTICE_CATEGORY.NOTICE;
  return (
    <div role="dialog" aria-label={n.title} onMouseDown={onFocus} style={{
      position: 'fixed', display: 'flex', flexDirection: 'column', background: T.surface, borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 18px 48px rgba(0, 38, 59, 0.28), 0 2px 8px rgba(0, 38, 59, 0.12)', border: `1px solid ${T.border1}`, ...style,
    }}>
      <div style={{ background: T.navy, color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <NotificationOutlined style={{ fontSize: 18, opacity: 0.85 }} />
        <Tag color={cat.color} style={{ marginInlineEnd: 0, fontWeight: 600 }}>{cat.label}</Tag>
        <span style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.35, wordBreak: 'keep-all' }}>{n.title}</span>
        <button type="button" aria-label="닫기" onClick={() => onClose(false)} style={{
          background: 'transparent', border: 0, color: '#fff', opacity: 0.8, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1,
        }}><CloseOutlined /></button>
      </div>
      <div style={{
        flex: 1, padding: '22px 24px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 16, lineHeight: 1.85, color: T.t1,
        overflowY: 'auto', minHeight: 0,
      }}>
        {n.content}
        {n.files?.length > 0 && (
          <div style={{ marginTop: 18, whiteSpace: 'normal' }}><NoticeFiles noticeId={n.noticeId} files={n.files} /></div>
        )}
        <div style={{ marginTop: 18, fontSize: 13, color: T.t4 }}>
          {[n.authorName, n.createdAt?.slice(0, 10)].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', background: T.bg, borderTop: `1px solid ${T.border1}`, padding: '10px 16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: T.t2, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" onChange={(e) => { if (e.target.checked) onClose(true); }} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          오늘 하루 보지 않기
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => onClose(false)} style={{
          background: T.primary, color: '#fff', border: 0, borderRadius: 8, padding: '7px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>닫기</button>
      </div>
    </div>
  );
};

/**
 * 공지 팝업 — 오늘이 팝업 기간 안인 공지를 로그인 후 띄운다(PC PageLayout·모바일 MobileLayout 에 둔다).
 * 사내 그룹웨어식 레이어 팝업: 화면 왼쪽 위(헤더 아래)에 크게, 배경을 가리지 않는다. 여러 건이면 화면 폭에 들어가는 만큼 옆으로 나란히(안 들어가면 비스듬히 겹쳐) 놓고
 * 각자 닫는다(누른 창이 맨 위로). 폰에선 한 장씩 화면 폭에 맞춰 위쪽에.
 * 닫으면 이번 접속 동안 다시 안 뜨고, "오늘 하루 보지 않기"면 그날은 안 뜬다(사용자 요청 2026-10-16 — 가운데 작은 창 → 왼쪽 위 큰 창).
 */
const NoticePopup: React.FC = () => {
  const { isAuthenticated, passwordResetRequired } = useAuthStore();
  const screens = Grid.useBreakpoint();
  const isPhone = !screens.md;
  const { data } = useQuery({
    queryKey: ['notice-popups'],
    queryFn: noticeApi.popups,
    enabled: isAuthenticated && !passwordResetRequired,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const [closed, setClosed] = useState<number[]>(seenIds);
  const [front, setFront] = useState<number | null>(null);

  // 오래된 공지가 아래, 최신이 위에 오도록 오래된 순으로 놓는다
  const list = useMemo<Notice[]>(() => (data ?? [])
    .filter((n) => !closed.includes(n.noticeId) && read(HIDE_KEY(n.noticeId), localStorage) !== today())
    .slice().reverse(), [data, closed]);

  if (!list.length) return null;

  const close = (id: number, hideToday: boolean) => {
    if (hideToday) write(HIDE_KEY(id), today(), localStorage);
    const next = Array.from(new Set([...seenIds(), id]));
    write(SEEN_KEY, JSON.stringify(next), sessionStorage);
    setClosed(next);
  };

  if (isPhone) {
    // 폰: 최신 한 장만 — 닫으면 다음 장. 바깥은 살짝 어둡게(작은 화면에선 창이 거의 다 덮는다)
    const n = list[list.length - 1];
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1040 }} onClick={() => close(n.noticeId, false)} />
        <NoticeWindow key={n.noticeId} n={n} onClose={(h) => close(n.noticeId, h)}
          style={{ zIndex: 1041, top: 64, left: 12, right: 12, maxHeight: 'calc(100dvh - 150px)' }} />
      </>
    );
  }

  // 화면 폭에 다 들어가면 옆으로 나란히, 아니면 비스듬히 겹쳐 놓는다
  const sideBySide = 32 * 2 + list.length * PC_W + (list.length - 1) * GAP <= window.innerWidth;
  return (
    <>
      {list.map((n, i) => (
        <NoticeWindow
          key={n.noticeId}
          n={n}
          onClose={(h) => close(n.noticeId, h)}
          onFocus={() => setFront(n.noticeId)}
          style={{
            zIndex: front === n.noticeId ? 1050 + list.length : 1040 + i,
            top: HEADER_H + 24 + (sideBySide ? 0 : i * CASCADE),
            left: 32 + i * (sideBySide ? PC_W + GAP : CASCADE),
            width: `min(${PC_W}px, calc(100vw - 64px))`,
            minHeight: 420,
            maxHeight: `calc(100vh - ${HEADER_H + 48 + (sideBySide ? 0 : i * CASCADE)}px)`,
          }}
        />
      ))}
    </>
  );
};

export default NoticePopup;
