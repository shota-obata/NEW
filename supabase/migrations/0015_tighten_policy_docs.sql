-- Growth OS Mobile — policy_documents を認証済みだけに締める
--
-- using (true) で書いていたため、未認証でも規定のメタデータ（条番号・版・
-- 施行日・周知日）が読めていた。中身は機微ではないが、読む必要があるのは
-- 同意画面（サインイン後）だけなので、公開する理由が無い。
--
-- ブラウザから実測して気づいた:
--   未認証で practice_records → 0件、users → 0件、policy_documents → 1件

drop policy if exists policy_docs_all on policy_documents;

create policy policy_docs_authed on policy_documents for select
  using (auth.uid() is not null);

-- 同意の記録も、他人の分まで数えられる必要は無い。
-- 運営者は v_consent_gap（件数だけ）を見る。
comment on policy policy_docs_authed on policy_documents is
  '規定は認証済みなら誰でも読める（同意画面と全文表示に要る）。未認証には返さない';
