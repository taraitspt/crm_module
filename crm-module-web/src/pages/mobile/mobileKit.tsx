import React, { useCallback, useEffect, useState } from 'react';
import { Empty } from 'antd';
import { T } from '@/theme/designTokens';

/**
 * 모바일 앱(/m) 공용 소품 — 폰 폭(360~430px)에 맞춘 카드·KPI·행.
 * PC 화면 컴포넌트(PageLayout·DataTable)는 폭이 넓어 여기선 쓰지 않는다.
 */

export const fmtNum = (v?: number | null) => Math.round(v ?? 0).toLocaleString('ko-KR');
/** 금액 축약 — 폰 폭에서는 원 단위 그대로 쓰면 줄이 넘친다. */
export const fmtCompact = (v?: number | null) => {
  const n = v ?? 0;
  const a = Math.abs(n);
  const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : a >= 1e4 ? `${fmtNum(a / 1e4)}만` : fmtNum(a);
  return n < 0 ? `-${s}` : s;
};
export const rate = (actual: number, plan: number) => (plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null);
export const rateColor = (r: number | null) => (r == null ? T.t3 : r >= 100 ? T.ok : r >= 70 ? T.wa : T.er);

export function MCard({ children, style, onClick, title, extra }: {
  children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void;
  title?: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 12, padding: 12,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}>
      {(title || extra) && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {title && <span style={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{title}</span>}
          {extra && <span style={{ marginLeft: 'auto', fontSize: 12, color: T.t3 }}>{extra}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** KPI 타일 — 2열 그리드용. 숫자가 주인공. */
export function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: T.t3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** 라벨 / 값 한 줄. */
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: `1px solid ${T.border3}`, fontSize: 13 }}>
      <span style={{ flex: '0 0 72px', color: T.t3 }}>{label}</span>
      <span style={{ flex: 1, color: T.t1, minWidth: 0, wordBreak: 'break-all' }}>{children ?? '-'}</span>
    </div>
  );
}

export function MEmpty({ text }: { text: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: T.t3, fontSize: 13 }}>{text}</span>} style={{ margin: '24px 0' }} />;
}

/** 전화번호 → tel: 링크. 현장에서 바로 걸 수 있게. */
export function Tel({ no }: { no?: string | null }) {
  if (!no) return <>-</>;
  const digits = no.replace(/[^\d+]/g, '');
  return <a href={`tel:${digits}`} style={{ color: T.primary700 }}>{no}</a>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * 홈 화면 설치 상태.
 * - isStandalone: 이미 앱으로 실행 중(설치 안내 불필요)
 * - canInstall: Android/Chrome 이 설치 프롬프트를 준 상태 → install() 로 띄운다
 * - isIOS: Safari 는 프롬프트 API 가 없어 "공유 → 홈 화면에 추가" 안내만 가능
 */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  // 홈 화면 앱(standalone) 이거나 Capacitor 네이티브 앱(APK/iOS) 안이면 이미 "설치된" 상태다.
  const cap = typeof window !== 'undefined' ? (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor : undefined;
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches
      || (navigator as { standalone?: boolean }).standalone === true
      || cap?.isNativePlatform?.() === true);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'accepted') setEvt(null);
  }, [evt]);

  return { isStandalone, isIOS, canInstall: !!evt, install };
}
