// Growth OS Mobile — Edge Function 共通

import { createClient } from 'jsr:@supabase/supabase-js@2';

export const URL_ = Deno.env.get('SUPABASE_URL')!;
export const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

export const admin = () =>
  createClient(URL_, SERVICE, { auth: { persistSession: false } });

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

// 失敗の理由は外に出さない。
// 個人IDの存在、端末の登録有無、PINの正誤を、応答から区別できないようにする。
// 例外は「ロック中」— これは本人が知る必要がある（15分待つか運営者に頼むか）。
export const DENY = { ok: false, reason: 'denied' } as const;
export const LOCKED = { ok: false, reason: 'locked' } as const;

// アクセストークンから session_id を取り出す。
// 直前に Supabase から受け取ったものなので、ここでは検証せず読むだけでよい
export function sessionIdOf(accessToken: string): string | null {
  try {
    const p = accessToken.split('.')[1];
    const pad = p.length % 4 ? '='.repeat(4 - (p.length % 4)) : '';
    const claims = JSON.parse(
      atob(p.replace(/-/g, '+').replace(/_/g, '/') + pad),
    );
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}

// 総当たりを鈍らせる。PINは4桁しかない
export const slow = () => new Promise((r) => setTimeout(r, 400));
