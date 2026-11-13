-- 00404 · إشعارات مدير غرفة العمليات (إصلاح عيب — الجولة 31)
--
-- العيب: كل إشعار يُوجَّه إلى صاحب الطلب عبر app.approval_link_for()، وهذه الدالة
-- لا تعرف الدور ops_room_manager فتُرجع '/' . وجدول notifications عليه قيد
--     notifications_link_internal: link IS NULL OR link ~ '^/[a-zA-Z0-9/_?=&.-]+$'
-- فيرفض '/'، و app.hr_notify يبتلع الخطأ (exception when others then null)
-- فتُفقد الرسالة بالكامل بلا أثر: لا إشعار ولا خطأ ظاهر.
-- الدليل وقت الإصلاح: 452 إشعارًا في الجدول، صفر منها لحساب siaf@akram.iq،
-- وهو الحساب الوحيد من 20 حسابًا الذي رابطه غير صالح.
--
-- الإصلاح (الأضيق — بلا أي تغيير في الصلاحيات):
--   ١) فرع جديد في approval_link_for: ops_room_manager → /ops-room-manager/approvals
--   ٢) hr_notify: الرابط غير الصالح يُخزَّن NULL بدل إسقاط الإشعار كاملًا.
--
-- لا يُمسّ: current_role() / has_role() / بوابات الصلاحيات / أي مسار موافقات.
-- التراجع: إعادة تعريف الدالتين بالنسخة السابقة (00399 وما قبلها).

-- ١) وجهة إشعارات مدير غرفة العمليات
create or replace function app.approval_link_for(p_user uuid) returns text
language sql stable security definer set search_path to 'public' as $fn$
  select case
    when exists (select 1 from public.user_roles where user_id=p_user and role='admin_ops') then '/admin-ops/requests'
    when exists (select 1 from public.user_roles where user_id=p_user and role='department_manager') then '/manager/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='field_ops') then '/field-ops/requests'
    when exists (select 1 from public.user_roles where user_id=p_user and role='hr_officer') then '/hr/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='deputy_director') then '/deputy/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='super_admin') then '/admin/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='it_admin') then '/it/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='executive_director') then '/executive/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='ops_room_manager') then '/ops-room-manager/approvals'   -- 00404
    when exists (select 1 from public.user_roles where user_id=p_user and role='ops_room') then '/ops-room/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='finance_officer') then '/finance/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='follow_up') then '/follow-up/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='maintenance') then '/maintenance/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='transfer_station') then '/transfer-station/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='complaints_officer') then '/complaints/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='media_officer') then '/media/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='central_garage_officer') then '/central-garage/approvals'
    when exists (select 1 from public.user_roles where user_id=p_user and role='employee') then '/employee/approvals'
    else '/' end $fn$;

-- ٢) رابط غير صالح لا يُسقِط الإشعار: يُخزَّن بلا وجهة (NULL) والرسالة تصل
create or replace function app.hr_notify(p_user uuid, p_title text, p_body text, p_link text, p_key text, p_type text default 'info')
returns void language plpgsql security definer set search_path to 'public', 'app' as $fn$
begin
  if p_user is null then return; end if;
  if p_key like 'leave_req:%' or p_key like 'leave_hr_fallback:%' then p_link := app.approval_link_for(p_user); end if;
  -- 00404: قيد notifications_link_internal يرفض أي رابط لا يطابق '^/[a-zA-Z0-9/_?=&.-]+$'
  if p_link is not null and p_link !~ '^/[a-zA-Z0-9/_?=&.-]+$' then p_link := null; end if;
  insert into public.notifications (user_id,title,body,type,category,priority,link,dedupe_key)
  values (p_user,p_title,p_body,p_type,'system','normal',p_link,p_key)
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;
exception when others then null;
end $fn$;
