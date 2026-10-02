/* 활동 알림 웹 푸시 — vite-plugin-pwa 가 만드는 sw.js 가 importScripts 로 불러온다(vite.config.ts workbox.importScripts).
 * 서버(WebPushService)가 보내는 payload: { title, body, url, tag }. 아이폰 홈 화면 웹앱(iOS 16.4+)·안드로이드 Chrome PWA 가 받는다. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: '영업관리', body: event.data ? event.data.text() : '' }; }
  const title = data.title || '영업관리';
  const options = {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/m/activity' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/m/activity';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) {
        if ('navigate' in c) c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
