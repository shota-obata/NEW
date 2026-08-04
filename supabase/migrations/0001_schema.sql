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
