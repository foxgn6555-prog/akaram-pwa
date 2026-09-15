-- اختبار وحدة قوالب التصميم: إنشاء/تعديل/أرشفة بيد مسؤول الإعلام + عزل الأدوار الأخرى
do $$
declare
  media_u uuid := '00000000-0000-0000-0000-000000000123';
  other_u uuid := '00000000-0000-0000-0000-000000000124';
  t public.media_design_templates;
  n bigint;
begin
  insert into auth.users (id, email) values (media_u, 'media-templates@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (media_u, 'media_officer')
    on conflict (user_id, role) do nothing;
  insert into auth.users (id, email) values (other_u, 'media-templates-other@akram.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (other_u, 'department_manager')
    on conflict (user_id, role) do nothing;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', media_u::text, false);

  -- إنشاء قالب
  select * into t from public.media_template_create(
    'قالب الكرادة الرسمي', 'karrada', 'first_half', null, '["كنس الشوارع"]'::jsonb, 'اختبار');
  if t.id is null or t.status <> 'active' then
    raise exception 'TEMPLATE CREATE FAIL';
  end if;

  -- تعديل قالب
  select * into t from public.media_template_update(
    t.id, 'قالب الكرادة الرسمي 2', 'karrada', 'second_half', null,
    '["كنس الشوارع","رفع حاويات"]'::jsonb, '');
  if t.title <> 'قالب الكرادة الرسمي 2' or t.period_type <> 'second_half'
     or jsonb_array_length(t.work_types) <> 2 then
    raise exception 'TEMPLATE UPDATE FAIL';
  end if;

  -- القائمة تشمل النشط
  select count(*) into n from public.media_templates_list(false);
  if n < 1 then raise exception 'TEMPLATE LIST FAIL'; end if;

  -- عزل: مسؤول قسم لا ينشئ ولا يقرأ
  perform set_config('request.jwt.claim.sub', other_u::text, false);
  begin
    perform public.media_template_create('قالب محظور', null, 'first_half', null, '[]'::jsonb, '');
    raise exception 'TEMPLATE ISOLATION FAIL — مدير قسم أنشأ قالباً';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'unexpected sqlstate %', sqlstate; end if;
  end;
  begin
    perform public.media_templates_list(false);
    raise exception 'TEMPLATE LIST ISOLATION FAIL';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'unexpected sqlstate %', sqlstate; end if;
  end;

  -- أرشفة بدل الحذف
  perform set_config('request.jwt.claim.sub', media_u::text, false);
  select * into t from public.media_template_archive(t.id);
  if t.status <> 'archived' then raise exception 'TEMPLATE ARCHIVE FAIL'; end if;
  select count(*) into n from public.media_templates_list(false);
  if n <> 0 then raise exception 'ARCHIVED TEMPLATE STILL LISTED'; end if;
  select count(*) into n from public.media_templates_list(true);
  if n < 1 then raise exception 'ARCHIVED TEMPLATE MISSING FROM FULL LIST'; end if;

  -- تنظيف (عودة للدور الإداري)
  reset role;
  delete from public.media_design_templates where created_by in (media_u, other_u);
  delete from public.user_roles where user_id in (media_u, other_u);
  delete from auth.users where id in (media_u, other_u);
  raise notice '✅ قوالب التصميم: إنشاء/تعديل/أرشفة لمسؤول الإعلام وعزل كامل لبقية الأدوار';
end $$;
