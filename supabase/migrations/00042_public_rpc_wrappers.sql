-- ═══════════════════════════════════════════════════════════════
-- 00042 · أغلفة RPC عامة (public) لدوال المخطط app
--   السبب: PostgREST يعرض مخطط public فقط، وsupabase.rpc() يبحث فيه،
--   بينما دوال 00039/00040 عُرِّفت في app → خطأ PGRST202 في الواجهات
--   (الحذف/الأرشفة/الاستعادة/الرفع/الإرسال/الملخصات).
--   الأغلفة security invoker: فحوصات الأدوار داخل دوال app تبقى سارية
--   على هوية المتصل، وصلاحيات execute على دوال app ممنوحة أصلاً لـ authenticated.
-- ═══════════════════════════════════════════════════════════════

-- ── المحطة التحويلية (00039) ──
create or replace function public.ts_weight_archive(p_id text, p_reason text)
returns boolean
language sql
security invoker
set search_path = public, app
as $$
  select app.ts_weight_archive(p_id, p_reason)
$$;

create or replace function public.ts_weight_restore(p_id text)
returns boolean
language sql
security invoker
set search_path = public, app
as $$
  select app.ts_weight_restore(p_id)
$$;

create or replace function public.ts_weight_send_to_ops(p_date date, p_shift text)
returns integer
language sql
security invoker
set search_path = public, app
as $$
  select app.ts_weight_send_to_ops(p_date, p_shift)
$$;

create or replace function public.ts_weight_summary(p_days integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = public, app
as $$
  select app.ts_weight_summary(p_days)
$$;

-- ── وحدة الكشوفات (00040) ──
create or replace function public.disclosure_archive(p_id text, p_reason text)
returns boolean
language sql
security invoker
set search_path = public, app
as $$
  select app.disclosure_archive(p_id, p_reason)
$$;

create or replace function public.disclosure_restore(p_id text)
returns boolean
language sql
security invoker
set search_path = public, app
as $$
  select app.disclosure_restore(p_id)
$$;

create or replace function public.disclosure_submit(p_id text)
returns boolean
language sql
security invoker
set search_path = public, app
as $$
  select app.disclosure_submit(p_id)
$$;

create or replace function public.disclosure_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, app
as $$
  select app.disclosure_summary()
$$;

-- ── الصلاحيات: منع anon/public العام — السماح للمصادقين فقط ──
revoke all on function public.ts_weight_archive(text,text)     from public, anon;
revoke all on function public.ts_weight_restore(text)          from public, anon;
revoke all on function public.ts_weight_send_to_ops(date,text) from public, anon;
revoke all on function public.ts_weight_summary(integer)       from public, anon;
revoke all on function public.disclosure_archive(text,text)    from public, anon;
revoke all on function public.disclosure_restore(text)         from public, anon;
revoke all on function public.disclosure_submit(text)          from public, anon;
revoke all on function public.disclosure_summary()             from public, anon;

grant execute on function public.ts_weight_archive(text,text)     to authenticated;
grant execute on function public.ts_weight_restore(text)          to authenticated;
grant execute on function public.ts_weight_send_to_ops(date,text) to authenticated;
grant execute on function public.ts_weight_summary(integer)       to authenticated;
grant execute on function public.disclosure_archive(text,text)    to authenticated;
grant execute on function public.disclosure_restore(text)         to authenticated;
grant execute on function public.disclosure_submit(text)          to authenticated;
grant execute on function public.disclosure_summary()             to authenticated;