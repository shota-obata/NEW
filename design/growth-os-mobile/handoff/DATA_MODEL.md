# データモデル

Postgres想定（Supabase）。命名はsnake_case。すべてのテーブルに `created_at` / `updated_at`。

## 組織と人

```
stores
  id             uuid pk
  store_code     text unique     -- 画面上の「店舗ID」。KW-001 / SK-002
  name           text            -- 河原町店 / 四条烏丸店
  business_hours jsonb           -- 下記「営業時間（AI,re 確定値）」参照。定休日は null
  timezone       text            -- 'Asia/Tokyo'

users
  id            uuid pk
  person_code   text unique      -- 画面上の「個人ID」。会社が発番。本人には決めさせない
  display_name  text
  retired_at    timestamptz null -- 退職日。null=在籍
  birth_date            date null -- 本人のみ編集可。生の値は他者に返さない
  experience_started_on date null -- 美容師としての経験開始日（入社日ではない）
  show_age              bool      -- 年齢を他者に見せるか。既定 false

user_roles                       -- 1人が複数役割を持てる（制約あり）
  id            uuid pk
  user_id       uuid fk users
  store_id      uuid fk stores
  role          text             -- 'staff' | 'support' | 'mgmt'
  membership    text             -- 'member'（所属） | 'visiting'（応援での入室）
  mgmt_code     text null        -- role='mgmt' のときのみ。例 MG-7714
  active        bool
  unique (user_id, store_id, role)

devices                          -- 端末登録（PIN単独運用を避けるため必須）
  id            uuid pk
  user_id       uuid fk users
  device_token  text unique
  label         text             -- 画面上の端末名。例「黒坂さんの iPhone」
  device_kind   text             -- 'personal' | 'shared'（共有端末では「裏」を返さない）
  fingerprint   text             -- 機種・OS・鍵の指紋。変わったら再登録
  registered_at timestamptz
  last_seen_at  timestamptz
  revoked_at    timestamptz null
  revoked_by    uuid null fk users
  revoke_reason text null        -- 失効時は必須

device_grants                    -- 登録コード（Managementが発行）
  id            uuid pk
  store_id      uuid fk stores
  target_user_id uuid fk users
  code_hash     text             -- 6桁のハッシュ。平文保存は不可
  issued_by     uuid fk users
  expires_at    timestamptz      -- 発行 + 15分
  used_at       timestamptz null -- 1回限り

credentials
  user_id       uuid pk fk users
  pin_hash      text             -- 4桁PINのハッシュ（bcrypt等）。平文保存は不可
  failed_count  int              -- 5回で locked_until を立てる。人単位（端末単位ではない）
  locked_until  timestamptz null -- 失敗時 + 15分
  unlocked_by   uuid null fk users -- 15分を待たず解除できるのは運営者のみ
```

### 組織の実データ（AI,re 確定値）

| 店舗 | 店舗ID | Management | Support | Staff | 計 |
| --- | --- | --- | --- | --- | --- |
| 河原町店 | `KW-001` | 1 | 2 | 2 | 5名 |
| 四条烏丸店 | `SK-002` | 1 | 1 | 2 | 4名 |
| **全社** | | **2** | **3** | **4** | **9名** |

**役割の行数は10、人数は9です。** 小畑（`KW-02`）が Support と Staff を兼ねるため、`user_roles` は10行になります。**同意の分母は `users` の実人数（9）** で、役割の数ではありません。宛先の表示も「全社9名」を使い、役割ごとの合計は出しません（兼務が二重に数えられるため）。

- **両店とも常時10人未満**のため、就業規則の労基署への届出は不要（書面の交付により周知）。
- 営業時間は両店とも同じ（下記「営業時間（AI,re 確定値）」）。
- **人数は `users` の実人数で数えます。** SupportはStaffを兼ねられるので `user_roles` は9行より多くなりますが、**同意の分母は9**です。ManagementはStaffを兼ねられないので2名のまま（`check_role_combo()`）。
- 全体通達の宛先表示は **「全社9名」**（必要なら「全社9名（2店舗）」）。**役割単位の合計は使いません** — 小畑さんの兼務で Staff が4名にも5名にも見え、二重に数えることになるためです。

**認証の順序**：`devices` の照合 → `user_roles` の確認 → PINの照合 → **最新版の規定への同意**の確認。他店舗にサインインしたときは `store_access_log` への記録が成功してからセッションを張り、その店舗IDをセッション変数（`app.store_id`）に入れます。**`membership='visiting'` のセッションでは、育成設計と軸定義に書き込めません**（読みは可。`RLS.md` `can_write_in()`）。未登録・失効済みの端末ではセッションを発行せず、PINの入力欄も出しません（画面 `12a`）。試行は端末単位でも記録します（未登録端末からの試行も `audit_log` に残る）。

**運用細目（就業規則 第7条。数字は条文ではなく別紙で定める）**

| 項目 | 値 | 実装 |
| --- | --- | --- |
| 1人あたりの端末数 | **3台** | `device_grants` 発行時に `count(devices where revoked_at is null) < 3` を検査。4台目は発行不可。超える場合は運営者が既存を失効させる（理由必須） |
| PINの失敗 | **5回で15分ロック** | `credentials.failed_count` / `locked_until`。人単位で数える。**15分を待たない解除は運営者のみ**（本人の自己解除は作らない）。ロックと解除は `audit_log` に残り、本人にも届く |
| 共有端末の自動サインアウト | **無操作3分** | `device_kind = 'shared'` のセッション。サインアウトで端末内データを消す。書きかけの記録は下書きとしてサーバに残す（入力中のものを失わせない） |

### 役割の制約（DBレベルで担保する）

```sql
-- Management と Staff の併用を禁止
-- Support と Management の併用を禁止
create or replace function check_role_combo() returns trigger as $$
begin
  if exists (select 1 from user_roles where user_id = new.user_id and active
             and ((new.role='mgmt'    and role in ('staff','support'))
               or (new.role='staff'   and role = 'mgmt')
               or (new.role='support' and role = 'mgmt'))) then
    raise exception 'この役割の組み合わせは登録できません';
  end if;
  return new;
end $$ language plpgsql;
```

Support ＋ Staff の併用のみ許可。Supportは店舗IDを知っていれば複数店舗の `user_roles` を持てる（他店舗ログインは `store_access_log` に記録）。

## パーソナルスペース（区分01）

```
personal_notes
  id, user_id fk users
  visibility text            -- 'surface'（表） | 'private'（裏）
  body       text

personal_note_shares         -- 開示先。「表」だけが持てる
  id, note_id fk, shared_with fk users, shared_at
  unique (note_id, shared_with)
```

- **「裏」に開示先を作れないことはトリガーで担保**します。画面に開示ボタンを置かないだけでは、APIを直接叩けば作れてしまうためです。
- 「表」→「裏」に変えたとき、既存の開示先を**必ず消します**（残っていると、裏にしたのに見えている人がいる状態になる）。
- **共有端末では `private` の行を返しません**。サインイン時に `devices.device_kind` をセッション変数へ入れ、`current_device_kind()` で判定します（`app.store_id` と同じ仕組み）。
- Support・Management には**存在も件数も返しません**。

## 担当関係

```
assignments
  id            uuid pk
  staff_id      uuid fk users
  support_id    uuid fk users
  store_id      uuid fk stores
  kind          text             -- 'primary'（主担当） | 'temporary'（応援）
  scope         text             -- 'full' | 'limited'
  scope_note    text null        -- 例 「CP3のEvidenceのみ」
  expires_at    timestamptz null -- 応援の期限
  active        bool

assignment_changes               -- 双方同意で成立する変更
  id            uuid pk
  assignment_id uuid fk
  proposed_by   uuid fk users
  reason        text
  mgmt_agreed   bool
  support_agreed bool
  settled_at    timestamptz null -- 両方trueで成立
```

## 育成の骨格

```
journeys                         -- Staff 1人につき1本
  id, staff_id, vision text, current_position text

checkpoints
  id            uuid pk
  journey_id    uuid fk
  code          text             -- CP1, CP2, CP3
  title         text
  required_evidence int          -- 必要Evidence件数（例3）
  conditions    jsonb            -- 条件定義（例 骨格タイプ2種以上）
  os_passed_at  timestamptz null -- 1段目：Growth OSの判断
  support_decided_by uuid null   -- 2段目：Supportの判断
  support_decided_at timestamptz null
  support_note  text null        -- 本人に見えるひとこと
  status        text             -- 'open' | 'os_passed' | 'reached' | 'held'

checkpoint_holds                 -- 「まだ早い」の置き場（Staff側に残る）
  id, checkpoint_id, held_by, reason text, add_what text, created_at
  resolved_at   timestamptz null
```

**到達の判定**：`os_passed_at is not null AND support_decided_at is not null` のときのみ `reached`。片方だけは `held`（保留）で本人にも見え、どちらが欠けているかも見せる。保留の回数はどこにも集計表示しない。

## Practice記録

```
practice_records
  id            uuid pk
  staff_id      uuid fk users
  recorded_on   date
  title         text
  question      text             -- 今回の問い
  fact          text             -- 起きたこと（事実）
  misjudgement  text             -- ズレた判断
  reflection    text             -- 反省
  next_gain     text             -- 次回への経験値の貯め方
  shared_at     timestamptz null -- Support/Mapへの共有時刻
  salon_shared  bool             -- サロン（スタッフ間）に出すか
  images_pending bool default false -- ストレージ上限で画像だけ保存できなかった
  instructed_by uuid null fk users -- 実務上そのレッスンを見た人（Managementが入ることがある）
  -- ⚠ instructed_by は「誰が見たか」の記録であって権限ではない。
  --    可視領域は assignments のみで決まる。RLSの条件に使ってはならない。
  anonymized    bool             -- 退職時に true → 表示名は Other
  deleted_at    timestamptz null

practice_images
  id, record_id, kind text ('before'|'after'), storage_path, sort_order
  -- kindごとに最大5枚。アプリ側とDB側の両方で制限する
  -- 保存前に長辺1600px / JPEG品質80へ再圧縮（必須）。EXIF は再エンコードで落とす
  -- バケット側でも file_size_limit 1.5MB をかける（`STORAGE.md`）

record_views                     -- 既読（誰が・いつ）
  id, record_id, viewer_id, viewed_at
  -- 本人・Support・Management すべて記録し、本人に開示する

evidence
  id, record_id, checkpoint_id, name text, accepted_at
```

## 相談と通達

```
consultations                    -- Staff → Support
  id, staff_id, support_id, title, body, created_at
  replied_at timestamptz null
  reply_body text null           -- Supportの返答（Managementの「閲覧」対象）

mgmt_consultations               -- Staff → Management（Supportへの不満など。Supportに非表示）
  id, staff_id, body, created_at

notices                          -- 通達3系統
  id            uuid pk
  kind          text             -- 'support_to_mgmt' | 'mgmt_to_all' | 'mgmt_to_support'
  from_user_id  uuid fk users
  store_id      uuid fk stores
  category      text             -- シフト・時間 / 担当関係 / Checkpointの設計 / 設備・材料 / その他
  title, body   text
  subject_user_id uuid null      -- 任意。入れると本人にも見える
  attached_metrics jsonb null    -- 個別通達に添える数字のみ（返答文の引用は不可）
  created_at

inbox_items                      -- 受信ボックス（全件保存）
  id            uuid pk
  user_id       uuid fk users
  source_kind   text             -- 'notice' | 'os_suggestion' | 'nudge' | 'agreement_request' | 'policy_update' | 'storage_alert'
  source_id     uuid
  read_at       timestamptz null
  deleted_at    timestamptz null -- 消去（任意）
  purge_at      timestamptz null -- deleted_at + 30日。バッチで物理削除
  deliver_after timestamptz null -- 営業時間外に発生したものは翌営業時間の開始時刻
```

### 営業時間（AI,re 確定値）

```json
{
  "mon": ["11:00", "20:00"],
  "tue": null,
  "wed": ["11:00", "20:00"],
  "thu": ["11:00", "20:00"],
  "fri": ["11:00", "20:00"],
  "sat": ["10:00", "19:00"],
  "sun": ["10:00", "19:00"]
}
```

- **火曜は定休日**（`null`）。プッシュ・催促は送らない。
- 火曜のモデル練習は**本人の希望がある場合のみ**。記録は作成できるが、`required_pace` の分母に数えない。会社が求めるものではない旨をUIに明記する（`14c` に記載）。**Growth OSが定休日の練習を提案・催促することも禁止。**
- 週休2日。休みの曜日は個人が決めるため、`business_hours` は**店舗の営業日であって個人の勤務日ではない**。個人のシフトは別テーブル（将来）。現段階では店舗の営業時間のみで判定する。
- 判定は必ずサーバー側（`stores.timezone` 基準）。端末の時計は使わない。
- `inbox_items.deliver_after` に次の営業開始時刻を入れ、時間外に発生した通知はそこまで保留する。**火曜に発生したものは水曜 11:00。**

挙動の一覧（就業規則 第2条第3項）：

| 対象 | 営業時間内 | 時間外 | 定休日（火） |
| --- | --- | --- | --- |
| プッシュ通知 | 送る | **送らない** | **送らない** |
| 催促（`nudge`） | 送る | **送らない** | **送らない** |
| Growth OSの練習提案 | 送る | 翌営業時間に回す | **出さない**（定休日の練習は提案・催促しない） |
| 受信ボックスへの保存 | 保存する | 保存する | 保存する（消えるわけではない） |
| 記録の作成・編集 | できる | **できる**。1行出す：「時間外の入力は義務ではありません」 | **できる**。1行出す：「定休日・本人希望・必要ペースには数えない」 |
| `required_pace` の分母 | 数える | 数える | **数えない** |

画面は `13d`（3状態を切り替え）、`14c`（登録）。

### 練習枠の設計

必要ペースが不足する場合に開ける枠は**営業日の営業時間内**から出す（例：月曜 11:00–12:00）。**火曜を練習枠として通達してはならない** — 定休日に出勤を促す形になるため。モックの文面もすべて月曜に統一済み。

## Capability Map

```
capability_axes                  -- 2軸（拡張可）
  id, store_id, code text ('area'|'step'), label text

capability_params
  id            uuid pk
  axis_id       uuid fk
  parent_id     uuid null        -- サブ項目（誠実さ→接客）
  name          text             -- Support/Managementが変更可
  sources       text[]           -- 'model_count'|'lesson_count'|'support_input'|'practice_record'|'checkpoint'|'avg_response'
  sort_order    int
  hidden_at     timestamptz null -- 非表示（削除ではない。過去の記録は消さない）

capability_values                -- 月次スナップショット＋現在値
  id, staff_id, param_id, value int (0-100), status text, snapshot_month date
  source     text                -- 'computed' | 'initial_estimate'
  entered_by uuid null fk users  -- 初期値を入れた人（Management / Support）
  entered_at timestamptz null
  basis      text null           -- 初期値の根拠。10字以上必須
```

**導入時の初期値**：年の途中から始めるため、既に経験のあるスタッフを0から始めません。Management と Support が初期値を入れられます（**本人は入力できません**）。`source = 'initial_estimate'` と入力者・入力日・根拠を必ず残し、本人の画面では自動算出と区別して「導入時の初期値です」と出します。**初期値のまま3か月動かない項目は「未検証」**として扱います（保存せず `v_capability_current.effective_status` で導出）。

```

capability_param_changes         -- 名称・ソース変更の監査
  id, param_id, changed_by, before jsonb, after jsonb, changed_at
```

### 初期パラメーター（ユーザー確定）

**能力領域**：シャンプー / ブロー / 縮毛矯正 / 骨格の観察 / カットの設計 / カラー / 接客（→誠実さ・明るさ）/ 似合わせ（→提案・独自性）

**判断工程**：現在地の把握 / 問いの設定 / 条件の設計 / 事実の観察 / 判断の修正 / 応用 / 転用

いずれも後から追加可（名称＋ソースを指定）。ソースが空の項目は数値が動かない。

### 算出

- 各パラメーターの値は、紐づくソースの寄与を合成した0–100。点数ではなく「根拠の接続度」として扱う（UIでも点数と呼ばない）。
- `practice_records.misjudgement` の内容から判断工程へ、`title`/`question` から能力領域へ紐づける（初期は共有時にStaffが確認、将来は分類の自動化）。
- 状態は `接続済み`（概ね70以上かつEvidence充足）／`検証中`／`未接続`（根拠2件未満）。

### 平均レスポンス →「誠実さ」

```
avg_response_days(user, window=30d)
  = mean(reply_at - asked_at)   -- Staffの場合はSupportからの問いへの返信、Supportの場合は相談への返答
```

基準はサロン平均 **1.0日**（店舗設定で変更可）。

```
sincerity_from_response = clamp(0, 70, round(70 * (1.0 / max(avg_days, 0.25)) / 2))
-- 0.6日 → 約58〜74の範囲に入る。早いほど上がるが、速さだけでは70%を超えない
```

残り30%は `support_input`（Supportの入力）から。速さだけで満点にならないことをUIにも明記済み。

## ストレージ

```
storage_usage                    -- 日次スナップショット（推定ではなく実測）
  id, measured_on date unique, bucket text,
  bytes_used bigint, object_count int, quota_bytes bigint

storage_alerts                   -- 段階が上がったときだけ1件
  id, level text ('notice'|'warn'|'danger'), pct numeric, days_left int, created_at
```

画像は**消せません**（第8条で退職後も残す）。監視の目的は掃除ではなく、**有料枠へ移る判断を余裕をもって出すこと**です。率だけでなく直近28日の増加ペースから**枯渇予測日**を出し、両方でしきい値を判定します。詳細は **`STORAGE.md`**。

## 監査ログ

```
audit_log
  id, actor_id, action text, target_type text, target_id uuid,
  reason text null,              -- 権限変更・削除では必須（50字以上）
  visible_to_subject bool default true,
  created_at

store_access_log                 -- Supportの他店舗ログイン
  id, user_id, store_id, at
```

```
policy_documents                 -- 規定の版と、例外を開けるためのゲート
  id             uuid pk
  clause         text unique     -- 'work_rules_art6'
  version        text            -- '第2版'
  revised_at     date            -- 2026-07-28
  effective_from date            -- 附則の施行日。AI,re は 2026-08-10
  announced_at   timestamptz null -- 周知が済むまで null
  announced_by   uuid fk users
  notice_id      uuid fk notices  -- 周知に使った全体通達（必須）
  revoked_at     timestamptz null -- 停止の求めに応じたとき

policy_consents                  -- 従業員側の同意（新規テーブルはこれだけ）
  id                  uuid pk
  user_id             uuid fk users
  policy_document_id  uuid fk policy_documents
  consented_at        timestamptz
  device_token        text       -- どの端末で同意したか
  unique (user_id, policy_document_id)
```

**同意**：最新版に対する `policy_consents` の行がないユーザーは、ログイン後のガードで `/consent` に入ります。**同意しないと本体に入れません。** 担保は画面ではなくセッションのDBロールです（`RLS.md` §6）。版が上がったら受信ボックスに1件（`source_kind = 'policy_update'`）＋次回ログインで再同意。

**例外**：運営者の「閲覧」画面（指導者→従業員の返答内容・返答日数）でのアクセスは `audit_log` に記録しない、または `visible_to_subject = false` で本人・指導者のどちらにも出さない。根拠は **就業規則 第6条第3項**（第5条第1項の開示対象から除外）。

この例外が開くのは、次の**3つが全部揃ったときだけ**です（`policy_gate_open()` ／ `RLS.md` §4 ／ `POLICY_INTERNAL_RULES.md`）。

1. `announced_at is not null` かつ `notice_id is not null` — 周知した
2. `policy_consents` の件数 ＝ 在籍者数（`retired_at is null`）— **1人でも未同意なら開かない**
3. `effective_from <= current_date` — 施行日を過ぎた

運営者の画面に返すのは「未同意 2名」という件数のみ（`v_consent_gap`）。**誰が未同意かは返しません。**

## 行レベルセキュリティ

可視領域8区分のポリシー定義は **`RLS.md`**。UIでの出し分けは採用しない。

## 退職・削除

```
deletion_requests
  id, target_user_id, requested_by, reason text,   -- 50字以上必須
  mgmt_agreed_count int, support_agreed_count int,
  hold_until timestamptz,                          -- 申請 + 24時間
  cancelled_at, executed_at
```

- 既定（`delPolicy = keep`）：`practice_records` は `anonymized = true` にして残す（表示名 `Other`、staff_idはリンクを切る）。画像も残す。`journeys` / `capability_values` / `consultations` は削除。
- `ask`：退職30日前に本人へ確認を通知。
- `del`：Management ＋ Support の双方同意＋24時間保留＋理由必須。保留中は誰でも取り消せる。実行後は復元しない。
- 匿名化した記録から本人をたどる導線は作らない（逆引きテーブルを残さない）。
