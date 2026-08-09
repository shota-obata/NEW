// Growth OS Mobile — プッシュを送る
//
// 呼ぶのは pg_cron（send_due_pushes → pg_net）。
// 受け取るのは「誰に送るか」だけ。本文はここの固定文言。
//
// ロック画面に出る前提なので、内容は一切書かない。
// 氏名・種別・題名・件数のいずれも入れない（NOTIFICATIONS.md）。

import webpush from 'npm:web-push@3.6.7';
import { admin, cors, json } from '../_shared/util.ts';

const PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY');
const PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

// 固定文言。ここ以外に本文は無い
const PAYLOAD = JSON.stringify({ title: 'AI,re', body: '受信ボックスに届いています。' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false }, 405);

  // 呼べるのは service_role だけ。外から叩かれても何も起きない
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!key || auth !== `Bearer ${key}`) return json({ ok: false }, 401);

  if (!PUBLIC || !PRIVATE) return json({ ok: false, reason: 'no_keys' }, 500);

  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

  const { user_ids } = await req.json().catch(() => ({ user_ids: [] }));
  if (!Array.isArray(user_ids) || user_ids.length === 0) return json({ ok: true, sent: 0 });

  const db = admin();
  const { data } = await db.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').in('user_id', user_ids).is('failed_at', null);

  const subs = (data ?? []) as
    { id: string; endpoint: string; p256dh: string; auth: string }[];

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        PAYLOAD,
        { TTL: 3600 },       // 1時間で捨てる。古い呼び出しで叩き起こさない
      );
      sent++;
    } catch (e) {
      // 404 / 410 は購読が失効している。印を付けて、掃除に任せる
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }));

  if (dead.length) {
    await db.from('push_subscriptions')
      .update({ failed_at: new Date().toISOString() }).in('id', dead);
  }
  if (sent) {
    await db.from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString() })
      .in('id', subs.map((s) => s.id).filter((id) => !dead.includes(id)));
  }

  return json({ ok: true, sent, dead: dead.length });
});
