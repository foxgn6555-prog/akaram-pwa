-- 20261203000600 — مواءمة الإنتاج قبل/بعد تطبيق ترحيلات الآليات المؤجرة
--
-- سببه: 20261203000500 تحمل كتلة كتالوج مولَّدة من مصدر ناقص (20261118140000)، وهي تُطبَّق
-- كـ upsert (insert … on conflict do update) بلا حذف — فلا تُفقد الوحدات الباقية، لكن تبقى
-- وحدات أُنشئت في ترحيلات لاحقة (00223–00251، مثلاً deputy.rewards) غائبةً عن نص الكتالوج.
-- الترحيل هذا يجسر الفجوة بقيم الإنتاج الفعلية المقروءة قبل التطبيق (لا بالتخمين).
--
-- ما يفعله:
--   600-A  يحقن 9 وحدات كانت في الإنتاج وغائبة عن كتلة 20261203000500 (upsert آمن).
--   600-B  يربط دوال الضريبة القديمة (00251) — كانت مكشوفة لأي مستخدم مسجَّل بلا حارس.
--   600-C  فحص ذاتي يُثبت: لا وحدة ناقصة، لا ربط يتيم، الدوال الثمانية مربوطة، والدوال القديمة محمية.
--
-- ⚠️ لا يُنشئ جداول ولا يحذف صفوفاً. آمن للتكرار (idempotent).

-- أي تعديل على صف قائم (تسمية/إجراءات/فرز) خطر لا حاجة له — نضمن الوجود فقط.
-- ── 600-A: الوحدات التسع ─────────────────────────────────────────────────────
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('deputy.data-analysis',   'deputy',   '/deputy/data-analysis',   'تحليل البيانات',  null, '{view,export}', 148),
  ('deputy.station-folders', 'deputy',   '/deputy/station-folders', 'مجلدات المحطة',   null, '{view}',       151),
  ('deputy.letters',         'deputy',   '/deputy/letters',         'الكتب',           null, '{view,create}', 156),
  ('finance.expenses',       'finance',  '/finance/expenses',       'المصروفات',       null, '{view,create}', 200),
  ('finance.purchases',      'finance',  '/finance/purchases',      'المشتريات',       null, '{view,create}', 201),
  ('finance.settlements',    'finance',  '/finance/settlements',    'التسويات',        null, '{view,edit}',   202),
  ('ops-room.station-fleet',   'ops-room', '/ops-room/station-fleet',   'أسطول المحطة',  null, '{view,edit}',  260),
  ('ops-room.station-outbound','ops-room', '/ops-room/station-outbound','الخارج من المحطة', null, '{view}',   261),
  ('it.central-garage-approvals','it',     '/it/central-garage-approvals','اعتمادات الكراج المركزي', null, '{view,decide}', 130)
on conflict (key) do nothing;

-- ── 600-B: دوال الضريبة القديمة (00251) ─────────────────────────────────────
-- كانت security definer بلا فحص دور ولا require_can، ومتاحة لـ authenticated.
-- 20261203000100–000500 أدخلت نظام ضريبة جديداً لكل آلية (rented_vehicle_taxes)، وبقيت القديمة
-- (نسبة عامة + تجاوز لكل موظف) تعمل بلا حارس. نربطها بالوحدة القائمة deputy.rented-tax.
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('deputy_rented_tax_set_pct',      'deputy.rented-tax', 'edit'),
  ('deputy_rented_tax_override_set', 'deputy.rented-tax', 'edit'),
  ('deputy_rented_tax_override_clear','deputy.rented-tax','edit')
on conflict (fn) do update set unit_key = excluded.unit_key, action = excluded.action;

-- 00251 وضعت هذه الأسماء في guarded_write_functions؟ لا. نتحقق أدناه بدل الافتراض.
do $g$ declare v_missing text; begin
  select string_agg(x.fn, ', ') into v_missing
    from unnest(array['deputy_rented_tax_set_pct','deputy_rented_tax_override_set','deputy_rented_tax_override_clear']) x(fn)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = x.fn);
  if v_missing is not null then
    raise exception 'RENTED_RECONCILE: دوال الضريبة القديمة غير موجودة: % — نفّذ 00251 أولاً', v_missing;
  end if;
end $g$;

-- ── 600-C: فحص ذاتي ─────────────────────────────────────────────────────────
do $check$ declare v_bad text; v_n int;
begin
  -- ١) الوحدات التسع موجودة
  select string_agg(k, ', ') into v_bad
    from unnest(array[
      'deputy.data-analysis','deputy.station-folders','deputy.letters',
      'finance.expenses','finance.purchases','finance.settlements',
      'ops-room.station-fleet','ops-room.station-outbound','it.central-garage-approvals'
    ]) k
   where not exists (select 1 from public.permission_units u where u.key = k);
  if v_bad is not null then raise exception 'RENTED_RECONCILE: وحدات ناقصة: %', v_bad; end if;

  -- ٢) وحدات الآليات المؤجرة الثلاث من 20261203000500
  select count(*) into v_n from public.permission_units
   where key in ('ops-room.rented-attendance','finance.rented-salaries','deputy.rented-vehicles');
  if v_n <> 3 then
    raise exception 'RENTED_RECONCILE: وحدات الآليات المؤجرة يجب أن تكون 3، وُجد % — نفّذ 20261203000500 أولاً', v_n;
  end if;

  -- ٣) الربط يشير إلى وحدات وإجراءات صحيحة (نفس شرط 00296)
  select string_agg(b.fn || '→' || b.unit_key || ':' || b.action, ', ') into v_bad
    from public.permission_write_bindings b
    join public.permission_units u on u.key = b.unit_key
   where not (b.action = any(u.actions));
  if v_bad is not null then raise exception 'RENTED_RECONCILE: ربط بإجراء غير متاح: %', v_bad; end if;

  -- ٤) الدوال الثمانية الجديدة مربوطة وموجودة في حرس الكتابة
  select count(*) into v_n
    from public.permission_write_bindings b
   where b.fn in ('rented_attendance_set_day','rented_discharge_save','rented_month_submit',
                  'rented_tax_save','rented_tax_clear','rented_month_decide_deputy',
                  'rented_salary_save','rented_month_pay');
  if v_n <> 8 then raise exception 'RENTED_RECONCILE: ربط دوال الآليات المؤجرة يجب أن يكون 8، وُجد %', v_n; end if;

  select count(*) into v_n
    from unnest(app.guarded_write_functions()) g(fn)
   where g.fn like 'rented\_%';
  if v_n <> 8 then
    raise exception 'RENTED_RECONCILE: حرس الكتابة يحوي % دوال rented_* بدل 8 — نفّذ 20261203000500 أولاً', v_n;
  end if;

  -- ٥) دوال الضريبة القديمة مربوطة الآن (لم تبق مكشوفة)
  select count(*) into v_n from public.permission_write_bindings
   where fn like 'deputy_rented_tax%' and unit_key = 'deputy.rented-tax';
  if v_n <> 3 then raise exception 'RENTED_RECONCILE: دوال الضريبة القديمة غير مربوطة (%)', v_n; end if;
end $check$;

comment on function app.guarded_write_functions() is
  '20261203000600: قائمة دوال الكتابة المحمية — 94 دالة (86 + 8 للآليات المؤجرة). أي دالة كتابة جديدة تُضاف هنا وتُربط في permission_write_bindings.';
