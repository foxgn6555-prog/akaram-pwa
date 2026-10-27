-- 00357 · كتب الشكر والتقدير + كتب التنبيه/الإنذار (امتداد لمحرّك الكتب الرسمية 00356):
--   (1) كتاب «شكر وتقدير» يصدر تلقائياً برقم سنوي عند تسجيل مكافأة من نوع thanks_letter (المدير المفوض أو معاونه) — مصدره حركة المكافأة،
--       ويُبلَّغ المدير المباشر؛ ترحيل كتب الشكر السابقة.
--   (2) كتاب «تنبيه» أو «إنذار» يدوي: المدير المفوض/المعاون يختار موظفاً ويكتب السبب ⇒ كتاب برقم رسمي، يُبلَّغ الموظف والمدير المباشر،
--       ويُحتسب تسلسل التنبيهات السابقة للموظف في نص الكتاب.
--   (3) letters_list: مرشّح 'admin_any' (شكر/تنبيه/إنذار) و'disciplinary_any' (تنبيه/إنذار).

alter table public.official_letters drop constraint if exists official_letters_kind_check;
alter table public.official_letters add constraint official_letters_kind_check
  check (kind in ('resignation_accept','termination','dismissal','contract_end','retirement','death','settlement','thanks','notice','warning'));
alter table public.official_letters drop constraint if exists official_letters_source_kind_check;
alter table public.official_letters add constraint official_letters_source_kind_check check (source_kind in ('settlement','treasury','disciplinary'));

create or replace function app.letter_kind_label(p text) returns text language sql immutable as $$
  select case p when 'resignation_accept' then 'قبول استقالة' when 'termination' then 'إنهاء خدمات' when 'dismissal' then 'فصل من الخدمة'
                when 'contract_end' then 'انتهاء عقد' when 'retirement' then 'إحالة إلى التقاعد' when 'death' then 'إنهاء خدمة (وفاة)'
                when 'settlement' then 'تصفية نهاية الخدمة' when 'thanks' then 'شكر وتقدير' when 'notice' then 'تنبيه' when 'warning' then 'إنذار' else p end $$;

-- المدير المباشر للموظف (employees.manager_id ثم مدير القسم)
create or replace function app.letter_manager(p_employee uuid, out mgr_user uuid, out mgr_name text)
language sql stable security definer set search_path = public, app as $$
  select coalesce(me.user_id, dm.user_id), coalesce(me.full_name, dm.full_name)
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.employees me on me.id = e.manager_id and me.id <> e.id
  left join public.employees dm on dm.id = d.manager_id and dm.id <> e.id
  where e.id = p_employee $$;
revoke all on function app.letter_manager(uuid) from public, anon, authenticated;

-- ── (1) كتاب الشكر من حركة المكافأة ─────────────────────────────────────────────────────────────────────
create or replace function app.letter_for_thanks(p_tx uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare t public.treasury_transactions; m record; lid uuid; l public.official_letters;
begin
  select * into t from public.treasury_transactions where id = p_tx and kind = 'reward' and reward_type = 'thanks_letter' and status = 'confirmed';
  if not found or t.employee_id is null then return null; end if;
  if exists (select 1 from public.official_letters where source_kind = 'treasury' and source_id = t.id and kind = 'thanks') then
    return (select id from public.official_letters where source_kind = 'treasury' and source_id = t.id and kind = 'thanks');
  end if;
  select * into m from app.letter_manager(t.employee_id);
  lid := app.letter_issue('thanks', 'شكر وتقدير / ' || t.employee_name, t.employee_id, jsonb_build_array(
    'تثميناً لجهودكم المتميزة وإخلاصكم في أداء الواجب، يسرّ إدارة شركة جزيرة الأكارم أن تتقدم إليكم بخالص الشكر والتقدير'
      || coalesce(' وذلك لقاء: ' || nullif(trim(t.details), ''), '') || '.',
    'آملين أن تكونوا قدوة حسنة لزملائكم، وأن تستمروا بالعطاء والتفاني بما يخدم مصلحة العمل، مع تمنياتنا لكم بدوام التوفيق والنجاح.',
    'يُثبَّت هذا الكتاب في الإضبارة الشخصية ويُحتسب ضمن سجل التميّز' || coalesce(' ويُبلَّغ المدير المباشر (' || nullif(m.mgr_name, '') || ') به', '') || '.'),
    jsonb_build_object('reward_ref', t.ref_no, 'reason', t.details, 'granted_by', t.created_by_name, 'granted_at', t.created_at, 'manager_name', m.mgr_name),
    'treasury', t.id);
  select * into l from public.official_letters where id = lid;
  if m.mgr_user is not null then
    insert into public.notifications (user_id, title, body, type, link)
    values (m.mgr_user, 'كتاب شكر وتقدير لأحد منتسبيك', 'صدر الكتاب ' || l.ref || ' — شكر وتقدير للموظف ' || t.employee_name || coalesce(' · ' || nullif(trim(t.details), ''), ''), 'success', null);
  end if;
  return lid;
end $$;
revoke all on function app.letter_for_thanks(uuid) from public, anon, authenticated;

create or replace function app.trg_treasury_thanks_letter() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.kind = 'reward' and new.reward_type = 'thanks_letter' and new.status = 'confirmed' then perform app.letter_for_thanks(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_treasury_thanks_letter on public.treasury_transactions;
create trigger trg_treasury_thanks_letter after insert or update of status on public.treasury_transactions for each row execute function app.trg_treasury_thanks_letter();

-- ── (2) كتاب تنبيه / إنذار يدوي ────────────────────────────────────────────────────────────────────────
create or replace function public.letter_issue_disciplinary(p_employee uuid, p_kind text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare e public.employees; m record; prior int; lid uuid; l public.official_letters; seq_txt text; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not app.has_role(array['executive_director', 'deputy_director', 'super_admin']) then raise exception 'LETTER_FORBIDDEN'; end if;
  if p_kind not in ('notice', 'warning') then raise exception 'LETTER_KIND_INVALID'; end if;
  if v_reason is null or length(v_reason) < 5 then raise exception 'LETTER_REASON_REQUIRED'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null and terminated_at is null;
  if not found then raise exception 'LETTER_EMPLOYEE_INVALID'; end if;
  select * into m from app.letter_manager(e.id);
  select count(*)::int into prior from public.official_letters where employee_id = e.id and kind in ('notice', 'warning');
  seq_txt := case prior when 0 then '' when 1 then ' (وهو الثاني في سجلكم)' when 2 then ' (وهو الثالث في سجلكم)' else ' (وهو رقم ' || (prior + 1)::text || ' في سجلكم)' end;
  lid := app.letter_issue(p_kind, app.letter_kind_label(p_kind) || ' / ' || e.full_name, e.id, jsonb_build_array(
    'لوحظ من قبل الإدارة ما يأتي: ' || v_reason || '.',
    case p_kind when 'notice'
      then 'لذا نوجّه إليكم هذا التنبيه' || seq_txt || ' مع ضرورة الالتزام بالتعليمات والضوابط النافذة وتلافي تكرار ذلك مستقبلاً، وبخلافه ستُتخذ بحقكم الإجراءات الإدارية الأشد.'
      else 'لذا تقرَّر توجيه إنذار رسمي إليكم' || seq_txt || '، وفي حال التكرار ستُتخذ بحقكم الإجراءات الإدارية والقانونية وفق التعليمات النافذة بما فيها إنهاء الخدمة.' end,
    'يُثبَّت هذا الكتاب في إضبارتكم الشخصية' || coalesce(' ويُبلَّغ المدير المباشر (' || nullif(m.mgr_name, '') || ') به لمتابعة الالتزام', '') || '.'),
    jsonb_build_object('reason', v_reason, 'prior_count', prior, 'issued_by_role', case when app.has_role(array['deputy_director']) and not app.has_role(array['executive_director','super_admin']) then 'deputy' else 'executive' end, 'manager_name', m.mgr_name),
    'disciplinary', gen_random_uuid());
  select * into l from public.official_letters where id = lid;
  if e.user_id is not null then
    insert into public.notifications (user_id, title, body, type, link)
    values (e.user_id, 'كتاب ' || l.kind_label || ' رسمي', 'صدر بحقك الكتاب ' || l.ref || ' (' || l.kind_label || '): ' || v_reason, 'warning', null);
  end if;
  if m.mgr_user is not null and m.mgr_user is distinct from e.user_id then
    insert into public.notifications (user_id, title, body, type, link)
    values (m.mgr_user, 'كتاب ' || l.kind_label || ' لأحد منتسبيك', 'صدر الكتاب ' || l.ref || ' (' || l.kind_label || ') بحق الموظف ' || e.full_name || ': ' || v_reason, 'warning', null);
  end if;
  return public.letter_get(lid);
end $$;
grant execute on function public.letter_issue_disciplinary(uuid, text, text) to authenticated;

-- ── (3) المرشّحات ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.letters_list(p_kind text default null, p_year int default null, p_q text default null, p_limit int default 300)
returns table (id uuid, ref text, letter_year int, letter_no int, kind text, kind_label text, subject text, employee_id uuid, employee_number text, full_name text,
               department_name text, job_title text, issued_at timestamptz, issued_by_name text, signer_name text, source_kind text, source_id uuid)
language sql stable security definer set search_path = public, app as $$
  select l.id, l.ref, l.letter_year, l.letter_no, l.kind, l.kind_label, l.subject, l.employee_id, l.employee_number, l.full_name, l.department_name, l.job_title,
         l.issued_at, l.issued_by_name, l.signer_name, l.source_kind, l.source_id
  from public.official_letters l
  where app.letters_can_read()
    and (p_kind is null or p_kind = '' or l.kind = p_kind
         or (p_kind = 'termination_any' and l.kind not in ('settlement', 'thanks', 'notice', 'warning'))
         or (p_kind = 'admin_any' and l.kind in ('thanks', 'notice', 'warning'))
         or (p_kind = 'disciplinary_any' and l.kind in ('notice', 'warning')))
    and (p_year is null or l.letter_year = p_year)
    and (p_q is null or p_q = '' or l.ref ilike '%' || p_q || '%' or l.full_name ilike '%' || p_q || '%' or coalesce(l.employee_number, '') ilike '%' || p_q || '%' or l.subject ilike '%' || p_q || '%')
  order by l.letter_year desc, l.letter_no desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000)) $$;
grant execute on function public.letters_list(text, int, text, int) to authenticated;

-- ── ترحيل كتب الشكر السابقة (بترتيب تسجيلها) ──────────────────────────────────────────────────────────
do $$ declare r record; begin
  for r in select id from public.treasury_transactions where kind = 'reward' and reward_type = 'thanks_letter' and status = 'confirmed' and employee_id is not null order by created_at loop
    perform app.letter_for_thanks(r.id);
  end loop;
end $$;

-- ── كتالوج الصلاحيات: وحدة «كتب الشكر والتنبيه» للمدير المفوض والمعاون (مولَّد بـ scripts/gen-permission-catalog.ts)
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 3),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 4),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 5),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 6),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 7),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 8),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 9),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 10),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 11),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 12),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 13),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 14),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 15),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 16),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 17),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 18),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 19),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 20),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 21),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 22),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 23),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 24),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 25),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 26),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 27),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 28),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 29),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 30),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 31),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 32),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 33),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 34),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 35),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 36),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 37),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 38),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 39),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 40),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 41),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 42),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 43),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 44),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 45),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 46),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 47),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 48),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 49),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 50),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 51),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 52),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 53),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 54),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 55),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 56),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 57),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 58),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 59),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 60),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 61),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 62),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 63),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 64),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 65),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 66),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 67),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 68),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 69),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 70),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 71),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 72),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 73),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 74),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 75),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 76),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 77),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 78),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 79),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 80),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 81),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 82),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 83),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 84),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 85),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 86),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 87),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 88),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 89),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 90),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 91),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 92),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 93),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 94),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 95),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 96),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 97),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 98),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 99),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 100),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 101),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 102),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 103),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 104),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 105),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 106),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 107),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 108),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 109),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 110),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 111),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 112),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 113),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 114),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 115),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 116),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 117),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 118),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 119),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 120),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 121),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 122),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 123),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 124),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 125),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 126),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 127),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 128),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 129),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 130),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 131),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 132),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 133),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 134),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 135),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 136),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 137),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 138),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 139),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 140),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 141),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 142),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 143),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 144),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 145),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 146),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 147),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 148),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 149),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 150),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 151),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 152),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 153),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 154),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 155),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 156),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 157),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 158),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 159),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 160),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 161),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 162),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 163),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 164),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 165),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 166),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 167),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 168),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 169),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 170),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 171),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 172),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 173),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 174),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 175),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 176),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 177),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 178),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 179),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 180),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 181),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 182),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 183),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 184),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 185),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 186),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 187),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 188),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 189),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 190),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 191),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 192)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.leaves', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.letters', 'finance.purchases', 'finance.budget', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.letters', 'executive.events', 'executive.behavior', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.letters', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
delete from public.permission_portal_roles where portal not in ('employee', 'hr', 'manager', 'finance', 'it', 'admin', 'field-ops', 'admin-ops', 'maintenance', 'transfer-station', 'executive', 'deputy', 'ops-room', 'complaints', 'media', 'central-garage', 'follow-up');
-- <<catalog/>>

-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
delete from public.permission_write_bindings;
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('hr_employee_create', 'hr.employees', 'create'),
  ('hr_employee_terminate', 'hr.recruitment', 'execute'),
  ('hire_request_complete', 'hr.hire-requests', 'execute'),
  ('supply_request_deliver', 'ops-room.store', 'execute'),
  ('advance_request_create', 'ops-room.advances', 'create'),
  ('ops_attendance_confirm', 'ops-room.attendance', 'decide'),
  ('ops_contractor_month_approve', 'ops-room.contractor-headcounts', 'decide'),
  ('advance_deliver', 'finance.advances', 'execute'),
  ('advance_settle_cash', 'finance.advances', 'execute'),
  ('finance_payroll_approve', 'finance.payroll', 'decide'),
  ('finance_payroll_adjust', 'finance.payroll', 'edit'),
  ('finance_payroll_reconcile', 'finance.payroll', 'execute'),
  ('finance_treasury_confirm', 'finance.budget', 'decide'),
  ('cold_archive_package_create', 'it.cold-archive', 'create'),
  ('cold_archive_purge_request', 'it.cold-archive', 'delete'),
  ('cold_archive_purge_approve', 'it.cold-archive', 'decide'),
  ('cold_archive_purge_confirm', 'it.cold-archive', 'delete'),
  ('it_deduction_exemption_add', 'it.integrations.auto-deductions', 'edit'),
  ('garage_decide_tank_zero', 'it.central-garage-approvals', 'decide'),
  ('complaint_approve_report', 'complaints.processing', 'decide'),
  ('complaint_create_item_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_batch_create_items_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_start_assignment_ticket', 'manager.complaints', 'execute'),
  ('complaint_complete_assignment_ticket', 'manager.complaints', 'execute'),
  ('sector_confirm_vehicle_arrival', 'manager.vehicle-trips', 'execute'),
  ('sector_confirm_vehicle_site_return', 'manager.vehicle-trips', 'execute'),
  ('sector_submit_breakdown', 'manager.breakdown', 'create'),
  ('sector_support_request_create', 'manager.support', 'create'),
  ('garage_record_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_return', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_shift_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_decide_maintenance_dispatch', 'central-garage.maintenance-coordination', 'decide'),
  ('station_confirm_vehicle_arrival', 'transfer-station.vehicle-movements', 'execute'),
  ('station_record_exit', 'transfer-station.vehicle-movements', 'execute'),
  ('maintenance_approve_readiness', 'maintenance.vehicle-cases', 'decide'),
  ('maintenance_complete_case', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_confirm_arrival', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_inventory_create', 'maintenance.inventory', 'create'),
  ('maintenance_purchase_create', 'maintenance.purchases', 'create'),
  ('media_template_create', 'media.design-templates', 'create');
-- <<bindings/>>
