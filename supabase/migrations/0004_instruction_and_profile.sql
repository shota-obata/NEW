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
