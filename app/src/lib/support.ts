// Growth OS Mobile — Support のデータ層
//
// 担当している Staff のものしか返らない。絞り込みはサーバ（RLS）がやる。
// ここで staff_id を指定しないのは、指定しなくても担当分しか来ないから。
// 「担当外が見えないこと」は 0007 のテストで検証済み。

import { sb } from './api';
import type { Record_ } from './staff';

export type Staff = { id: string; person_code: string; display_name: string };

// 担当しているStaff。assignments 経由でしか見えない
export async function assignedStaff(): Promise<Staff[]> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb.from('assignments')
    .select('staff_id, users:staff_id(id, person_code, display_name)')
    .eq('support_id', u.user.id).eq('active', true);
  return (data ?? [])
    .map((a) => a.users as unknown as Staff)
    .filter((x): x is Staff => !!x);
}

// 共有された記録。shared_at が入っているものだけ。
//
// RLS は「担当しているStaffの記録」に絞るが、**自分の記録も返す**（本人だから）。
// Support として見る画面なので、自分の分は外す。
// これを外さないと、兼務の人の Home に自分の記録が「担当スタッフの記録」として並ぶ。
export async function sharedRecords(): Promise<(Record_ & { staff_id: string })[]> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb.from('practice_records')
    .select('*').not('shared_at', 'is', null).is('deleted_at', null)
    .neq('staff_id', u.user.id)
    .order('shared_at', { ascending: false }).limit(30);
  return (data ?? []) as (Record_ & { staff_id: string })[];
}

// 開いた事実を残す。就業規則 第5条第1項 — 誰がいつ見たかを本人に開示する。
// 「見たけれど残らない」を作らない（例外は運営者の「閲覧」画面だけ）
export async function markViewed(record_id: string) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  await sb.from('record_views')
    .insert({ record_id, viewer_id: u.user.id })
    .select();   // 既に見ていれば unique 制約で弾かれる。それでよい
}

// 自分が開いた記録のid。未読の判定に使う（未読＝まだ開いていない）
export async function myViewed(): Promise<string[]> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb.from('record_views')
    .select('record_id').eq('viewer_id', u.user.id);
  return (data ?? []).map((x) => (x as { record_id: string }).record_id);
}

// 相談への返答。Management には本文が渡らない（v_consultation_trend は
// body / reply_body の列を持たない）
export type Consultation = {
  id: string; staff_id: string; title: string; body: string;
  created_at: string; replied_at: string | null; reply_body: string | null;
};

// RLS は「担当分」と「自分が書いたもの」の両方を返す。
// Support として見る画面なので、自分が書いた相談は外す。
// 外さないと、兼務の人の画面に自分の相談が「担当スタッフの相談」として並ぶ。
export async function consultations(): Promise<Consultation[]> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data } = await sb.from('consultations')
    .select('*').neq('staff_id', u.user.id)
    .order('created_at', { ascending: false }).limit(30);
  return (data ?? []) as Consultation[];
}

export async function reply(id: string, body: string) {
  const { error } = await sb.from('consultations')
    .update({ reply_body: body, replied_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

// ---- 要対応（第1便 F-3）------------------------------------------------
// 条件は3つの OR。平均レスポンスは入れない —
// あれは Management が設計を直すための数字で、Support 自身を追い立てるものではない。

export type Attention = {
  staff: Staff; scope: string;
  unreplied: number;      // 未返答の相談
  stalled: string | null; // 2段目が3営業日止まっているCPの code
  unread: number;         // 共有された記録の未読
};

const BIZ_DAY_MS = 86400000;

export async function attention(): Promise<Attention[]> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];

  const { data: asg } = await sb.from('assignments')
    .select('staff_id, scope, users:staff_id(id, person_code, display_name)')
    .eq('support_id', u.user.id).eq('active', true);

  const rows = (asg ?? []) as unknown as
    { staff_id: string; scope: string; users: Staff | null }[];

  const [cons, recs, seen] = await Promise.all([
    consultations(),
    sharedRecords(),
    myViewed(),
  ]);

  // 2段目が止まっているCP。1段目通過から3営業日（定休の火曜を除いて数える）
  const { data: cps } = await sb.from('checkpoints')
    .select('code, os_passed_at, support_decided_at, journey_id, journeys:journey_id(staff_id)')
    .not('os_passed_at', 'is', null).is('support_decided_at', null);

  const stalledOf = (staffId: string) => {
    const hit = ((cps ?? []) as unknown as
      { code: string; os_passed_at: string; journeys: { staff_id: string } | null }[])
      .find((x) => x.journeys?.staff_id === staffId);
    if (!hit) return null;
    return bizDays(new Date(hit.os_passed_at), new Date()) >= 3 ? hit.code : null;
  };

  return rows.filter((r) => r.users).map((r) => ({
    staff: r.users as Staff,
    scope: r.scope,
    unreplied: cons.filter((x) => x.staff_id === r.staff_id && !x.replied_at).length,
    stalled: stalledOf(r.staff_id),
    unread: recs.filter((x) => x.staff_id === r.staff_id && !seen.includes(x.id)).length,
  }));
}

export const needsAction = (a: Attention) =>
  a.unreplied > 0 || !!a.stalled || a.unread > 0;

// 営業日で数える。火曜は定休なので飛ばす（DATA_MODEL の営業時間）
export function bizDays(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  while (d < to) {
    d.setTime(d.getTime() + BIZ_DAY_MS);
    if (d.getDay() !== 2) n++;   // 2 = 火曜
  }
  return n;
}
