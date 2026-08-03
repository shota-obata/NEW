-- 適用できたかの点検。SQL Editor に貼って実行し、結果をそのまま送ってください。
-- 秘密の値は一切含みません（件数と有無だけ）。

select * from (values
  ('テーブル数',
   '30',
   (select count(*)::text from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE')),

  ('店舗',            '2',  (select count(*)::text from stores)),
  ('人（users）',      '9',  (select count(*)::text from users)),
  ('役割（user_roles）','10', (select count(*)::text from user_roles)),
  ('主担当',           '5',  (select count(*)::text from assignments)),
  ('Capability 軸',    '4',  (select count(*)::text from capability_axes)),
  ('Capability 項目',  '38', (select count(*)::text from capability_params)),
  -- 19項目 × 2店舗。軸が店舗ごとなので項目も店舗ごとに持つ（各店が独立に改名・追加できる）
  ('規定',             '1',  (select count(*)::text from policy_documents)),

  ('施行日',
   '2026-08-10',
   (select coalesce(max(effective_from)::text,'なし') from policy_documents)),

  ('小畑の兼務（Support+Staff）',
   '2',
   (select count(*)::text from user_roles r join users u on u.id=r.user_id
    where u.person_code='KW-02')),

  ('小畑の担当Support（RIHO）',
   'KW-03',
   (select coalesce(max(sp.person_code),'なし') from assignments a
    join users st on st.id=a.staff_id join users sp on sp.id=a.support_id
    where st.person_code='KW-02')),

  -- 0004 が当たっているか
  ('instructed_by 列',
   'あり',
   (select case when count(*)>0 then 'あり' else 'なし' end
    from information_schema.columns
    where table_name='practice_records' and column_name='instructed_by')),

  ('users の追加3列',
   '3',
   (select count(*)::text from information_schema.columns
    where table_name='users'
      and column_name in ('birth_date','experience_started_on','show_age'))),

  ('capability_values の追加4列',
   '4',
   (select count(*)::text from information_schema.columns
    where table_name='capability_values'
      and column_name in ('source','entered_by','entered_at','basis'))),

  -- ビューと関数
  ('ビュー',
   '5',
   (select count(*)::text from information_schema.views
    where table_schema='public' and table_name in
      ('v_user_public','v_user_profile','v_capability_current',
       'v_storage_forecast','v_consent_gap'))),

  ('関数（主要）',
   '8',
   (select count(*)::text from information_schema.routines
    where routine_schema='public' and routine_name in
      ('policy_gate_open','can_write_in','has_role_in','is_member_of',
       'is_open_now','next_open_at','login_gate','check_storage_alert'))),

  ('トリガー',
   '20',   -- information_schema は「insert or update」を2行で数える
   (select count(*)::text from information_schema.triggers
    where trigger_schema='public'))
) as t(項目, 期待, 実際);
