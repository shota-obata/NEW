// Growth OS Mobile — 端末の登録
//
// 運営者が本人確認のうえ、登録コード（6桁・15分・1回限り）と仮PINを手渡す。
// この関数はコードを引き換えて端末トークンを返すだけで、**サインインはしない**。
// 登録のあと、本人が仮PINでサインインし、PINを変更してから本体に入る。
//
// 1人3台の上限は devices のトリガーが弾く。

import { admin, cors, json, DENY, slow } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(DENY, 405);

  const { person_code, code, label, device_kind, fingerprint } =
    await req.json().catch(() => ({}));

  if (!person_code || !code || !label || !device_kind || !fingerprint)
    return json(DENY, 400);
  if (!/^[0-9]{6}$/.test(code)) { await slow(); return json(DENY, 401); }

  const { data, error } = await admin().rpc('redeem_device_grant', {
    p_person_code: person_code,
    p_code: code,
    p_label: label,
    p_kind: device_kind,
    p_fingerprint: fingerprint,
  });

  if (error) {
    await slow();
    // 上限超過だけは理由を返す。運営者に失効を頼む必要があるため
    if (String(error.message).includes('1人3台'))
      return json({ ok: false, reason: 'device_limit' }, 409);
    return json(DENY, 401);
  }
  if (!data || data.length === 0) { await slow(); return json(DENY, 401); }

  // この端末トークンは端末内にだけ保存する。以後のサインインで毎回送る
  return json({ ok: true, device_token: data[0].device_token });
});
