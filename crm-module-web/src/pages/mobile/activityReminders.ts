import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import dayjs from 'dayjs';
import { activityApi } from '@/api/activity.api';
import { typeMeta } from '@/types/activity';

/**
 * 활동 알림(앱 자체) — 폰 앱(APK)에서 "활동일 아침 8시"에 활동 제목을 알림으로 띄운다.
 *
 * 서버 푸시(FCM)·Firebase 없이 Capacitor 로컬 알림으로 한다: 앱이 열릴 때(그리고 활동을 저장할 때)
 * 내 활동(오늘~30일)을 받아 와 폰 안에 예약하고, 없어진 활동의 예약은 지운다. 알림 id = activityId 라
 * 같은 활동을 다시 예약하면 덮어쓴다. PC 에서 등록한 활동도 폰 앱을 한 번 열면 예약된다.
 *
 * 한계: 네이티브 앱(APK, iOS 빌드) 안에서만 동작한다. 아이폰 "홈 화면에 추가"(PWA)는 로컬 알림이 없어
 * 서버 웹 푸시가 따로 필요하다(미구현). 안드로이드 13+ 는 알림 권한을 묻고, 정확한 시각 권한이 없으면 시스템이 몇 분 늦출 수 있다.
 */
export const REMINDER_HOUR = 8;
const PREF_KEY = 'm-activity-reminder';
const CHANNEL_ID = 'activity-reminder';
const DAYS_AHEAD = 30;

export const isNativeApp = () => Capacitor.isNativePlatform();

export const reminderEnabled = () => { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; } };
export const setReminderEnabled = (on: boolean) => { try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* ignore */ } };

let syncing = false;

/** 예약 전부 취소 — 알림을 끄거나 로그아웃할 때. */
export async function clearActivityReminders() {
  if (!isNativeApp()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  } catch { /* ignore */ }
}

/**
 * 내 활동 알림을 서버 기준으로 다시 맞춘다. 결과: 예약된 건수, 권한이 없으면 null.
 * 네이티브 앱이 아니거나 담당자(users.id)가 없으면 아무것도 하지 않는다.
 */
export async function syncActivityReminders(salesEmpId?: string | null): Promise<{ scheduled: number } | null> {
  if (!isNativeApp() || !salesEmpId || syncing) return null;
  syncing = true;
  try {
    if (!reminderEnabled()) { await clearActivityReminders(); return { scheduled: 0 }; }

    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return null;

    if (Capacitor.getPlatform() === 'android') {
      try {
        await LocalNotifications.createChannel({ id: CHANNEL_ID, name: '활동 알림', description: '활동일 아침 8시에 그날 활동을 알립니다', importance: 4, visibility: 1 });
      } catch { /* 이미 있음 */ }
    }

    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(DAYS_AHEAD, 'day').format('YYYY-MM-DD');
    const items = await activityApi.list({ from, to, salesEmpId });
    const now = dayjs();
    const wanted = items
      .filter((a) => String(a.salesEmpId) === String(salesEmpId))
      .map((a) => ({ a, at: dayjs(a.activityDt).hour(REMINDER_HOUR).minute(0).second(0).millisecond(0) }))
      .filter((x) => x.at.isAfter(now));

    // 서버에 더는 없는(삭제·날짜 변경·지난) 예약은 지운다
    const wantedIds = new Set(wanted.map((x) => x.a.activityId));
    const pending = await LocalNotifications.getPending();
    const stale = pending.notifications.filter((n) => !wantedIds.has(n.id));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });

    if (wanted.length) {
      const notifications: LocalNotificationSchema[] = wanted.map(({ a, at }) => ({
        id: a.activityId,
        title: `오늘 활동 · ${a.title}`,
        body: [typeMeta(a.activityType).label, a.partnerNm, a.content ? a.content.slice(0, 60) : null].filter(Boolean).join(' · '),
        schedule: { at: at.toDate(), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { activityId: a.activityId, activityDt: a.activityDt },
      }));
      await LocalNotifications.schedule({ notifications });
    }
    return { scheduled: wanted.length };
  } catch (e) {
    console.warn('[activity-reminder] sync failed', e);
    return null;
  } finally {
    syncing = false;
  }
}

/** 알림을 눌렀을 때 — 그 활동의 날짜로 활동 화면을 연다. 해제 함수를 돌려준다. */
export function onReminderTap(handler: (activityDt?: string) => void) {
  if (!isNativeApp()) return () => {};
  const p = LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
    handler(ev.notification.extra?.activityDt as string | undefined);
  });
  return () => { p.then((h) => h.remove()).catch(() => {}); };
}
