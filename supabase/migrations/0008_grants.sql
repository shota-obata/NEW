-- Growth OS Mobile — authenticated ロールへの権限付与
--
-- 0006 で RLS を有効にしたが、**テーブルへの GRANT を書いていなかった。**
-- RLS は「どの行を返すか」を決めるだけで、「テーブルに触れてよいか」は
-- GRANT が決める。付けないと、アプリ（authenticated で接続する）は
-- 1行も読めない（permission denied になる）。
--
-- 方針: SELECT は広く、書き込みは必要な表だけ。行の制御は RLS が持つ。

grant usage on schema public to authenticated;

-- 読みは全表。行は RLS が絞る
grant select on all tables in schema public to authenticated;

-- 書き込みは、クライアントが実際に書く表だけに絞る
grant insert, update, delete on
  personal_notes, personal_note_shares
to authenticated;

grant insert, update on
  practice_records, practice_images, evidence,
  consultations, mgmt_consultations,
  journeys, checkpoints, checkpoint_holds,
  assignments, assignment_changes,
  capability_params, capability_values,
  notices, deletion_requests
to authenticated;

grant insert on record_views, policy_consents to authenticated;
grant update on inbox_items, users, devices to authenticated;

-- ⚠ credentials は読みだけ。PINの照合と変更は Edge Function（service_role）で行う。
--   クライアントに更新権限を与えると、他人のPINを書き換える経路が生まれる。
revoke insert, update, delete on credentials from authenticated;

-- ⚠ 監査ログとストレージ計測はクライアントから書かせない。
revoke insert, update, delete on
  audit_log, store_access_log, storage_usage, storage_alerts,
  policy_documents, stores, user_roles, capability_axes,
  capability_param_changes, device_grants
from authenticated;

-- 以後に作る表にも同じ既定を効かせる
alter default privileges in schema public
  grant select on tables to authenticated;
