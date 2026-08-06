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
export type Param = { id: string; name: string; sources: string[]; parent_id: string | null; axis_id: string };
export type Axis = { id: string; code: 'area' | 'step'; label: string };
export type Val = {
  staff_id: string; param_id: string; value: number; status: string;
  source: string; basis: string | null; effective_status: string; unverified: boolean;
};

export const axes = async () =>
  ((await sb.from('capability_axes').select('*')).data ?? []) as Axis[];

export const params = async (axis_id: string) =>
  ((await sb.from('capability_params').select('*').eq('axis_id', axis_id)
      .is('hidden_at', null).order('sort_order')).data ?? []) as Param[];

export const values = async (staff_id?: string) => {
  let q = sb.from('v_capability_current').select('*');
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
