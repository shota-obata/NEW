-- Growth OS Mobile — セッションの文脈を JWT クレームから読む
--
-- ■ 何が問題だったか
-- current_store() / current_device_kind() は `app.store_id` /
-- `app.device_kind` というセッション変数を読んでいた。テストでは
-- set_config で入れられるので通るが、**本番では誰が入れるのか**という
-- 穴がある。PostgREST 経由のクライアントは任意の GUC を設定できないし、
-- 仮に設定できるなら **クライアントが自分で店舗を詐称できる** ことになる。
-- 「他店舗ログイン中は書けない」という担保が、クライアント任せになってしまう。
--
-- ■ 直し方
-- 署名済みの JWT クレームから読む。トークンは Edge Function が
-- 端末とPINを照合したうえで発行するので、クライアントは書き換えられない。
-- （書き換えると署名が壊れて認証自体が通らない）
--
-- テストのために、クレームが無いときだけ GUC にフォールバックする。
-- 本番のトークンには必ずクレームが入るので、フォールバックは効かない。

create or replace function jwt_claim(k text) returns text as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> k,
      ''
    ), '');
$$ language sql stable;

-- セッションが入っている店舗。Edge Function が store_access_log への
-- 記録に成功したうえでトークンに載せる
create or replace function current_store() returns uuid as $$
  select coalesce(
    jwt_claim('store_id'),
    nullif(current_setting('app.store_id', true), '')   -- テスト用のフォールバック
  )::uuid;
$$ language sql stable;

-- 端末の種類。共有端末では「裏」を返さない判定に使う
create or replace function current_device_kind() returns text as $$
  select coalesce(
    jwt_claim('device_kind'),
    nullif(current_setting('app.device_kind', true), ''),
    'unknown'
  );
$$ language sql stable;

comment on function current_store() is
  'JWTクレームから読む。クライアントは署名を壊さずに書き換えられない';
comment on function current_device_kind() is
  'JWTクレームから読む。共有端末で private を返さないための判定';

-- ------------------------------------------------------------
-- PIN の照合とロック（Edge Function から呼ぶ）
-- ------------------------------------------------------------
-- 照合そのものをDB側に置く。クライアントに pin_hash を渡さないため。
-- 5回失敗で15分ロック。解除は運営者のみ（本人の自己解除は作らない）。

create or replace function verify_pin(p_user uuid, p_pin text)
returns table (ok bool, reason text, must_change bool) as $$
declare c record;
begin
  select * into c from credentials where user_id = p_user;
  if c is null then
    return query select false, 'no_credentials', false; return;
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    return query select false, 'locked', c.must_change_pin; return;
  end if;

  if c.pin_hash = crypt(p_pin, c.pin_hash) then
    update credentials
       set failed_count = 0, locked_until = null
     where user_id = p_user;
    return query select true, 'ok', c.must_change_pin; return;
  end if;

  update credentials
     set failed_count = c.failed_count + 1,
         locked_until = case when c.failed_count + 1 >= 5
                             then now() + interval '15 minutes' end
   where user_id = p_user;

  -- ロックは本人にも運営者にも残す
  if c.failed_count + 1 >= 5 then
    insert into audit_log (actor_id, action, target_type, target_id)
    values (p_user, 'pin_locked', 'user', p_user);
  end if;

  return query select false,
    case when c.failed_count + 1 >= 5 then 'locked' else 'wrong_pin' end,
    c.must_change_pin;
end $$ language plpgsql security definer;

revoke execute on function verify_pin(uuid, text) from public, authenticated;

-- 本人がPINを変更する（仮PINからの初回変更もこれ）
create or replace function change_pin(p_user uuid, p_new text)
returns void as $$
begin
  if p_new !~ '^[0-9]{4}$' then
    raise exception 'PINは4桁の数字です';
  end if;
  -- 連番と同一数字は弾く。仮PINの配布運用で「1234」が残るのを防ぐ
  if p_new in ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
               '0123','1234','2345','3456','4567','5678','6789','9876','8765','4321') then
    raise exception 'そのPINは使えません。別の4桁にしてください';
  end if;
  update credentials
     set pin_hash = crypt(p_new, gen_salt('bf')),
         must_change_pin = false,
         pin_set_at = now(),
         failed_count = 0,
         locked_until = null
   where user_id = p_user;
end $$ language plpgsql security definer;

revoke execute on function change_pin(uuid, text) from public, authenticated;

-- 運営者が仮PINを発行する
create or replace function issue_temp_pin(p_target uuid, p_pin text, p_by uuid)
returns void as $$
begin
  insert into credentials (user_id, pin_hash, must_change_pin, issued_by)
  values (p_target, crypt(p_pin, gen_salt('bf')), true, p_by)
  on conflict (user_id) do update
    set pin_hash = crypt(p_pin, gen_salt('bf')),
        must_change_pin = true,
        pin_set_at = null,
        issued_by = p_by,
        failed_count = 0,
        locked_until = null;

  insert into audit_log (actor_id, action, target_type, target_id, reason)
  values (p_by, 'temp_pin_issued', 'user', p_target, '本人確認のうえ仮PINを手渡し');
end $$ language plpgsql security definer;

revoke execute on function issue_temp_pin(uuid, text, uuid) from public, authenticated;

-- 運営者がロックを解除する（本人の自己解除は作らない）
create or replace function unlock_pin(p_target uuid, p_by uuid)
returns void as $$
begin
  if not exists (select 1 from user_roles r
                 where r.user_id = p_target and r.active
                   and exists (select 1 from user_roles m
                               where m.user_id = p_by and m.store_id = r.store_id
                                 and m.role = 'mgmt' and m.active)) then
    raise exception 'この操作は運営者のみです';
  end if;
  update credentials set failed_count = 0, locked_until = null where user_id = p_target;
  insert into audit_log (actor_id, action, target_type, target_id)
  values (p_by, 'pin_unlocked', 'user', p_target);
end $$ language plpgsql security definer;
