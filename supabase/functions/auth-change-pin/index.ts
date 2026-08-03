// Growth OS Mobile — PINの変更
//
// 仮PINからの初回変更と、以後の自主的な変更の両方。
// 呼ぶにはサインイン済みであること（Authorization ヘッダ）が要る。
// 仮PINのままでは本体に入れないので、この画面だけが通れる状態になる。
//
// 現在のPINも照合する。端末を置いたまま席を離れた隙に、
// 別人がPINだけ書き換えて乗っ取る、という経路を塞ぐため。

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { admin, ANON, URL_, cors, json, DENY, LOCKED, slow }
  from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(DENY, 405);

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(DENY, 401);

  const { current_pin, new_pin } = await req.json().catch(() => ({}));
  if (!current_pin || !new_pin) return json(DENY, 400);

  // 誰のセッションか、Supabase Auth に確かめる
  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: me, error: ue } = await asUser.auth.getUser();
  if (ue || !me.user) return json(DENY, 401);

  const db = admin();

  // 現在のPINを照合（失敗回数もロックもここで数えられる）
  const { data: v } = await db.rpc('verify_pin', {
    p_user: me.user.id, p_pin: current_pin,
  });
  if (!v || v.length === 0 || !v[0].ok) {
    await slow();
    return json(v?.[0]?.reason === 'locked' ? LOCKED : DENY, 401);
  }

  if (current_pin === new_pin)
    return json({ ok: false, reason: 'same_pin' }, 400);

  // 4桁・連番・ゾロ目の禁止は change_pin() が弾く
  const { error } = await db.rpc('change_pin', {
    p_user: me.user.id, p_new: new_pin,
  });
  if (error) {
    const m = String(error.message);
    if (m.includes('そのPINは使えません'))
      return json({ ok: false, reason: 'weak_pin' }, 400);
    if (m.includes('4桁'))
      return json({ ok: false, reason: 'format' }, 400);
    return json(DENY, 400);
  }

  await db.from('audit_log').insert({
    actor_id: me.user.id, action: 'pin_changed',
    target_type: 'user', target_id: me.user.id,
  });

  return json({ ok: true });
});
