-- Growth OS Mobile — 行レベルセキュリティ（可視領域8区分）
-- 出典: design_handoff_growth_os/RLS.md ／ PERMISSIONS.md
--
-- ■ 実装方針の変更点（RLS.md からの差分）
-- RLS.md は role_staff / role_mgmt という独自のDBロールを前提に
-- grant / revoke を書いているが、Supabase のロールは anon / authenticated /
-- service_role の3つで、役割はDBロールではなく auth.uid() で判定する。
-- そこで「ビューに権限を与える／外す」ではなく、
--   ・基底テーブルは RLS で行を絞る
--   ・ビューは security_invoker = off（所有者権限）で回し、
--     呼び出し側の判定を **ビューの WHERE に直接書く**
-- という形にする。効果は同じで、返らない列は列ごと存在しない。
--
-- ■ 既定は拒否
-- enable + force。ポリシーが1つも一致しなければ 0件 / 404。
-- 403 は返さない（あることを伝えてしまうため）。

-- ============================================================
-- 0. 全テーブルで RLS を有効化（force = 所有者にも効かせる）
-- ============================================================

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- ============================================================
-- 1. セッションの前提（仮PIN・未同意では本体に入れない）
-- ============================================================
-- 画面のガードとは別に、DB側でも止める。抜け道を作らないため。

create or replace function session_ok() returns bool as $$
  select auth.uid() is not null
     and coalesce((select not must_change_pin from credentials
                   where user_id = auth.uid()), false)
     and has_consented(auth.uid(), 'work_rules_art6');
$$ language sql stable security definer;

comment on function session_ok() is
  '仮PINのまま、または最新版の規定に未同意なら false。本体のテーブルは全て これを AND する';

-- ============================================================
-- 2. 自分自身と組織（同意を取る前でも読める必要がある）
-- ============================================================

create policy users_self on users for select
  using (id = auth.uid());

-- 同一店舗の在籍者は互いに見える（氏名まで。経験年数は v_user_public に無い）
create policy users_same_store on users for select
  using (exists (
    select 1 from user_roles a, user_roles b
    where a.user_id = auth.uid() and b.user_id = users.id
      and a.store_id = b.store_id and a.active and b.active));

-- 本人だけが自分のプロフィールを変えられる。person_code は会社が発番するので
-- 本人には変えさせない（列単位の制限は RLS に無いのでトリガーで担保）
create policy users_self_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function protect_user_fields() returns trigger as $$
begin
  if auth.uid() = new.id then
    if new.person_code is distinct from old.person_code then
      raise exception '個人IDは会社が発番します。本人は変更できません';
    end if;
    if new.retired_at is distinct from old.retired_at then
      raise exception '在籍状態は本人には変更できません';
    end if;
  end if;
  return new;
end $$ language plpgsql;

create trigger users_protect before update on users
  for each row execute function protect_user_fields();

create policy stores_member on stores for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.store_id = stores.id and r.active));

create policy user_roles_self on user_roles for select
  using (user_id = auth.uid() or is_mgmt_of(store_id));

-- ============================================================
-- 3. 規定と同意（同意を完了させるために、同意前でも読める）
-- ============================================================

create policy policy_docs_all on policy_documents for select using (true);

create policy consents_self on policy_consents for select
  using (user_id = auth.uid() or is_mgmt_of((select store_id from user_roles
         where user_id = policy_consents.user_id and active limit 1)));

create policy consents_insert_self on policy_consents for insert
  with check (user_id = auth.uid());   -- 他人の同意を代行できない

-- ============================================================
-- 4. 端末と資格情報
-- ============================================================

create policy devices_self_or_mgmt on devices for select
  using (user_id = auth.uid()
         or exists (select 1 from user_roles r
                    where r.user_id = devices.user_id and r.active
                      and is_mgmt_of(r.store_id)));

create policy devices_mgmt_write on devices for update
  using (exists (select 1 from user_roles r
                 where r.user_id = devices.user_id and r.active
                   and is_mgmt_of(r.store_id)));

create policy grants_target_or_mgmt on device_grants for select
  using (target_user_id = auth.uid() or is_mgmt_of(store_id));

-- 資格情報は本人の行だけ。PINハッシュは列として返るが、
-- 照合は Edge Function 側で行い、クライアントには渡さない
create policy credentials_self on credentials for select
  using (user_id = auth.uid());

-- ============================================================
-- 5. 区分01 パーソナルスペース
-- ============================================================
-- Support / Management には存在も件数も返さない。
-- 共有端末では「裏」を返さない（端末内に痕跡を残さないため）。

create policy p01_personal_owner_only on personal_notes for all
  using (user_id = auth.uid() and session_ok()
         and (visibility <> 'private' or current_device_kind() = 'personal'))
  with check (user_id = auth.uid()
         and (visibility <> 'private' or current_device_kind() = 'personal'));

-- 「表」を開示された相手は読める
create policy p01_shared_surface on personal_notes for select
  using (session_ok() and visibility = 'surface'
         and exists (select 1 from personal_note_shares s
                     where s.note_id = personal_notes.id and s.shared_with = auth.uid()));

create policy p01_shares_owner on personal_note_shares for all
  using (exists (select 1 from personal_notes n
                 where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from personal_notes n
                 where n.id = note_id and n.user_id = auth.uid()));

create policy p01_shares_target on personal_note_shares for select
  using (shared_with = auth.uid());

-- ============================================================
-- 6. 区分02 相談と返答
-- ============================================================

create policy p02_subject on consultations for select
  using (session_ok() and staff_id = auth.uid());

create policy p02_subject_write on consultations for insert
  with check (staff_id = auth.uid());

create policy p02_assigned_support on consultations for select
  using (session_ok() and supports(consultations.staff_id));

create policy p02_support_reply on consultations for update
  using (supports(consultations.staff_id))
  with check (supports(consultations.staff_id));

-- Management には行を渡さない。集計だけを別ビューで返す。
-- body / reply_body の列を持たないので、引用は物理的にできない。
create or replace view v_consultation_trend
  with (security_invoker = off) as
  select c.staff_id,
         date_trunc('week', c.created_at) as week,
         count(*) as n,
         mode() within group (order by c.step_tag) as stuck_step
  from consultations c
  where exists (select 1 from user_roles r
                where r.user_id = c.staff_id and r.active
                  and is_mgmt_of(r.store_id))       -- 呼び出し側の判定をここに書く
  group by 1, 2;

comment on view v_consultation_trend is
  'Management の「傾向だけ」。body / reply_body を列ごと持たない';

-- ============================================================
-- 7. 区分03 Managementへの相談（Supportに非表示）
-- ============================================================

create policy p03_subject_or_mgmt on mgmt_consultations for select
  using (session_ok() and (staff_id = auth.uid() or is_mgmt_of(store_id)));

create policy p03_insert_self on mgmt_consultations for insert
  with check (staff_id = auth.uid());

-- ============================================================
-- 8. 区分04 育成設計（読みは店舗スコープ、書きは所属店舗のセッションのみ）
-- ============================================================

create policy p04_education_side on assignments for select
  using (session_ok()
         and (has_role_in('support', store_id) or is_mgmt_of(store_id)));

-- 応援で入った Support が担当関係を書き換えると、元の店舗の Management が
-- 知らないうちに設計が変わる。他店舗ログイン中は書けない。
create policy p04_education_write on assignments for all
  using      (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)))
  with check (can_write_in(store_id)
              and (has_role_in('support', store_id) or is_mgmt_of(store_id)));

create policy p04_change_read on assignment_changes for select
  using (session_ok() and exists (select 1 from assignments a
         where a.id = assignment_id
           and (has_role_in('support', a.store_id) or is_mgmt_of(a.store_id))));

create policy p04_change_write on assignment_changes for all
  using      (exists (select 1 from assignments a
              where a.id = assignment_id and can_write_in(a.store_id)))
  with check (exists (select 1 from assignments a
              where a.id = assignment_id and can_write_in(a.store_id)));

-- Staff が自分の担当Supportの氏名だけを見るためのビュー
create or replace view v_my_support with (security_invoker = off) as
  select a.staff_id, u.display_name, a.kind, a.scope, a.scope_note, a.expires_at
  from assignments a join users u on u.id = a.support_id
  where a.active and a.staff_id = auth.uid();

-- ============================================================
-- 9. Journey・Checkpoint
-- ============================================================
-- 本人と担当Supportは細目まで。Management は要約ビューのみ。
-- スタッフ間は一切非共有。

create policy p04b_journey on journeys for select
  using (session_ok() and (staff_id = auth.uid() or supports(staff_id)));

create policy p04b_journey_own_write on journeys for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy p04b_checkpoint on checkpoints for select
  using (session_ok() and exists (select 1 from journeys j
         where j.id = checkpoints.journey_id
           and (j.staff_id = auth.uid() or supports(j.staff_id))));

create policy p04b_checkpoint_support_decide on checkpoints for update
  using (exists (select 1 from journeys j
         where j.id = checkpoints.journey_id and supports(j.staff_id)));

create policy p04b_holds on checkpoint_holds for select
  using (session_ok() and exists (
         select 1 from checkpoints c join journeys j on j.id = c.journey_id
         where c.id = checkpoint_id
           and (j.staff_id = auth.uid() or supports(j.staff_id))));

-- Management は現在地と到達数だけ。vision も support_note も含めない
create or replace view v_journey_summary with (security_invoker = off) as
  select j.staff_id, j.current_position,
         count(*) filter (where c.status = 'reached') as reached,
         count(*) as total
  from journeys j
  left join checkpoints c on c.journey_id = j.id
  where exists (select 1 from user_roles r
                where r.user_id = j.staff_id and r.active and is_mgmt_of(r.store_id))
  group by 1, 2;

-- ============================================================
-- 10. 区分05 軸定義（読みは店舗の全員、書きは所属店舗のセッションのみ）
-- ============================================================

create policy p05_axes_read on capability_axes for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.store_id = capability_axes.store_id
                   and r.active));

create policy p05_store_read on capability_params for select
  using (exists (select 1 from user_roles r join capability_axes x on x.id = axis_id
                 where r.user_id = auth.uid() and r.store_id = x.store_id and r.active));

create policy p05_edu_write on capability_params for all
  using      (can_write_in((select store_id from capability_axes where id = axis_id))
              and (has_role_in('support', (select store_id from capability_axes where id = axis_id))
                   or is_mgmt_of((select store_id from capability_axes where id = axis_id))))
  with check (can_write_in((select store_id from capability_axes where id = axis_id)));

create policy p05_param_changes on capability_param_changes for select
  using (exists (select 1 from capability_params p join capability_axes x on x.id = p.axis_id
                 where p.id = param_id
                   and (has_role_in('support', x.store_id) or is_mgmt_of(x.store_id))));

-- ============================================================
-- 11. Capability Map の値
-- ============================================================
-- 本人と担当Support は細目まで。Management は要約のみ。スタッフ間は0件。

create policy p09_owner_or_support on capability_values for select
  using (session_ok() and (staff_id = auth.uid() or supports(staff_id)));

-- 初期値を入れられるのは Management と Support だけ。本人は入力できない。
create policy p09_initial_by_edu on capability_values for insert
  with check (
    source = 'computed'                                  -- 自動算出はサーバ側
    or (source = 'initial_estimate'
        and staff_id <> auth.uid()                       -- 本人は入れられない
        and entered_by = auth.uid()
        and (supports(staff_id)
             or exists (select 1 from user_roles r
                        where r.user_id = staff_id and r.active
                          and is_mgmt_of(r.store_id)))));

create or replace view v_capability_summary with (security_invoker = off) as
  select v.staff_id,
         count(*) filter (where v.status = '接続済み') as connected,
         count(*) as total
  from v_capability_current v
  where exists (select 1 from user_roles r
                where r.user_id = v.staff_id and r.active and is_mgmt_of(r.store_id))
  group by 1;

-- ============================================================
-- 12. Practice記録
-- ============================================================
-- ⚠ instructed_by はここに一切書かない。可視領域は assignments のみで決まる。

create policy p10_owner_support_mgmt on practice_records for select
  using (session_ok() and deleted_at is null and (
         staff_id = auth.uid()
      or supports(staff_id)
      or exists (select 1 from user_roles r
                 where r.user_id = practice_records.staff_id and r.active
                   and is_mgmt_of(r.store_id))));

create policy p10_own_write on practice_records for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create policy p10_images on practice_images for select
  using (exists (select 1 from practice_records p where p.id = record_id));

create policy p10_images_own_write on practice_images for all
  using      (exists (select 1 from practice_records p
              where p.id = record_id and p.staff_id = auth.uid()))
  with check (exists (select 1 from practice_records p
              where p.id = record_id and p.staff_id = auth.uid()));

-- 既読は本人に開示する（誰が・いつ）
create policy p10_views_read on record_views for select
  using (exists (select 1 from practice_records p
                 where p.id = record_id
                   and (p.staff_id = auth.uid() or viewer_id = auth.uid())));

create policy p10_views_insert on record_views for insert
  with check (viewer_id = auth.uid());

create policy p10_evidence on evidence for select
  using (exists (select 1 from practice_records p where p.id = record_id));

-- スタッフ間は、サロンに出したものだけ・氏名なし
create or replace view v_salon_records with (security_invoker = off) as
  select p.id, p.recorded_on, p.title, p.question, p.fact,
         p.misjudgement, p.reflection, p.next_gain,
         case when p.anonymized then 'Other' else u.display_name end as author
  from practice_records p join users u on u.id = p.staff_id
  where p.salon_shared and p.deleted_at is null
    and exists (select 1 from user_roles a, user_roles b
                where a.user_id = auth.uid() and b.user_id = p.staff_id
                  and a.store_id = b.store_id and a.active and b.active);

-- ============================================================
-- 13. 区分06 / 07 / 08 通達
-- ============================================================

create policy p06_support_to_mgmt on notices for select
  using (session_ok() and kind = 'support_to_mgmt'
         and (is_mgmt_of(store_id) or from_user_id = auth.uid()
              or subject_user_id = auth.uid()));

create policy p07_mgmt_to_all on notices for select
  using (session_ok() and kind = 'mgmt_to_all'
         and exists (select 1 from user_roles r
                     where r.user_id = auth.uid() and r.store_id = notices.store_id
                       and r.active));

create policy p08_mgmt_to_support on notices for select
  using (session_ok() and kind = 'mgmt_to_support'
         and (subject_user_id = auth.uid() or from_user_id = auth.uid()
              or is_mgmt_of(store_id)));

create policy notices_write on notices for insert
  with check (from_user_id = auth.uid() and can_write_in(store_id));

-- 受信ボックスは本人だけ。保留中（deliver_after が未来）は返さない
create policy inbox_self on inbox_items for select
  using (user_id = auth.uid()
         and (deliver_after is null or deliver_after <= now()));

create policy inbox_self_write on inbox_items for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 14. 例外 — 運営者の「閲覧」（就業規則 第6条第3項）
-- ============================================================
-- 就業規則 第6条第3項に基づく例外。第5条第1項の開示対象から除外する。
-- 変更には規定の改定が必要。
--
-- 周知・在籍者全員の同意・施行日の3つが揃うまで、1行も返さない。

create or replace view v_support_quality with (security_invoker = off) as
  select a.support_id,
         u.display_name,
         count(c.*) filter (where c.replied_at is not null) as replies,
         round(avg(extract(epoch from (c.replied_at - c.created_at))
                   / 86400.0)::numeric, 1) as avg_response_days
  from assignments a
  join users u on u.id = a.support_id
  left join consultations c on c.support_id = a.support_id
  where a.active
    and is_mgmt_of(a.store_id)                    -- 運営者に限る（第6条第4項）
    and policy_gate_open('work_rules_art6')       -- 3条件が揃うまで開かない
  group by 1, 2;

comment on view v_support_quality is
  '就業規則 第6条第1項の確認。第5条第1項の開示対象外（第6条第3項）。閲覧を audit_log に残さない唯一の面';

-- ============================================================
-- 15. 監査ログ（閲覧履歴まで本人に開く。例外は上の1面だけ）
-- ============================================================

create policy audit_subject on audit_log for select
  using (visible_to_subject and (target_id = auth.uid() or actor_id = auth.uid()));

create policy audit_mgmt on audit_log for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.role = 'mgmt' and r.active));

create policy store_access_self_or_mgmt on store_access_log for select
  using (user_id = auth.uid() or is_mgmt_of(store_id));

-- ============================================================
-- 16. ストレージ監視・削除申請（運営者のみ）
-- ============================================================

create policy storage_mgmt on storage_usage for select
  using (exists (select 1 from user_roles r
                 where r.user_id = auth.uid() and r.role = 'mgmt' and r.active));

create policy storage_alerts_read on storage_alerts for select
  using (auth.uid() is not null);   -- danger は全員に配るため、本文は全員が読める

create policy deletion_read on deletion_requests for select
  using (target_user_id = auth.uid()
         or exists (select 1 from user_roles r
                    where r.user_id = deletion_requests.target_user_id and r.active
                      and (is_mgmt_of(r.store_id) or has_role_in('support', r.store_id))));
