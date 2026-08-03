-- Growth OS Mobile — 初期データ（AI,re 確定値）
--
-- 個人IDは会社が発番する。本人には決めさせない（ログインの識別子であり、
-- 重複と推測可能性を避けるため）。person_code は本人に編集させない（RLS で担保）。
-- PIN は運営者が本人確認のうえ仮PINを手渡し、初回ログインで本人が変更する。
-- ここでは credentials を作らない（仮PINの発行は運営者の操作で行う）。

-- ============================================================
-- 店舗
-- ============================================================

insert into stores (store_code, name, timezone, business_hours) values
('KW-001', 'AI,re 河原町店',   'Asia/Tokyo', '{
  "mon": ["11:00","20:00"], "tue": null,
  "wed": ["11:00","20:00"], "thu": ["11:00","20:00"], "fri": ["11:00","20:00"],
  "sat": ["10:00","19:00"], "sun": ["10:00","19:00"]}'),
('SK-002', 'AI,re 四条烏丸店', 'Asia/Tokyo', '{
  "mon": ["11:00","20:00"], "tue": null,
  "wed": ["11:00","20:00"], "thu": ["11:00","20:00"], "fri": ["11:00","20:00"],
  "sat": ["10:00","19:00"], "sun": ["10:00","19:00"]}');

-- ============================================================
-- 人（全社9名）
-- ============================================================
-- RIHO は英字表記が正。
-- 小畑（KW-02）は Support と Staff を兼用するが、users は1行。
-- 同意の分母は users の実人数なので9名（user_roles は10行になる）。

insert into users (person_code, display_name) values
-- 河原町店
('KW-01', '田邊 翔伍'),
('KW-02', '小畑 昭汰'),
('KW-03', 'RIHO'),
('KW-04', '黒坂 侑夏'),
('KW-05', '藤田 彩也菜'),
-- 四条烏丸店
('SK-01', '大谷 洋平'),
('SK-02', '殿 綾貴'),
('SK-03', '高島 颯人'),
('SK-04', '荒井 優月');

-- 役割。Management は Staff / Support を兼ねられない（check_role_combo で弾かれる）。
-- Support ＋ Staff の兼用のみ許可 → 小畑が2行持つ。
insert into user_roles (user_id, store_id, role, membership, mgmt_code)
select u.id, s.id, v.role, 'member', v.mgmt_code
from (values
  ('KW-01','KW-001','mgmt',    'MG-KW-01'),
  ('KW-02','KW-001','support', null),
  ('KW-02','KW-001','staff',   null),      -- 小畑：Support ＋ Staff の兼用
  ('KW-03','KW-001','support', null),
  ('KW-04','KW-001','staff',   null),
  ('KW-05','KW-001','staff',   null),
  ('SK-01','SK-002','mgmt',    'MG-SK-01'),
  ('SK-02','SK-002','support', null),
  ('SK-03','SK-002','staff',   null),
  ('SK-04','SK-002','staff',   null)
) as v(person_code, store_code, role, mgmt_code)
join users  u on u.person_code = v.person_code
join stores s on s.store_code  = v.store_code;

-- ============================================================
-- 規定（第2版 / 2026-08-10 施行）
-- ============================================================
-- 紙では 8/10 に施行済み。アプリ導入は9月上旬のため、
-- announced_at / notice_id はアプリ内で周知の通達を出したときに入れる。
-- そのとき effective_from は既に過去日なので、残る条件は「在籍者全員の同意」だけ。

insert into policy_documents (clause, version, revised_at, effective_from)
values ('work_rules_art6', '第2版', '2026-07-28', '2026-08-10');

-- ============================================================
-- Capability Map の軸
-- ============================================================

insert into capability_axes (store_id, code, label)
select s.id, v.code, v.label
from stores s cross join (values ('area','能力領域'), ('step','判断工程')) as v(code, label);

-- 能力領域
insert into capability_params (axis_id, name, sources, sort_order)
select a.id, v.name, v.sources::text[], v.ord
from capability_axes a cross join (values
  ('シャンプー',   '{model_count,practice_record}',            1),
  ('ブロー',       '{model_count,practice_record}',            2),
  ('縮毛矯正',     '{lesson_count,practice_record}',           3),
  ('骨格の観察',   '{practice_record,checkpoint}',             4),
  ('カットの設計', '{practice_record,checkpoint,support_input}',5),
  ('カラー',       '{model_count,practice_record}',            6),
  ('接客',         '{}',                                       7),
  ('似合わせ',     '{}',                                       8)
) as v(name, sources, ord)
where a.code = 'area';

-- サブ項目。誠実さは平均レスポンスに連動する
insert into capability_params (axis_id, parent_id, name, sources, sort_order)
select p.axis_id, p.id, v.name, v.sources::text[], v.ord
from capability_params p join capability_axes a on a.id = p.axis_id
cross join (values
  ('誠実さ', '{avg_response,support_input}', 1),
  ('明るさ', '{support_input}',              2)
) as v(name, sources, ord)
where a.code = 'area' and p.name = '接客';

insert into capability_params (axis_id, parent_id, name, sources, sort_order)
select p.axis_id, p.id, v.name, v.sources::text[], v.ord
from capability_params p join capability_axes a on a.id = p.axis_id
cross join (values
  ('提案',   '{practice_record,support_input}', 1),
  ('独自性', '{practice_record}',               2)
) as v(name, sources, ord)
where a.code = 'area' and p.name = '似合わせ';

-- 判断工程
insert into capability_params (axis_id, name, sources, sort_order)
select a.id, v.name, v.sources::text[], v.ord
from capability_axes a cross join (values
  ('現在地の把握', '{practice_record,checkpoint}',   1),
  ('問いの設定',   '{practice_record}',              2),
  ('条件の設計',   '{practice_record}',              3),
  ('事実の観察',   '{practice_record}',              4),
  ('判断の修正',   '{practice_record,support_input}',5),
  ('応用',         '{practice_record}',              6),
  ('転用',         '{practice_record}',              7)
) as v(name, sources, ord)
where a.code = 'step';

-- ============================================================
-- 主担当（初期値）
-- ============================================================
-- 固定ではない。双方同意でいつでも変更できる（assignment_changes）。
-- 小畑は Support であると同時に Staff でもあるので、本人の担当Supportとして
-- RIHO を付ける。付けないと、小畑が Staff として書いた記録がどの Support にも
-- 返らない（本人と Management のみ）状態になるため。

insert into assignments (staff_id, support_id, store_id, kind, scope)
select st.id, sp.id, s.id, 'primary', 'full'
from (values
  ('KW-04','KW-02','KW-001'),   -- 黒坂 ← 小畑
  ('KW-05','KW-02','KW-001'),   -- 藤田 ← 小畑
  ('KW-02','KW-03','KW-001'),   -- 小畑（Staffとして）← RIHO
  ('SK-03','SK-02','SK-002'),   -- 高島 ← 殿
  ('SK-04','SK-02','SK-002')    -- 荒井 ← 殿
) as v(staff, support, store)
join users  st on st.person_code = v.staff
join users  sp on sp.person_code = v.support
join stores s  on s.store_code   = v.store;
