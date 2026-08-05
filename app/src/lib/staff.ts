// Growth OS Mobile — Staff のデータ層
//
// 可視領域はサーバ（RLS）が担保する。ここでは絞り込みも出し分けもしない。
// 返ってこなかったものを、それらしく埋めない。空は空として扱う。

import { sb } from './api';

// ---- 型 ---------------------------------------------------------------

export type Record_ = {
  id: string;
  recorded_on: string;
  title: string;
  question: string | null;
  fact: string | null;
  misjudgement: string | null;
  reflection: string | null;
  next_gain: string | null;
  shared_at: string | null;
  salon_shared: boolean;
  images_pending: boolean;
  off_hours: boolean;
  counts_to_pace: boolean;
};

export type Img = { id: string; kind: 'before' | 'after'; storage_path: string; sort_order: number };

// ---- 営業時間 ---------------------------------------------------------
// 判定はサーバ側。端末の時計は使わない（就業規則 第2条第3項）

export async function storeState(store_id: string) {
  const [open, closed] = await Promise.all([
    sb.rpc('is_open_now', { store: store_id }),
    sb.rpc('is_closed_day', { store: store_id }),
  ]);
  return { open: !!open.data, closedDay: !!closed.data };
}

export async function myStore(): Promise<{ id: string; name: string } | null> {
  const { data } = await sb.from('user_roles')
    .select('store_id, stores(id, name)').eq('role', 'staff').eq('active', true).limit(1);
  const s = data?.[0]?.stores as unknown as { id: string; name: string } | undefined;
  return s ?? null;
}

// ---- Practice記録 -----------------------------------------------------

export async function myRecords(limit = 20) {
  const { data } = await sb.from('practice_records')
    .select('*').is('deleted_at', null)
    .order('recorded_on', { ascending: false }).limit(limit);
  return (data ?? []) as Record_[];
}

export async function getRecord(id: string) {
  const { data } = await sb.from('practice_records')
    .select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return data as Record_ | null;
}

export async function createRecord(a: {
  title: string; recorded_on: string; store_id: string;
}): Promise<{ id: string } | null> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;

  // 時間外・定休日かはサーバに訊く。定休日の記録は必要ペースに数えない
  const { open, closedDay } = await storeState(a.store_id);

  const { data, error } = await sb.from('practice_records').insert({
    staff_id: u.user.id,
    recorded_on: a.recorded_on,
    title: a.title,
    off_hours: !open,
    counts_to_pace: !closedDay,
  }).select('id').single();
  return error ? null : (data as { id: string });
}

export async function saveRecord(id: string, patch: Partial<Record_>) {
  const { error } = await sb.from('practice_records').update(patch).eq('id', id);
  return !error;
}

// ---- 画像 -------------------------------------------------------------
// 長辺1600px / JPEG品質80 へ再圧縮してから上げる（STORAGE.md）。
// 無加工だと1GBの無料枠が3週間で尽きる。EXIF が落ちるのは副次効果ではなく要件で、
// 撮影地のGPSが残るとモデルさんの来店場所が記録に残ってしまう。

export async function shrink(file: File, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', quality));
}

export async function listImages(record_id: string) {
  const { data } = await sb.from('practice_images')
    .select('id, kind, storage_path, sort_order').eq('record_id', record_id)
    .order('sort_order');
  return (data ?? []) as Img[];
}

export type UploadResult = { ok: true } | { ok: false; reason: 'limit' | 'quota' | 'failed' };

export async function uploadImage(
  record_id: string, kind: 'before' | 'after', file: File
): Promise<UploadResult> {
  const existing = (await listImages(record_id)).filter((i) => i.kind === kind);
  if (existing.length >= 5) return { ok: false, reason: 'limit' };

  let blob: Blob;
  try { blob = await shrink(file); } catch { return { ok: false, reason: 'failed' }; }

  // パスの規約: {record_id}/{kind}/{uuid}.jpg（storage の RLS がこれで判定する）
  const path = `${record_id}/${kind}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('practice-images')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    // 容量上限で落ちたときは、記録本体は残したまま「画像だけ未保存」と印を付ける。
    // 黙って落とさない（STORAGE.md §4）
    const quota = /exceeded|quota|payload|too large/i.test(error.message);
    if (quota) await sb.from('practice_records').update({ images_pending: true }).eq('id', record_id);
    return { ok: false, reason: quota ? 'quota' : 'failed' };
  }

  await sb.from('practice_images').insert({
    record_id, kind, storage_path: path, sort_order: existing.length, bytes: blob.size,
  });
  return { ok: true };
}

export async function imageUrl(path: string) {
  const { data } = await sb.storage.from('practice-images').createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export async function removeImage(img: Img) {
  await sb.storage.from('practice-images').remove([img.storage_path]);
  // practice_images の行は storage のトリガーが消す
}

// ---- 共有 -------------------------------------------------------------

export async function share(id: string, salon: boolean) {
  return saveRecord(id, { shared_at: new Date().toISOString(), salon_shared: salon });
}

export async function unshare(id: string) {
  return saveRecord(id, { shared_at: null, salon_shared: false });
}

// 誰がいつ見たか。本人に開示する（就業規則 第5条第1項）
export async function viewers(record_id: string) {
  const { data } = await sb.from('record_views')
    .select('viewed_at, users:viewer_id(display_name)').eq('record_id', record_id)
    .order('viewed_at');
  return (data ?? []).map((v) => ({
    at: v.viewed_at as string,
    name: (v.users as unknown as { display_name: string } | null)?.display_name ?? '—',
  }));
}

// ---- 受信ボックス -----------------------------------------------------
// deliver_after が未来のものは RLS が返さない（時間外・定休日の保留）

export async function inbox() {
  const { data } = await sb.from('inbox_items')
    .select('id, source_kind, source_id, read_at, created_at')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
  return data ?? [];
}

// ---- プロフィール（本人のみ編集可）------------------------------------
// 用途は Capability Map の解釈の補助。比較や評価には使わない。
// 生年月日そのものは他者に返らない（v_user_public に列ごと無い）。
// 経験年数はスタッフ間に見せない（v_user_profile のみ）。

export type Profile = {
  birth_date: string | null;
  experience_started_on: string | null;
  show_age: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data } = await sb.from('users')
    .select('birth_date, experience_started_on, show_age').eq('id', u.user.id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function saveProfile(patch: Partial<Profile>) {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return false;
  const { error } = await sb.from('users').update(patch).eq('id', u.user.id);
  return !error;
}

export const yearsSince = (d: string | null) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 864e5) * 10) / 10 : null;
