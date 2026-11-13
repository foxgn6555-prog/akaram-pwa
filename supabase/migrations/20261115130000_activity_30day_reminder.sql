-- 00417 — تذكير كل 30 يومًا (بديل MFA — البند الأخير من الجولة 39)
--
-- الهدف (الوجهُان حسب قرار (ج)):
--   (أ) تذكير كل مستخدم: إذا لم يسجل الدخول منذ 30 يومًا، يصله تذكير أمني.
--   (ب) تقرير دوري للمدير التقني (super_admin): عدد الحسابات الخاملة + منح الصلاحيات
--       في آخر 30 يومًا، ليراجع استمرار الحاجة إليها.
--
-- آلية التنفيذ:
--   · دالة app.activity_monthly_report() (SECURITY DEFINER) تُنشئ الإشعارات.
--   · pg_cron job شهري (الساعة 03:00 يوم 1 كل شهر ≈ كل 30 يومًا) ينفّذ الدالة.
--   · dedupe_key = '...:YYYY-MM' ⇒ تشغيل متكرر في الشهر نفسه لا يُكرّر الإشعارات.
--   · لا يغيّر أي سياسة RLS ولا صلاحيات المستخدمين — يضيف إشعارات فقط.
--   · الإشعارات تُعرض عبر جرس الإشعارات الحالي (notification_center) وعبر
--     banner الواجهة (ActivityReminderBanner) الذي يظهر التذكير الأمني غير المقروء.

create or replace function app.activity_monthly_report()
returns void
language plpgsql
security definer
set search_path = public, app
as $$\ndeclare
  v_month   text := to_char(date_trunc('month', now()), 'YYYY-MM');
  v_cutoff  timestamptz := now() - interval '30 days';
  v_idle    int;
  v_grants  int;
begin
  -- ① تذكير كل مستخدم خامد (لم يسجل الدخول منذ 30 يومًا، أو لم يدخل أصلًا وعمره >30 يوم)
  insert into public.notifications
    (user_id, title, body, type, category, priority, link, entity_type, action_label, dedupe_key, in_app_visible, push_allowed, sound_allowed)
  select
    u.id,
    left('تذكير بالنشاط — لم تسجل الدخول منذ 30 يومًا', 160),
    left(format('مرحباً، لم تسجل الدخول إلى جزيرة الأكارم منذ أكثر من 30 يومًا (حتى %s). إذا كان حسابك لا يزال نشطًا، سجّل الدخول بانتظام للتأكد من وصولك إلى بياناتك.', to_char(now(), 'YYYY-MM-DD')), 1000),
    'warning', 'security', 'normal', '/login', 'activity_reminder', 'فتح التطبيق',
    'idle:' || u.id::text || ':' || v_month,
    true, false, false
  from auth.users u
  where u.last_sign_in_at < v_cutoff
     or (u.last_sign_in_at is null and u.created_at < v_cutoff)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  -- ② تقرير دوري للمدير التقني: الحسابات الخاملة + منح الصلاحيات في آخر 30 يومًا
  select
    (select count(*) from auth.users u
       where u.last_sign_in_at < v_cutoff
          or (u.last_sign_in_at is null and u.created_at < v_cutoff)),
    (select count(*) from public.user_roles ur where ur.created_at >= v_cutoff)
  into v_idle, v_grants;

  insert into public.notifications
    (user_id, title, body, type, category, priority, link, entity_type, action_label, dedupe_key, in_app_visible, push_allowed, sound_allowed)
  select
    ur.user_id,
    left('تقرير النشاط الدوري — ' || v_month, 160),
    left(format('التقرير الدوري (كل 30 يومًا) حتى %s: %s حساب خامد (لم يسجل الدخول منذ 30 يومًا). %s منح صلاحية جديدة في آخر 30 يومًا. راجع الحسابات الخاملة ومنح الصلاحيات للتأكد من استمرار الحاجة إليها، وأعطِ الصلاحيات الحساسة موافقة المدير المفوض.', to_char(now(), 'YYYY-MM-DD'), v_idle, v_grants), 1000),
    'info', 'security', 'high', '/admin', 'activity_report', 'فتح التقرير',
    'report:' || v_month,
    true, false, false
  from public.user_roles ur
  where ur.role = 'super_admin'
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end$$;

-- منح execute للأدوار التي تُنفّذها (pg_cron ينفذ كـservice_role/postgres)
grant execute on function app.activity_monthly_report() to service_role;
grant execute on function app.activity_monthly_report() to postgres;

-- تخطيط مهمة pg_cron شهريًا (الساعة 03:00 يوم 1 ≈ كل 30 يومًا)
-- إلغاء سابق (عند إعادة تطبيق الهجرة) ثم إنشاء — لتجنب التكرار
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'activity_monthly_reminder') then
      perform cron.unschedule('activity_monthly_reminder');
    end if;
    perform cron.schedule(
      'activity_monthly_reminder',
      '0 3 1 * *',
      'select app.activity_monthly_report()'
    );
  end if;
end $$;
