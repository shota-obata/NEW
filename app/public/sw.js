// Growth OS Mobile — Service Worker
//
// 役割はプッシュの受け取りだけ。オフラインキャッシュはしない。
// 記録は共有した時点で相手に渡るものなので、
// 端末に残して「送ったつもり」を作らない。

// 本文に内容は書かない（ロック画面に出るため）。
// 氏名も種別も件数も題名も入れない。固定文言だけ。
const TITLE = 'AI,re';
const BODY  = '受信ボックスに届いています。';

self.addEventListener('push', (e) => {
  e.waitUntil(
    self.registration.showNotification(TITLE, {
      body: BODY,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // 複数まとまっても1つにする。積み上げて叩き起こさない
      tag: 'gos-inbox',
      renotify: false,
      data: { url: '/?to=inbox' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.registration.scope)) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// 端末側の購読が失効したら、サーバの行も落としたい。
// ここでは新しい購読を作り直すだけにして、送信側は 410 で片付ける
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(Promise.resolve());
});
