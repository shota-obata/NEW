-- Growth OS Mobile — resolve_login の列名衝突を直す
--
-- 症状: resolve_login を呼ぶと
--   ERROR: column reference "user_id" is ambiguous
-- サインインが必ず失敗する。
--
-- 原因: returns table (user_id uuid, store_id uuid, device_id uuid) の
--   出力列名と、関数の中で参照する devices.user_id / user_roles.store_id が
--   同じ名前になっていた。PL/pgSQL はどちらを指すか決められない。
--
-- 直し方: 出力列名に接頭辞を付け、内部の参照はテーブル名で明示する。

drop function if exists resolve_login(text, text, text, text);

create or replace function resolve_login(
  p_person_code text, p_store_code text, p_device_token text, p_mgmt_code text
) returns table (out_user_id uuid, out_store_id uuid, out_device_id uuid) as $$
declare v_user uuid; v_store uuid; v_device uuid;
begin
  select u.id into v_user from users u
   where u.person_code = p_person_code and u.retired_at is null;
  if v_user is null then return; end if;

  select s.id into v_store from stores s where s.store_code = p_store_code;
  if v_store is null then return; end if;

  select d.id into v_device from devices d
   where d.device_token = p_device_token
     and d.user_id = v_user
     and d.revoked_at is null;
  if v_device is null then return; end if;

  -- その店舗にその人の有効な役割があること。
  -- Management は Management ID の一致まで見る
  if not exists (
    select 1 from user_roles r
     where r.user_id = v_user and r.store_id = v_store and r.active
       and (r.role <> 'mgmt' or r.mgmt_code = p_mgmt_code)
  ) then return; end if;

  return query select v_user, v_store, v_device;
end $$ language plpgsql security definer;

revoke execute on function resolve_login(text, text, text, text) from public, authenticated;

comment on function resolve_login(text, text, text, text) is
  '端末・店舗・役割をまとめて照合する。出力列は out_ 接頭辞（内部参照との衝突を避ける）';
