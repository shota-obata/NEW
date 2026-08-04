-- Growth OS Mobile — 画像の可視領域（storage.objects）
--
-- バケットを Private にしただけでは足りない。Private は「URLを直接叩けない」
-- だけで、**認証が通れば誰の画像でも取れる**。before/after にはモデルさんの
-- 顔が写るので、記録本体（practice_records）と同じ範囲に揃える。
--
-- ■ パスの規約
--   practice-images/{record_id}/{before|after}/{uuid}.jpg
--   先頭のフォルダ名が record_id。ここから記録を引いて可視領域を判定する。
--   クライアントが好きなパスに置けると判定が効かなくなるので、
--   規約に合わないパスは insert のポリシーで弾く。

-- 画像1枚から、その記録の可視性を判定する
create or replace function can_see_record(p_record uuid) returns bool as $$
  select exists (
    select 1 from practice_records p
     where p.id = p_record and p.deleted_at is null
       and (
         p.staff_id = auth.uid()                       -- 本人
         or supports(p.staff_id)                       -- 担当Support
         or exists (select 1 from user_roles r         -- 同一店舗の Management
                    where r.user_id = p.staff_id and r.active
                      and is_mgmt_of(r.store_id))
         or (p.salon_shared and exists (               -- サロンに出したものは同一店舗のスタッフ間
              select 1 from user_roles a, user_roles b
               where a.user_id = auth.uid() and b.user_id = p.staff_id
                 and a.store_id = b.store_id and a.active and b.active))
       )
  );
$$ language sql stable security definer;

create or replace function owns_record(p_record uuid) returns bool as $$
  select exists (select 1 from practice_records
                  where id = p_record and staff_id = auth.uid()
                    and deleted_at is null);
$$ language sql stable security definer;

-- パスの先頭フォルダを record_id として取り出す（不正なら null）。
-- 例外処理は plpgsql でしか書けない（language sql には exception 節が無い）
create or replace function record_of_path(p_name text) returns uuid as $$
begin
  return nullif((storage.foldername(p_name))[1], '')::uuid;
exception when others then
  return null;
end $$ language plpgsql stable;

-- ------------------------------------------------------------
-- ポリシー
-- ------------------------------------------------------------
-- storage.objects は Supabase が RLS を有効にした状態で用意している。
-- バケットを跨がないよう bucket_id で必ず絞る。

drop policy if exists practice_images_read   on storage.objects;
drop policy if exists practice_images_insert on storage.objects;
drop policy if exists practice_images_delete on storage.objects;

-- 読み: 記録が見える人だけ。範囲は practice_records と完全に同じ
create policy practice_images_read on storage.objects for select
  using (
    bucket_id = 'practice-images'
    and session_ok()
    and can_see_record(record_of_path(name))
  );

-- 書き: 本人だけ。しかも自分の記録の下にしか置けない。
-- 2段目のフォルダは before / after に限る（規約外のパスを作らせない）
create policy practice_images_insert on storage.objects for insert
  with check (
    bucket_id = 'practice-images'
    and session_ok()
    and owns_record(record_of_path(name))
    and (storage.foldername(name))[2] in ('before','after')
  );

-- 消す: 本人だけ。退職時の匿名化では消さない（第8条で残す）
create policy practice_images_delete on storage.objects for delete
  using (
    bucket_id = 'practice-images'
    and owns_record(record_of_path(name))
  );

-- 更新は許さない。差し替えは delete + insert で行う。
-- update を許すと、他人の記録の画像を自分のパスへ移す経路ができる。

comment on function can_see_record(uuid) is
  '画像の可視領域。practice_records の p10 と同じ範囲に揃える。ずらさないこと';

-- ------------------------------------------------------------
-- 画像が消えたら practice_images の行も消す
-- ------------------------------------------------------------
-- 実体とメタデータがずれると、枚数の上限（kindごと5枚）が実態と合わなくなる。

create or replace function sync_image_row() returns trigger as $$
begin
  delete from practice_images where storage_path = old.name;
  return old;
end $$ language plpgsql security definer;

drop trigger if exists practice_images_sync on storage.objects;
create trigger practice_images_sync
  after delete on storage.objects
  for each row when (old.bucket_id = 'practice-images')
  execute function sync_image_row();
