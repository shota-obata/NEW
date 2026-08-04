# Cloudflare Pages へのデプロイ

無料プランで**商用利用が許可されている**ため、サロンの業務ツールでも使えます。
静的アセットの帯域制限もありません。

信頼できるサーバ層を持たない構成なので、**可視領域は必然的に RLS が担保します。**
UIで隠す実装が物理的に選べません。

## 1. Pages プロジェクトを作る

Cloudflare ダッシュボード → **Workers & Pages → Create → Pages → Connect to Git**

`shota-obata/NEW` を選び、次のように設定します。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | なし（None） |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Root directory** | **`app`** ← 必須。リポジトリ直下ではありません |

## 2. 環境変数

**Settings → Environment variables** に、Production と Preview の両方へ入れます。

```
VITE_SUPABASE_URL       https://kealuvrsravveuymibna.supabase.co
VITE_SUPABASE_ANON_KEY  sb_publishable_...
```

`anon`（publishable）キーはブラウザのバンドルに必ず入るため、公開前提のものです。
**`service_role` は絶対に入れないでください。** RLS を丸ごとバイパスします。

## 3. Edge Function の CORS

Supabase の Edge Functions に、配信元を教えます。

**Supabase Dashboard → Edge Functions → Secrets**

```
APP_ORIGIN = https://<プロジェクト名>.pages.dev
```

入れないと `*` になります（動きはしますが、絞れるなら絞ります）。

## 4. ホーム画面へ追加

iPhone の Safari で開き、共有ボタン → 「ホーム画面に追加」。
`display: standalone` なので、ブラウザのバーが消えて通常のアプリのように開きます。

## セキュリティヘッダ

`app/public/_headers` で配信時に付きます。

- `Content-Security-Policy` — 接続先を Supabase に限定。`frame-ancestors 'none'` で埋め込み禁止
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer` — 遷移先に URL を渡さない
- `Permissions-Policy` — カメラは自オリジンのみ（before/after の撮影に要る）、位置情報は禁止

位置情報を切っているのは、画像から EXIF を落とす方針と揃えるためです
（`STORAGE.md`）。モデルさんの来店場所を記録に残しません。
