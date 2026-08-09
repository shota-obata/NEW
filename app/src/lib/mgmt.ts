// Growth OS Mobile — Management のデータ層
//
// 運営者は「人」ではなく「設計」を扱う。個人の細目は取りに行かない。
// 相談の本文も、習熟の細目も、ここには経路が無い。

import { sb } from './api';

// 同意の集まり具合。誰が未同意かは返さない（件数だけ）
export async function consentGap() {
  const { data } = await sb.from('v_consent_gap').select('*').maybeSingle();
  return data as { clause: string; version: string; total: number; consented: number } | null;
}

// 「閲覧」。3条件が揃うまで1行も返らない（就業規則 第6条第3項）
export type Quality = {
  support_id: string; display_name: string;
  replies: number; avg_response_days: number | null;
};

export async function supportQuality(): Promise<Quality[]> {
  const { data } = await sb.from('v_support_quality').select('*');
  return (data ?? []) as Quality[];
}

export async function gateOpen(): Promise<boolean> {
  const { data } = await sb.rpc('policy_gate_open', { c: 'work_rules_art6' });
  return !!data;
}

// 規定の状態（周知・施行日）
export async function policyState() {
  const { data } = await sb.from('policy_documents')
    .select('version, effective_from, announced_at').eq('clause', 'work_rules_art6').maybeSingle();
  return data as { version: string; effective_from: string; announced_at: string | null } | null;
}

// ストレージの見通し。運営者だけが見る
export async function storageForecast() {
  const { data } = await sb.from('v_storage_forecast').select('*').maybeSingle();
  return data as { bytes_used: number; quota_bytes: number; pct: number; days_left: number | null } | null;
}

// ---- 端末とアカウントの管理（運営者のみ）------------------------------
// 検査は関数の中（0017）。運営者でなければ例外になる。

export type Rollout = {
  id: string; person_code: string; display_name: string; store_code: string;
  pin_pending: boolean; locked: boolean; devices: number;
  code_active: boolean; consented: boolean;
};

export async function rollout(): Promise<Rollout[]> {
  const { data } = await sb.from('v_rollout').select('*').order('person_code');
  return (data ?? []) as Rollout[];
}

const digits = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b % 10).join('');

const BANNED = ['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
                '0123','1234','2345','3456','4567','5678','6789','9876','8765','4321'];

// 登録コード。15分・1回限り。その場で手渡すために画面に出す
export async function issueCode(user_id: string, store_code: string) {
  const { data: st } = await sb.from('stores').select('id').eq('store_code', store_code).single();
  if (!st) return null;
  const code = digits(6);
  const { error } = await sb.rpc('issue_device_grant',
    { p_target: user_id, p_store: st.id, p_code: code, p_by: user_id });
  return error ? null : code;
}

// 仮PIN。連番・ゾロ目は避ける
export async function issuePin(user_id: string) {
  let pin = digits(4);
  while (BANNED.includes(pin)) pin = digits(4);
  const { error } = await sb.rpc('issue_temp_pin',
    { p_target: user_id, p_pin: pin, p_by: user_id });
  return error ? null : pin;
}

export async function unlock(user_id: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { error } = await sb.rpc('unlock_pin', { p_target: user_id, p_by: u.user.id });
  return !error;
}

export type Device = {
  id: string; label: string; device_kind: string;
  registered_at: string; last_seen_at: string | null;
};

export async function devicesOf(user_id: string): Promise<Device[]> {
  const { data } = await sb.from('devices')
    .select('id, label, device_kind, registered_at, last_seen_at')
    .eq('user_id', user_id).is('revoked_at', null).order('registered_at');
  return (data ?? []) as Device[];
}

// 失効には理由が要る（DBの制約）。本人にも監査ログにも残る
export async function revokeDevice(id: string, reason: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { error } = await sb.from('devices').update({
    revoked_at: new Date().toISOString(), revoked_by: u.user.id, revoke_reason: reason,
  }).eq('id', id);
  return !error;
}

// ============================================================
// 第3便 W ／ 第4便 ／ 第5便 の反映
// ============================================================

import { storeSettings, type StoreSettings } from './core';

// ---- Mgmt 1「いま設計で直せること」（第3便 W）------------------------
// 「3件」ではない。該当するものだけ・最大3件。
// 0件なら中立ボックス1つ。空カードで3枠を埋めない。

export type Fix = { key: 'slots' | 'load' | 'policy'; text: string; to: 'design' | 'settings' };

export async function fixables(): Promise<Fix[]> {
  const st = await storeSettings();
  const out: Fix[] = [];

  // ① 枠不足 — 確保 < 必要 の Staff が1名以上。割合は見ない。
  //    1人分の枠が無いのは、その1人にとっては100%の不足。
  const short = await shortStaff();
  if (short.length > 0)
    out.push({ key: 'slots', text: `${short.length}名分の枠が足りていません。`, to: 'design' });

  // ② 介入量過剰 — 1人のSupportが担当する人数。
  //    しきい値は固定の4ではなく 6h ÷ 1名あたり必要時間（店舗が値を変えれば追従する）
  const per = ((st?.required_pace_default ?? 3) * (st?.practice_slot_minutes ?? 30)) / 60;
  const cap = per > 0 ? Math.floor(6 / per) : 4;
  const over = await overloadedSupports(cap);
  for (const o of over)
    out.push({ key: 'load', text: `${o.name}さんが${o.n}名を見ています。`, to: 'design' });

  // ③ 記録の扱い未設定 — 既定値を置いてはいけない判断なので、null が正しい初期状態
  if (st && st.retirement_record_policy === null)
    out.push({ key: 'policy', text: '退職したときの記録の扱いが、決まっていません。', to: 'settings' });

  return out.slice(0, 3);
}

// ---- 確保と必要（第3便 H）--------------------------------------------
// 確保 = kind='practice' かつ staff_id が対象者の ends_at-starts_at 合計
// 必要 = required_pace（件／週）× practice_slot_minutes
// 単位は 週・個人。週は月曜始まり

export type Slots = { staff_id: string; name: string; secured: number; needed: number };

function weekStart(): string {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;           // 月曜始まり
  d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function slotsOfWeek(): Promise<Slots[]> {
  const st = await storeSettings();
  const per = (st?.practice_slot_minutes ?? 30) / 60;

  const { data: us } = await sb.from('users')
    .select('id, display_name, required_pace').is('retired_at', null);
  const { data: ss } = await sb.from('shift_slots')
    .select('staff_id, starts_at, ends_at')
    .eq('kind', 'practice').gte('starts_at', weekStart());

  const rows = (us ?? []) as { id: string; display_name: string; required_pace: number | null }[];
  const slots = (ss ?? []) as { staff_id: string; starts_at: string; ends_at: string }[];

  return rows.map((u) => ({
    staff_id: u.id, name: u.display_name,
    secured: slots.filter((s) => s.staff_id === u.id)
      .reduce((h, s) => h + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600000, 0),
    needed: (u.required_pace ?? st?.required_pace_default ?? 3) * per,
  }));
}

const shortStaff = async () => (await slotsOfWeek()).filter((x) => x.secured < x.needed);

async function overloadedSupports(cap: number) {
  const { data } = await sb.from('assignments')
    .select('support_id, users:support_id(display_name)').eq('active', true);
  const rows = (data ?? []) as unknown as
    { support_id: string; users: { display_name: string } | null }[];
  const by = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const cur = by.get(r.support_id) ?? { name: r.users?.display_name ?? '—', n: 0 };
    by.set(r.support_id, { ...cur, n: cur.n + 1 });
  }
  return [...by.values()].filter((x) => x.n >= cap);
}

// 空き枠。営業時間から定休日と shift_slots の全kindを差し引いた残り。
// 候補のうち最も早い・30分以上連続する枠を1つだけ提案文にする
export async function openSlot(): Promise<string | null> {
  const { data: s } = await sb.from('stores').select('id, business_hours').limit(1);
  const store = s?.[0] as { id: string; business_hours: Record<string, { open: string; close: string } | null> } | undefined;
  if (!store) return null;

  const { data: taken } = await sb.from('shift_slots')
    .select('starts_at, ends_at').eq('store_id', store.id).gte('starts_at', weekStart());
  const busy = (taken ?? []) as { starts_at: string; ends_at: string }[];

  const KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const JA   = ['月', '火', '水', '木', '金', '土', '日'];
  const base = new Date(weekStart());

  for (let i = 0; i < 7; i++) {
    const h = store.business_hours?.[KEYS[i]];
    if (!h) continue;                                   // 定休日
    const day = new Date(base); day.setDate(base.getDate() + i);
    const [oh, om] = h.open.split(':').map(Number);

    for (let m = 0; m < 8 * 60; m += 30) {              // 開店から30分刻みで探す
      const t = new Date(day); t.setHours(oh, om + m, 0, 0);
      const e = new Date(t.getTime() + 30 * 60000);
      if (e.getTime() <= Date.now()) continue;
      const clash = busy.some((b) =>
        Date.parse(b.starts_at) < e.getTime() && Date.parse(b.ends_at) > t.getTime());
      if (!clash)
        return `${JA[i]}${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
  }
  return null;
}

// ---- 担当の割り当て（第3便 V ／ 第5便 AM）----------------------------

export async function proposeAssignment(a: {
  staff_id: string; support_id: string; store_id: string;
  kind: 'primary' | 'temporary'; scope: 'full' | 'limited';
  scope_note?: string; expires_at?: string;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('assignments').insert({
    ...a, active: false,
    proposed_by: u.user.id, proposed_at: new Date().toISOString(),
    mgmt_agreed_at: new Date().toISOString(),   // 提案＝同意
  });
  return !error;
}

export async function agreeAssignment(id: string) {
  const { error } = await sb.from('assignments')
    .update({ support_agreed_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

export async function declineAssignment(id: string, reason: string) {
  const { error } = await sb.from('assignments').update({
    declined_at: new Date().toISOString(), declined_reason: reason,
  }).eq('id', id);
  return !error;
}

export async function proposeEnd(id: string, reason: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('assignments').update({
    ended_reason: reason, end_proposed_by: u.user.id,
    end_mgmt_ok_at: new Date().toISOString(),
  }).eq('id', id);
  return !error;
}

export const allAssignments = async () =>
  ((await sb.from('assignments')
      .select('*, staff:staff_id(display_name), support:support_id(display_name)')
      .order('created_at', { ascending: false })).data ?? []) as unknown as
    (Record<string, unknown> & {
      id: string; active: boolean; kind: string; scope: string;
      declined_at: string | null; ended_at: string | null;
      support_agreed_at: string | null;
      staff: { display_name: string } | null;
      support: { display_name: string } | null;
    })[];

// ---- 店舗設定（Mgmt 5）------------------------------------------------
export async function saveSettings(v: Partial<StoreSettings>) {
  const st = await storeSettings(); if (!st) return false;
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('store_settings')
    .update({ ...v, changed_at: new Date().toISOString(), changed_by: u.user?.id })
    .eq('store_id', st.store_id);
  return !error;
}

// ---- 営業時間（14c）---------------------------------------------------
export type Hours = Record<string, { open: string; close: string } | null>;

export async function businessHours(): Promise<{ id: string; hours: Hours } | null> {
  const { data } = await sb.from('stores').select('id, business_hours').limit(1);
  const s = data?.[0] as { id: string; business_hours: Hours } | undefined;
  return s ? { id: s.id, hours: s.business_hours } : null;
}

const JA_DAY: Record<string, string> = {
  mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日',
};

// 保存すると全員に通知する。文面はシステムが作る（Management は本文を直せる）
export function hoursNoticeBody(h: Hours, from: Date): string {
  const lines = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k) =>
    `${JA_DAY[k]}　${h[k] ? `${h[k]!.open} – ${h[k]!.close}` : '定休日'}`);
  return `${from.getFullYear()}年${from.getMonth() + 1}月${from.getDate()}日から、`
       + `営業時間が次のようになります。\n\n${lines.join('\n')}\n\n`
       + '時間外の入力は義務ではありません。催促や通知は、営業時間内にだけ届きます。';
}

export async function saveHours(store_id: string, hours: Hours, body: string) {
  const { error } = await sb.from('stores').update({ business_hours: hours }).eq('id', store_id);
  if (error) return false;
  const { data: u } = await sb.auth.getUser();
  await sb.from('notices').insert({
    kind: 'mgmt_to_all', from_user_id: u.user?.id, store_id,
    title: '営業時間が変わりました', body,
  });
  return true;
}

// ---- 規定の周知と、確認の停止（第5便 AN）-----------------------------

export async function announcePolicy(doc_id: string, store_id: string, body: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { data: n, error } = await sb.from('notices').insert({
    kind: 'mgmt_to_all', from_user_id: u.user.id, store_id,
    title: '就業規則 追加条文について', body, policy_document_id: doc_id,
  }).select('id').single();
  if (error || !n) return false;
  await sb.from('policy_documents').update({
    announced_at: new Date().toISOString(), announced_by: u.user.id,
    notice_id: (n as { id: string }).id,
  }).eq('id', doc_id);
  return true;
}

// 第6条第7項の「確認の停止」。規定の取り消しではない。消せない
export async function stopReview(doc_id: string, store_id: string, reason: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { data: n } = await sb.from('notices').insert({
    kind: 'mgmt_to_all', from_user_id: u.user.id, store_id,
    title: '「閲覧」の確認を止めます', body: reason, policy_document_id: doc_id,
  }).select('id').single();
  if (!n) return false;
  const { error } = await sb.from('policy_documents').update({
    revoked_at: new Date().toISOString(), revoked_reason: reason,
    revoked_by: u.user.id, revoked_notice_id: (n as { id: string }).id,
  }).eq('id', doc_id);
  return !error;
}

// 14a の催促。同じ版につき3回まで。数えるのは通達そのもの
export async function policyNudgeCount(doc_id: string): Promise<number> {
  const { count } = await sb.from('notices')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'mgmt_to_all').eq('policy_document_id', doc_id);
  return count ?? 0;
}

export async function nudgeUnconsented(doc_id: string, store_id: string, body: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('notices').insert({
    kind: 'mgmt_to_all', from_user_id: u.user.id, store_id,
    title: '就業規則 追加条文への同意のお願い', body, policy_document_id: doc_id,
  });
  return !error;
}

// ---- 退職・削除（第3便 X）--------------------------------------------
export async function requestDeletion(a: {
  subject_user_id: string; store_id: string; reason: string;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('deletion_requests').insert({
    ...a, policy: 'del', requested_by: u.user.id,
  });
  return !error;
}

export const deletionRequests = async () =>
  ((await sb.from('deletion_requests')
      .select('*, subject:subject_user_id(display_name)')
      .is('executed_at', null).is('cancelled_at', null)).data ?? []) as unknown as
    (Record<string, unknown> & {
      id: string; reason: string; execute_after: string | null;
      subject: { display_name: string } | null;
    })[];

export async function approveDeletion(request_id: string, role: 'mgmt' | 'support') {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('deletion_approvals')
    .insert({ request_id, approver_id: u.user.id, role });
  return !error;
}

export async function cancelDeletion(id: string) {
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('deletion_requests').update({
    cancelled_at: new Date().toISOString(), cancelled_by: u.user?.id,
  }).eq('id', id);
  return !error;
}

// ---- 個別通達に添える数字（第2便 R）----------------------------------
// 5つだけ。上限2つ — 3つ以上並べると通達が査定表になる。
// 個々の返答文・相談本文は入れられない（列の形として持たない）。

export type MetricKey = 'avg_response_days' | 'unanswered_consultations'
                      | 'cp_stall_days' | 'assigned_staff' | 'secured_hours';

export const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'avg_response_days',        label: '平均レスポンス',   unit: '日' },
  { key: 'unanswered_consultations', label: '未返答の相談',     unit: '件' },
  { key: 'cp_stall_days',            label: 'CP判断の滞留',     unit: '日' },
  { key: 'assigned_staff',           label: '担当人数',         unit: '名' },
  { key: 'secured_hours',            label: '確保している時間', unit: 'h/週' },
];

export type Metric = {
  key: MetricKey; label: string; value: number; unit: string;
  baseline: number | null; period: string;
};

const ym = () => new Date().toISOString().slice(0, 7);

// その Support の実測値を引く。渡せるのは数字だけ
export async function metricsFor(support_id: string): Promise<Metric[]> {
  const st = await storeSettings();
  const base = st?.response_baseline_days ?? 1.0;

  const q = (await supportQuality()).find((x) => x.support_id === support_id);
  const { count: unans } = await sb.from('consultations')
    .select('id', { count: 'exact', head: true })
    .eq('support_id', support_id).is('replied_at', null);
  const { count: staff } = await sb.from('assignments')
    .select('id', { count: 'exact', head: true })
    .eq('support_id', support_id).eq('active', true);

  const slots = await slotsOfWeek();
  const { data: asg } = await sb.from('assignments')
    .select('staff_id').eq('support_id', support_id).eq('active', true);
  const mine = ((asg ?? []) as { staff_id: string }[]).map((x) => x.staff_id);
  const secured = slots.filter((s) => mine.includes(s.staff_id))
    .reduce((n, s) => n + s.secured, 0);
  const needed = slots.filter((s) => mine.includes(s.staff_id))
    .reduce((n, s) => n + s.needed, 0);

  return [
    { key: 'avg_response_days', label: '平均レスポンス',
      value: q?.avg_response_days ?? 0, unit: '日', baseline: base, period: ym() },
    { key: 'unanswered_consultations', label: '未返答の相談',
      value: unans ?? 0, unit: '件', baseline: null, period: ym() },
    { key: 'cp_stall_days', label: 'CP判断の滞留',
      value: 0, unit: '日', baseline: 3, period: ym() },
    { key: 'assigned_staff', label: '担当人数',
      value: staff ?? 0, unit: '名', baseline: null, period: ym() },
    { key: 'secured_hours', label: '確保している時間',
      value: +secured.toFixed(1), unit: 'h/週', baseline: +needed.toFixed(1), period: ym() },
  ];
}

export async function postIndividual(a: {
  support_id: string; store_id: string; title: string; body: string; metrics: Metric[];
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('notices').insert({
    kind: 'mgmt_to_support', from_user_id: u.user.id, store_id: a.store_id,
    subject_user_id: a.support_id, title: a.title, body: a.body,
    attached_metrics: a.metrics.slice(0, 2),   // 上限2つ
  });
  return !error;
}

export const supports = async () => {
  const { data } = await sb.from('user_roles')
    .select('user_id, users:user_id(display_name)').eq('role', 'support').eq('active', true);
  return ((data ?? []) as unknown as { user_id: string; users: { display_name: string } | null }[])
    .map((x) => ({ id: x.user_id, name: x.users?.display_name ?? '—' }));
};

// 在籍者と店舗の数。文面に直値で書かない（人が増減すると嘘になる）
export async function orgSize(): Promise<{ people: number; stores: number }> {
  const { count: people } = await sb.from('users')
    .select('id', { count: 'exact', head: true }).is('retired_at', null);
  const { count: stores } = await sb.from('stores')
    .select('id', { count: 'exact', head: true });
  return { people: Math.max(0, (people ?? 1) - 1), stores: stores ?? 0 };  // Other を除く
}
