-- Growth OS Mobile — Supabase Auth との紐付け
--
-- PIN が本当の資格情報で、Supabase Auth は「セッションの器」として使う。
-- Auth のパスワードはサーバだけが知る長いランダム文字列にして、ここに置く。
-- クライアントには一切渡さないし、外から入力する経路も作らない。
-- 実際の関門は「登録済み端末」＋「4桁PIN」で、それを Edge Function が
-- 照合してから、この文字列で Supabase Auth にサインインする。

alter table credentials
  add column if not exists auth_secret text;

comment on column credentials.auth_secret is
  'Supabase Auth のパスワード。サーバ専用。クライアントに渡さない。'
  'PINが通らないかぎり使われない';

-- authenticated からは列ごと触らせない（credentials は 0008 で読みのみ）。
-- 読めてしまうと Auth に直接サインインされ、端末とPINの関門を迂回できる。
revoke select on credentials from authenticated;

-- 本人が自分の状態（仮PINか、ロック中か）だけを知るためのビュー
create or replace view v_my_credential_state as
  select user_id,
         must_change_pin,
         (locked_until is not null and locked_until > now()) as locked,
         locked_until
  from credentials
  where user_id = auth.uid();

grant select on v_my_credential_state to authenticated;

comment on view v_my_credential_state is
  '本人が自分の状態だけを知る。pin_hash と auth_secret は列ごと持たない';
