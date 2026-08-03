# 可視領域の実装（サーバ側）

`PERMISSIONS.md` の可視領域8区分を、そのままPostgresのRLSポリシーにしたものです。**UIで隠す実装は採用しません。** 画面側の分岐は表示を変えるだけで、レスポンスの中身は変えません。古いバージョンのアプリ、開発者ツール、直接叩いたAPI — どれからでも読めてしまいます。

対応する画面：`Growth OS Mobile.dc.html` の `12c`（3役で同じURLを叩く）、`12d`（返し方の規約）、`12e`（8区分の対応表）。

---

## 1. 「見えない」の返し方は3つだけ

混ぜないでください。どれを使うかは区分ごとに固定します。

| 返し方 | 使う場面 | 理由 |
| --- | --- | --- |
| `404 Not Found` | 単体取得で、行が見えないとき | **403は返しません。** 403は「あるが見せない」という情報を渡してしまいます |
| `200 []` | 一覧取得で、見えない行があるとき | 見えない行は件数にも入りません。画面は必ず0件表示を持ちます |
| `200`（列を落としたビュー） | Managementの「傾向だけ」など | マスク文字列は返しません。**列そのものを持たないビュー**にだけ権限を与えます |

画面側の責務は1つだけです — **返ってこなかったものを、それらしく埋めないこと。** 空は空として出します（「誰も見ていません」など）。「権限がありません」という表示も、存在を伝えてしまう場面では使いません。

---

## 2. 前提

```sql
-- すべての対象テーブルで
alter table <t> enable row level security;
alter table <t> force  row level security;   -- テーブル所有者にも効かせる

-- 現在のユーザーの役割（JWTのclaimではなくDBを引く。クライアントが偽れないように）
create or replace function current_roles() returns text[] as $$
  select coalesce(array_agg(role), '{}')
  from user_roles where user_id = auth.uid() and active;
$$ language sql stable security definer;

create or replace function is_mgmt_of(store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and role = 'mgmt' and active);
$$ language sql stable security definer;

-- 店舗スコープ付きの役割判定。current_roles() は全店舗ぶんを返すので、
-- 行が属する店舗を必ず渡す（他店舗の行に一致させないため）
create or replace function has_role_in(r text, store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and role = r and active);
$$ language sql stable security definer;

-- 所属（member）と応援での入室（visiting）を分ける。user_roles.membership を見る
create or replace function is_member_of(store uuid) returns bool as $$
  select exists (select 1 from user_roles
                 where user_id = auth.uid() and store_id = store
                   and membership = 'member' and active);
$$ language sql stable security definer;

-- セッションが入っている店舗（サインイン時の店舗ID）。
-- store_access_log への記録が成功したときにセッション変数へ入れる
create or replace function current_store() returns uuid as $$
  select nullif(current_setting('app.store_id', true), '')::uuid;
$$ language sql stable;

-- 書き込みの共通ガード：所属店舗に、その店舗のセッションで入っているときだけ真。
-- 他店舗ログイン中（応援）は、読めても書けない
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
```

**役割はJWTのclaimから読まない。** claimは発行時点のもので、権限変更や失効が反映されるまで遅れます。`user_roles` を毎回引きます。

**`current_roles()` を単独で条件に使わない。** これは全店舗ぶんの役割を平らに返すので、`'support' = any(current_roles())` は「どこかの店舗でSupportなら真」になります。AI,re は2店舗（河原町店・四条烏丸店）あるため、**行が属する店舗を渡す `has_role_in(role, store_id)` を使ってください。** `current_roles()` は画面の出し分けなど、店舗に依存しない用途にだけ残します。

---

## 3. 8区分 → ポリシー

区分番号をポリシー名に残します（`p01_` 〜 `p08_`）。権限表と実装のどちらからでも辿れるようにするためです。

| # | 領域 | テーブル / ビュー | ポリシー | 見えない側に返るもの |
| --- | --- | --- | --- | --- |
| 01 | Staff 個人領域（表／裏） | `personal_notes` | `p01_personal_owner_only` | 404 ／ 一覧は0件。件数も出しません |
| 02 | 相談と返答 | `consultations` / `v_consultation_trend` | `p02_subject` `p02_assigned_support` `p02_mgmt_trend` | 担当外は404。Managementは店舗設定に従い、既定は集計ビューのみ |
| 03 | Managementへの相談 | `mgmt_consultations` | `p03_subject_or_mgmt` | Supportには404。存在も件数も出しません |
| 04 | 育成設計 | `assignments` / `assignment_changes` | `p04_education_side` | Staffには0件。自分の担当Supportの氏名だけは別ビュー |
| 05 | 軸定義 | `capability_axes` / `capability_params` | `p05_store_read` `p05_edu_write` | 3者とも読めます。書けるのは Support / Management |
| 06 | Support → Management 通達 | `notices` | `p06_support_to_mgmt` | 対象指定されていないStaffには0件 |
| 07 | Management → 全体通達 | `notices` | `p07_mgmt_to_all` | 同一店舗の全員に返ります |
| 08 | Management → Support 個別通達 | `notices` | `p08_mgmt_to_support` | Staffには0件。宛先Supportと発信者のみ |
| ＋ | Journey・現在地・Capability Map | `capability_values` / `v_capability_summary` | `p09_owner_or_support` `p09_mgmt_summary` | Managementは要約のみ。スタッフ間は0件（一切非共有） |
| ＋ | Practice記録（サロン共有分） | `practice_records` / `v_salon_records` | `p10_owner_support_mgmt` `p10_salon_anon` | スタッフ間は氏名列を持たないビュー。退職者は `Other` |
| 例外 | Support→Staff 返答の質・平均レスポンス | `v_support_quality` | `p11_mgmt_quality_view` | Managementのみ。閲覧が監査ログに載らない唯一の面（`POLICY_INTERNAL_RULES.md`） |

---

## 4. 実装

### 01 パーソナルスペース

```sql
create policy p01_personal_owner_only on personal_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

「裏」（`visibility = 'private'`）は、開示先を選ぶ導線そのものを作りません。共有端末で登録された端末（`devices.device_kind = 'shared'`）からは、`visibility = 'private'` の行を返しません。

```sql
create policy p01_no_private_on_shared_device on personal_notes for select
  using (user_id = auth.uid()
         and (visibility <> 'private' or current_device_kind() = 'personal'));
```

### 02 相談と返答

```sql
create policy p02_subject on consultations for select
  using (staff_id = auth.uid());

create policy p02_assigned_support on consultations for select
  using (supports(consultations.staff_id));

-- Management には行を渡さない。集計ビューにだけ権限を与える
create view v_consultation_trend with (security_invoker = off) as
  select staff_id, date_trunc('week', created_at) as week,
         count(*) as n, mode() within group (order by step_tag) as stuck_step
  from consultations group by 1, 2;        -- body / reply_body を持たない

revoke all on consultations   from role_mgmt;
grant select on v_consultation_trend to role_mgmt;
```

店舗設定が `何も出さない` のときは `v_consultation_trend` の権限も外します。`本人が渡したものだけ` のときは `shared_with_mgmt_at is not null` の行だけを含むビューに差し替えます。**設定の切替は権限の付け外しであって、画面の分岐ではありません。**

### 03 Managementへの相談

```sql
create policy p03_subject_or_mgmt on mgmt_consultations for select
  using (staff_id = auth.uid() or is_mgmt_of(store_id));
```

Supportにはポリシーが1つも一致しないので、行は返りません（RLSの既定は拒否）。

### ⚠ ポリシーに使ってはいけない列

| 列 | 理由 |
| --- | --- |
| `practice_records.instructed_by` | 実務上そのレッスンを見た人の**記録**であって権限ではない。Management がレッスンに入っても、その Staff の Journey や Capability Map の閲覧権限は増えない。**可視領域は `assignments` のみで決まる** |
| `users.birth_date` | 他者には年齢（`show_age` が true のときだけ）を返す。生年月日そのものは、どちらのビューにも**列ごと入れない**（マスクではなく非収録） |
| `users.experience_started_on` | **スタッフ間には見せない**（比較が始まるため）。本人・担当Support・Management のみ。ポリシーで絞るのではなく、**列を持たない `v_user_public` を別に用意**して分ける |

ビューは2つです。

| ビュー | 見える人 | 含む列 |
| --- | --- | --- |
| `v_user_public` | 同一店舗のスタッフ間まで | 氏名、個人ID、年齢（`show_age` が true のときだけ）|
| `v_user_profile` | 本人・担当Support・Management | 上記 ＋ 経験開始日・経験年数 |

`instructed_by` を条件に足すと、可視領域の決まり方が2系統になり、権限表と実装が一致しなくなります。**足さないこと。**

### 04 育成設計

```sql
-- 店舗スコープ必須。current_roles() だと他店舗の育成設計まで返る
create policy p04_education_side on assignments for select
  using (has_role_in('support', store_id) or is_mgmt_of(store_id));

-- Staffが自分の担当Supportの氏名だけを見るための別ビュー
create view v_my_support with (security_invoker = off) as
  select a.staff_id, u.display_name, a.kind, a.scope, a.scope_note, a.expires_at
  from assignments a join users u on u.id = a.support_id where a.active;
grant select on v_my_support to role_staff;   -- 行は staff_id = auth.uid() でさらに絞る
```

介入量・シフトの調整はStaffに返しません。

**他店舗ログイン中は書けません（読みは可）。** 応援で入ったSupportが担当関係を書き換えると、元の店舗のManagementが知らないうちに設計が変わるためです。

```sql
create policy p04_education_write on assignments for all
  using      (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)))
  with check (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)));

create policy p04_change_write on assignment_changes for all
  using      (can_write_in((select store_id from assignments a where a.id = assignment_id)))
  with check (can_write_in((select store_id from assignments a where a.id = assignment_id)));
```

担当の変更はもともと **Management ＋ Support の双方同意**（`assignment_changes`）で成立します。応援のSupportは片側の同意すら記録できません。

### ＋ Journey・Checkpoint

`journeys` と `checkpoints` にもポリシーが要ります（RLSの既定は拒否なので、無いと**本人すら読めません**）。可視領域は Capability Map と同じ扱い — 本人と担当Supportは細目まで、Managementは要約のみ。

```sql
create policy p04b_journey_owner_or_support on journeys for select
  using (staff_id = auth.uid() or supports(staff_id));

create policy p04b_checkpoint_owner_or_support on checkpoints for select
  using (exists (select 1 from journeys j
                 where j.id = checkpoints.journey_id
                   and (j.staff_id = auth.uid() or supports(j.staff_id))));

-- Managementは要約ビューのみ（現在地とCP到達数だけ。vision や support_note は含めない）
create view v_journey_summary with (security_invoker = off) as
  select j.staff_id, j.current_position,
         count(*) filter (where c.status = 'reached') as reached,
         count(*) as total
  from journeys j left join checkpoints c on c.journey_id = j.id
  group by 1, 2;
grant select on v_journey_summary to role_mgmt;
```

**スタッフ間は一切非共有。** 他のStaffのIDでは、どのポリシーにも一致しません。担当関係が無ければ、他店舗のSupportにも返りません。

### 05 軸定義

```sql
create policy p05_store_read on capability_params for select
  using (exists (select 1 from user_roles r join capability_axes x on x.id = axis_id
                 where r.user_id = auth.uid() and r.store_id = x.store_id and r.active));

-- 読みは店舗の全員に（軸名は3者共通の設計物）。書きは所属店舗のセッションからだけ
create policy p05_edu_write on capability_params for update
  using      (can_write_in((select store_id from capability_axes where id = axis_id))
              and (has_role_in('support', (select store_id from capability_axes where id = axis_id))
                   or is_mgmt_of((select store_id from capability_axes where id = axis_id))))
  with check (can_write_in((select store_id from capability_axes where id = axis_id)));
```

変更は `capability_param_changes` に必ず残します（トリガー）。過去の `capability_values` は消しません。

### 06 / 07 / 08 通達

```sql
create policy p06_support_to_mgmt on notices for select
  using (kind = 'support_to_mgmt'
         and (is_mgmt_of(store_id) or from_user_id = auth.uid()
              or subject_user_id = auth.uid()));

create policy p07_mgmt_to_all on notices for select
  using (kind = 'mgmt_to_all'
         and exists (select 1 from user_roles
                     where user_id = auth.uid() and store_id = notices.store_id and active));

create policy p08_mgmt_to_support on notices for select
  using (kind = 'mgmt_to_support'
         and (subject_user_id = auth.uid() or from_user_id = auth.uid() or is_mgmt_of(store_id)));
```

個別通達に添えられるのは `attached_metrics`（数字）だけです。返答文の引用は、列がないので物理的にできません。

### ＋ Journey・Capability Map

```sql
create policy p09_owner_or_support on capability_values for select
  using (staff_id = auth.uid() or supports(staff_id));

create view v_capability_summary with (security_invoker = off) as
  select staff_id, axis_code, avg(value)::int as level, count(*) filter (where status='未接続') as gaps
  from capability_values v join capability_params p on p.id = v.param_id
  group by 1, 2;                            -- 細目・パラメーター名を持たない
grant select on v_capability_summary to role_mgmt;
```

**スタッフ間は一切非共有。** 他のStaffのIDでは、どのポリシーにも一致しません。

### ＋ Practice記録

```sql
create policy p10_owner_support_mgmt on practice_records for select
  using (deleted_at is null
         and (staff_id = auth.uid() or supports(staff_id) or is_mgmt_of(store_of(staff_id))));

-- サロン（スタッフ間）は氏名列を持たないビュー
create view v_salon_records with (security_invoker = off) as
  select id, recorded_on, title, question, fact, misjudgement, reflection, next_gain,
         case when anonymized then 'Other' else null end as author_label
  from practice_records where salon_shared and deleted_at is null;
```

`staff_id` も `display_name` もビューに含めません。匿名化した記録から本人をたどる導線（逆引きテーブル）は作りません。

### 例外 返答の質

```sql
create view v_support_quality with (security_invoker = off) as
  select support_id, staff_id, reply_body, replied_at - created_at as response_time
  from consultations where replied_at is not null;

-- 就業規則 第6条第3項に基づく例外。第5条第1項の開示対象から除外する。
-- 変更には規定の改定が必要。
create policy p11_mgmt_quality_view on v_support_quality for select
  using (is_mgmt_of(store_of(support_id))
         and policy_gate_open('work_rules_art6'));
```

ゲートは3条件です。**`announced_at` が入っただけでは開きません** — 周知は一方通行なので、受け取った側の記録が要ります。

```sql
create or replace function policy_gate_open(c text) returns bool as $$
  select exists (
    select 1 from policy_documents d
    where d.clause = c
      and d.announced_at is not null          -- 1 周知した
      and d.notice_id  is not null            --   通達を出さずには立てられない
      and d.revoked_at is null
      and d.effective_from <= current_date    -- 3 施行日を過ぎた
      and (select count(*) from policy_consents pc
           where pc.policy_document_id = d.id)
          = (select count(*) from users where retired_at is null)   -- 2 同意 100%
  );
$$ language sql stable security definer;
```

| 条件 | 何を見るか |
| --- | --- |
| 1 周知した | `announced_at is not null` かつ `notice_id is not null`（周知に使った全体通達） |
| 2 全員が同意した | `policy_consents` の件数 ＝ 在籍者数（`retired_at is null`）。**1人でも未同意なら開きません** |
| 3 施行日を過ぎた | `effective_from <= current_date`。周知した日ではなく、規定が効力を持つ日 |

**社内規定への明記と、全員の同意が実装のゲートです**（`POLICY_INTERNAL_RULES.md`）。画面側にもロックがありますが（`12f`）、本体はこのポリシーです。

運営者の画面に出すのは **「未同意 2名」という件数だけ** です。誰が未同意かは返しません。

```sql
-- 運営者に渡してよいのは件数のみ
create view v_consent_gap with (security_invoker = off) as
  select d.id as policy_document_id,
         (select count(*) from users where retired_at is null)
         - (select count(*) from policy_consents pc where pc.policy_document_id = d.id) as pending
  from policy_documents d;                    -- user_id を持たない
grant select on v_consent_gap to role_mgmt;
```

### 同意（全役割・全画面の前段）

```sql
create policy p12_consent_own on policy_consents for select
  using (user_id = auth.uid() or is_mgmt_of(store_of(user_id)));

create policy p12_consent_insert on policy_consents for insert
  with check (user_id = auth.uid());          -- 代理での同意は作らない
```

同意そのものは例外ではありません。誰がいつ同意したかは本人にも運営者にも見えます。**未同意のセッションには、`policy_consents` と `policy_documents` 以外のテーブルへの権限を与えません** — 画面のリダイレクトだけに頼りません（§6）。

---

## 5. 受け入れ条件

8区分＋2つの追加ルール＋1つの例外、それぞれに **「見えるはず」と「見えないはず」の2本** のテストを置きます。落ちたら実装を止めます。**UIのテストで代替しません。**

```sql
-- 例：02 の「見えないはず」
set local role role_support;
set local request.jwt.claim.sub = '<担当外Supportのuuid>';
select count(*) from consultations where id = '<相談id>';   -- 期待値 0
```

テストに必ず含めるもの：

- 担当外Support（`assignments` にない）
- 期限切れの応援Support（`expires_at < now()`）
- `scope = 'limited'` のSupportが範囲外を引いたとき
- 他店舗のManagement
- 退職者（`retired_at is not null`）のトークン
- 失効済み端末（`devices.revoked_at is not null`）のセッション
- **他店舗のSupport**（`store_access_log` に入室が残っていても、`assignments` が無い）— 記録・Journey・Capability Map・相談とも0件
- **他店舗のSupport**が、その店舗の `assignments` / `capability_params` を**読む**とき（`user_roles` があれば読めてよい）
- **他店舗のSupport**が、その店舗の `assignments` / `capability_params` を**書く**とき（`can_write_in()` が偽なので必ず失敗する）
- **未同意のユーザー**（`policy_consents` に最新版の行がない）— どの役割でも、本体のどのテーブルからも0件
- **在籍者が1人でも未同意のときの `v_support_quality`** — 運営者でも0件。同意率が100%に戻ると返る
- **施行日前の `v_support_quality`** — 周知も同意も済んでいても0件

```sql
-- 例：他店舗ログインの「見えないはず」
-- 河原町店のSupport（池田さん）が四条烏丸店に入室したあと
set local role role_support;
set local request.jwt.claim.sub = '<池田さんのuuid>';
select count(*) from practice_records  where staff_id = '<四条烏丸のStaffのuuid>';  -- 期待値 0
select count(*) from journeys          where staff_id = '<四条烏丸のStaffのuuid>';  -- 期待値 0
select count(*) from capability_values where staff_id = '<四条烏丸のStaffのuuid>';  -- 期待値 0
select count(*) from consultations     where staff_id = '<四条烏丸のStaffのuuid>';  -- 期待値 0
-- 入室そのものは残る
select count(*) from store_access_log
 where user_id = '<池田さんのuuid>' and store_id = '<四条烏丸のuuid>';              -- 期待値 1
```

```sql
-- 例：例外の「見えないはず」（未同意が1名）
set local role role_mgmt;
set local request.jwt.claim.sub = '<運営者のuuid>';
delete from policy_consents where user_id = '<在籍者1名のuuid>';
select count(*) from v_support_quality;                      -- 期待値 0
```

### 他店舗ログインの範囲（2店舗になって初めて試せる経路）

AI,re は河原町店・四条烏丸店の2店舗です。Supportは店舗IDを知っていれば他店舗に入室できますが、**入室と閲覧は別**です。

| 他店舗に入室したSupportが | 見えるか | 根拠 |
| --- | --- | --- |
| その店舗のStaffの Practice記録 | **× 0件** | `p10` は `supports(staff_id)`。`assignments` が無い |
| その店舗のStaffの Journey・Checkpoint | **× 0件** | `p04b` も `supports(staff_id)` |
| その店舗のStaffの Capability Map | **× 0件** | `p09` も `supports(staff_id)` |
| その店舗のStaffの 相談 | **× 0件** | `p02_assigned_support` も同じ |
| その店舗の 育成設計（`assignments`）を**読む** | ○ `user_roles` を持つとき | `p04_education_side` |
| その店舗の 育成設計を**書く** | **× 禁止** | `p04_education_write` → `can_write_in()`。応援で入ったSupportは書けません |
| その店舗の 軸定義を**読む** | ○ | `p05_store_read`。軸の名前は3者共通の設計物 |
| その店舗の 軸定義を**書く** | **× 禁止** | `p05_edu_write` → `can_write_in()`。所属店舗だけ |
| 全体通達 | ○ | `p07`。その店舗に `user_roles` があるとき |

**読めても書けません。** 他店舗ログイン中の書き込みは、育成設計・軸定義とも禁止です。元の店舗のManagementが知らないうちに設計が変わることを防ぐためで、応援は「見て、返答する」までに限ります。

**担当関係を作らないかぎり、他店舗のスタッフの中身は1件も返りません。** 応援に入るときは `assignments` に `kind='temporary'` / `scope='limited'` / `expires_at` 付きで足します。範囲変更は本人に通知され、監査ログにも残ります。

入室自体は `store_access_log` に必ず残り、その店舗と本人の両方の監査ログに出ます。

## 6. RLSでは足りないもの

RLSは「入った後」の話です。入口の制約は別に要ります。

- **役割の併用禁止**（Management＋Staff、Support＋Management）は `check_role_combo()` トリガー（`DATA_MODEL.md`）。
- **端末登録**は認証時のチェック（`PERMISSIONS.md`「端末」）。未登録端末はセッションを発行しません。1人3台まで。
- **他店舗ログイン**は `store_access_log` への記録が成功して初めてセッションを張ります。
- **規定への同意**は、セッションに付与するDBロールで分けます。最新版への同意がないあいだは `role_pending_consent` を割り当て、`policy_documents` / `policy_consents` 以外への `grant` を持たせません。**画面のリダイレクトだけに頼りません** — 未同意のトークンでAPIを直接叩いても、どのテーブルからも0件です。
