-- Growth OS Mobile — 全マイグレーション（東京リージョンへの再構築用）
-- 0007_rls_tests.sql と 0000_verify.sql は含みません（検査用のため別に流します）
-- 順序に意味があります。分割せず、このまま1回で実行してください。


-- ======================================================================
-- ▼ 0001_schema.sql
-- ======================================================================

-- Growth OS Mobile — スキーマ
-- 出典: design_handoff_growth_os/DATA_MODEL.md
-- RLS のポリシーは 0004（フェーズ2）で入れる。ここは表と制約だけ。

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- 全テーブル共通の updated_at
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end $$ language plpgsql;

-- ============================================================
-- 組織と人
-- ============================================================

create table stores (
  id             uuid primary key default gen_random_uuid(),
  store_code     text unique not null,           -- 画面上の「店舗ID」 KW-001 / SK-002
  name           text not null,
  timezone       text not null default 'Asia/Tokyo',
  business_hours jsonb not null,                 -- 定休日は null。STORAGE/DATA_MODEL 参照
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger stores_touch before update on stores
  for each row execute function touch_updated_at();

create table users (
  id           uuid primary key default gen_random_uuid(),
  person_code  text unique not null,             -- 画面上の「個人ID」 例 KS-0184
  display_name text not null,
  retired_at   timestamptz,                      -- null = 在籍。同意の分母はこれで数える
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger users_touch before update on users
  for each row execute function touch_updated_at();

-- 1人が複数役割を持てる（制約あり）。membership で所属と応援を分ける
create table user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  store_id   uuid not null references stores(id) on delete cascade,
  role       text not null check (role in ('staff','support','mgmt')),
  membership text not null default 'member' check (membership in ('member','visiting')),
  mgmt_code  text,                               -- role='mgmt' のときのみ
  active     bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id, role),
  constraint mgmt_code_only_for_mgmt
    check ((role = 'mgmt') = (mgmt_code is not null))
);
create trigger user_roles_touch before update on user_roles
  for each row execute function touch_updated_at();
create index on user_roles (user_id) where active;
create index on user_roles (store_id) where active;

-- Management と Staff / Support の併用を禁止（PERMISSIONS.md 併用可否）
-- UIではなくDBで弾く
create or replace function check_role_combo() returns trigger as $$
begin
  if exists (
    select 1 from user_roles
    where user_id = new.user_id and active and id <> coalesce(new.id, gen_random_uuid())
      and ((new.role = 'mgmt'    and role in ('staff','support'))
        or (new.role = 'staff'   and role = 'mgmt')
        or (new.role = 'support' and role = 'mgmt'))
  ) then
    raise exception 'この役割の組み合わせは登録できません（Management は Staff / Support を兼ねられません）';
  end if;
  return new;
end $$ language plpgsql;

create trigger user_roles_combo before insert or update on user_roles
  for each row when (new.active) execute function check_role_combo();

-- ============================================================
-- 端末（PIN単独運用を避けるため必須）
-- ============================================================

create table devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  device_token  text unique not null,
  label         text not null,                   -- 「黒坂さんの iPhone」
  device_kind   text not null check (device_kind in ('personal','shared')),
  fingerprint   text not null,                   -- 機種・OS・鍵。変わったら再登録
  registered_at timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references users(id),
  revoke_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint revoke_needs_reason
    check ((revoked_at is null) = (revoke_reason is null))
);
create trigger devices_touch before update on devices
  for each row execute function touch_updated_at();
create index on devices (user_id) where revoked_at is null;

-- 1人3台まで（運用細目。就業規則 第7条の別紙）
create or replace function check_device_limit() returns trigger as $$
begin
  if (select count(*) from devices
      where user_id = new.user_id and revoked_at is null) >= 3 then
    raise exception '登録できる端末は1人3台までです。既存の端末を失効させてください';
  end if;
  return new;
end $$ language plpgsql;

create trigger devices_limit before insert on devices
  for each row when (new.revoked_at is null) execute function check_device_limit();

-- 登録コード（運営者が発行。15分・1回限り）
create table device_grants (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id),
  target_user_id uuid not null references users(id) on delete cascade,
  code_hash      text not null,                  -- 6桁のハッシュ。平文保存は不可
  issued_by      uuid not null references users(id),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index on device_grants (target_user_id) where used_at is null;

-- 運営者が本人確認のうえ仮PINを手渡し、初回ログインで本人が変更する。
-- 本人確認は端末登録より前に行う（登録コードと仮PINを同時に渡す運用）
create table credentials (
  user_id         uuid primary key references users(id) on delete cascade,
  pin_hash        text not null,                 -- bcrypt 等。平文保存は不可
  must_change_pin bool not null default true,    -- 仮PINの間は true。変更で false
  pin_set_at      timestamptz,                   -- 本人が設定した時刻。仮の間は null
  issued_by       uuid references users(id),     -- 仮PINを配った運営者
  failed_count    int not null default 0,
  locked_until    timestamptz,                   -- 5回失敗で15分。解除は運営者のみ
  updated_at      timestamptz not null default now(),
  -- 本人が変えたなら pin_set_at が入っている。取り違えを防ぐ
  constraint changed_pin_has_timestamp
    check (must_change_pin or pin_set_at is not null)
);
create trigger credentials_touch before update on credentials
  for each row execute function touch_updated_at();

-- ============================================================
-- 規定と同意
-- ============================================================

create table policy_documents (
  id             uuid primary key default gen_random_uuid(),
  clause         text unique not null,           -- 'work_rules_art6'
  version        text not null,                  -- '第2版'（ソフトウェアの採番は使わない）
  revised_at     date not null,
  effective_from date not null,                  -- 附則の施行日
  announced_at   timestamptz,                    -- 周知が済むまで null
  announced_by   uuid references users(id),
  notice_id      uuid,                           -- 周知に使った全体通達（下で FK を付ける）
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint announced_needs_notice
    check ((announced_at is null) = (notice_id is null))
);
create trigger policy_documents_touch before update on policy_documents
  for each row execute function touch_updated_at();

create table policy_consents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  policy_document_id uuid not null references policy_documents(id) on delete cascade,
  consented_at       timestamptz not null default now(),
  device_token       text not null,              -- どの端末で同意したか
  unique (user_id, policy_document_id)
);

-- ============================================================
-- 担当関係
-- ============================================================

create table assignments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references users(id) on delete cascade,
  support_id uuid not null references users(id) on delete cascade,
  store_id   uuid not null references stores(id),
  kind       text not null check (kind in ('primary','temporary')),
  scope      text not null default 'full' check (scope in ('full','limited')),
  scope_note text,                               -- 「CP3のEvidenceのみ」
  expires_at timestamptz,                        -- 応援の期限
  active     bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint limited_needs_note
    check (scope <> 'limited' or scope_note is not null),
  constraint no_self_assignment check (staff_id <> support_id)
);
create trigger assignments_touch before update on assignments
  for each row execute function touch_updated_at();
create index on assignments (staff_id) where active;
create index on assignments (support_id) where active;

-- 双方同意で成立する変更
create table assignment_changes (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references assignments(id) on delete cascade,
  proposed_by    uuid not null references users(id),
  reason         text not null,
  mgmt_agreed    bool not null default false,
  support_agreed bool not null default false,
  settled_at     timestamptz,                    -- 両方 true で成立
  created_at     timestamptz not null default now(),
  constraint reason_min_length check (char_length(reason) >= 50)
);

-- ============================================================
-- 育成の骨格
-- ============================================================

create table journeys (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null unique references users(id) on delete cascade,
  vision           text,
  current_position text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger journeys_touch before update on journeys
  for each row execute function touch_updated_at();

create table checkpoints (
  id                 uuid primary key default gen_random_uuid(),
  journey_id         uuid not null references journeys(id) on delete cascade,
  code               text not null,              -- CP1 / CP2 / CP3
  title              text not null,
  required_evidence  int not null default 3,
  conditions         jsonb,
  os_passed_at       timestamptz,                -- 1段目: Growth OS
  support_decided_by uuid references users(id),  -- 2段目: Support
  support_decided_at timestamptz,
  support_note       text,
  status             text not null default 'open'
                     check (status in ('open','os_passed','reached','held')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (journey_id, code)
);
create trigger checkpoints_touch before update on checkpoints
  for each row execute function touch_updated_at();

-- 到達は2段が揃ったときだけ。片方だけは held（保留）
create or replace function sync_checkpoint_status() returns trigger as $$
begin
  new.status := case
    when new.os_passed_at is not null and new.support_decided_at is not null then 'reached'
    when new.os_passed_at is not null or  new.support_decided_at is not null then 'held'
    else 'open' end;
  return new;
end $$ language plpgsql;

create trigger checkpoints_status before insert or update on checkpoints
  for each row execute function sync_checkpoint_status();

-- 「まだ早い」の置き場。保留の回数はどこにも集計表示しない
create table checkpoint_holds (
  id            uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references checkpoints(id) on delete cascade,
  held_by       uuid not null references users(id),
  reason        text not null,
  add_what      text not null,                   -- 足すもの
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- Practice記録
-- ============================================================

create table practice_records (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references users(id) on delete set null,
  recorded_on    date not null,
  title          text not null,
  question       text,                           -- 今回の問い
  fact           text,                           -- 起きたこと（事実）
  misjudgement   text,                           -- ズレた判断
  reflection     text,                           -- 反省
  next_gain      text,                           -- 次回への経験値の貯め方
  shared_at      timestamptz,
  salon_shared   bool not null default false,
  anonymized     bool not null default false,    -- 退職時 true → 表示名は Other
  images_pending bool not null default false,    -- ストレージ上限で画像だけ落ちた
  off_hours      bool not null default false,    -- 時間外・定休日に書かれた
  counts_to_pace bool not null default true,     -- 定休日は false（必要ペースの分母外）
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger practice_records_touch before update on practice_records
  for each row execute function touch_updated_at();
create index on practice_records (staff_id) where deleted_at is null;

create table practice_images (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references practice_records(id) on delete cascade,
  kind         text not null check (kind in ('before','after')),
  storage_path text not null,
  sort_order   int not null default 0,
  bytes        bigint,                           -- 再圧縮後の実サイズ
  created_at   timestamptz not null default now()
);
create index on practice_images (record_id);

-- kindごとに最大5枚。アプリ側とDB側の両方で制限する
create or replace function check_image_limit() returns trigger as $$
begin
  if (select count(*) from practice_images
      where record_id = new.record_id and kind = new.kind) >= 5 then
    raise exception '% は最大5枚です', new.kind;
  end if;
  return new;
end $$ language plpgsql;

create trigger practice_images_limit before insert on practice_images
  for each row execute function check_image_limit();

-- 既読（誰が・いつ）。本人・Support・Management すべて記録し、本人に開示する
create table record_views (
  id        uuid primary key default gen_random_uuid(),
  record_id uuid not null references practice_records(id) on delete cascade,
  viewer_id uuid not null references users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (record_id, viewer_id)
);

create table evidence (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references practice_records(id) on delete cascade,
  checkpoint_id uuid not null references checkpoints(id) on delete cascade,
  name          text not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 相談と通達
-- ============================================================

create table consultations (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references users(id) on delete cascade,
  support_id uuid references users(id),
  title      text not null,
  body       text not null,
  step_tag   text,                               -- 集計ビュー用（詰まっている工程）
  replied_at timestamptz,
  reply_body text,                               -- 運営者の「閲覧」対象
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger consultations_touch before update on consultations
  for each row execute function touch_updated_at();
create index on consultations (staff_id);

-- Staff → Management（Supportへの不満など。Supportに非表示）
create table mgmt_consultations (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references users(id) on delete cascade,
  store_id   uuid not null references stores(id),
  body       text not null,
  created_at timestamptz not null default now()
);

create table notices (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('support_to_mgmt','mgmt_to_all','mgmt_to_support')),
  from_user_id     uuid not null references users(id),
  store_id         uuid not null references stores(id),
  category         text,
  title            text not null,
  body             text not null,
  subject_user_id  uuid references users(id),    -- 任意。入れると本人にも見える
  attached_metrics jsonb,                        -- 数字のみ。返答文の引用は不可
  created_at       timestamptz not null default now(),
  -- 全体通達は宛先を絞れない（NOTIFICATIONS.md「催促で選べないこと」）
  constraint all_notice_has_no_subject
    check (kind <> 'mgmt_to_all' or subject_user_id is null)
);

alter table policy_documents
  add constraint policy_documents_notice_fk
  foreign key (notice_id) references notices(id);

create table inbox_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  source_kind   text not null check (source_kind in
                  ('notice','os_suggestion','nudge','agreement_request',
                   'policy_update','storage_alert')),
  source_id     uuid,
  read_at       timestamptz,
  deleted_at    timestamptz,
  purge_at      timestamptz,                     -- deleted_at + 30日
  deliver_after timestamptz,                     -- 時間外・定休日は次の営業開始まで保留
  created_at    timestamptz not null default now()
);
create index on inbox_items (user_id) where deleted_at is null;

-- 消去から30日後に物理削除するためのバッチ用
create or replace function set_purge_at() returns trigger as $$
begin
  new.purge_at := case when new.deleted_at is null
                       then null else new.deleted_at + interval '30 days' end;
  return new;
end $$ language plpgsql;

create trigger inbox_purge before insert or update on inbox_items
  for each row execute function set_purge_at();

-- ============================================================
-- Capability Map
-- ============================================================

create table capability_axes (
  id       uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  code     text not null check (code in ('area','step')),
  label    text not null,
  unique (store_id, code)
);

create table capability_params (
  id         uuid primary key default gen_random_uuid(),
  axis_id    uuid not null references capability_axes(id) on delete cascade,
  parent_id  uuid references capability_params(id) on delete cascade,
  name       text not null,
  sources    text[] not null default '{}',       -- 空だと数値が動かない
  sort_order int not null default 0,
  hidden_at  timestamptz,                        -- 非表示。削除ではない
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger capability_params_touch before update on capability_params
  for each row execute function touch_updated_at();

create table capability_values (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references users(id) on delete cascade,
  param_id       uuid not null references capability_params(id) on delete cascade,
  value          int not null check (value between 0 and 100),
  status         text not null check (status in ('接続済み','検証中','未接続')),
  snapshot_month date,                           -- null = 現在値
  created_at     timestamptz not null default now()
);
create index on capability_values (staff_id);

create table capability_param_changes (
  id         uuid primary key default gen_random_uuid(),
  param_id   uuid not null references capability_params(id) on delete cascade,
  changed_by uuid not null references users(id),
  before     jsonb not null,
  after      jsonb not null,
  changed_at timestamptz not null default now()
);

-- ============================================================
-- 監査・ストレージ・退職
-- ============================================================

create table audit_log (
  id                 uuid primary key default gen_random_uuid(),
  actor_id           uuid references users(id),
  action             text not null,
  target_type        text,
  target_id          uuid,
  reason             text,                       -- 権限変更・削除では必須（50字以上）
  visible_to_subject bool not null default true,
  created_at         timestamptz not null default now()
);
create index on audit_log (target_id);

create table store_access_log (             -- Supportの他店舗ログイン
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references users(id) on delete cascade,
  store_id uuid not null references stores(id),
  at       timestamptz not null default now()
);

create table storage_usage (                -- 日次スナップショット（実測）
  id           uuid primary key default gen_random_uuid(),
  measured_on  date not null unique,
  bucket       text not null,
  bytes_used   bigint not null,
  object_count int not null,
  quota_bytes  bigint not null,
  created_at   timestamptz not null default now()
);

create table storage_alerts (               -- 段階が上がったときだけ1件
  id         uuid primary key default gen_random_uuid(),
  level      text not null check (level in ('notice','warn','danger')),
  pct        numeric not null,
  days_left  int,
  created_at timestamptz not null default now()
);

create table deletion_requests (
  id                  uuid primary key default gen_random_uuid(),
  target_user_id      uuid not null references users(id) on delete cascade,
  requested_by        uuid not null references users(id),
  reason              text not null,
  mgmt_agreed_count   int not null default 0,
  support_agreed_count int not null default 0,
  hold_until          timestamptz not null,      -- 申請 + 24時間
  cancelled_at        timestamptz,
  executed_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint reason_min_length check (char_length(reason) >= 50)
);


-- ======================================================================
-- ▼ 0002_functions.sql
-- ======================================================================

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


-- ======================================================================
-- ▼ 0003_seed.sql
-- ======================================================================

-- Growth OS Mobile — 初期データ（AI,re 確定値）
--
-- 個人IDは会社が発番する。本人には決めさせない（ログインの識別子であり、
-- 重複と推測可能性を避けるため）。person_code は本人に編集させない（RLS で担保）。
-- PIN は運営者が本人確認のうえ仮PINを手渡し、初回ログインで本人が変更する。
-- ここでは credentials を作らない（仮PINの発行は運営者の操作で行う）。

-- ============================================================
-- 店舗
-- ============================================================

insert into stores (store_code, name, timezone, business_hours) values
('KW-001', 'AI,re 河原町店',   'Asia/Tokyo', '{
  "mon": ["11:00","20:00"], "tue": null,
  "wed": ["11:00","20:00"], "thu": ["11:00","20:00"], "fri": ["11:00","20:00"],
  "sat": ["10:00","19:00"], "sun": ["10:00","19:00"]}'),
('SK-002', 'AI,re 四条烏丸店', 'Asia/Tokyo', '{
  "mon": ["11:00","20:00"], "tue": null,
  "wed": ["11:00","20:00"], "thu": ["11:00","20:00"], "fri": ["11:00","20:00"],
  "sat": ["10:00","19:00"], "sun": ["10:00","19:00"]}');

-- ============================================================
-- 人（全社9名）
-- ============================================================
-- RIHO は英字表記が正。
-- 小畑（KW-02）は Support と Staff を兼用するが、users は1行。
-- 同意の分母は users の実人数なので9名（user_roles は10行になる）。

insert into users (person_code, display_name) values
-- 河原町店
('KW-01', '田邊 翔伍'),
('KW-02', '小畑 昭汰'),
('KW-03', 'RIHO'),
('KW-04', '黒坂 侑夏'),
('KW-05', '藤田 彩也菜'),
-- 四条烏丸店
('SK-01', '大谷 洋平'),
('SK-02', '殿 綾貴'),
('SK-03', '高島 颯人'),
('SK-04', '荒井 優月');

-- 役割。Management は Staff / Support を兼ねられない（check_role_combo で弾かれる）。
-- Support ＋ Staff の兼用のみ許可 → 小畑が2行持つ。
insert into user_roles (user_id, store_id, role, membership, mgmt_code)
select u.id, s.id, v.role, 'member', v.mgmt_code
from (values
  ('KW-01','KW-001','mgmt',    'MG-KW-01'),
  ('KW-02','KW-001','support', null),
  ('KW-02','KW-001','staff',   null),      -- 小畑：Support ＋ Staff の兼用
  ('KW-03','KW-001','support', null),
  ('KW-04','KW-001','staff',   null),
  ('KW-05','KW-001','staff',   null),
  ('SK-01','SK-002','mgmt',    'MG-SK-01'),
  ('SK-02','SK-002','support', null),
  ('SK-03','SK-002','staff',   null),
  ('SK-04','SK-002','staff',   null)
) as v(person_code, store_code, role, mgmt_code)
join users  u on u.person_code = v.person_code
join stores s on s.store_code  = v.store_code;

-- ============================================================
-- 規定（第2版 / 2026-08-10 施行）
-- ============================================================
-- 紙では 8/10 に施行済み。アプリ導入は9月上旬のため、
-- announced_at / notice_id はアプリ内で周知の通達を出したときに入れる。
-- そのとき effective_from は既に過去日なので、残る条件は「在籍者全員の同意」だけ。

insert into policy_documents (clause, version, revised_at, effective_from)
values ('work_rules_art6', '第2版', '2026-07-28', '2026-08-10');

-- ============================================================
-- Capability Map の軸
-- ============================================================

insert into capability_axes (store_id, code, label)
select s.id, v.code, v.label
from stores s cross join (values ('area','能力領域'), ('step','判断工程')) as v(code, label);

-- 能力領域
insert into capability_params (axis_id, name, sources, sort_order)
select a.id, v.name, v.sources::text[], v.ord
from capability_axes a cross join (values
  ('シャンプー',   '{model_count,practice_record}',            1),
  ('ブロー',       '{model_count,practice_record}',            2),
  ('縮毛矯正',     '{lesson_count,practice_record}',           3),
  ('骨格の観察',   '{practice_record,checkpoint}',             4),
  ('カットの設計', '{practice_record,checkpoint,support_input}',5),
  ('カラー',       '{model_count,practice_record}',            6),
  ('接客',         '{}',                                       7),
  ('似合わせ',     '{}',                                       8)
) as v(name, sources, ord)
where a.code = 'area';

-- サブ項目。誠実さは平均レスポンスに連動する
insert into capability_params (axis_id, parent_id, name, sources, sort_order)
select p.axis_id, p.id, v.name, v.sources::text[], v.ord
from capability_params p join capability_axes a on a.id = p.axis_id
cross join (values
  ('誠実さ', '{avg_response,support_input}', 1),
  ('明るさ', '{support_input}',              2)
) as v(name, sources, ord)
where a.code = 'area' and p.name = '接客';

insert into capability_params (axis_id, parent_id, name, sources, sort_order)
select p.axis_id, p.id, v.name, v.sources::text[], v.ord
from capability_params p join capability_axes a on a.id = p.axis_id
cross join (values
  ('提案',   '{practice_record,support_input}', 1),
  ('独自性', '{practice_record}',               2)
) as v(name, sources, ord)
where a.code = 'area' and p.name = '似合わせ';

-- 判断工程
insert into capability_params (axis_id, name, sources, sort_order)
select a.id, v.name, v.sources::text[], v.ord
from capability_axes a cross join (values
  ('現在地の把握', '{practice_record,checkpoint}',   1),
  ('問いの設定',   '{practice_record}',              2),
  ('条件の設計',   '{practice_record}',              3),
  ('事実の観察',   '{practice_record}',              4),
  ('判断の修正',   '{practice_record,support_input}',5),
  ('応用',         '{practice_record}',              6),
  ('転用',         '{practice_record}',              7)
) as v(name, sources, ord)
where a.code = 'step';

-- ============================================================
-- 主担当（初期値）
-- ============================================================
-- 固定ではない。双方同意でいつでも変更できる（assignment_changes）。
-- 小畑は Support であると同時に Staff でもあるので、本人の担当Supportとして
-- RIHO を付ける。付けないと、小畑が Staff として書いた記録がどの Support にも
-- 返らない（本人と Management のみ）状態になるため。

insert into assignments (staff_id, support_id, store_id, kind, scope)
select st.id, sp.id, s.id, 'primary', 'full'
from (values
  ('KW-04','KW-02','KW-001'),   -- 黒坂 ← 小畑
  ('KW-05','KW-02','KW-001'),   -- 藤田 ← 小畑
  ('KW-02','KW-03','KW-001'),   -- 小畑（Staffとして）← RIHO
  ('SK-03','SK-02','SK-002'),   -- 高島 ← 殿
  ('SK-04','SK-02','SK-002')    -- 荒井 ← 殿
) as v(staff, support, store)
join users  st on st.person_code = v.staff
join users  sp on sp.person_code = v.support
join stores s  on s.store_code   = v.store;


-- ======================================================================
-- ▼ 0004_instruction_and_profile.sql
-- ======================================================================

-- Growth OS Mobile — 実務の指導記録、初期パラメーター、本人プロフィール
--
-- 0001 を適用済みでも未適用でも通るよう、すべて追加（alter）で書く。

-- ============================================================
-- ② 実務ベースの指導者（Practice記録）
-- ============================================================
-- Management がレッスンの指導に入ることがある。ただし記録上の主担当は
-- Support が持ったままで、Management に Support 権限は与えない
-- （併用禁止は check_role_combo でそのまま維持）。
--
-- ⚠ この列は「その日その場で誰が見たか」を表すだけの記録である。
--    可視領域は assignments のみで決まる。
--    **instructed_by を RLS のポリシー条件に使ってはならない。**
--    ここに Management が入っても、その Staff の Journey や
--    Capability Map の閲覧権限は増えない。

alter table practice_records
  add column if not exists instructed_by uuid references users(id);

comment on column practice_records.instructed_by is
  '実務上そのレッスンを見た人。assignments とは独立。可視領域には一切影響しない（RLSの条件に使わないこと）';

create index if not exists practice_records_instructed_by_idx
  on practice_records (instructed_by) where deleted_at is null;

-- ============================================================
-- ③ 途中加入したスタッフの初期パラメーター
-- ============================================================
-- 導入が年の途中なので、既に経験のあるスタッフを0から始めると実態と合わない。
-- Management と Support が初期値を入れられる。本人は入力できない（RLS で担保）。

alter table capability_values
  add column if not exists source     text not null default 'computed',
  add column if not exists entered_by uuid references users(id),
  add column if not exists entered_at timestamptz,
  add column if not exists basis      text;

do $$ begin
  alter table capability_values
    add constraint capability_values_source_chk
    check (source in ('computed','initial_estimate'));
exception when duplicate_object then null; end $$;

-- 初期値は「誰が・いつ・どんな根拠で」を必ず残す。自動算出と区別がつくように
do $$ begin
  alter table capability_values
    add constraint initial_estimate_needs_provenance
    check (source <> 'initial_estimate'
           or (entered_by is not null and entered_at is not null
               and basis is not null and char_length(basis) >= 10));
exception when duplicate_object then null; end $$;

comment on column capability_values.source is
  'computed = 記録から算出 / initial_estimate = 導入時に人が入れた初期値。本人の画面で区別して見せる';

-- 現在値と、そこに「未検証」の判定を足したビュー。
-- 初期値のまま3か月動いていない項目は未検証として扱う（保存せず導出する）。
create or replace view v_capability_current as
with latest as (
  select distinct on (staff_id, param_id)
         staff_id, param_id, value, status, source, entered_by, entered_at,
         basis, created_at
  from capability_values
  where snapshot_month is null
  order by staff_id, param_id, created_at desc
)
select l.*,
       (l.source = 'initial_estimate'
        and l.created_at < now() - interval '3 months') as unverified,
       case when l.source = 'initial_estimate'
                 and l.created_at < now() - interval '3 months' then '未検証'
            else l.status end as effective_status
from latest l;

comment on view v_capability_current is
  '各パラメーターの現在値。初期値のまま3か月動かないものは effective_status = 未検証';

-- ============================================================
-- ④ 年齢と経験年数（本人のみ編集可）
-- ============================================================
-- 用途は Capability Map の解釈の補助。比較や評価には使わない。
-- 経験年数は入社年ではなく、美容師としての経験開始日（転職者がいるため）。

alter table users
  add column if not exists birth_date            date,
  add column if not exists experience_started_on date,
  add column if not exists show_age              bool not null default false;

comment on column users.birth_date is
  '本人のみ編集可。生の生年月日は他者に返さない（年齢だけを show_age に従って出す）';
comment on column users.experience_started_on is
  '美容師としての経験開始日。入社日ではない';
comment on column users.show_age is
  '年齢を他者に見せるか。既定は false（見せない）';

-- 見せ方を2つに分ける。どちらにも birth_date は入れない（マスクではなく非収録）。
--
-- 経験年数はスタッフ間に見せない。比較が始まるのを避けるため。
-- ポリシーで絞るのではなく、**列を持たないビューを別に用意する**。

-- 1) スタッフ間まで見えてよい範囲
create or replace view v_user_public as
select u.id,
       u.person_code,
       u.display_name,
       case when u.show_age and u.birth_date is not null
            then extract(year from age(u.birth_date))::int
       end as age,                                    -- show_age が false なら null
       u.retired_at
from users u;

comment on view v_user_public is
  'スタッフ間まで見えてよい範囲。経験年数と生年月日は列ごと持たない';

-- 2) 本人・担当Support・Management だけ（経験年数を含む）
create or replace view v_user_profile as
select p.*,
       u.experience_started_on,
       case when u.experience_started_on is not null
            then round(extract(epoch from age(u.experience_started_on))
                       / (365.25 * 86400), 1)
       end as experience_years
from v_user_public p join users u on u.id = p.id;

comment on view v_user_profile is
  '本人・担当Support・Management のみ。経験年数を含む。birth_date は非収録';


-- ======================================================================
-- ▼ 0005_personal_notes.sql
-- ======================================================================

-- Growth OS Mobile — パーソナルスペース（可視領域 区分01）
--
-- RLS.md が p01_* のポリシーを書いているのに、格納先のテーブルが
-- どこにも定義されていなかった。ここで埋める。
--
-- 「表」：いま抱えている悩み。本人が相手を選んで開示できる。
-- 「裏」：誰にも共有されない。開示の導線そのものを作らない。
-- Management・Support からは存在も件数も出さない。
-- 共有端末では「裏」を置かない（端末内に残さないため）。

create table if not exists personal_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  visibility text not null check (visibility in ('surface','private')),
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger personal_notes_touch before update on personal_notes
  for each row execute function touch_updated_at();

create index if not exists personal_notes_user_idx on personal_notes (user_id);

comment on table personal_notes is
  'パーソナルスペース。区分01。Support / Management には存在も件数も返さない';
comment on column personal_notes.visibility is
  'surface = 表（本人が相手を選んで開示できる） / private = 裏（開示の導線を作らない）';

-- 開示先。「表」だけが持てる
create table if not exists personal_note_shares (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references personal_notes(id) on delete cascade,
  shared_with uuid not null references users(id) on delete cascade,
  shared_at   timestamptz not null default now(),
  unique (note_id, shared_with)
);

-- 「裏」に開示先を作れないことを、UIではなくDBで担保する。
-- 画面に開示ボタンを置かないだけでは、APIを直接叩けば作れてしまう。
create or replace function check_private_not_shared() returns trigger as $$
begin
  if (select visibility from personal_notes where id = new.note_id) = 'private' then
    raise exception '「裏」は誰にも共有できません（開示先を作れません）';
  end if;
  return new;
end $$ language plpgsql;

create trigger personal_note_shares_guard before insert or update on personal_note_shares
  for each row execute function check_private_not_shared();

-- 「表」→「裏」への変更時に、既存の開示先を必ず消す。
-- 残っていると、裏にしたのに見えている人がいる状態になる。
create or replace function drop_shares_on_private() returns trigger as $$
begin
  if new.visibility = 'private' and old.visibility <> 'private' then
    delete from personal_note_shares where note_id = new.id;
  end if;
  return new;
end $$ language plpgsql;

create trigger personal_notes_private_drops_shares
  after update on personal_notes
  for each row execute function drop_shares_on_private();

-- ============================================================
-- 端末の種類（共有端末では「裏」を返さない）
-- ============================================================
-- サインイン時に devices.device_kind をセッション変数へ入れる。
-- app.store_id と同じ仕組み。

create or replace function current_device_kind() returns text as $$
  select coalesce(nullif(current_setting('app.device_kind', true), ''), 'unknown');
$$ language sql stable;

comment on function current_device_kind() is
  'サインイン時に入れる。共有端末では private の行を返さない（p01_no_private_on_shared_device）';


-- ======================================================================
-- ▼ 0006_rls.sql
-- ======================================================================

-- Growth OS Mobile — 行レベルセキュリティ（可視領域8区分）
-- 出典: design_handoff_growth_os/RLS.md ／ PERMISSIONS.md
--
-- ■ 実装方針の変更点（RLS.md からの差分）
-- RLS.md は role_staff / role_mgmt という独自のDBロールを前提に
-- grant / revoke を書いているが、Supabase のロールは anon / authenticated /
-- service_role の3つで、役割はDBロールではなく auth.uid() で判定する。
-- そこで「ビューに権限を与える／外す」ではなく、
--   ・基底テーブルは RLS で行を絞る
--   ・ビューは security_invoker = off（所有者権限）で回し、
--     呼び出し側の判定を **ビューの WHERE に直接書く**
-- という形にする。効果は同じで、返らない列は列ごと存在しない。
--
-- ■ 既定は拒否
-- enable + force。ポリシーが1つも一致しなければ 0件 / 404。
-- 403 は返さない（あることを伝えてしまうため）。

-- ============================================================
-- 0. 全テーブルで RLS を有効化（force = 所有者にも効かせる）
-- ============================================================

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- ============================================================
-- 1. セッションの前提（仮PIN・未同意では本体に入れない）
-- ============================================================
-- 画面のガードとは別に、DB側でも止める。抜け道を作らないため。

create or replace function session_ok() returns bool as $$
  select auth.uid() is not null
     and coalesce((select not must_change_pin from credentials
                   where user_id = auth.uid()), false)
     and has_consented(auth.uid(), 'work_rules_art6');
$$ language sql stable security definer;

comment on function session_ok() is
  '仮PINのまま、または最新版の規定に未同意なら false。本体のテーブルは全て これを AND する';

-- ============================================================
-- 2. 自分自身と組織（同意を取る前でも読める必要がある）
-- ============================================================

create policy users_self on users for select
  using (id = auth.uid());

-- 同一店舗の在籍者は互いに見える（氏名まで。経験年数は v_user_public に無い）
create policy users_same_store on users for select
  using (exists (
    select 1 from user_roles a, user_roles b
    where a.user_id = auth.uid() and b.user_id = users.id
      and a.store_id = b.store_id and a.active and b.active));

-- 本人だけが自分のプロフィールを変えられる。person_code は会社が発番するので
-- 本人には変えさせない（列単位の制限は RLS に無いのでトリガーで担保）
create policy users_self_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function protect_user_fields() returns trigger as $$
begin
  if auth.uid() = new.id then
    if new.person_code is distinct from old.person_code then
      raise exception '個人IDは会社が発番します。本人は変更できません';
    end if;
    if new.retired_at is distinct from old.retired_at then
      raise exception '在籍状態は本人には変更できません';
    end if;
  end if;
  return new;
end $$ language plpgsql;

create trigger users_protect before update on users
  for each row execute function protect_user_fields();

create policy stores_member on stores for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.store_id = stores.id and r.active));

create policy user_roles_self on user_roles for select
  using (user_id = auth.uid() or is_mgmt_of(store_id));

-- ============================================================
-- 3. 規定と同意（同意を完了させるために、同意前でも読める）
-- ============================================================

create policy policy_docs_all on policy_documents for select using (true);

create policy consents_self on policy_consents for select
  using (user_id = auth.uid() or is_mgmt_of((select store_id from user_roles
         where user_id = policy_consents.user_id and active limit 1)));

create policy consents_insert_self on policy_consents for insert
  with check (user_id = auth.uid());   -- 他人の同意を代行できない

-- ============================================================
-- 4. 端末と資格情報
-- ============================================================

create policy devices_self_or_mgmt on devices for select
  using (user_id = auth.uid()
         or exists (select 1 from user_roles r
                    where r.user_id = devices.user_id and r.active
                      and is_mgmt_of(r.store_id)));

create policy devices_mgmt_write on devices for update
  using (exists (select 1 from user_roles r
                 where r.user_id = devices.user_id and r.active
                   and is_mgmt_of(r.store_id)));

create policy grants_target_or_mgmt on device_grants for select
  using (target_user_id = auth.uid() or is_mgmt_of(store_id));

-- 資格情報は本人の行だけ。PINハッシュは列として返るが、
-- 照合は Edge Function 側で行い、クライアントには渡さない
create policy credentials_self on credentials for select
  using (user_id = auth.uid());

-- ============================================================
-- 5. 区分01 パーソナルスペース
-- ============================================================
-- Support / Management には存在も件数も返さない。
-- 共有端末では「裏」を返さない（端末内に痕跡を残さないため）。

create policy p01_personal_owner_only on personal_notes for all
  using (user_id = auth.uid() and session_ok()
         and (visibility <> 'private' or current_device_kind() = 'personal'))
  with check (user_id = auth.uid()
         and (visibility <> 'private' or current_device_kind() = 'personal'));

-- 「表」を開示された相手は読める
create policy p01_shared_surface on personal_notes for select
  using (session_ok() and visibility = 'surface'
         and exists (select 1 from personal_note_shares s
                     where s.note_id = personal_notes.id and s.shared_with = auth.uid()));

create policy p01_shares_owner on personal_note_shares for all
  using (exists (select 1 from personal_notes n
                 where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from personal_notes n
                 where n.id = note_id and n.user_id = auth.uid()));

create policy p01_shares_target on personal_note_shares for select
  using (shared_with = auth.uid());

-- ============================================================
-- 6. 区分02 相談と返答
-- ============================================================

create policy p02_subject on consultations for select
  using (session_ok() and staff_id = auth.uid());

create policy p02_subject_write on consultations for insert
  with check (staff_id = auth.uid());

create policy p02_assigned_support on consultations for select
  using (session_ok() and supports(consultations.staff_id));

create policy p02_support_reply on consultations for update
  using (supports(consultations.staff_id))
  with check (supports(consultations.staff_id));

-- Management には行を渡さない。集計だけを別ビューで返す。
-- body / reply_body の列を持たないので、引用は物理的にできない。
create or replace view v_consultation_trend
  with (security_invoker = off) as
  select c.staff_id,
         date_trunc('week', c.created_at) as week,
         count(*) as n,
         mode() within group (order by c.step_tag) as stuck_step
  from consultations c
  where exists (select 1 from user_roles r
                where r.user_id = c.staff_id and r.active
                  and is_mgmt_of(r.store_id))       -- 呼び出し側の判定をここに書く
  group by 1, 2;

comment on view v_consultation_trend is
  'Management の「傾向だけ」。body / reply_body を列ごと持たない';

-- ============================================================
-- 7. 区分03 Managementへの相談（Supportに非表示）
-- ============================================================

create policy p03_subject_or_mgmt on mgmt_consultations for select
  using (session_ok() and (staff_id = auth.uid() or is_mgmt_of(store_id)));

create policy p03_insert_self on mgmt_consultations for insert
  with check (staff_id = auth.uid());

-- ============================================================
-- 8. 区分04 育成設計（読みは店舗スコープ、書きは所属店舗のセッションのみ）
-- ============================================================

create policy p04_education_side on assignments for select
  using (session_ok()
         and (has_role_in('support', store_id) or is_mgmt_of(store_id)));

-- 応援で入った Support が担当関係を書き換えると、元の店舗の Management が
-- 知らないうちに設計が変わる。他店舗ログイン中は書けない。
create policy p04_education_write on assignments for all
  using      (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)))
  with check (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)));

create policy p04_change_read on assignment_changes for select
  using (session_ok() and exists (select 1 from assignments a
         where a.id = assignment_id
           and (has_role_in('support', a.store_id) or is_mgmt_of(a.store_id))));

create policy p04_change_write on assignment_changes for all
  using      (exists (select 1 from assignments a
              where a.id = assignment_id and can_write_in(a.store_id)))
  with check (exists (select 1 from assignments a
              where a.id = assignment_id and can_write_in(a.store_id)));

-- Staff が自分の担当Supportの氏名だけを見るためのビュー
create or replace view v_my_support with (security_invoker = off) as
  select a.staff_id, u.display_name, a.kind, a.scope, a.scope_note, a.expires_at
  from assignments a join users u on u.id = a.support_id
  where a.active and a.staff_id = auth.uid();

-- ============================================================
-- 9. Journey・Checkpoint
-- ============================================================
-- 本人と担当Supportは細目まで。Management は要約ビューのみ。
-- スタッフ間は一切非共有。

create policy p04b_journey on journeys for select
  using (session_ok() and (staff_id = auth.uid() or supports(staff_id)));

create policy p04b_journey_own_write on journeys for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy p04b_checkpoint on checkpoints for select
  using (session_ok() and exists (select 1 from journeys j
         where j.id = checkpoints.journey_id
           and (j.staff_id = auth.uid() or supports(j.staff_id))));

create policy p04b_checkpoint_support_decide on checkpoints for update
  using (exists (select 1 from journeys j
         where j.id = checkpoints.journey_id and supports(j.staff_id)));

create policy p04b_holds on checkpoint_holds for select
  using (session_ok() and exists (
         select 1 from checkpoints c join journeys j on j.id = c.journey_id
         where c.id = checkpoint_id
           and (j.staff_id = auth.uid() or supports(j.staff_id))));

-- Management は現在地と到達数だけ。vision も support_note も含めない
create or replace view v_journey_summary with (security_invoker = off) as
  select j.staff_id, j.current_position,
         count(*) filter (where c.status = 'reached') as reached,
         count(*) as total
  from journeys j
  left join checkpoints c on c.journey_id = j.id
  where exists (select 1 from user_roles r
                where r.user_id = j.staff_id and r.active and is_mgmt_of(r.store_id))
  group by 1, 2;

-- ============================================================
-- 10. 区分05 軸定義（読みは店舗の全員、書きは所属店舗のセッションのみ）
-- ============================================================

create policy p05_axes_read on capability_axes for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.store_id = capability_axes.store_id
                   and r.active));

create policy p05_store_read on capability_params for select
  using (exists (select 1 from user_roles r join capability_axes x on x.id = axis_id
                 where r.user_id = auth.uid() and r.store_id = x.store_id and r.active));

create policy p05_edu_write on capability_params for all
  using      (can_write_in((select store_id from capability_axes where id = axis_id))
              and (has_role_in('support', (select store_id from capability_axes where id = axis_id))
                   or is_mgmt_of((select store_id from capability_axes where id = axis_id))))
  with check (can_write_in((select store_id from capability_axes where id = axis_id)));

create policy p05_param_changes on capability_param_changes for select
  using (exists (select 1 from capability_params p join capability_axes x on x.id = p.axis_id
                 where p.id = param_id
                   and (has_role_in('support', x.store_id) or is_mgmt_of(x.store_id))));

-- ============================================================
-- 11. Capability Map の値
-- ============================================================
-- 本人と担当Support は細目まで。Management は要約のみ。スタッフ間は0件。

create policy p09_owner_or_support on capability_values for select
  using (session_ok() and (staff_id = auth.uid() or supports(staff_id)));

-- 初期値を入れられるのは Management と Support だけ。本人は入力できない。
create policy p09_initial_by_edu on capability_values for insert
  with check (
    source = 'computed'                                  -- 自動算出はサーバ側
    or (source = 'initial_estimate'
        and staff_id <> auth.uid()                       -- 本人は入れられない
        and entered_by = auth.uid()
        and (supports(staff_id)
             or exists (select 1 from user_roles r
                        where r.user_id = staff_id and r.active
                          and is_mgmt_of(r.store_id)))));

create or replace view v_capability_summary with (security_invoker = off) as
  select v.staff_id,
         count(*) filter (where v.status = '接続済み') as connected,
         count(*) as total
  from v_capability_current v
  where exists (select 1 from user_roles r
                where r.user_id = v.staff_id and r.active and is_mgmt_of(r.store_id))
  group by 1;

-- ============================================================
-- 12. Practice記録
-- ============================================================
-- ⚠ instructed_by はここに一切書かない。可視領域は assignments のみで決まる。

create policy p10_owner_support_mgmt on practice_records for select
  using (session_ok() and deleted_at is null and (
         staff_id = auth.uid()
      or supports(staff_id)
      or exists (select 1 from user_roles r
                 where r.user_id = practice_records.staff_id and r.active
                   and is_mgmt_of(r.store_id))));

create policy p10_own_write on practice_records for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy p10_images on practice_images for select
  using (exists (select 1 from practice_records p where p.id = record_id));

create policy p10_images_own_write on practice_images for all
  using      (exists (select 1 from practice_records p
              where p.id = record_id and p.staff_id = auth.uid()))
  with check (exists (select 1 from practice_records p
              where p.id = record_id and p.staff_id = auth.uid()));

-- 既読は本人に開示する（誰が・いつ）
create policy p10_views_read on record_views for select
  using (exists (select 1 from practice_records p
                 where p.id = record_id
                   and (p.staff_id = auth.uid() or viewer_id = auth.uid())));

create policy p10_views_insert on record_views for insert
  with check (viewer_id = auth.uid());

create policy p10_evidence on evidence for select
  using (exists (select 1 from practice_records p where p.id = record_id));

-- スタッフ間は、サロンに出したものだけ・氏名なし
create or replace view v_salon_records with (security_invoker = off) as
  select p.id, p.recorded_on, p.title, p.question, p.fact,
         p.misjudgement, p.reflection, p.next_gain,
         case when p.anonymized then 'Other' else u.display_name end as author
  from practice_records p join users u on u.id = p.staff_id
  where p.salon_shared and p.deleted_at is null
    and exists (select 1 from user_roles a, user_roles b
                where a.user_id = auth.uid() and b.user_id = p.staff_id
                  and a.store_id = b.store_id and a.active and b.active);

-- ============================================================
-- 13. 区分06 / 07 / 08 通達
-- ============================================================

create policy p06_support_to_mgmt on notices for select
  using (session_ok() and kind = 'support_to_mgmt'
         and (is_mgmt_of(store_id) or from_user_id = auth.uid()
              or subject_user_id = auth.uid()));

create policy p07_mgmt_to_all on notices for select
  using (session_ok() and kind = 'mgmt_to_all'
         and exists (select 1 from user_roles r
                     where r.user_id = auth.uid() and r.store_id = notices.store_id
                       and r.active));

create policy p08_mgmt_to_support on notices for select
  using (session_ok() and kind = 'mgmt_to_support'
         and (subject_user_id = auth.uid() or from_user_id = auth.uid()
              or is_mgmt_of(store_id)));

create policy notices_write on notices for insert
  with check (from_user_id = auth.uid() and can_write_in(store_id));

-- 受信ボックスは本人だけ。保留中（deliver_after が未来）は返さない
create policy inbox_self on inbox_items for select
  using (user_id = auth.uid()
         and (deliver_after is null or deliver_after <= now()));

create policy inbox_self_write on inbox_items for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 14. 例外 — 運営者の「閲覧」（就業規則 第6条第3項）
-- ============================================================
-- 就業規則 第6条第3項に基づく例外。第5条第1項の開示対象から除外する。
-- 変更には規定の改定が必要。
--
-- 周知・在籍者全員の同意・施行日の3つが揃うまで、1行も返さない。

create or replace view v_support_quality with (security_invoker = off) as
  select a.support_id,
         u.display_name,
         count(c.*) filter (where c.replied_at is not null) as replies,
         round(avg(extract(epoch from (c.replied_at - c.created_at))
                   / 86400.0)::numeric, 1) as avg_response_days
  from assignments a
  join users u on u.id = a.support_id
  left join consultations c on c.support_id = a.support_id
  where a.active
    and is_mgmt_of(a.store_id)                    -- 運営者に限る（第6条第4項）
    and policy_gate_open('work_rules_art6')       -- 3条件が揃うまで開かない
  group by 1, 2;

comment on view v_support_quality is
  '就業規則 第6条第1項の確認。第5条第1項の開示対象外（第6条第3項）。閲覧を audit_log に残さない唯一の面';

-- ============================================================
-- 15. 監査ログ（閲覧履歴まで本人に開く。例外は上の1面だけ）
-- ============================================================

create policy audit_subject on audit_log for select
  using (visible_to_subject and (target_id = auth.uid() or actor_id = auth.uid()));

create policy audit_mgmt on audit_log for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.role = 'mgmt' and r.active));

create policy store_access_self_or_mgmt on store_access_log for select
  using (user_id = auth.uid() or is_mgmt_of(store_id));

-- ============================================================
-- 16. ストレージ監視・削除申請（運営者のみ）
-- ============================================================

create policy storage_mgmt on storage_usage for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.role = 'mgmt' and r.active));

create policy storage_alerts_read on storage_alerts for select
  using (auth.uid() is not null);   -- danger は全員に配るため、本文は全員が読める

create policy deletion_read on deletion_requests for select
  using (target_user_id = auth.uid()
         or exists (select 1 from user_roles r
                    where r.user_id = deletion_requests.target_user_id and r.active
                      and (is_mgmt_of(r.store_id) or has_role_in('support', r.store_id))));


-- ======================================================================
-- ▼ 0008_grants.sql
-- ======================================================================

-- Growth OS Mobile — authenticated ロールへの権限付与
--
-- 0006 で RLS を有効にしたが、**テーブルへの GRANT を書いていなかった。**
-- RLS は「どの行を返すか」を決めるだけで、「テーブルに触れてよいか」は
-- GRANT が決める。付けないと、アプリ（authenticated で接続する）は
-- 1行も読めない（permission denied になる）。
--
-- 方針: SELECT は広く、書き込みは必要な表だけ。行の制御は RLS が持つ。

grant usage on schema public to authenticated;

-- 読みは全表。行は RLS が絞る
grant select on all tables in schema public to authenticated;

-- 書き込みは、クライアントが実際に書く表だけに絞る
grant insert, update, delete on
  personal_notes, personal_note_shares
to authenticated;

grant insert, update on
  practice_records, practice_images, evidence,
  consultations, mgmt_consultations,
  journeys, checkpoints, checkpoint_holds,
  assignments, assignment_changes,
  capability_params, capability_values,
  notices, deletion_requests
to authenticated;

grant insert on record_views, policy_consents to authenticated;
grant update on inbox_items, users, devices to authenticated;

-- ⚠ credentials は読みだけ。PINの照合と変更は Edge Function（service_role）で行う。
--   クライアントに更新権限を与えると、他人のPINを書き換える経路が生まれる。
revoke insert, update, delete on credentials from authenticated;

-- ⚠ 監査ログとストレージ計測はクライアントから書かせない。
revoke insert, update, delete on
  audit_log, store_access_log, storage_usage, storage_alerts,
  policy_documents, stores, user_roles, capability_axes,
  capability_param_changes, device_grants
from authenticated;

-- 以後に作る表にも同じ既定を効かせる
alter default privileges in schema public
  grant select on tables to authenticated;


-- ======================================================================
-- ▼ 0009_fix_recursion.sql
-- ======================================================================

-- Growth OS Mobile — personal_notes ／ personal_note_shares の相互再帰を解く
--
-- ■ 何が起きていたか
--   personal_notes のポリシー   → personal_note_shares を参照
--   personal_note_shares のポリシー → personal_notes を参照
--   → 互いのポリシーが互いを呼び、infinite recursion (42P17)。
--
-- ■ なぜ他のポリシーは平気なのか
--   他は supports() / is_mgmt_of() / has_role_in() のような
--   security definer 関数を経由している。所有者が postgres（BYPASSRLS）なので
--   関数の中では RLS が効かず、そこで連鎖が止まる。
--   区分01 だけ、ポリシーの中に生のサブクエリを直接書いていた。
--
-- ■ 直し方
--   参照の向きを1本消す。personal_note_shares に owner_id を持たせ、
--   「そのノートの持ち主か」を personal_notes を見ずに判定できるようにする。
--   これで personal_note_shares 側から personal_notes への辺が無くなり、
--   閉路が消える。非正規化だが、RLS を非循環に保つための正攻法。

-- ------------------------------------------------------------
-- 1. 所有者を持たせる
-- ------------------------------------------------------------

alter table personal_note_shares
  add column if not exists owner_id uuid references users(id) on delete cascade;

-- 既存行の埋め戻し（このテーブルはまだ空のはずだが、念のため）
update personal_note_shares s
   set owner_id = n.user_id
  from personal_notes n
 where n.id = s.note_id and s.owner_id is null;

alter table personal_note_shares alter column owner_id set not null;

create index if not exists personal_note_shares_owner_idx
  on personal_note_shares (owner_id);

-- owner_id は必ずノートの持ち主に一致させる。クライアントに詐称させない
create or replace function set_share_owner() returns trigger as $$
begin
  select user_id into new.owner_id from personal_notes where id = new.note_id;
  if new.owner_id is null then
    raise exception 'ノートが見つかりません';
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists personal_note_shares_owner on personal_note_shares;
create trigger personal_note_shares_owner
  before insert or update on personal_note_shares
  for each row execute function set_share_owner();

-- ------------------------------------------------------------
-- 2. ポリシーを張り替える（personal_notes を見ない形に）
-- ------------------------------------------------------------

drop policy if exists p01_shares_owner  on personal_note_shares;
drop policy if exists p01_shares_target on personal_note_shares;

-- 持ち主。personal_notes を参照しないので閉路にならない
create policy p01_shares_owner on personal_note_shares for all
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 開示された相手は、自分に来た行だけ読める
create policy p01_shares_target on personal_note_shares for select
  using (shared_with = auth.uid());

-- ------------------------------------------------------------
-- 3. 既存のトリガーを security definer にする
-- ------------------------------------------------------------
-- RLS 有効化後は、トリガー関数も呼び出し元の権限で動く。
-- personal_notes が見えないと「裏に開示先を作れない」ガードが素通りする。

create or replace function check_private_not_shared() returns trigger as $$
begin
  if (select visibility from personal_notes where id = new.note_id) = 'private' then
    raise exception '「裏」は誰にも共有できません（開示先を作れません）';
  end if;
  return new;
end $$ language plpgsql security definer;

create or replace function drop_shares_on_private() returns trigger as $$
begin
  if new.visibility = 'private' and old.visibility <> 'private' then
    delete from personal_note_shares where note_id = new.id;
  end if;
  return new;
end $$ language plpgsql security definer;

-- ------------------------------------------------------------
-- 4. personal_notes 側は、参照先のポリシーが単純になったのでそのままでよい
-- ------------------------------------------------------------
-- p01_shared_surface は personal_note_shares を見るが、
-- その先はもう personal_notes を見ない。連鎖は1段で止まる。

comment on column personal_note_shares.owner_id is
  'ノートの持ち主。RLSを非循環に保つための非正規化。トリガーで必ずノートと一致させる';


-- ======================================================================
-- ▼ 0010_session_claims.sql
-- ======================================================================

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


-- ======================================================================
-- ▼ 0011_app_sessions.sql
-- ======================================================================

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


-- ======================================================================
-- ▼ 0012_auth_link.sql
-- ======================================================================

-- Growth OS Mobile — Supabase Auth との紐付け
--
-- PIN が本当の資格情報で、Supabase Auth は「セッションの器」として使う。
-- Auth のパスワードはサーバだけが知る長いランダム文字列にして、ここに置く。
-- クライアントには一切渡さないし、外から入力する経路も作らない。
-- 実際の関門は「登録済み端末」＋「4桁PIN」で、それを Edge Function が
-- 照合してから、この文字列で Supabase Auth にサインインする。

alter table credentials
  add column if not exists auth_secret text;

comment on column credentials.auth_secret is
  'Supabase Auth のパスワード。サーバ専用。クライアントに渡さない。'
  'PINが通らないかぎり使われない';

-- authenticated からは列ごと触らせない（credentials は 0008 で読みのみ）。
-- 読めてしまうと Auth に直接サインインされ、端末とPINの関門を迂回できる。
revoke select on credentials from authenticated;

-- 本人が自分の状態（仮PINか、ロック中か）だけを知るためのビュー
create or replace view v_my_credential_state as
  select user_id,
         must_change_pin,
         (locked_until is not null and locked_until > now()) as locked,
         locked_until
  from credentials
  where user_id = auth.uid();

grant select on v_my_credential_state to authenticated;

comment on view v_my_credential_state is
  '本人が自分の状態だけを知る。pin_hash と auth_secret は列ごと持たない';


-- ======================================================================
-- ▼ 0013_device_grant.sql
-- ======================================================================

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
