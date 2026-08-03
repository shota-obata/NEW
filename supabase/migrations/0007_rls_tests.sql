-- Growth OS Mobile — RLS の受け入れテスト
--
-- 各区分に「見えるはず」と「見えないはず」を2本ずつ置く。
-- 落ちたら実装を止める。UIのテストでは代替しない。
--
-- 使い方: SQL Editor にこのまま貼って実行。
--   すべて通れば「RLS OK」の1行だけが返る。
--   落ちるとその場で例外になり、どの主張が破れたか分かる。
--
-- ロールバックするので、データは変わらない。

do $$
declare
  kw01 uuid; kw02 uuid; kw03 uuid; kw04 uuid; kw05 uuid;
  sk01 uuid; sk02 uuid; sk03 uuid;
  s_kw uuid; s_sk uuid;
  n int; ok int := 0;
begin
  select id into kw01 from users where person_code='KW-01';   -- 田邊（Mgmt 河原町）
  select id into kw02 from users where person_code='KW-02';   -- 小畑（Support+Staff）
  select id into kw03 from users where person_code='KW-03';   -- RIHO（Support）
  select id into kw04 from users where person_code='KW-04';   -- 黒坂（Staff）
  select id into kw05 from users where person_code='KW-05';   -- 藤田（Staff）
  select id into sk01 from users where person_code='SK-01';   -- 大谷（Mgmt 四条烏丸）
  select id into sk02 from users where person_code='SK-02';   -- 殿（Support）
  select id into sk03 from users where person_code='SK-03';   -- 高島（Staff）
  select id into s_kw from stores where store_code='KW-001';
  select id into s_sk from stores where store_code='SK-002';

  -- テスト用に、全員を「PIN変更済み・同意済み」にする（このトランザクション内だけ）
  insert into credentials (user_id, pin_hash, must_change_pin, pin_set_at)
  select id, 'x', false, now() from users
  on conflict (user_id) do update set must_change_pin = false, pin_set_at = now();

  insert into policy_consents (user_id, policy_document_id, device_token)
  select u.id, d.id, 'test'
  from users u cross join policy_documents d where d.clause='work_rules_art6'
  on conflict do nothing;

  -- ============================================================
  -- 準備: セッションを切り替えるためのマクロ代わり
  -- ============================================================
  -- perform set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true)
  -- perform set_config('app.store_id',   <uuid>::text, true)
  -- perform set_config('app.device_kind','personal',  true)

  -- ============================================================
  -- 区分01 パーソナルスペース
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw04)::text, true);
  perform set_config('app.store_id', s_kw::text, true);
  perform set_config('app.device_kind', 'personal', true);

  insert into personal_notes (user_id, visibility, body)
  values (kw04, 'private', '裏のメモ'), (kw04, 'surface', '表のメモ');

  select count(*) into n from personal_notes;
  if n <> 2 then raise exception '01 本人は自分の表裏を見えるはず: %', n; end if;
  ok := ok + 1;

  -- 共有端末では「裏」を返さない
  perform set_config('app.device_kind', 'shared', true);
  select count(*) into n from personal_notes where visibility='private';
  if n <> 0 then raise exception '01 共有端末で裏が見えてはいけない: %', n; end if;
  ok := ok + 1;
  perform set_config('app.device_kind', 'personal', true);

  -- 担当Support（RIHO は小畑の担当。黒坂の担当は小畑）からは見えない
  perform set_config('request.jwt.claims', json_build_object('sub', kw02)::text, true);
  select count(*) into n from personal_notes;
  if n <> 0 then raise exception '01 担当Supportに個人領域が見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- Management からも見えない
  perform set_config('request.jwt.claims', json_build_object('sub', kw01)::text, true);
  select count(*) into n from personal_notes;
  if n <> 0 then raise exception '01 Managementに個人領域が見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- ============================================================
  -- 区分02 相談と返答
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw04)::text, true);
  insert into consultations (staff_id, support_id, title, body, step_tag)
  values (kw04, kw02, 'カットの基準点', '本文', '問いの設定');

  select count(*) into n from consultations;
  if n <> 1 then raise exception '02 本人は自分の相談が見えるはず: %', n; end if;
  ok := ok + 1;

  -- 担当Support（小畑）は見える
  perform set_config('request.jwt.claims', json_build_object('sub', kw02)::text, true);
  select count(*) into n from consultations;
  if n <> 1 then raise exception '02 担当Supportは見えるはず: %', n; end if;
  ok := ok + 1;

  -- 担当外のSupport（RIHO）は見えない
  perform set_config('request.jwt.claims', json_build_object('sub', kw03)::text, true);
  select count(*) into n from consultations;
  if n <> 0 then raise exception '02 担当外のSupportに見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- Management は行を1件も取れない（集計ビューだけ）
  perform set_config('request.jwt.claims', json_build_object('sub', kw01)::text, true);
  select count(*) into n from consultations;
  if n <> 0 then raise exception '02 Managementに相談の行が渡ってはいけない: %', n; end if;
  ok := ok + 1;

  -- ============================================================
  -- 区分03 Managementへの相談（Supportに非表示）
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw04)::text, true);
  insert into mgmt_consultations (staff_id, store_id, body) values (kw04, s_kw, '本文');

  perform set_config('request.jwt.claims', json_build_object('sub', kw01)::text, true);
  select count(*) into n from mgmt_consultations;
  if n <> 1 then raise exception '03 Managementは見えるはず: %', n; end if;
  ok := ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', kw02)::text, true);
  select count(*) into n from mgmt_consultations;
  if n <> 0 then raise exception '03 Supportに見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- ============================================================
  -- 他店舗ログイン（2店舗になって初めて試せる経路）
  -- ============================================================
  -- 四条烏丸の記録を作る
  perform set_config('request.jwt.claims', json_build_object('sub', sk03)::text, true);
  perform set_config('app.store_id', s_sk::text, true);
  insert into practice_records (staff_id, recorded_on, title) values (sk03, current_date, '四条烏丸の記録');

  -- 河原町のSupport（小畑）が四条烏丸に入室した状態
  perform set_config('request.jwt.claims', json_build_object('sub', kw02)::text, true);
  perform set_config('app.store_id', s_sk::text, true);

  select count(*) into n from practice_records where staff_id = sk03;
  if n <> 0 then raise exception '他店舗のStaffの記録が見えてはいけない: %', n; end if;
  ok := ok + 1;

  select count(*) into n from journeys where staff_id = sk03;
  if n <> 0 then raise exception '他店舗のJourneyが見えてはいけない: %', n; end if;
  ok := ok + 1;

  select count(*) into n from capability_values where staff_id = sk03;
  if n <> 0 then raise exception '他店舗のCapability Mapが見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- 育成設計は「読めても書けない」
  begin
    update assignments set scope_note = '書けてはいけない'
    where store_id = s_sk;
    if found then raise exception '他店舗ログイン中に育成設計を書けてはいけない'; end if;
  exception when insufficient_privilege then null;
  end;
  ok := ok + 1;

  -- ============================================================
  -- スタッフ間は非共有
  -- ============================================================
  perform set_config('app.store_id', s_kw::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', kw05)::text, true);
  select count(*) into n from practice_records where staff_id = kw04;
  if n <> 0 then raise exception 'スタッフ間で記録が見えてはいけない: %', n; end if;
  ok := ok + 1;

  -- ============================================================
  -- 初期値は本人が入れられない
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw04)::text, true);
  begin
    insert into capability_values (staff_id, param_id, value, status, source,
                                   entered_by, entered_at, basis)
    select kw04, p.id, 50, '検証中', 'initial_estimate', kw04, now(), '自分で入れた根拠'
    from capability_params p limit 1;
    raise exception '本人が初期値を入れられてはいけない';
  exception when insufficient_privilege or check_violation then ok := ok + 1;
  end;

  -- ============================================================
  -- 例外（第6条）— 同意が揃うまで開かない
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw01)::text, true);

  -- announced_at が未設定なので、この時点ではまだ開かない
  select count(*) into n from v_support_quality;
  if n <> 0 then raise exception '周知前に「閲覧」が開いてはいけない: %', n; end if;
  ok := ok + 1;

  -- 未同意の人を1人作ると閉じることの確認
  delete from policy_consents where user_id = kw05;
  if policy_gate_open('work_rules_art6') then
    raise exception '1人でも未同意なら開いてはいけない';
  end if;
  ok := ok + 1;

  -- ============================================================
  -- 同意していないユーザーは本体に入れない
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', kw05)::text, true);
  select count(*) into n from practice_records;
  if n <> 0 then raise exception '未同意のユーザーが本体を読めてはいけない: %', n; end if;
  ok := ok + 1;

  raise notice 'RLS OK — % 件の主張が通りました', ok;
  raise exception 'ROLLBACK_ON_PURPOSE';   -- データを変えずに終わる
exception
  when others then
    if sqlerrm = 'ROLLBACK_ON_PURPOSE' then
      raise notice '✅ すべて通りました（変更はロールバックされます）';
    else
      raise;
    end if;
end $$;
