# 画像ストレージの設計と監視

Practice記録の before/after 画像は、**消せない資産**です。就業規則 第8条で、退職者の記録も氏名を外して保存し続けます。したがって**古い画像を消して空ける運用は取れません。** ストレージは一方向にしか増えません。

だから監視の目的は「掃除の合図」ではなく、**有料枠へ移る判断を、余裕をもって出すこと**です。

---

## 1. 前提と見積り

| | |
| --- | --- |
| 1記録あたりの画像 | before 最大5枚 ＋ after 最大5枚（`DATA_MODEL.md` `practice_images`） |
| 利用者 | 9名（河原町店5・四条烏丸店4） |
| 再圧縮 | **長辺1600px / JPEG品質80**（必須。既定値） |

| 前提 | 1枚 | 週あたり | 1GB到達 |
| --- | --- | --- | --- |
| 無加工（iPhone のまま） | 約3MB | 約324MB | **約3週間** |
| 再圧縮あり | 約400KB | 約43MB | **約5〜6か月** |

**再圧縮は任意ではありません。** 無加工だと3週間で無料枠が尽きます。

### 再圧縮の実装

クライアント側で canvas に描き直してから上げます。

```js
// 長辺1600px / JPEG q0.80。EXIF は canvas 再エンコードで落ちる
async function shrink(file, maxEdge = 1600, quality = 0.80) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/jpeg', quality });
}
```

**EXIF が落ちるのは副次効果ではなく要件です。** 撮影地のGPSが残ると、モデルの来店場所が記録に残ります。第4条第2項（第三者の写り込みは同意を得る）の趣旨からも、位置情報は持ち込みません。

### クライアントを信用しない

再圧縮はクライアント側の処理なので、失敗もすり抜けもあります。**バケット側でも上限をかけます。**

```
bucket: practice-images
  file_size_limit: 1572864          -- 1.5MB。狙いは400KBなので十分な余裕
  allowed_mime_types: ['image/jpeg', 'image/webp']
```

可視領域と同じ考え方です — クライアントの都合で変わらない場所に置きます。

---

## 2. 使用量の記録

推定ではなく**実測**します。Supabase Storage はオブジェクトのメタデータを `storage.objects` に持つので、実バイト数を合計できます。

```sql
create table storage_usage (
  id           uuid primary key default gen_random_uuid(),
  measured_on  date not null unique,
  bucket       text not null,
  bytes_used   bigint not null,
  object_count int not null,
  quota_bytes  bigint not null,          -- 無料枠なら 1073741824
  created_at   timestamptz default now()
);

create or replace function snapshot_storage_usage() returns void as $$
  insert into storage_usage (measured_on, bucket, bytes_used, object_count, quota_bytes)
  select current_date, 'practice-images',
         coalesce(sum((metadata->>'size')::bigint), 0),
         count(*),
         1073741824
  from storage.objects where bucket_id = 'practice-images'
  on conflict (measured_on) do update
    set bytes_used = excluded.bytes_used, object_count = excluded.object_count;
$$ language sql security definer;

-- 毎日 3:00 JST（営業時間外）
select cron.schedule('storage-snapshot', '0 18 * * *', 'select snapshot_storage_usage()');
```

日次のスナップショットを貯めるのは、**率ではなく増え方**を見るためです。

---

## 3. 通知の条件 — 率ではなく「残り日数」

「85%を超えたら警告」だけでは足りません。9名が10名になれば増加は速くなり、繁忙期にも変わります。**同じ85%でも、残りが3週間のときと3か月のときがあります。**

そこで直近28日の増加ペースから**枯渇予測日**を出し、率と残り日数の**両方**で判定します。

```sql
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
```

### しきい値

| 段階 | 条件（いずれか） | 宛先 | 文面の趣旨 |
| --- | --- | --- | --- |
| **予告** | 70% ／ 残り90日 | 運営者2名 | 有料枠の検討を始める時期です |
| **警告** | 85% ／ 残り30日 | 運営者2名 | 移行の手配をしてください |
| **危険** | 95% ／ 残り10日 | 運営者2名 ＋ **全員** | 画像の保存が近く止まります |

**予告は残り90日**です。第8条で消せない以上、対応は有料枠への移行しかなく、稟議と支払い手続きの時間が要るためです。率だけなら70%はまだ余裕に見えますが、増加が速ければ90日を先に割ります。

**危険（95%）だけ全員に出します。** それより前は運営の判断事項で、現場に知らせても打つ手がありません。95%を超えると保存が止まり、**現場の作業が失われる**ので、そこで初めて全員に知らせます。

```sql
create or replace function check_storage_alert() returns void as $$
declare f record; lvl text;
begin
  select * into f from v_storage_forecast;
  lvl := case
    when f.pct >= 95 or f.days_left <= 10 then 'danger'
    when f.pct >= 85 or f.days_left <= 30 then 'warn'
    when f.pct >= 70 or f.days_left <= 90 then 'notice'
  end;
  if lvl is null then return; end if;
  -- 同じ段階を繰り返し送らない（段階が上がったときだけ）
  if exists (select 1 from storage_alerts where level = lvl
             and created_at > now() - interval '30 days') then return; end if;
  insert into storage_alerts (level, pct, days_left) values (lvl, f.pct, f.days_left);
  -- 受信ボックスへ。danger のみ全員、それ以外は運営者だけ
  insert into inbox_items (user_id, source_kind, source_id)
  select u.id, 'storage_alert', currval('storage_alerts_id_seq')
  from users u where u.retired_at is null
    and (lvl = 'danger' or exists (select 1 from user_roles r
         where r.user_id = u.id and r.role = 'mgmt' and r.active));
end $$ language plpgsql security definer;

select cron.schedule('storage-alert', '5 18 * * *', 'select check_storage_alert()');
```

**同じ段階は30日に1回まで**です。毎日鳴ると読まれなくなり、危険の通知まで無視されます。

通知は `NOTIFICATIONS.md` の営業時間ルールに従います — 時間外・定休日は送らず、次の営業開始まで保留します。

---

## 4. 上限に達したとき

**記録を失わせないことが最優先です。**

1. 画像のアップロードだけが失敗します。**テキストの記録は保存されます**（別テーブルなので独立して成立します）
2. `practice_records.images_pending = true` を立て、記録に「画像は未保存です」と表示します
3. 画面は `SCREENS.md`「保存できないとき」（`6d`）のオフライン・再試行と同じ扱いにします
4. 容量が空いた（＝有料枠へ移った）あと、`images_pending` の記録を一覧して再アップロードできます

**黙って落とさない。** 保存できなかったことが本人に見える形にします。

```sql
alter table practice_records add column images_pending bool default false;
```

---

## 5. 有料枠へ移るとき

無料枠1GBを超えたら Supabase の有料プランへ移ります。**移行で記録は消えません**（同じプロジェクトのプラン変更）。`quota_bytes` を新しい上限に更新すれば、監視はそのまま動きます。

```sql
update storage_usage set quota_bytes = <新しい上限> where measured_on = current_date;
```

判断の材料として、運営者の「設定」に現在の使用量・増加ペース・枯渇予測日を出します（`v_storage_forecast` をそのまま表示）。

---

## 6. 無料枠のもう1つの停止条件

Supabase の無料プロジェクトは**7日間まったくアクセスが無いと一時停止**します。9名が日常的に使うぶんには止まりませんが、**年末年始やお盆で1週間以上休むと停止し、手動での再開が要ります**。長期休業の前に、運営者へ通知する運用にしてください。

無料枠の数値（DB 500MB／ストレージ 1GB／帯域 5GB／7日で停止）は改定されるので、**着手時に現行の料金ページで確認します。**
