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
