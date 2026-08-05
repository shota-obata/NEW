-- Growth OS Mobile — 運営者の操作をアプリから行えるようにする
--
-- 登録コードの発行・仮PINの再発行・端末の失効を、運営者が自分の画面から
-- 行えるようにする。関数に「呼び出し者がその店舗の運営者か」の検査を入れた
-- うえで authenticated へ開く。
--
-- ⚠ 見つかったバグ: issue_device_grant の検査が効いていなかった。
--
--     if not is_mgmt_of(p_store) and p_by is distinct from p_by then
--                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^
--     p_by is distinct from p_by は常に偽。and で繋いでいるので
--     条件全体が常に偽になり、運営者の検査を一度も通っていなかった。
--
--   いまは service_role からしか呼べないので実害は出ていない。
--   ただしこの関数を将来 authenticated へ開いたとき、誰でも他人の
--   登録コードを発行できる状態になる。開く前に直しておく。
--
--   issue_temp_pin には検査そのものが無かった。同じ理由で足す。

create or replace function issue_device_grant(
  p_target uuid, p_store uuid, p_code text, p_by uuid
) returns void as $$
begin
  -- service_role（auth.uid() が null）は運用ツールとして通す。
  -- ユーザーとして呼ぶなら、その店舗の運営者であること
  if auth.uid() is not null and not is_mgmt_of(p_store) then
    raise exception 'この操作は運営者のみです';
  end if;
  -- 対象者がその店舗に属していること（他店舗の人にコードを出せない）
  if not exists (select 1 from user_roles
                 where user_id = p_target and store_id = p_store and active) then
    raise exception 'その人はこの店舗に所属していません';
  end if;
  if p_code !~ '^[0-9]{6}$' then
    raise exception '登録コードは6桁の数字です';
  end if;

  -- 未使用のコードは1人1件。取り違えを防ぐ
  delete from device_grants where target_user_id = p_target and used_at is null;

  insert into device_grants (store_id, target_user_id, code_hash, issued_by, expires_at)
  values (p_store, p_target, crypt(p_code, gen_salt('bf')), p_by,
          now() + interval '15 minutes');

  insert into audit_log (actor_id, action, target_type, target_id)
  values (coalesce(auth.uid(), p_by), 'device_grant_issued', 'user', p_target);
end $$ language plpgsql security definer;

create or replace function issue_temp_pin(p_target uuid, p_pin text, p_by uuid)
returns void as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from user_roles r
                     where r.user_id = p_target and r.active and is_mgmt_of(r.store_id)) then
    raise exception 'この操作は運営者のみです';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PINは4桁の数字です';
  end if;

  insert into credentials (user_id, pin_hash, must_change_pin, issued_by)
  values (p_target, crypt(p_pin, gen_salt('bf')), true, p_by)
  on conflict (user_id) do update
    set pin_hash = crypt(p_pin, gen_salt('bf')),
        must_change_pin = true, pin_set_at = null,
        issued_by = p_by, failed_count = 0, locked_until = null;

  insert into audit_log (actor_id, action, target_type, target_id, reason)
  values (coalesce(auth.uid(), p_by), 'temp_pin_issued', 'user', p_target,
          '本人確認のうえ仮PINを手渡し');
end $$ language plpgsql security definer;

-- 検査を関数の中に入れたので、authenticated から呼べるようにする。
-- 運営者でなければ例外になる（service_role は運用ツールとして通る）
grant execute on function issue_device_grant(uuid, uuid, text, uuid) to authenticated;
grant execute on function issue_temp_pin(uuid, text, uuid) to authenticated;
grant execute on function unlock_pin(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 運営者が見る一覧（誰がどこまで進んだか）
-- ------------------------------------------------------------
-- 仮PINやコードそのものは含めない。状態だけを返す。
create or replace view v_rollout as
select u.id, u.person_code, u.display_name, s.store_code,
       coalesce(c.must_change_pin, true)                      as pin_pending,
       (c.locked_until is not null and c.locked_until > now()) as locked,
       (select count(*) from devices d
         where d.user_id = u.id and d.revoked_at is null)      as devices,
       exists (select 1 from device_grants g
                where g.target_user_id = u.id and g.used_at is null
                  and g.expires_at > now())                    as code_active,
       exists (select 1 from policy_consents pc
                where pc.user_id = u.id)                       as consented
from users u
left join credentials c on c.user_id = u.id
left join lateral (
  select st.store_code, r.store_id from user_roles r join stores st on st.id = r.store_id
   where r.user_id = u.id and r.active limit 1
) s on true
where u.retired_at is null and is_mgmt_of(s.store_id);   -- 運営者にだけ見える

comment on view v_rollout is
  '導入の進み具合。仮PINやコードそのものは含めない（状態だけ）';
