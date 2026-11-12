-- 20261111130000_approval_step_sla_2_days.sql
--
-- 00401 · البند ③ من الجولة 27 — «مهام الموافقة بلا موعد استحقاق».
-- السبب: app.approval_activate_step يضع due_at فقط إذا كانت الخطوة تحدّد sla_days،
--        وكل خطوات السلاسل الحالية بلا sla_days ⇒ due_at = null ⇒ لا تذكير ولا تصعيد أبداً.
-- القرار (المستخدم، الجولة 29): مهلة كل خطوة = يومان.
--
-- ما يتغيّر: كل خطوة تُنشَّط تحصل على sla_days = 2 (إن لم تُحدَّد) و due_at = وقت التفعيل + يومين.
-- ما لا يتغيّر: لا صلاحيات، ولا auto-escalate (الخطوات تبقى escalate = 'none' كما هي)،
--              ولا يُنشأ/يُحذف أي طلب. التذكير عند انقضاء المهلة يعمل من مهمة cron القائمة.

-- ① التفعيل: مهلة افتراضية يومان + تسجيلها في الخطوة نفسها (نص التذكير وحساب التصعيد يقروآنها)
do $do$
declare def text; new_def text;
  pat text := 'set status = ''pending'', due_at = case when sla_days is not null then now() + make_interval(days => sla_days) end';
  rep text := 'set status = ''pending'', sla_days = coalesce(sla_days, 2), due_at = now() + make_interval(days => coalesce(sla_days, 2))';
begin
  def := pg_get_functiondef('app.approval_activate_step(text,uuid,integer)'::regprocedure);
  new_def := replace(def, pat, rep);
  if new_def = def then raise exception '00401: لم يُعثر على تعبير due_at في approval_activate_step'; end if;
  execute new_def;
end $do$;

-- ② الخطوات المفتوحة الآن (pending فقط): تُمنح المهلة بأثر رجعي من وقت وصولها للخطوة.
--    الخطوات waiting لا تُمنح موعداً (لا تُذكَّر قبل أن تُنشَّط).
update public.approval_tasks
   set sla_days = coalesce(sla_days, 2),
       due_at   = coalesce(pending_at, created_at) + interval '2 days'
 where status = 'pending' and due_at is null;
