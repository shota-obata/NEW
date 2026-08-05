// Growth OS Mobile — サインイン
//
// 関門は「登録済みの端末」＋「個人ID」＋「4桁PIN」（＋店舗ID、Managementは Management ID）。
// Supabase Auth のパスワードはサーバだけが知る文字列で、外から入力する経路は無い。
// PINが通らないかぎりセッションは発行されない。
//
// 応答は成否だけ。個人IDの存在も端末の登録有無もPINの正誤も区別できない。
// 例外はロック中だけ（本人が待つか運営者に頼むかを判断する必要があるため）。

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { admin, ANON, URL_, cors, json, DENY, LOCKED, sessionIdOf, slow }
  from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(DENY, 405);

  const { person_code, store_code, pin, device_token, mgmt_code } =
    await req.json().catch(() => ({}));

  if (!person_code || !store_code || !pin || !device_token) return json(DENY, 400);
  if (!/^[0-9]{4}$/.test(pin)) { await slow(); return json(DENY, 401); }

  const db = admin();

  // 1. 端末・店舗・役割をまとめて照合。1つでも欠ければ空が返る
  const { data: r, error: re } = await db.rpc('resolve_login', {
    p_person_code: person_code,
    p_store_code: store_code,
    p_device_token: device_token,
    p_mgmt_code: mgmt_code ?? null,
  });
  if (re || !r || r.length === 0) { await slow(); return json(DENY, 401); }
  const { out_user_id: user_id, out_store_id: store_id, out_device_id: device_id } = r[0];

  // 2. PIN。5回失敗で15分ロック（DB側で数える）
  const { data: v, error: ve } = await db.rpc('verify_pin', {
    p_user: user_id, p_pin: pin,
  });
  if (ve || !v || v.length === 0) { await slow(); return json(DENY, 401); }
  const res = v[0];
  if (!res.ok) {
    await slow();
    return json(res.reason === 'locked' ? LOCKED : DENY, 401);
  }

  // 3. ここまで通って初めて Supabase Auth のセッションを取る
  const { data: cred } = await db
    .from('credentials').select('auth_secret').eq('user_id', user_id).single();
  if (!cred?.auth_secret) return json(DENY, 401);

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: sess, error: se } = await anon.auth.signInWithPassword({
    email: `${String(person_code).toLowerCase()}@ai-re.invalid`,
    password: cred.auth_secret,
  });
  if (se || !sess.session) return json(DENY, 401);

  // 4. 店舗と端末の文脈をサーバ側に記録する。
  //    他店舗ログインなら store_access_log に残してからでないと成立しない
  const sid = sessionIdOf(sess.session.access_token);
  if (!sid) return json(DENY, 500);

  const { error: oe } = await db.rpc('open_session', {
    p_session_id: sid, p_user: user_id, p_store: store_id, p_device: device_id,
  });
  if (oe) return json(DENY, 500);

  // 5. 次にどの画面へ行くか（仮PIN → 同意 → 本体）
  const { data: gate } = await db.rpc('login_gate', { u: user_id });

  return json({
    ok: true,
    next: gate ?? 'ok',                       // change_pin | consent | ok
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at,
  });
});
