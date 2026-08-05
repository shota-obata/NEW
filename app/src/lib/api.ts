// Growth OS Mobile — サーバとのやりとり
//
// 可視領域はすべてサーバ（RLS）が担保する。ここでは出し分けをしない。
// 返ってこなかったものを、それらしく埋めないこと。空は空として出す。

import { createClient, type Session } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const sb = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storage: localStorage },
});

// ---- 端末トークン ----------------------------------------------------
// 登録時に受け取り、端末内にだけ置く。以後のサインインで毎回送る。
const DEV_KEY = 'growthos.device_token';
export const deviceToken = () => localStorage.getItem(DEV_KEY);
export const setDeviceToken = (v: string) => localStorage.setItem(DEV_KEY, v);
export const clearDeviceToken = () => localStorage.removeItem(DEV_KEY);

// 端末の指紋。機種やOSが変われば作り直す（再登録が要る）
export function fingerprint(): string {
  const s = [navigator.userAgent, navigator.language, screen.width, screen.height,
             Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');
  let hADD = 0;
  for (let i = 0; i < s.length; i++) hADD = (hADD * 31 + s.charCodeAt(i)) >>> 0;
  return hADD.toString(16).padStart(8, '0');
}

// ---- Edge Function ---------------------------------------------------
// 通信そのものが失敗しても必ず返す。throw させると呼び出し側の
// setBusy(false) に到達せず、画面が「…しています」のまま固まる
const fn = async (name: string, body: unknown, token?: string) => {
  try {
    const res = await fetch(`${URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, body: { ok: false, reason: 'network' } };
  }
};

export type Next = 'change_pin' | 'consent' | 'ok';
export type Deny = 'denied' | 'locked' | 'device_limit' | 'weak_pin' | 'format' | 'same_pin' | 'network';

export async function login(a: {
  person_code: string; store_code: string; pin: string; mgmt_code?: string;
}): Promise<{ ok: true; next: Next } | { ok: false; reason: Deny }> {
  const token = deviceToken();
  if (!token) return { ok: false, reason: 'denied' };

  const { body } = await fn('auth-login', { ...a, device_token: token });
  if (!body?.ok) return { ok: false, reason: (body?.reason as Deny) ?? 'denied' };

  // Edge Function が返したセッションを、以後は supabase-js に持たせる
  const { error } = await sb.auth.setSession({
    access_token: body.access_token, refresh_token: body.refresh_token,
  });
  if (error) return { ok: false, reason: 'denied' };
  return { ok: true, next: body.next as Next };
}

export async function registerDevice(a: {
  person_code: string; code: string; label: string; device_kind: 'personal' | 'shared';
}): Promise<{ ok: true } | { ok: false; reason: Deny }> {
  const { body } = await fn('auth-register-device', { ...a, fingerprint: fingerprint() });
  if (!body?.ok) return { ok: false, reason: (body?.reason as Deny) ?? 'denied' };
  setDeviceToken(body.device_token);
  return { ok: true };
}

export async function changePin(current_pin: string, new_pin: string):
  Promise<{ ok: true } | { ok: false; reason: Deny }> {
  const { data } = await sb.auth.getSession();
  const tok = data.session?.access_token;
  if (!tok) return { ok: false, reason: 'denied' };
  const { body } = await fn('auth-change-pin', { current_pin, new_pin }, tok);
  if (!body?.ok) return { ok: false, reason: (body?.reason as Deny) ?? 'denied' };
  return { ok: true };
}

export async function signOut() {
  await sb.auth.signOut();               // 端末トークンは消さない（次回も同じ端末）
}

// ---- 規定と同意 -------------------------------------------------------

export async function currentPolicy() {
  const { data } = await sb.from('policy_documents')
    .select('id, clause, version, effective_from, announced_at')
    .eq('clause', 'work_rules_art6').is('revoked_at', null).maybeSingle();
  return data;
}

export async function consent(policy_document_id: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { error } = await sb.from('policy_consents').insert({
    user_id: u.user.id, policy_document_id, device_token: deviceToken() ?? 'unknown',
  });
  return !error;
}

// サインイン後にどの画面へ行くか。画面の分岐ではなくサーバに訊く
export async function loginGate(): Promise<Next> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return 'change_pin';
  const { data } = await sb.rpc('login_gate', { u: u.user.id });
  return (data as Next) ?? 'ok';
}

export async function me() {
  const { data } = await sb.from('v_user_public').select('*').maybeSingle();
  return data;
}

export async function myCredentialState() {
  const { data } = await sb.from('v_my_credential_state').select('*').maybeSingle();
  return data as { must_change_pin: boolean; locked: boolean; locked_until: string | null } | null;
}

export const session = () => sb.auth.getSession().then(r => r.data.session as Session | null);
