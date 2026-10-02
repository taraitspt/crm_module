import { pushApi } from '@/api/push.api';

/**
 * 웹 푸시(활동 알림) — 아이폰 홈 화면 웹앱(iOS 16.4+)·안드로이드 Chrome PWA·데스크톱 브라우저.
 * 서버 스케줄러가 매일 08:00 에 그날 활동을 보낸다(앱을 안 열어도 온다). 안드로이드 APK 는 로컬 알림(activityReminders.ts)을 쓴다.
 * 구독은 브라우저·기기·도메인마다 하나라 서버 주소가 바뀌면 다시 켜야 한다.
 */
export type PushState = 'unsupported' | 'server-off' | 'denied' | 'subscribed' | 'unsubscribed';

export const webPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function registration() {
  // vite-plugin-pwa 가 index.html 에서 등록한 sw.js — 준비될 때까지 기다린다(최대 10초)
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000));
  return Promise.race([ready, timeout]);
}

/** 지금 상태 — 메뉴 라벨·배너 노출용. */
export async function getPushState(): Promise<PushState> {
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const key = await pushApi.vapidKey();
    if (!key?.enabled) return 'server-off';
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

/** 알림 켜기 — 사용자 탭(제스처) 안에서 불러야 권한 창이 뜬다. */
export async function subscribePush(): Promise<PushState> {
  if (!webPushSupported()) return 'unsupported';
  const key = await pushApi.vapidKey();
  if (!key?.enabled || !key.publicKey) return 'server-off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'unsubscribed';
  const reg = await registration();
  if (!reg) throw new Error('서비스워커가 준비되지 않았습니다. 새로고침 후 다시 시도하세요.');
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
  await sendToServer(sub);
  return 'subscribed';
}

export async function unsubscribePush(): Promise<void> {
  if (!webPushSupported()) return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try { await pushApi.unsubscribe(sub.endpoint); } catch { /* 서버에 없어도 폰 쪽은 지운다 */ }
  await sub.unsubscribe();
}

/** 이미 구독돼 있으면 서버에 다시 등록 — 서버 데이터가 비었거나 다른 사용자로 로그인한 경우를 맞춘다. 앱을 열 때 부른다. */
export async function ensurePushRegistered(): Promise<void> {
  if (!webPushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sendToServer(sub);
  } catch { /* ignore */ }
}

async function sendToServer(sub: PushSubscription) {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('구독 정보가 비어 있습니다.');
  await pushApi.subscribe({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, userAgent: navigator.userAgent });
}
