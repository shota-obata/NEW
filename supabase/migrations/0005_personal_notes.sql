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
