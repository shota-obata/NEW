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

// 共有された記録。shared_at が入っているものだけ
export async function sharedRecords(): Promise<(Record_ & { staff_id: string })[]> {
  const { data } = await sb.from('practice_records')
    .select('*').not('shared_at', 'is', null).is('deleted_at', null)
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

// 相談への返答。Management には本文が渡らない（v_consultation_trend は
// body / reply_body の列を持たない）
export type Consultation = {
  id: string; staff_id: string; title: string; body: string;
  created_at: string; replied_at: string | null; reply_body: string | null;
};

export async function consultations(): Promise<Consultation[]> {
  const { data } = await sb.from('consultations')
    .select('*').order('created_at', { ascending: false }).limit(30);
  return (data ?? []) as Consultation[];
}

export async function reply(id: string, body: string) {
  const { error } = await sb.from('consultations')
    .update({ reply_body: body, replied_at: new Date().toISOString() }).eq('id', id);
  return !error;
}
