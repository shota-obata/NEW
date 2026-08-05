// Growth OS Mobile — 登録コードと仮PINの発行
//
// 使い方:
//   node issue.mjs status          いま誰がどこまで進んでいるか
//   node issue.mjs pin --all       仮PINを全員ぶん再発行 → temp-pins.txt へ
//   node issue.mjs pin KW-04       1人ぶん再発行 → temp-pins.txt へ追記
//   node issue.mjs code KW-04      登録コードを1件発行 → device-code.txt へ
//
// 実行:
//   set -a && . ./.env.local && set +a && node issue.mjs <コマンド>
//
// ■ コードとPINで扱いが違う理由
//   仮PIN   … 無期限。初回ログインで本人が必ず変える。まとめて発行して紙で配れる
//   登録コード … 15分・1回限り。まとめて出すと配り終わる前に失効する。
//               その人が目の前にいるときに1件ずつ発行する
//
// 出力は画面に出さずファイルへ書く（権限 0600）。
// 端末を共有している場合や、実行ログが残る環境で流出させないため。

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要ります'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const BANNED = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
                        '0123','1234','2345','3456','4567','5678','6789','9876','8765','4321']);
const pin4 = () => { let p; do { p = String(randomInt(0, 10000)).padStart(4, '0'); } while (BANNED.has(p)); return p; };
const code6 = () => String(randomInt(0, 1000000)).padStart(6, '0');
const jst = (d = new Date()) => d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

const die = (l, e) => { if (e) { console.error(`✗ ${l}:`, e.message ?? e); process.exit(1); } };

const people = async () => {
  const { data, error } = await db.from('users')
    .select('id, person_code, display_name').is('retired_at', null).order('person_code');
  die('users', error); return data;
};

// 運営者。監査ログに「誰が発行したか」を残すため
const mgmtOf = async (person_code) => {
  const { data } = await db.from('user_roles')
    .select('store_id, users!inner(person_code)').eq('role', 'mgmt').eq('active', true);
  const { data: me } = await db.from('user_roles')
    .select('store_id').eq('user_id', (await byCode(person_code)).id).eq('active', true).limit(1);
  const store = me?.[0]?.store_id;
  const m = data?.find((x) => x.store_id === store);
  return m ? { store_id: store, mgmt_code: m.users.person_code } : null;
};

const byCode = async (pc) => {
  const { data } = await db.from('users').select('id, display_name').eq('person_code', pc).maybeSingle();
  if (!data) { console.error(`✗ 個人ID ${pc} が見つかりません`); process.exit(1); }
  return data;
};

// ------------------------------------------------------------
const cmd = process.argv[2], arg = process.argv[3];

if (cmd === 'status') {
  const us = await people();
  const [{ data: cr }, { data: dv }, { data: gr }, { data: co }] = await Promise.all([
    db.from('credentials').select('user_id, must_change_pin, locked_until'),
    db.from('devices').select('user_id, revoked_at'),
    db.from('device_grants').select('target_user_id, expires_at, used_at'),
    db.from('policy_consents').select('user_id'),
  ]);
  const C = new Map(cr.map((x) => [x.user_id, x])), CO = new Set(co.map((x) => x.user_id));
  console.log('\n  個人ID  氏名            仮PIN    端末  有効コード  同意');
  console.log('  ' + '-'.repeat(58));
  for (const u of us) {
    const c = C.get(u.id);
    const locked = c?.locked_until && new Date(c.locked_until) > Date.now();
    const nd = dv.filter((d) => d.user_id === u.id && !d.revoked_at).length;
    const ng = gr.filter((g) => g.target_user_id === u.id && !g.used_at && new Date(g.expires_at) > Date.now()).length;
    console.log(`  ${u.person_code}   ${u.display_name.padEnd(13, '　')} ` +
      `${c ? (c.must_change_pin ? '未変更' : '変更済') : 'なし  '}${locked ? '(ロック)' : '      '} ` +
      `${nd}台   ${ng ? 'あり' : 'なし'}       ${CO.has(u.id) ? '✓' : '—'}`);
  }
  console.log(`\n  同意: ${co.length} / ${us.length}  → 全員そろうと運営者の「閲覧」が開きます\n`);

} else if (cmd === 'pin') {
  const us = arg === '--all' ? await people() : [{ ...(await byCode(arg)), person_code: arg }];
  const out = [];
  for (const u of us) {
    const p = pin4();
    const m = await mgmtOf(u.person_code);
    const { error } = await db.rpc('issue_temp_pin', {
      p_target: u.id, p_pin: p, p_by: m ? (await byCode(m.mgmt_code)).id : u.id,
    });
    die(`issue_temp_pin ${u.person_code}`, error);
    out.push(`  ${u.person_code}  ${u.display_name.padEnd(12, '　')}  ${p}`);
  }
  const head = [`仮PIN — ${jst()} 発行`,
    '運営者が本人確認のうえ手渡してください。本人は初回ログインで必ず変更します。',
    '手渡し終えたら、このファイルを削除してください。', '='.repeat(46)];
  writeFileSync('temp-pins.txt', [...head, ...out, '='.repeat(46), ''].join('\n'), { mode: 0o600 });
  console.log(`\n✓ 仮PIN ${out.length} 名分を temp-pins.txt に書きました（画面には出しません）\n`);

} else if (cmd === 'code') {
  if (!arg) { console.error('個人IDを指定してください（例: node issue.mjs code KW-04）'); process.exit(1); }
  const u = await byCode(arg);
  const { data: role } = await db.from('user_roles')
    .select('store_id').eq('user_id', u.id).eq('active', true).limit(1);
  const store = role?.[0]?.store_id;
  if (!store) { console.error('店舗が見つかりません'); process.exit(1); }

  // 発行者は同じ店舗の運営者
  const { data: m } = await db.from('user_roles')
    .select('user_id').eq('store_id', store).eq('role', 'mgmt').eq('active', true).limit(1);
  const by = m?.[0]?.user_id ?? u.id;

  const code = code6();
  const { error } = await db.rpc('issue_device_grant',
    { p_target: u.id, p_store: store, p_code: code, p_by: by });
  die('issue_device_grant', error);

  const exp = new Date(Date.now() + 15 * 60 * 1000);
  const line = `${jst()}  ${arg}  ${u.display_name}  コード ${code}  （${jst(exp)} まで有効・1回限り）`;
  if (!existsSync('device-code.txt'))
    writeFileSync('device-code.txt', `登録コード — 手渡し用。使い終わったら削除してください。\n${'='.repeat(70)}\n`, { mode: 0o600 });
  appendFileSync('device-code.txt', line + '\n');
  console.log(`\n✓ ${arg} ${u.display_name} の登録コードを device-code.txt に書きました`);
  console.log(`  有効期限 15分（${jst(exp)} まで）。1回使うと無効になります。\n`);

} else {
  console.log(`
  node issue.mjs status        いま誰がどこまで進んでいるか
  node issue.mjs pin --all     仮PINを全員ぶん再発行 → temp-pins.txt
  node issue.mjs pin KW-04     1人ぶん再発行 → temp-pins.txt
  node issue.mjs code KW-04    登録コードを1件発行（15分）→ device-code.txt
`);
}
