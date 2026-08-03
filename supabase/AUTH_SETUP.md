# 認証のセットアップ手順（フェーズ3）

RLS は全編 `auth.uid() = users.id` で書いてあります。`auth.uid()` が返すのは
Supabase Auth 側のIDなので、**`users.id` をそれに揃えないと、誰でサインインしても
1行も見えません。** そのために `users` を一度入れ直します。

実データはまだ入っていないので、失うのは9行の名簿と担当5件だけです。

---

## 0. 前提

- `0001`〜`0011` が適用済み
- Supabase CLI が入っていて `supabase link` 済み
- Dashboard → Edge Functions → Secrets に **`SUPABASE_SERVICE_ROLE_KEY`** を登録済み

`SUPABASE_URL` と `SUPABASE_ANON_KEY` は Edge Function の実行環境に最初から入っています。

---

## 1. マイグレーションを流す

SQL Editor で順に実行します。

```
0012_auth_link.sql     Auth用の秘密の置き場、本人向けの状態ビュー
0013_device_grant.sql  登録コードの発行・引き換え、サインインの照合
```

`0012` は `credentials` の SELECT 権限を `authenticated` から剥奪します。
読めてしまうと Auth に直接サインインでき、**端末とPINの関門を迂回**できるためです。
本人が自分の状態（仮PINか、ロック中か）を知るための `v_my_credential_state` だけ残します。

---

## 2. Auth ユーザーを作り、users を入れ直す

```bash
cd <このフォルダ>
npm i @supabase/supabase-js

SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role の値> \
node provision.mjs
```

やること:

1. 同じメールの既存 Auth ユーザーがあれば削除
2. `users` を削除（`user_roles` / `assignments` は cascade で落ちる）
3. Auth ユーザーを9人作成（メールは `kw-01@ai-re.invalid` 形式。**実在しないドメイン**）
4. 返ってきたIDで `users` を作成 → 役割10行 → 主担当5件
5. `credentials` に Auth用の秘密（48バイトのランダム）と**仮PIN**を登録

### ⚠ 出力の扱い

最後に仮PINの一覧が出ます。**運営者が本人確認のうえ手渡すためのもの**です。

- チャットにも、メールにも、チャットツールにも貼らないでください
- 手渡したら端末から消してください
- 本人は初回ログインで必ず変更します（変更するまで本体に入れません）

---

## 3. 確認

```sql
-- users.id と auth.users.id が揃っているか（9行とも true になるはず）
select u.person_code, u.display_name, (a.id is not null) as auth_linked
from users u left join auth.users a on a.id = u.id
order by u.person_code;
```

そのあと **`0007_rls_tests.sql` をもう一度**回してください。
IDが変わったので、テストが引き続き通ることを確かめます。

---

## 4. Edge Function をデプロイ

```bash
supabase functions deploy auth-login
supabase functions deploy auth-register-device
supabase functions deploy auth-change-pin
```

`functions/` の中身を、プロジェクトの `supabase/functions/` に置いてから実行してください。

---

## 流れの全体像

```
運営者が本人確認 → 登録コード（6桁・15分・1回限り）と仮PINを手渡し
        ↓
[auth-register-device]  コードを引き換えて端末トークンを受け取る（端末内に保存）
        ↓
[auth-login]  端末トークン ＋ 個人ID ＋ 仮PIN（＋店舗ID、Managementは Management ID）
        ↓            5回失敗で15分ロック。解除は運営者のみ
        ↓  next = 'change_pin'
[auth-change-pin]  現在のPINを照合したうえで変更。連番・ゾロ目は弾く
        ↓  next = 'consent'
規定への同意（画面。フェーズ5）
        ↓  next = 'ok'
本体
```

**PINが通らないかぎりセッションは発行されません。** Auth のパスワードはサーバだけが
知る文字列で、外から入力する経路そのものがありません。

### 応答について

失敗の理由は返しません。**個人IDの存在も、端末の登録有無も、PINの正誤も、
応答からは区別できません。** 例外は2つだけです。

- `locked` — 本人が「15分待つか運営者に頼むか」を判断する必要がある
- `device_limit` — 運営者に既存端末の失効を頼む必要がある

総当たりを鈍らせるため、失敗時は 400ms 待ってから返します。
