-- Growth OS Mobile — セッションの文脈を、サーバ側の表で持つ
--
-- ■ 0010 の設計を差し替える
-- 0010 は store_id / device_kind を JWT のカスタムクレームに載せる前提だった。
-- それには自前でトークンを発行する必要があり、
--   ・JWT シークレットを扱う（Supabase は非対称鍵へ移行中で、共有シークレットは非推奨）
--   ・リフレッシュトークン、セッション失効、再認証を全部自作する
-- ことになる。認証の土台を手作りするのは、この規模の店舗システムでは割に合わない。
--
-- ■ 差し替え後
-- 認証は Supabase Auth をそのまま使う（トークンの発行・更新・失効は任せる）。
-- 店舗と端末の文脈だけ、**サーバ側の表**に持つ。
-- 行を書くのは Edge Function（service_role）だけなので、クライアントは詐称できない。
-- 紐付けはアクセストークンの session_id クレーム。

create table if not exists app_sessions (
  session_id  text primary key,              -- Supabase Auth の session_id クレーム
  user_id     uuid not null references users(id) on delete cascade,
  store_id    uuid not null references stores(id),
  device_id   uuid not null references devices(id),
  device_kind text not null check (device_kind in ('personal','shared')),
  is_visiting bool not null default false,   -- 他店舗ログインか
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create index if not exists app_sessions_user_idx on app_sessions (user_id)
  where ended_at is null;

comment on table app_sessions is
  'セッションの文脈。Edge Function だけが書く。クライアントからは読みも書きもできない';

alter table app_sessions enable row level security;
alter table app_sessions force  row level security;

-- 本人が自分のセッションを確認できるだけ（他人のは見えない）
create policy app_sessions_self on app_sessions for select
  using (user_id = auth.uid());

revoke insert, update, delete on app_sessions from authenticated;

-- ------------------------------------------------------------
-- 文脈の読み出し
-- ------------------------------------------------------------

create or replace function current_session_id() returns text as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '');
$$ language sql stable;

create or replace function current_store() returns uuid as $$
  select coalesce(
    (select store_id from app_sessions
      where session_id = current_session_id() and ended_at is null),
    nullif(current_setting('app.store_id', true), '')::uuid   -- テスト用
  );
$$ language sql stable security definer;

create or replace function current_device_kind() returns text as $$
  select coalesce(
    (select device_kind from app_sessions
      where session_id = current_session_id() and ended_at is null),
    nullif(current_setting('app.device_kind', true), ''),      -- テスト用
    'unknown'
  );
$$ language sql stable security definer;

comment on function current_store() is
  'サインイン時に Edge Function が書いた app_sessions から読む。クライアントは書けない';

-- ------------------------------------------------------------
-- サインインの記録（Edge Function から service_role で呼ぶ）
-- ------------------------------------------------------------
-- 端末とPINの照合が通ったあとに呼ぶ。
-- 他店舗ログインなら store_access_log に残してからでないとセッションを張らない。

create or replace function open_session(
  p_session_id text, p_user uuid, p_store uuid, p_device uuid
) returns void as $$
declare k text; visiting bool;
begin
  select device_kind into k from devices
   where id = p_device and user_id = p_user and revoked_at is null;
  if k is null then
    raise exception '登録されていない端末です';
  end if;

  visiting := not exists (
    select 1 from user_roles
     where user_id = p_user and store_id = p_store
       and membership = 'member' and active);

  -- 他店舗への入室は、記録が残って初めて成立する
  if visiting then
    insert into store_access_log (user_id, store_id) values (p_user, p_store);
  end if;

  insert into app_sessions (session_id, user_id, store_id, device_id, device_kind, is_visiting)
  values (p_session_id, p_user, p_store, p_device, k, visiting)
  on conflict (session_id) do update
    set store_id = excluded.store_id,
        device_id = excluded.device_id,
        device_kind = excluded.device_kind,
        is_visiting = excluded.is_visiting,
        ended_at = null;

  update devices set last_seen_at = now() where id = p_device;
end $$ language plpgsql security definer;

revoke execute on function open_session(text, uuid, uuid, uuid) from public, authenticated;

create or replace function close_session(p_session_id text) returns void as $$
  update app_sessions set ended_at = now()
   where session_id = p_session_id and ended_at is null;
$$ language sql security definer;

-- 共有端末は無操作3分で自動サインアウト。バッチで閉じる
create or replace function expire_shared_sessions() returns void as $$
  update app_sessions set ended_at = now()
   where ended_at is null and device_kind = 'shared'
     and started_at < now() - interval '3 minutes';
$$ language sql security definer;

select cron.schedule('expire-shared-sessions', '* * * * *',
                     'select expire_shared_sessions()');
