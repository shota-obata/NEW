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
