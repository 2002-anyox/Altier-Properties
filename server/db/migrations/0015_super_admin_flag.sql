/* ------------------------------------------------------------------ *
 * Nobody grants themselves the support desk.
 *
 * profiles.is_super_admin opens every workspace: each row policy begins
 * `altier_is_super_admin() OR …`. It is meant to be set by hand, in the
 * database, by Altier. But the role every request runs as could write it
 * — 0004 granted UPDATE on whole tables — and the profiles policy lets a
 * request update its own row, and a colleague's. No route writes the flag
 * today; that is the only thing that was keeping it shut, and a row
 * policy is supposed to be the second lock, not a hope.
 *
 * So the column comes out of altier_app's reach entirely, on insert and
 * on update. Every other column stays writable exactly as before. The
 * flag can still be set by a superuser connection, which is the "by
 * hand" the support desk was always described as needing.
 * ------------------------------------------------------------------ */

REVOKE INSERT, UPDATE ON profiles FROM altier_app;--> statement-breakpoint

GRANT INSERT (id, name, email, phone, password_hash, password_set_at,
              failed_attempts, locked_until, created_at)
  ON profiles TO altier_app;--> statement-breakpoint

GRANT UPDATE (name, email, phone, password_hash, password_set_at,
              failed_attempts, locked_until)
  ON profiles TO altier_app;--> statement-breakpoint
