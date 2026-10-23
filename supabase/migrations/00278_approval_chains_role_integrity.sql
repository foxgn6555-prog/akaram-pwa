-- ═══════════════════════════════════════════════════════════════
-- 00278 · سلاسل الموافقات — سلامة دور الطالب والخطوات (00333)
--   · دور الطالب يجب أن يكون دوراً حقيقياً من user_roles (كانت القائمة تقبل media/complaints/disclosures
--     وهي ليست أدواراً ⇒ سلاسل «ميتة» لا تُطبَّق على أحد)
--   · تصحيح السلاسل الميتة الموجودة: media→media_officer · complaints→complaints_officer · disclosures→disclosures_officer
--     (وإن وُجدت سلسلة للدور الصحيح نفسه تُحذف الميتة)
--   · رفض الخطوات المتكررة المتتالية (APPROVAL_STEPS_DUPLICATE)
--   · تسميات عربية للأدوار كلها + ترتيب أولوية صحيح في approval_chain_for
-- ═══════════════════════════════════════════════════════════════

create or replace function app.approval_requester_roles() returns text[] language sql immutable as
$$ select array['employee','department_manager','admin_ops','field_ops','maintenance','central_garage_officer','transfer_station','ops_room',
                'hr_officer','finance_officer','media_officer','complaints_officer','disclosures_officer','follow_up','it_admin',
                'deputy_director','executive_director','super_admin'] $$;

-- ── ① تصحيح السلاسل الميتة ──
do $$
declare m record; v_new text;
begin
  for m in select id, requester_role, request_type from public.approval_chains where requester_role in ('media','complaints','disclosures') loop
    v_new := case m.requester_role when 'media' then 'media_officer' when 'complaints' then 'complaints_officer' else 'disclosures_officer' end;
    if exists (select 1 from public.approval_chains c where c.requester_role = v_new and c.request_type = m.request_type) then
      delete from public.approval_chains where id = m.id;
    else
      update public.approval_chains set requester_role = v_new, updated_at = now() where id = m.id;
    end if;
  end loop;
  -- أي دور آخر غير حقيقي (لا يمكن أن يُطبَّق) يُحذف
  delete from public.approval_chains where not (requester_role = any(app.approval_requester_roles()));
end $$;

alter table public.approval_chains drop constraint if exists approval_chains_requester_role_check;
alter table public.approval_chains add constraint approval_chains_requester_role_check
  check (requester_role in ('employee','department_manager','admin_ops','field_ops','maintenance','central_garage_officer','transfer_station','ops_room',
                            'hr_officer','finance_officer','media_officer','complaints_officer','disclosures_officer','follow_up','it_admin',
                            'deputy_director','executive_director','super_admin'));

-- ── ② التسميات ──
create or replace function app.approval_role_label(p_role text) returns text language sql immutable as $$
  select case p_role
    when 'employee' then 'متعهد' when 'department_manager' then 'مسؤول قسم' when 'admin_ops' then 'مسؤول قاطع' when 'field_ops' then 'العمليات الميدانية'
    when 'maintenance' then 'الصيانة' when 'central_garage_officer' then 'الكراج المركزي' when 'transfer_station' then 'المحطة التحويلية'
    when 'ops_room' then 'غرفة العمليات' when 'hr_officer' then 'الموارد البشرية' when 'finance_officer' then 'المالية' when 'it_admin' then 'التطوير المركزية'
    when 'deputy_director' then 'معاون المدير المفوض' when 'executive_director' then 'المدير التنفيذي' when 'super_admin' then 'المدير المفوض'
    when 'media_officer' then 'مسؤول الإعلام' when 'complaints_officer' then 'مسؤول الشكاوى' when 'disclosures_officer' then 'مسؤول الكشوفات' when 'follow_up' then 'المتابعة'
    else coalesce(p_role, '—') end $$;

-- ── ③ التحقق: خطوات غير متكررة ──
create or replace function app.approval_validate_steps(p_steps jsonb) returns void language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb; prev text := null; cur text;
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then raise exception 'APPROVAL_STEPS_REQUIRED'; end if;
  for s in select * from jsonb_array_elements(p_steps) loop
    if s ->> 'kind' = 'hierarchy' then
      if not ((s ->> 'role') = any(app.approval_hierarchy_roles())) then raise exception 'APPROVAL_STEP_ROLE_INVALID'; end if;
      cur := 'h:' || (s ->> 'role');
    elsif s ->> 'kind' = 'account' then
      if (s ->> 'user_id') is null or not exists (select 1 from auth.users u where u.id = (s ->> 'user_id')::uuid) then raise exception 'APPROVAL_STEP_ACCOUNT_INVALID'; end if;
      cur := 'a:' || (s ->> 'user_id');
    else raise exception 'APPROVAL_STEP_KIND_INVALID'; end if;
    if cur = prev then raise exception 'APPROVAL_STEPS_DUPLICATE'; end if;
    prev := cur;
  end loop;
end$$;

create or replace function public.approval_chain_save(p_requester_role text, p_request_type text, p_steps jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; clean jsonb;
begin
  perform app.require_it();
  if p_request_type not in ('leave','time_permit','supplies','termination','disclosure','advance') then raise exception 'APPROVAL_TYPE_INVALID'; end if;
  if coalesce(p_requester_role, '') = '' then raise exception 'APPROVAL_ROLE_REQUIRED'; end if;
  if not (p_requester_role = any(app.approval_requester_roles())) then raise exception 'APPROVAL_ROLE_INVALID'; end if;
  perform app.approval_validate_steps(p_steps);
  select jsonb_agg(case when s ->> 'kind' = 'hierarchy' then jsonb_build_object('kind', 'hierarchy', 'role', s ->> 'role') else jsonb_build_object('kind', 'account', 'user_id', s ->> 'user_id') end order by o)
    into clean from jsonb_array_elements(p_steps) with ordinality t(s, o);
  insert into public.approval_chains (requester_role, request_type, steps, is_active, updated_by)
  values (p_requester_role, p_request_type, clean, coalesce(p_active, true), auth.uid())
  on conflict (requester_role, request_type) do update set steps = excluded.steps, is_active = excluded.is_active, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end$$;

-- ── ④ اختيار السلسلة لمستخدم متعدد الأدوار: الدور الأخص أولاً (ترتيب بأسماء الأدوار الحقيقية) ──
create or replace function app.approval_chain_for(p_user uuid, p_type text) returns public.approval_chains
language sql stable security definer set search_path = public, app as $$
  select c.* from public.approval_chains c
  join public.user_roles ur on ur.user_id = p_user and ur.role = c.requester_role
  where c.request_type = p_type and c.is_active
  order by array_position(app.approval_requester_roles(), c.requester_role) nulls last
  limit 1 $$;
