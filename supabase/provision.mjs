// Growth OS Mobile — Auth ユーザーの作成と、users の入れ直し
//
// なぜ入れ直すのか:
//   RLS は全編 auth.uid() = users.id で書いてある。auth.uid() が返すのは
//   Supabase Auth 側のIDなので、users.id をそれに揃えないと、誰でサインイン
//   しても1行も見えない。Auth を先に作り、返ってきたIDで users を作り直す。
//
// 実行:
//   npm i @supabase/supabase-js
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//   node provision.mjs
//
// ⚠ 出力に仮PINが含まれます。運営者が本人に手渡すためのものです。
//    チャットに貼らないでください。手渡したら端末から消してください。

import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境変数で渡してください');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const PEOPLE = [
  { code: 'KW-01', name: '田邊 翔伍',   store: 'KW-001', roles: [['mgmt', 'MG-KW-01']] },
  { code: 'KW-02', name: '小畑 昭汰',   store: 'KW-001', roles: [['support', null], ['staff', null]] },
  { code: 'KW-03', name: 'RIHO',        store: 'KW-001', roles: [['support', null]] },
  { code: 'KW-04', name: '黒坂 侑夏',   store: 'KW-001', roles: [['staff', null]] },
  { code: 'KW-05', name: '藤田 彩也菜', store: 'KW-001', roles: [['staff', null]] },
  { code: 'SK-01', name: '大谷 洋平',   store: 'SK-002', roles: [['mgmt', 'MG-SK-01']] },
  { code: 'SK-02', name: '殿 綾貴',     store: 'SK-002', roles: [['support', null]] },
  { code: 'SK-03', name: '高島 颯人',   store: 'SK-002', roles: [['staff', null]] },
  { code: 'SK-04', name: '荒井 優月',   store: 'SK-002', roles: [['staff', null]] },
];

// 主担当。双方同意でいつでも変えられる初期値
const ASSIGN = [
  ['KW-04', 'KW-02'],   // 黒坂 ← 小畑
  ['KW-05', 'KW-02'],   // 藤田 ← 小畑
  ['KW-02', 'KW-03'],   // 小畑（Staffとして）← RIHO
  ['SK-03', 'SK-02'],   // 高島 ← 殿
  ['SK-04', 'SK-02'],   // 荒井 ← 殿
];

const email = (code) => `${code.toLowerCase()}@ai-re.invalid`;
const secret = () => randomBytes(48).toString('base64url');       // Auth用。人は使わない
const tempPin = () => {
  const banned = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
                          '0123','1234','2345','3456','4567','5678','6789','9876','8765','4321']);
  let p; do { p = String(randomInt(0, 10000)).padStart(4, '0'); } while (banned.has(p));
  return p;
};

const die = (label, e) => { if (e) { console.error(`✗ ${label}:`, e.message ?? e); process.exit(1); } };

// ------------------------------------------------------------
// 1. 既存の Auth ユーザーを消す（同じメールがあると作り直せない）
// ------------------------------------------------------------
console.log('▸ 既存の Auth ユーザーを確認');
const { data: list, error: le } = await db.auth.admin.listUsers({ perPage: 1000 });
die('listUsers', le);
const wanted = new Set(PEOPLE.map(p => email(p.code)));
for (const u of list.users) {
  if (wanted.has(u.email)) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    die(`deleteUser ${u.email}`, error);
    console.log(`  - 削除 ${u.email}`);
  }
}

// ------------------------------------------------------------
// 2. users を消す（user_roles / assignments は cascade で落ちる）
// ------------------------------------------------------------
console.log('▸ users を入れ直す準備');
{
  const { error } = await db.from('users').delete().neq('person_code', '');
  die('delete users', error);
}

// ------------------------------------------------------------
// 3. Auth ユーザーを作り、そのIDで users を作る
// ------------------------------------------------------------
const created = [];
for (const p of PEOPLE) {
  const pw = secret();
  const { data, error } = await db.auth.admin.createUser({
    email: email(p.code),
    password: pw,
    email_confirm: true,
    user_metadata: { person_code: p.code },
  });
  die(`createUser ${p.code}`, error);

  const id = data.user.id;
  const pin = tempPin();
  created.push({ ...p, id, pw, pin });
  console.log(`  + ${p.code} ${p.name}`);
}

{
  const { error } = await db.from('users').insert(
    created.map(p => ({ id: p.id, person_code: p.code, display_name: p.name }))
  );
  die('insert users', error);
}

// ------------------------------------------------------------
// 4. 役割
// ------------------------------------------------------------
const { data: stores, error: se } = await db.from('stores').select('id, store_code');
die('select stores', se);
const storeId = Object.fromEntries(stores.map(s => [s.store_code, s.id]));

const roleRows = [];
for (const p of created)
  for (const [role, mgmt] of p.roles)
    roleRows.push({ user_id: p.id, store_id: storeId[p.store], role,
                    membership: 'member', mgmt_code: mgmt });
{
  const { error } = await db.from('user_roles').insert(roleRows);
  die('insert user_roles', error);
}
console.log(`▸ 役割 ${roleRows.length} 行（人数 ${created.length}。小畑さんの兼務で1行多い）`);

// ------------------------------------------------------------
// 5. 主担当
// ------------------------------------------------------------
const byCode = Object.fromEntries(created.map(p => [p.code, p]));
{
  const { error } = await db.from('assignments').insert(
    ASSIGN.map(([st, sp]) => ({
      staff_id: byCode[st].id, support_id: byCode[sp].id,
      store_id: storeId[byCode[st].store], kind: 'primary', scope: 'full',
    }))
  );
  die('insert assignments', error);
}

// ------------------------------------------------------------
// 6. 資格情報（Auth用の秘密 ＋ 仮PIN）
// ------------------------------------------------------------
for (const p of created) {
  const { error } = await db.rpc('issue_temp_pin',
    { p_target: p.id, p_pin: p.pin, p_by: byCode['KW-01'].id });
  die(`issue_temp_pin ${p.code}`, error);
  const { error: e2 } = await db.from('credentials')
    .update({ auth_secret: p.pw }).eq('user_id', p.id);
  die(`auth_secret ${p.code}`, e2);
}

// ------------------------------------------------------------
// 7. 仮PINの一覧（手渡し用）
// ------------------------------------------------------------
console.log('\n' + '='.repeat(52));
console.log('仮PIN — 運営者が本人確認のうえ手渡してください');
console.log('本人は初回ログインで必ず変更します（変更するまで本体に入れません）');
console.log('='.repeat(52));
for (const p of created)
  console.log(`  ${p.code}  ${p.name.padEnd(12, '　')}  ${p.pin}`);
console.log('='.repeat(52));
console.log('⚠ この出力はどこにも貼らないでください。手渡したら消してください。\n');
console.log('✓ 完了');
