// Growth OS Mobile — 相談・Journey・Capability Map・受信ボックス・通達
//
// 可視領域はサーバ（RLS）が担保する。画面側で絞らない。

import { sb } from './api';

// ---- 相談と返答（区分02）---------------------------------------------
export type Consult = {
  id: string; staff_id: string; support_id: string | null;
  title: string; body: string; step_tag: string | null;
  created_at: string; replied_at: string | null; reply_body: string | null;
};

export const consults = async () =>
  ((await sb.from('consultations').select('*')
      .order('created_at', { ascending: false }).limit(30)).data ?? []) as Consult[];

export async function ask(a: { title: string; body: string; step_tag?: string }) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  // 担当Supportを宛先にする。担当が無ければ null（Management相談ではない）
  const { data: a2 } = await sb.from('assignments')
    .select('support_id').eq('staff_id', u.user.id).eq('active', true).limit(1);
  const { error } = await sb.from('consultations').insert({
    staff_id: u.user.id, support_id: a2?.[0]?.support_id ?? null,
    title: a.title, body: a.body, step_tag: a.step_tag ?? null,
  });
  return !error;
}

export async function replyTo(id: string, body: string) {
  const { error } = await sb.from('consultations')
    .update({ reply_body: body, replied_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

// ---- Journey と Checkpoint -------------------------------------------
export type Journey = { id: string; staff_id: string; vision: string | null; current_position: string | null };
export type CP = {
  id: string; journey_id: string; code: string; title: string;
  required_evidence: number; os_passed_at: string | null;
  submitted_at: string | null;              // 本人が「見てもらう」を押した時刻
  support_decided_at: string | null; support_note: string | null; status: string;
};

export async function myJourney(staffId?: string): Promise<Journey | null> {
  let q = sb.from('journeys').select('*');
  if (staffId) q = q.eq('staff_id', staffId);
  else {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return null;
    q = q.eq('staff_id', u.user.id);
  }
  const { data } = await q.limit(1);
  return (data?.[0] ?? null) as Journey | null;
}

export async function ensureJourney(vision: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return null;
  const cur = await myJourney();
  if (cur) { await sb.from('journeys').update({ vision }).eq('id', cur.id); return cur.id; }
  const { data } = await sb.from('journeys')
    .insert({ staff_id: u.user.id, vision }).select('id').single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function setPosition(id: string, current_position: string) {
  await sb.from('journeys').update({ current_position }).eq('id', id);
}

export const checkpoints = async (journey_id: string) =>
  ((await sb.from('checkpoints').select('*').eq('journey_id', journey_id)
      .order('code')).data ?? []) as CP[];

export async function addCheckpoint(journey_id: string, code: string, title: string) {
  const { error } = await sb.from('checkpoints')
    .insert({ journey_id, code, title, required_evidence: 3 });
  return !error;
}

// 本人が出す。1段目が通っただけでは2段目に進まない。
// 出す一拍を本人に持たせるのが目的なので、自動で渡さない。
// 取り消せる — 後戻りできないと、出しにくくなる
export async function submitForReview(cp_id: string, on = true) {
  const { error } = await sb.from('checkpoints')
    .update({ submitted_at: on ? new Date().toISOString() : null }).eq('id', cp_id);
  return !error;
}

// 「2週間後にもう一度声をかけてもらう」。断った回数は数えない
export async function snoozeNudge(subject_id: string | null, kind: string) {
  await sb.rpc('snooze_nudge', { p_subject: subject_id, p_kind: kind });
}

// ---- パーソナルスペース（区分01）----------------------------------
// Support / Management には存在も件数も返らない。
// 「裏」に開示先を作れないことは DB が守っている（UIの話ではない）。
export type Note = {
  id: string; visibility: 'surface' | 'private'; body: string;
  created_at: string; updated_at: string;
};

export const notes = async (visibility: 'surface' | 'private') =>
  ((await sb.from('personal_notes').select('*').eq('visibility', visibility)
      .order('updated_at', { ascending: false })).data ?? []) as Note[];

export async function addNote(visibility: 'surface' | 'private', body: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('personal_notes')
    .insert({ user_id: u.user.id, visibility, body });
  return !error;
}

export async function saveNote(id: string, body: string) {
  const { error } = await sb.from('personal_notes').update({ body }).eq('id', id);
  return !error;
}

export const removeNote = (id: string) =>
  sb.from('personal_notes').delete().eq('id', id);

// 開示先は担当Supportだけ。「裏」には作れない（DBのトリガが弾く）
export async function shareNote(note_id: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { data } = await sb.from('assignments')
    .select('support_id').eq('staff_id', u.user.id).eq('active', true).limit(1);
  const sup = (data?.[0] as { support_id: string } | undefined)?.support_id;
  if (!sup) return false;
  const { error } = await sb.from('personal_note_shares')
    .insert({ note_id, shared_with: sup, owner_id: u.user.id });
  return !error;
}

export const noteShares = async (note_id: string) =>
  ((await sb.from('personal_note_shares').select('shared_with').eq('note_id', note_id))
    .data ?? []).length;

// 共有端末では「裏」を出さない。消すのではなく、出さないことを伝える
export const isSharedDevice = () =>
  localStorage.getItem('gos.device_kind') === 'shared';

// 2段目。Support だけが押せる（RLS）。到達は両方揃ったときだけ
export async function supportDecide(cp_id: string, note: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('checkpoints').update({
    support_decided_by: u.user.id, support_decided_at: new Date().toISOString(),
    support_note: note,
  }).eq('id', cp_id);
  return !error;
}

// 「まだ早い」。落としたのではなく預かる
export async function hold(cp_id: string, reason: string, add_what: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('checkpoint_holds')
    .insert({ checkpoint_id: cp_id, held_by: u.user.id, reason, add_what });
  return !error;
}

// 未到達のCPを1件。タブは常にこれを出し、ラベルは code に追従する。
// 2段そろって初めて到達なので、片方だけでは未到達のまま。
export async function currentCP(staffId?: string): Promise<{ cp: CP | null; all: CP[] }> {
  const j = await myJourney(staffId);
  if (!j) return { cp: null, all: [] };
  const all = await checkpoints(j.id);
  const reached = (x: CP) => !!x.os_passed_at && !!x.support_decided_at;
  return { cp: all.find((x) => !reached(x)) ?? null, all };
}

// 自分の保留。0件でも呼び出し側はボックスを消さない（保留の瞬間に
// 箱が生えると「落ちた」ように見えるため）
export async function myHolds() {
  const { cp, all } = await currentCP();
  void cp;
  if (all.length === 0) return [];
  const { data } = await sb.from('checkpoint_holds')
    .select('*').in('checkpoint_id', all.map((x) => x.id))
    .is('resolved_at', null).order('created_at', { ascending: false });
  return (data ?? []) as
    { id: string; checkpoint_id: string; reason: string; add_what: string; created_at: string }[];
}

export const holds = async (cp_id: string) =>
  ((await sb.from('checkpoint_holds').select('*').eq('checkpoint_id', cp_id)
      .is('resolved_at', null)).data ?? []) as
    { id: string; reason: string; add_what: string; created_at: string }[];

// ---- Capability Map ---------------------------------------------------
export type Param = {
  id: string; name: string; sources: string[]; parent_id: string | null;
  axis_id: string; owner_user_id: string | null;
};
export type Axis = { id: string; code: 'area' | 'step'; label: string };
export type Val = {
  staff_id: string; param_id: string; value: number;
  status: '接続済み' | '検証中' | '未接続';
  source: string; basis: string | null;
  unverified: boolean;      // 初期値のまま90日。色は増やさず破線で示す
  source_count: number;     // 繋がっている記録の本数
};

export const axes = async () =>
  ((await sb.from('capability_axes').select('*')).data ?? []) as Axis[];

export const params = async (axis_id: string) =>
  ((await sb.from('capability_params').select('*').eq('axis_id', axis_id)
      .is('hidden_at', null).order('sort_order')).data ?? []) as Param[];

// バッジは value から決めない（第2便 L）。
// 「接続済み／検証中／未接続」は証拠に繋がっているかどうかの状態で、
// 上手さの段階ではない。閾値でバッジを出すと Map が点数表になる。
export const values = async (staff_id?: string) => {
  let q = sb.from('v_capability_display').select('*');
  if (staff_id) q = q.eq('staff_id', staff_id);
  return ((await q).data ?? []) as Val[];
};

// 導入時の初期値。本人は入れられない（RLS）。根拠は10字以上必須
export async function setInitial(a: {
  staff_id: string; param_id: string; value: number; basis: string;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('capability_values').insert({
    staff_id: a.staff_id, param_id: a.param_id, value: a.value,
    status: a.value >= 70 ? '接続済み' : a.value >= 30 ? '検証中' : '未接続',
    source: 'initial_estimate', entered_by: u.user.id,
    entered_at: new Date().toISOString(), basis: a.basis,
  });
  return !error;
}

// ---- 受信ボックス -----------------------------------------------------
export type Inbox = {
  id: string; source_kind: string; source_id: string | null;
  read_at: string | null; created_at: string;
};

export const inbox = async (trash = false) => {
  const q = sb.from('inbox_items').select('*').order('created_at', { ascending: false }).limit(40);
  const { data } = await (trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null));
  return (data ?? []) as Inbox[];
};

export const markRead = (id: string) =>
  sb.from('inbox_items').update({ read_at: new Date().toISOString() }).eq('id', id);
export const softDelete = (id: string) =>
  sb.from('inbox_items').update({ deleted_at: new Date().toISOString() }).eq('id', id);
export const restore = (id: string) =>
  sb.from('inbox_items').update({ deleted_at: null }).eq('id', id);

// ---- 通達 -------------------------------------------------------------
export type Notice = {
  id: string; kind: string; title: string; body: string;
  category: string | null; created_at: string; from_user_id: string;
};

export const notices = async () =>
  ((await sb.from('notices').select('*')
      .order('created_at', { ascending: false }).limit(30)).data ?? []) as Notice[];

// 全体通達は宛先を絞れない（DBの制約 all_notice_has_no_subject）
export async function postNotice(a: {
  kind: 'support_to_mgmt' | 'mgmt_to_all' | 'mgmt_to_support';
  title: string; body: string; category?: string; subject_user_id?: string;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { data: r } = await sb.from('user_roles')
    .select('store_id').eq('user_id', u.user.id).eq('active', true).limit(1);
  const store_id = r?.[0]?.store_id; if (!store_id) return false;
  const { error } = await sb.from('notices').insert({
    kind: a.kind, from_user_id: u.user.id, store_id,
    title: a.title, body: a.body, category: a.category ?? null,
    subject_user_id: a.kind === 'mgmt_to_all' ? null : (a.subject_user_id ?? null),
  });
  return !error;
}

// ============================================================
// 第3便の反映
// ============================================================

// ---- 店舗設定（相談の注記は必ずこの値と一致させる。A の注記）----
export type StoreSettings = {
  store_id: string;
  consultation_visibility: 'none' | 'trend' | 'full';
  response_baseline_days: number;
  practice_slot_minutes: number;
  required_pace_default: number;
  retirement_record_policy: 'keep' | 'ask' | 'del' | null;
};

export async function storeSettings(): Promise<StoreSettings | null> {
  const { data } = await sb.from('store_settings').select('*').limit(1);
  return (data?.[0] ?? null) as StoreSettings | null;
}

// ---- 受信ボックスの送信元（第2便 P ／ 第3便 AB。そのまま画面に出す）----
// notice の3系統は notices.kind で分ける。source_kind は増やさない。
export function inboxFrom(kind: string, noticeKind?: string, nudgeCount?: number): string {
  switch (kind) {
    case 'notice':
      return noticeKind === 'mgmt_to_all'     ? 'MANAGEMENTから · 全体通達'
           : noticeKind === 'support_to_mgmt' ? 'SUPPORTから · 設計への通達'
           :                                    'MANAGEMENTから · あなた宛';
    case 'os_suggestion':       return 'GROWTH OSから · 次の問い';
    case 'nudge':               return `SUPPORTから · 催促 ${nudgeCount ?? 1}回目`;
    case 'escalation':          return 'GROWTH OSから · 3回届いています';
    case 'record_reply':        return 'SUPPORTから · 記録への返答';
    case 'direct_consultation': return 'STAFFから · 直接の相談';
    case 'agreement_request':   return 'MANAGEMENTから · 同意のお願い';
    case 'policy_update':       return 'MANAGEMENTから · 規定の更新';
    case 'storage_alert':       return 'GROWTH OSから · 保存容量';
    case 'support':             return 'SUPPORTから · 声かけ';
    default:                    return 'お知らせ';
  }
}

// 返信できるのは「次の問い」だけ。催促は「動いてください」であって
// 「答えてください」ではない。返信欄を付けると催促が会話になる（T）
export const canReply = (kind: string) => kind === 'os_suggestion';

// 受信ボックスの1件に、中身を添えて返す
export type InboxRow = Inbox & {
  from: string; title: string; body: string; notice_kind?: string;
};

export async function inboxRows(trash = false): Promise<InboxRow[]> {
  const items = await inbox(trash);
  const noticeIds = items.filter((x) => x.source_kind === 'notice' && x.source_id)
                         .map((x) => x.source_id as string);
  const recIds = items.filter((x) => x.source_kind === 'record_reply' && x.source_id)
                      .map((x) => x.source_id as string);

  const nx = noticeIds.length
    ? ((await sb.from('notices').select('id, kind, title, body').in('id', noticeIds)).data ?? [])
    : [];
  const rx = recIds.length
    ? ((await sb.from('practice_records').select('id, title').in('id', recIds)).data ?? [])
    : [];

  return items.map((x) => {
    if (x.source_kind === 'notice') {
      const n = nx.find((v) => (v as { id: string }).id === x.source_id) as
        { kind: string; title: string; body: string } | undefined;
      return { ...x, from: inboxFrom('notice', n?.kind), title: n?.title ?? '通達',
               body: n?.body ?? '', notice_kind: n?.kind };
    }
    if (x.source_kind === 'record_reply') {
      const r = rx.find((v) => (v as { id: string }).id === x.source_id) as
        { title: string } | undefined;
      // 本文は複製しない。記録と並べて読むもの（U-2）
      return { ...x, from: inboxFrom(x.source_kind),
               title: r?.title ?? '記録', body: `「${r?.title ?? '記録'}」に返答がありました。` };
    }
    return { ...x, from: inboxFrom(x.source_kind), title: '', body: '' };
  });
}

// ---- CP の1段目。充足の進み方を画面に出す（K）----
export type CondRow = { id: string; label: string; got: number; need: number; met: boolean };

export async function cpConditions(cp: CP): Promise<CondRow[]> {
  const conds = (cp as unknown as { conditions: unknown[] | null }).conditions;

  const shared = async () =>
    ((await sb.from('practice_records')
        .select('misjudgement, reflection, next_gain')
        .eq('checkpoint_id', cp.id).not('shared_at', 'is', null)
        .is('deleted_at', null)).data ?? []) as
      { misjudgement: string | null; reflection: string | null; next_gain: string | null }[];

  if (!conds || conds.length === 0) {
    const rows = await shared();
    return [{ id: 'default', label: '共有した記録', got: rows.length,
              need: cp.required_evidence, met: rows.length >= cp.required_evidence }];
  }

  const rows = await shared();
  const all = await checkpoints(cp.journey_id);

  return (conds as { id: string; label: string; test: Record<string, unknown> }[]).map((c) => {
    const t = c.test ?? {};
    const need = Number(t.count ?? 1);
    let got = 0;
    if (t.kind === 'shared_records') got = rows.length;
    else if (t.kind === 'record_field') {
      const f = t.field === 'misjudgment' ? 'misjudgement'
              : t.field === 'next_xp'     ? 'next_gain' : 'reflection';
      got = rows.filter((r) => (r[f as keyof typeof r] ?? '').trim() !== '').length;
    } else if (t.kind === 'cp_reached') {
      got = all.some((x) => x.code === t.code &&
        (x as unknown as { reached_at: string | null }).reached_at) ? 1 : 0;
    }
    return { id: c.id, label: c.label, got: Math.min(got, need), need, met: got >= need };
  });
}

export const reachedCPs = async (journey_id: string) =>
  ((await sb.from('checkpoints').select('*').eq('journey_id', journey_id)
      .not('reached_at', 'is', null).order('reached_at')).data ?? []) as
    (CP & { reached_at: string })[];

// ---- 保留中（D）----
export async function holdCards() {
  const { all } = await currentCP();
  const past = await sb.from('checkpoints').select('id, code, title');
  const ids = ((past.data ?? []) as { id: string }[]).map((x) => x.id);
  if (ids.length === 0) return [];
  const { data } = await sb.from('checkpoint_holds')
    .select('*').in('checkpoint_id', ids).order('created_at', { ascending: false });
  const named = (past.data ?? []) as { id: string; code: string; title: string }[];
  void all;
  return ((data ?? []) as {
    id: string; checkpoint_id: string; reason: string; add_what: string;
    resolved_at: string | null; created_at: string;
  }[]).map((h) => ({ ...h, cp: named.find((c) => c.id === h.checkpoint_id) ?? null }));
}

// ---- 相談（A）。title は本人に入力させない ----
export async function askAbout(a: { title: string; body: string; support_id?: string | null }) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  let support = a.support_id ?? null;
  if (!support) {
    const { data } = await sb.from('assignments')
      .select('support_id').eq('staff_id', u.user.id).eq('active', true).limit(1);
    support = (data?.[0] as { support_id: string } | undefined)?.support_id ?? null;
  }
  const { error } = await sb.from('consultations')
    .insert({ staff_id: u.user.id, support_id: support, title: a.title, body: a.body });
  return !error;
}

// ---- 区分03（B・AB）。Support には存在も件数も出ない ----
export async function tellManagement(body: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { data: r } = await sb.from('user_roles')
    .select('store_id').eq('user_id', u.user.id).eq('active', true).limit(1);
  const store_id = (r?.[0] as { store_id: string } | undefined)?.store_id;
  if (!store_id) return false;
  const { error } = await sb.from('mgmt_consultations')
    .insert({ staff_id: u.user.id, store_id, body });
  return !error;
}

// ---- 記録への返答（U）。1記録につき1つ ----
export async function replyToRecord(record_id: string, body: string) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('practice_records').update({
    support_reply: body, replied_at: new Date().toISOString(), replied_by: u.user.id,
  }).eq('id', record_id);
  return !error;
}

// ---- 共有シート（AC ＋ M-1）----------------------------------------
// 大きいほう（向かっている先）から小さいほう（どの能力に効いたか）へ。
// CP は選ばせない — 選択肢は「現在の未到達CP」1件だけで、選ぶ余地がない。
// 到達済みCPには紐づけられない（済んだ条件に後から記録を足せてしまう）。

export type ShareTargets = { cp: CP | null; params: Param[] };

export async function shareTargets(): Promise<ShareTargets> {
  const { cp } = await currentCP();
  const ax = await axes();
  const all: Param[] = [];
  for (const a of ax) all.push(...(await params(a.id)));
  return { cp, params: all };
}

// 共有を確定する。CP の紐づけと、Map の行への繋がりを一緒に書く。
// value は動かさない — 動くのは繋がりの本数と status だけ（第2便 M-2）
export async function shareWith(a: {
  record_id: string; checkpoint_id: string | null; param_ids: string[]; salon: boolean;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;

  await sb.from('practice_records')
    .update({ checkpoint_id: a.checkpoint_id }).eq('id', a.record_id);

  // 1件の記録が効く先は3つまで（DBのトリガでも弾く）
  for (const param_id of a.param_ids.slice(0, 3)) {
    await sb.from('capability_sources').insert({
      record_id: a.record_id, param_id, staff_id: u.user.id, chosen_by: u.user.id,
    });
  }

  const { error } = await sb.from('practice_records').update({
    shared_at: new Date().toISOString(), salon_shared: a.salon,
  }).eq('id', a.record_id);
  return !error;
}

export const sourcesOf = async (record_id: string) =>
  ((await sb.from('capability_sources').select('param_id').eq('record_id', record_id))
    .data ?? []).map((x) => (x as { param_id: string }).param_id);

// ---- Vision と現在地（第5便 AL）-------------------------------------
// どこへ行きたいかは本人が書き、いまどこにいるかは他人が書く。
// 現在地は自分では見えにくいもので、逆にすると評価面談になる。
// 列ごとの権限は DB のトリガが守っている。

export async function setVision(journey_id: string, vision: string) {
  const { error } = await sb.from('journeys').update({ vision }).eq('id', journey_id);
  return !error;
}

export async function setCurrentPosition(journey_id: string, current_position: string) {
  const { error } = await sb.from('journeys')
    .update({ current_position }).eq('id', journey_id);
  return !error;
}

// ---- Home に出すもの（第1便 E ／ 第4便 AA）---------------------------

// 催促。未読のものだけ。回数はキッカーに出す
export async function myNudge() {
  const { data } = await sb.from('inbox_items')
    .select('*').eq('source_kind', 'nudge').is('read_at', null).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1);
  const it = (data?.[0] ?? null) as Inbox | null;
  if (!it) return null;
  const { data: st } = await sb.from('nudge_states')
    .select('count, trigger_kind').eq('subject_id', it.source_id ?? '').limit(1);
  const n = (st?.[0] as { count: number } | undefined)?.count ?? 1;
  const kind = (st?.[0] as { trigger_kind: string } | undefined)?.trigger_kind
            ?? 'records_stalled';
  return { item: it, count: n, kind };
}

// 全体通達は最新1件のみ。件数は出さない（「3件」と出すと読む作業になる）
export async function latestNotice(): Promise<Notice | null> {
  const { data } = await sb.from('notices')
    .select('*').eq('kind', 'mgmt_to_all')
    .order('created_at', { ascending: false }).limit(1);
  return (data?.[0] ?? null) as Notice | null;
}

// ---- CP を作る（第5便 AK ／ 第4便 AE）--------------------------------
// Support に JSON は書かせない。種類3択＋件数＋自動生成の label。
// 条件は3つまで — 4つ以上は CP を2つに割るサイン。

export type CondKind = 'shared_records' | 'record_field' | 'cp_reached';
export type CondDraft = {
  id: string; kind: CondKind; count: number;
  field?: 'misjudgment' | 'reflection' | 'next_xp'; code?: string; label: string;
};

export const FIELD_LABEL: Record<string, string> = {
  misjudgment: 'ズレた判断', reflection: '反省', next_xp: '次回への貯め方',
};

// label は選んだ種類から自動で作る。編集もできる
export function condLabel(d: Omit<CondDraft, 'id' | 'label'>): string {
  if (d.kind === 'shared_records') return `共有した記録が${d.count}件`;
  if (d.kind === 'record_field')
    return `${FIELD_LABEL[d.field ?? 'reflection']}を書いた記録が${d.count}件`;
  return `${d.code ?? 'CP1'}に到達している`;
}

export type NextQDraft = { kind: 'as_is' | 'smaller' | 'shift_area'; body: string; reason: string };

export async function createCheckpoint(a: {
  journey_id: string; code: string; title: string;
  conditions: CondDraft[]; questions: NextQDraft[];
}) {
  const conditions = a.conditions.slice(0, 3).map((d) => ({
    id: d.id, label: d.label,
    test: d.kind === 'shared_records' ? { kind: d.kind, count: d.count }
        : d.kind === 'record_field'   ? { kind: d.kind, field: d.field, count: d.count }
        :                               { kind: d.kind, code: d.code },
  }));

  const { data, error } = await sb.from('checkpoints').insert({
    journey_id: a.journey_id, code: a.code, title: a.title,
    conditions, required_evidence: 3,
  }).select('id').single();
  if (error || !data) return null;
  const cp = (data as { id: string }).id;

  // 次の問いは CP と一緒に書く。到達の瞬間には何も生成しない
  for (const q of a.questions.filter((x) => x.body.trim() && x.reason.trim())) {
    await sb.from('next_questions').insert({
      journey_id: a.journey_id, from_checkpoint_id: cp,
      body: q.body.trim(), reason: q.reason.trim(),
      origin: 'os', adjust_kind: q.kind,
    });
  }
  return cp;
}

// ---- 次の問いを渡す（第4便 AE）---------------------------------------
export const nextQuestions = async (cp_id: string) =>
  ((await sb.from('next_questions').select('*').eq('from_checkpoint_id', cp_id)
      .order('created_at')).data ?? []) as {
    id: string; body: string; reason: string; origin: string;
    adjust_kind: string | null; adjust_reason: string | null;
    delivered_at: string | null; journey_id: string;
  }[];

export async function deliverQuestion(a: {
  id: string; journey_id: string; kind: 'as_is' | 'smaller' | 'shift_area';
  reason: string; code: string; title: string;
}) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;

  const { data: cp } = await sb.from('checkpoints').insert({
    journey_id: a.journey_id, code: a.code, title: a.title, required_evidence: 3,
  }).select('id').single();

  const { error } = await sb.from('next_questions').update({
    adjust_kind: a.kind,
    adjust_reason: a.kind === 'as_is' ? (a.reason || null) : a.reason,
    adjusted_by: u.user.id, delivered_at: new Date().toISOString(),
    created_checkpoint_id: (cp as { id: string } | null)?.id ?? null,
  }).eq('id', a.id);
  return !error;
}

// ---- Capability Map に行を足す（第4便 AD）---------------------------
// 店舗共通の骨格（Management）＋ 個人の行（本人）の2層。
// 本人が足したものは、その人の Map にだけ増える。

export const SOURCE_LABEL: Record<string, string> = {
  practice_record:  'Practice記録',
  record_images:    'before / after の画像',
  cp_reached:       'Checkpoint の到達',
  support_review:   'Support の確認',
  initial_estimate: '初期値',
};

export function sourcePreview(name: string, srcs: string[]): string {
  if (!name.trim()) return '名称を入れてください。';
  if (srcs.length === 0) return 'ソースを1つ以上選んでください。';
  return `「${name.trim()}」は、${srcs.map((s) => SOURCE_LABEL[s]).join('、')}から見ます。`;
}

export async function addParam(a: { axis_id: string; name: string; sources: string[] }) {
  const { data: u } = await sb.auth.getUser(); if (!u.user) return false;
  const { error } = await sb.from('capability_params').insert({
    axis_id: a.axis_id, name: a.name.trim(), sources: a.sources,
    owner_user_id: u.user.id,        // 自分の Map にだけ増える
    sort_order: 99,
  });
  return !error;
}

// ---- Capability Map の行を変える（Management 7）----------------------
// Management は名称・ソースとも可。Support はソースのみ・名称は不可。
// 本人が足した行（owner_user_id が本人）は本人が両方可。
// 理由は30字以上（本人が自分の行を変えるときは不要）。
// 権限は DB のトリガでも守っている。

export async function changeParam(a: {
  param_id: string; name?: string; sources?: string[]; reason?: string; own: boolean;
}) {
  if (!a.own && (!a.reason || a.reason.trim().length < 30)) return false;
  const patch: Record<string, unknown> = {};
  if (a.name !== undefined) patch.name = a.name.trim();
  if (a.sources !== undefined) patch.sources = a.sources;
  const { error } = await sb.from('capability_params').update(patch).eq('id', a.param_id);
  if (error) return false;
  // 理由は履歴側に残す（列の更新はトリガが拾う）
  if (a.reason?.trim())
    await sb.from('capability_param_changes')
      .update({ reason: a.reason.trim() })
      .eq('param_id', a.param_id).is('reason', null);
  return true;
}

// ---- 未読があること（AX-2）------------------------------------------
// プッシュが届かない人への担保。件数は出さない —
// 全体通達の既読を人数だけにしている扱いと揃える。
export async function hasUnread(): Promise<boolean> {
  const { count } = await sb.from('inbox_items')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null).is('deleted_at', null)
    .or(`deliver_after.is.null,deliver_after.lte.${new Date().toISOString()}`);
  return (count ?? 0) > 0;
}
