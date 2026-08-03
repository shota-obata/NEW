-- Growth OS Mobile — 関数
-- RLS のポリシー本体は 0004（フェーズ2）。ここはポリシーが使うヘルパーと、
-- 営業時間・ストレージ監視のような表に紐づかないロジック。

-- ============================================================
-- 役割・店舗（RLS.md §2）
-- ============================================================

-- 全店舗ぶんの役割を平らに返す。店舗に紐づく判定には使わないこと
create or replace function current_roles() returns text[] as $$
  select coalesce(array_agg(role), '{}')
  from user_roles where user_id = auth.uid() and active;
$$ language sql stable security definer;

create or replace function is_mgmt_of(store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and role = 'mgmt' and active);
$$ language sql stable security definer;

-- 店舗スコープ付き。行が属する店舗を必ず渡す
create or replace function has_role_in(r text, store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and role = r and active);
$$ language sql stable security definer;

create or replace function is_member_of(store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and membership = 'member' and active);
$$ language sql stable security definer;

-- セッションが入っている店舗。store_access_log への記録が成功したときに入れる
create or replace function current_store() returns uuid as $$
  select nullif(current_setting('app.store_id', true), '')::uuid;
$$ language sql stable;

-- 書き込みの共通ガード。他店舗ログイン中（応援）は読めても書けない
create or replace function can_write_in(store uuid) returns bool as $$
  select store = current_store() and is_member_of(store);
$$ language sql stable security definer;

-- 担当関係（応援は scope と期限も見る）
create or replace function supports(staff uuid) returns bool as $$
  select exists (select 1 from assignments a
                 where a.staff_id = staff and a.support_id = auth.uid()
                   and a.active
                   and (a.expires_at is null or a.expires_at > now()));
$$ language sql stable security definer;

-- ============================================================
-- 規定のゲート（POLICY_INTERNAL_RULES.md §4）
-- ============================================================

-- 周知・在籍者全員の同意・施行日の3つが揃って初めて true
create or replace function policy_gate_open(c text) returns bool as $$
  select exists (
    select 1 from policy_documents d
    where d.clause = c
      and d.announced_at is not null                              -- 1 周知した
      and d.notice_id  is not null                                --   通達なしでは立てられない
      and d.revoked_at is null
      and d.effective_from <= current_date                        -- 3 施行日を過ぎた
      and (select count(*) from policy_consents pc
           where pc.policy_document_id = d.id)
        = (select count(*) from users where retired_at is null)   -- 2 同意 100%
  );
$$ language sql stable security definer;

-- 運営者の画面に出す件数。誰が未同意かは返さない
create or replace view v_consent_gap as
  select d.clause, d.version,
         (select count(*) from users where retired_at is null) as total,
         (select count(*) from policy_consents pc
          where pc.policy_document_id = d.id)                  as consented
  from policy_documents d where d.revoked_at is null;

-- 最新版に同意しているか（ログイン後のガード）
create or replace function has_consented(u uuid, c text) returns bool as $$
  select exists (
    select 1 from policy_consents pc
    join policy_documents d on d.id = pc.policy_document_id
    where pc.user_id = u and d.clause = c and d.revoked_at is null
  );
$$ language sql stable security definer;

-- サインイン後に本体へ入れるか。仮PINのままでは入れない
create or replace function login_gate(u uuid) returns text as $$
  select case
    when (select must_change_pin from credentials where user_id = u) then 'change_pin'
    when not has_consented(u, 'work_rules_art6')                     then 'consent'
    else 'ok'
  end;
$$ language sql stable security definer;

-- ============================================================
-- 営業時間（就業規則 第2条第3項）
-- ============================================================

-- 判定は必ずサーバ側。端末の時計は使わない
-- 曜日キー。to_char(...,'dy') は lc_time に依存するので使わない
create or replace function dow_key(d date) returns text as $$
  select (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from d)::int];
$$ language sql immutable;

create or replace function is_open_now(store uuid, at timestamptz default now())
returns bool as $$
declare s record; local_ts timestamp; band jsonb;
begin
  select business_hours, timezone into s from stores where id = store;
  if s is null then return false; end if;
  local_ts := at at time zone s.timezone;
  band := s.business_hours -> dow_key(local_ts::date);
  if band is null or jsonb_typeof(band) = 'null' then
    return false;                                   -- 定休日
  end if;
  return local_ts::time >= (band->>0)::time
     and local_ts::time <  (band->>1)::time;
end $$ language plpgsql stable;

-- 次の営業開始時刻。火曜に発生したものは水曜の開店時刻になる
create or replace function next_open_at(store uuid, from_ts timestamptz default now())
returns timestamptz as $$
declare s record; local_ts timestamp; d int; probe date; band jsonb;
begin
  select business_hours, timezone into s from stores where id = store;
  if s is null then return from_ts; end if;
  local_ts := from_ts at time zone s.timezone;
  for d in 0..7 loop
    probe := (local_ts + (d || ' days')::interval)::date;
    band  := s.business_hours -> dow_key(probe);
    if band is not null and jsonb_typeof(band) <> 'null' then
      -- 当日なら開店前のときだけ採用（開店後は「いま」でよい）
      if d > 0 or local_ts::time < (band->>0)::time then
        return ((probe + (band->>0)::time) at time zone s.timezone);
      end if;
    end if;
  end loop;
  return from_ts;
end $$ language plpgsql stable;

-- 受信ボックスに入れるときに保留先を決める。定休日の練習提案は積まない
-- 定休日かどうか（時間外とは区別する）
create or replace function is_closed_day(store uuid, at timestamptz default now())
returns bool as $$
  select (s.business_hours -> dow_key(((at at time zone s.timezone)::date))) is null
      or jsonb_typeof(s.business_hours -> dow_key(((at at time zone s.timezone)::date))) = 'null'
  from stores s where s.id = store;
$$ language sql stable;

create or replace function queue_inbox(
  p_user uuid, p_kind text, p_source uuid, p_store uuid
) returns uuid as $$
declare id_ uuid;
begin
  -- 定休日に練習を提案・催促しない（NOTIFICATIONS.md）。
  -- 定休日の練習は本人希望のみで、会社が求めるものではないため、積まずに捨てる。
  -- 時間外は「積んで保留」なので、ここで落とすのは定休日だけ。
  if p_kind in ('os_suggestion','nudge') and is_closed_day(p_store) then
    return null;
  end if;
  insert into inbox_items (user_id, source_kind, source_id, deliver_after)
  values (p_user, p_kind, p_source,
          case when is_open_now(p_store) then null else next_open_at(p_store) end)
  returning id into id_;
  return id_;
end $$ language plpgsql security definer;

-- ============================================================
-- ストレージ監視（STORAGE.md）
-- ============================================================

create or replace function snapshot_storage_usage() returns void as $$
  insert into storage_usage (measured_on, bucket, bytes_used, object_count, quota_bytes)
  select current_date, 'practice-images',
         coalesce(sum((metadata->>'size')::bigint), 0),
         count(*),
         1073741824                                 -- 無料枠 1GB。有料化したら更新
  from storage.objects where bucket_id = 'practice-images'
  on conflict (measured_on) do update
    set bytes_used = excluded.bytes_used,
        object_count = excluded.object_count;
$$ language sql security definer;

-- 率ではなく「残り日数」でも判定する。直近28日の増加ペースから枯渇日を出す
create or replace view v_storage_forecast as
with recent as (
  select bytes_used, measured_on from storage_usage
  where bucket = 'practice-images' and measured_on > current_date - 28
),
rate as (
  select (max(bytes_used) - min(bytes_used))::numeric
         / nullif(max(measured_on) - min(measured_on), 0) as bytes_per_day
  from recent
),
now_ as (
  select bytes_used, quota_bytes from storage_usage
  where bucket = 'practice-images' order by measured_on desc limit 1
)
select n.bytes_used, n.quota_bytes,
       round(100.0 * n.bytes_used / n.quota_bytes, 1) as pct,
       r.bytes_per_day,
       case when r.bytes_per_day > 0
            then floor((n.quota_bytes - n.bytes_used) / r.bytes_per_day)::int
       end as days_left
from now_ n cross join rate r;

create or replace function check_storage_alert() returns void as $$
declare f record; lvl text; a_id uuid;
begin
  select * into f from v_storage_forecast;
  if f is null then return; end if;
  lvl := case
    when f.pct >= 95 or f.days_left <= 10 then 'danger'
    when f.pct >= 85 or f.days_left <= 30 then 'warn'
    when f.pct >= 70 or f.days_left <= 90 then 'notice'
  end;
  if lvl is null then return; end if;
  -- 同じ段階は30日に1回まで。毎日鳴ると危険の通知まで無視される
  if exists (select 1 from storage_alerts
             where level = lvl and created_at > now() - interval '30 days') then
    return;
  end if;
  insert into storage_alerts (level, pct, days_left)
  values (lvl, f.pct, f.days_left) returning id into a_id;
  -- danger のみ全員。それ以外は運営者だけ（現場に伝えても打つ手がない）
  insert into inbox_items (user_id, source_kind, source_id)
  select u.id, 'storage_alert', a_id
  from users u where u.retired_at is null
    and (lvl = 'danger' or exists (
      select 1 from user_roles r
      where r.user_id = u.id and r.role = 'mgmt' and r.active));
end $$ language plpgsql security definer;

-- 毎日 3:00 / 3:05 JST（営業時間外）
select cron.schedule('storage-snapshot', '0 18 * * *', 'select snapshot_storage_usage()');
select cron.schedule('storage-alert',    '5 18 * * *', 'select check_storage_alert()');

-- 消去から30日たった受信ボックスの物理削除
select cron.schedule('inbox-purge', '30 18 * * *',
  'delete from inbox_items where purge_at is not null and purge_at < now()');
