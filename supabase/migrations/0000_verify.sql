-- Growth OS Mobile — 適用後の点検（v2）
--
-- v1 は総数（テーブル30、ビュー6…）を期待値に書いていたが、
-- migration が増えるたびに古くなり、実害の無い不一致が並ぶだけになった。
--
-- v2 は「意味のある不変条件」だけを判定し、総数は参考値として出す。
-- 秘密の値は一切含まない（件数と真偽だけ）。

select * from (values

  -- ============ 実データ（ここがずれていたら本当の問題） ============
  ('人（users）',              '9',  (select count(*)::text from users)),
  ('役割（user_roles）',       '10', (select count(*)::text from user_roles)),
  ('主担当（assignments）',    '5',  (select count(*)::text from assignments)),
  ('資格情報（credentials）',  '9',  (select count(*)::text from credentials)),
  ('店舗',                     '2',  (select count(*)::text from stores)),
  ('Capability 項目',          '38', (select count(*)::text from capability_params)),
  ('規定',                     '1',  (select count(*)::text from policy_documents)),
  ('施行日', '2026-08-10',
   (select coalesce(max(effective_from)::text,'なし') from policy_documents)),

  -- ============ 認証の土台 ============
  ('Auth ユーザー',            '9',
   (select count(*)::text from auth.users)),
  ('users.id が Auth と一致',  '9',
   (select count(*)::text from users u join auth.users a on a.id = u.id)),
  ('仮PINのまま（未変更）',    '9',
   (select count(*)::text from credentials where must_change_pin)),
  ('Auth用の秘密あり',         '9',
   (select count(*)::text from credentials where auth_secret is not null)),

  -- ============ 組織の形 ============
  ('小畑の兼務（Support+Staff）', '2',
   (select count(*)::text from user_roles r join users u on u.id=r.user_id
     where u.person_code='KW-02')),
  ('小畑の担当Support',        'KW-03',
   (select coalesce(max(sp.person_code),'なし') from assignments a
     join users st on st.id=a.staff_id join users sp on sp.id=a.support_id
     where st.person_code='KW-02')),
  ('Management の兼務違反',    '0',
   (select count(*)::text from user_roles m
     where m.role='mgmt' and m.active
       and exists (select 1 from user_roles o
                   where o.user_id=m.user_id and o.active and o.role<>'mgmt'))),

  -- ============ 可視領域の土台（ここが崩れると全部崩れる） ============
  ('RLS 未有効のテーブル',     '0',
   (select count(*)::text from pg_tables t
     where t.schemaname='public'
       and not exists (select 1 from pg_class c
                       join pg_namespace n on n.oid=c.relnamespace
                       where n.nspname='public' and c.relname=t.tablename
                         and c.relrowsecurity))),
  ('FORCE 未設定のテーブル',   '0',
   (select count(*)::text from pg_tables t
     where t.schemaname='public'
       and not exists (select 1 from pg_class c
                       join pg_namespace n on n.oid=c.relnamespace
                       where n.nspname='public' and c.relname=t.tablename
                         and c.relforcerowsecurity))),
  ('ポリシー0本のテーブル',    '0',
   (select count(*)::text from pg_tables t
     where t.schemaname='public'
       and not exists (select 1 from pg_policies p
                       where p.schemaname='public' and p.tablename=t.tablename))),

  -- ============ 禁止事項（ポリシーに現れてはいけない列） ============
  ('instructed_by がポリシーに出現',        '0',
   (select count(*)::text from pg_policies
     where schemaname='public'
       and (coalesce(qual,'')||coalesce(with_check,'')) like '%instructed_by%')),
  ('experience_started_on がポリシーに出現','0',
   (select count(*)::text from pg_policies
     where schemaname='public'
       and (coalesce(qual,'')||coalesce(with_check,'')) like '%experience_started_on%')),

  -- ============ 例外のゲート（まだ開いていないはず） ============
  ('「閲覧」が開いているか',   'false',
   (select policy_gate_open('work_rules_art6')::text)),

  -- ============ 定期実行 ============
  ('cron ジョブ',              '4',
   (select count(*)::text from cron.job)),

  -- ============ 参考値（期待値は置かない。増えて当然） ============
  ('（参考）テーブル数',       '—',
   (select count(*)::text from pg_tables where schemaname='public')),
  ('（参考）ビュー数',         '—',
   (select count(*)::text from pg_views where schemaname='public')),
  ('（参考）ポリシー数',       '—',
   (select count(*)::text from pg_policies where schemaname='public'))

) as t(項目, 期待, 実際);
