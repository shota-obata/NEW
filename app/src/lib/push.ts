// Growth OS Mobile — プッシュ通知の購読
//
// iOS Safari の Web Push は「ホーム画面に追加」した端末にしか届かない。
// 全員が追加する前提には置かないので、ここが失敗しても画面は止めない。
// 届かない人には、Home 最上部の一行で気づいてもらう。

import { sb } from './api';

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

// 端末側でプッシュを扱えるか。iOS では standalone のときだけ true になる
export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && !!KEY;

export const pushGranted = () =>
  typeof Notification !== 'undefined' && Notification.permission === 'granted';

const b64ToU8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); }
  catch { return null; }
}

// 購読する。断られたら何もしない — 通知は義務ではない
export async function subscribePush(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW());
  if (!reg) return 'unsupported';

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToU8(KEY!),
  });

  const j = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  const { data: u } = await sb.auth.getUser();
  if (!u.user || !j.endpoint || !j.keys) return 'unsupported';

  await sb.from('push_subscriptions').upsert({
    user_id: u.user.id,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    device_token: localStorage.getItem('gos.device') ?? null,
    failed_at: null,
  }, { onConflict: 'endpoint' });

  return 'ok';
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function isSubscribed() {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}
