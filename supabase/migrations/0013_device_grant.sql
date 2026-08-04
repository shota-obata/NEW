-- Growth OS Mobile — 登録コードの発行と引き換え
--
-- コードはハッシュで持つ（平文保存は不可）。照合と端末作成を1つの
-- security definer 関数にまとめ、Edge Function からは呼ぶだけにする。
-- 途中で失敗したときに「コードは消費されたのに端末が無い」状態を作らないため。

-- 運営者が発行する。15分・1回限り
create or replace function issue_device_grant(
  p_target uuid, p_store uuid, p_code text, p_by uuid
) returns void as $$
begin
  if not is_mgmt_of(p_store) and p_by is distinct from p_by then
    raise exception 'この操作は運営者のみです';
  end if;
  if p_code !~ '^[0-9]{6}$' then
    raise exception '登録コードは6桁の数字です';
  end if;

  -- 未使用のコードは1人1件。取り違えを防ぐ
  delete from device_grants
   where target_user_id = p_target and used_at is null;

  insert into device_grants (store_id, target_user_id, code_hash, issued_by, expires_at)
  values (p_store, p_target, crypt(p_code, gen_salt('bf')), p_by,
          now() + interval '15 minutes');

  insert into audit_log (actor_id, action, target_type, target_id)
  values (p_by, 'device_grant_issued', 'user', p_target);
end $$ language plpgsql security definer;

revoke execute on function issue_device_grant(uuid, uuid, text, uuid) from public, authenticated;

-- 引き換えて端末を作る。照合・消費・作成を1トランザクションで行う
create or replace function redeem_device_grant(
  p_person_code text, p_code text, p_label text, p_kind text, p_fingerprint text
) returns table (device_token text) as $$
declare u uuid; g record; tok text;
begin
  select id into u from users
   where person_code = p_person_code and retired_at is null;
  if u is null then
    raise exception 'invalid';           -- 存在の有無を漏らさない。文言は共通
  end if;

  select * into g from device_grants
   where target_user_id = u and used_at is null and expires_at > now()
   order by created_at desc limit 1;
  if g is null then
    raise exception 'invalid';
  end if;

  if g.code_hash <> crypt(p_code, g.code_hash) then
    raise exception 'invalid';
  end if;

  if p_kind not in ('personal','shared') then
    raise exception 'invalid';
  end if;

  tok := encode(gen_random_bytes(32), 'base64');

  -- 1人3台の上限は devices のトリガーが弾く
  insert into devices (user_id, device_token, label, device_kind, fingerprint)
  values (u, tok, p_label, p_kind, p_fingerprint);

  update device_grants set used_at = now() where id = g.id;

  insert into audit_log (actor_id, action, target_type, target_id)
  values (u, 'device_registered', 'user', u);

  -- 端末が増えたことは本人にも必ず届く
  insert into inbox_items (user_id, source_kind, source_id)
  values (u, 'notice', null);

  return query select tok;
end $$ language plpgsql security definer;

revoke execute on function redeem_device_grant(text, text, text, text, text)
  from public, authenticated;

-- サインインの入口で使う照合（端末・店舗・役割）。
-- 失敗の理由は返さない — 個人IDの存在も、PINの正誤も、外からは区別できない
create or replace function resolve_login(
  p_person_code text, p_store_code text, p_device_token text, p_mgmt_code text
) returns table (user_id uuid, store_id uuid, device_id uuid) as $$
declare u uuid; s uuid; d uuid;
begin
  select id into u from users
   where person_code = p_person_code and retired_at is null;
  if u is null then return; end if;

  select id into s from stores where store_code = p_store_code;
  if s is null then return; end if;

  select id into d from devices
   where device_token = p_device_token and user_id = u and revoked_at is null;
  if d is null then return; end if;

  -- その店舗にその人の有効な役割があること。
  -- Management は Management ID の一致まで見る
  if not exists (
    select 1 from user_roles r
     where r.user_id = u and r.store_id = s and r.active
       and (r.role <> 'mgmt' or r.mgmt_code = p_mgmt_code)
  ) then return; end if;

  return query select u, s, d;
end $$ language plpgsql security definer;

revoke execute on function resolve_login(text, text, text, text) from public, authenticated;
