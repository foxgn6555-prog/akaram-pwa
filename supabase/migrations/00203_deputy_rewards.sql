-- 00203 · وحدة «المكافآت» لمعاون المدير المفوض — بنفس صلاحيات المدير التنفيذي على المكافآت فقط
--   · يسجّل مكافأة (نقدية/هدية/كتاب شكر/إجازة تشجيعية) · يلغي المعلّقة بسبب · يرى كل المكافآت وأرقامها · يبحث عن الموظفين
--   · المستحقات وتسديدات GPS ورصيد القاصة تبقى للمدير التنفيذي والمالية
--   · الإشعارات تذهب لمن سجّل الحركة (تنفيذي ⇒ /executive/rewards، معاون ⇒ /deputy/rewards) وتذكر صفته للموظف والمالية

-- صفة المسجِّل حسب دوره
create or replace function app.treasury_actor_label(p_user uuid) returns text language sql stable security definer set search_path = public, app as $$
  select case when exists (select 1 from public.user_roles where user_id = p_user and role = 'executive_director') then 'المدير التنفيذي'
              when exists (select 1 from public.user_roles where user_id = p_user and role = 'deputy_director') then 'معاون المدير المفوض'
              else 'الإدارة' end $$;

-- إشعار صاحب الحركة: المدير التنفيذي (الدور كله) أو المعاون الذي سجّلها، بالرابط الصحيح لبوابته
create or replace function app.treasury_notify_origin(t public.treasury_transactions, p_title text, p_body text, p_type text default 'info') returns int
language plpgsql security definer set search_path = public, app as $$
declare n int := 0; v_link text := case t.kind when 'receipt' then '/executive/receivables' when 'gps_payment' then '/executive/gps-payments' else '/executive/rewards' end;
begin
  if t.kind = 'reward' and exists (select 1 from public.user_roles where user_id = t.created_by and role = 'deputy_director')
     and not exists (select 1 from public.user_roles where user_id = t.created_by and role = 'executive_director') then
    insert into public.notifications (user_id, title, body, type, link) values (t.created_by, p_title, p_body, p_type, '/deputy/rewards');
    return 1;
  end if;
  n := app.treasury_notify(array['executive_director'], p_title, p_body, v_link, p_type);
  return n;
end$$;

-- قراءة الحركات: المعاون يرى المكافآت
drop policy if exists "treasury tx: read" on public.treasury_transactions;
create policy "treasury tx: read" on public.treasury_transactions for select to authenticated
  using (app.has_role(array['executive_director','finance_officer','super_admin'])
         or (kind = 'reward' and (app.has_role(array['hr_officer','deputy_director']) or employee_id = app.current_employee_id())));

create or replace function public.exec_treasury_record(p_kind text, p_amount numeric default null, p_type_id uuid default null, p_employee_id uuid default null, p_reward_type text default null, p_details text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare t public.treasury_transactions; rt public.treasury_receivable_types; e public.employees; v_needs_fin boolean; v_title text; v_body text; v_me text := app.user_display_name(auth.uid());
begin
  -- 00203: معاون المدير المفوض يسجّل المكافآت فقط (المستحقات وGPS تبقى للمدير التنفيذي)
  if not (app.has_role(array['executive_director','super_admin']) or (p_kind = 'reward' and app.has_role(array['deputy_director']))) then raise exception 'EXEC_FORBIDDEN'; end if;
  if p_kind not in ('receipt','reward','gps_payment') then raise exception 'TREASURY_KIND_INVALID'; end if;
  if p_kind = 'receipt' then
    select * into rt from public.treasury_receivable_types where id = p_type_id and is_active;
    if rt.id is null then raise exception 'TREASURY_TYPE_REQUIRED'; end if;
    if p_amount is null or p_amount <= 0 then raise exception 'TREASURY_AMOUNT_INVALID'; end if;
  elsif p_kind = 'gps_payment' then
    if p_amount is null or p_amount <= 0 then raise exception 'TREASURY_AMOUNT_INVALID'; end if;
  else
    if p_reward_type not in ('cash','gift','thanks_letter','incentive_leave') then raise exception 'TREASURY_REWARD_TYPE_INVALID'; end if;
    select * into e from public.employees where id = p_employee_id and archived_at is null;
    if e.id is null then raise exception 'TREASURY_EMPLOYEE_REQUIRED'; end if;
    if p_reward_type = 'cash' and (p_amount is null or p_amount <= 0) then raise exception 'TREASURY_AMOUNT_INVALID'; end if;
    if p_reward_type <> 'cash' and length(trim(coalesce(p_details, ''))) < 2 then raise exception 'TREASURY_DETAILS_REQUIRED'; end if;
  end if;
  if p_amount is not null and p_amount > 1000000000 then raise exception 'TREASURY_AMOUNT_INVALID'; end if;
  v_needs_fin := p_kind <> 'reward' or p_reward_type in ('cash','gift');

  insert into public.treasury_transactions (ref_no, kind, amount, type_id, type_name, employee_id, employee_name, employee_number, reward_type, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
  values (app.treasury_next_ref(), p_kind, case when p_kind = 'reward' and p_reward_type <> 'cash' then 0 else coalesce(p_amount, 0) end, rt.id,
          case p_kind when 'receipt' then rt.name when 'gps_payment' then 'تسديد مستحقات GPS' else 'مكافأة موظف' end,
          e.id, e.full_name, e.employee_number, case when p_kind = 'reward' then p_reward_type end, nullif(trim(coalesce(p_details, '')), ''),
          case when v_needs_fin then 'pending' else 'confirmed' end,
          p_kind = 'receipt' or p_kind = 'gps_payment' or p_reward_type = 'cash',
          auth.uid(), v_me, case when v_needs_fin then null else auth.uid() end, case when v_needs_fin then null else now() end)
  returning * into t;

  if v_needs_fin then
    v_title := case p_kind when 'receipt' then 'استلام مبلغ بانتظار تأكيدك' when 'gps_payment' then 'تسديد مستحقات GPS بانتظار تأكيد الدفع' else 'مكافأة موظف بانتظار التسليم' end;
    v_body := t.ref_no || ' · ' || coalesce(t.type_name, '') || case when t.employee_name is not null then ' · ' || t.employee_name else '' end
              || case when t.amount > 0 then ' · ' || to_char(t.amount, 'FM999,999,999,990') || ' د.ع' else ' · هدية' end || ' · من ' || v_me;
    perform app.treasury_notify(array['finance_officer'], v_title, v_body, '/finance/budget', 'info');
  elsif e.user_id is not null then
    insert into public.notifications (user_id, title, body, type, link)
    values (e.user_id, case when p_reward_type = 'thanks_letter' then 'كتاب شكر وتقدير' else 'إجازة تشجيعية' end, 'منحك ' || app.treasury_actor_label(auth.uid()) || ' ' || case when p_reward_type = 'thanks_letter' then 'كتاب شكر وتقدير' else 'إجازة تشجيعية' end || ': ' || coalesce(t.details, ''), 'success', null);
  end if;
  return app.treasury_json(t);
end$$;

create or replace function public.finance_treasury_confirm(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare t public.treasury_transactions;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  select * into t from public.treasury_transactions where id = p_id for update;
  if t.id is null then raise exception 'TREASURY_NOT_FOUND'; end if;
  if t.status <> 'pending' then raise exception 'TREASURY_NOT_PENDING'; end if;
  update public.treasury_transactions set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), finance_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id returning * into t;
  perform app.treasury_notify_origin(t,
    case t.kind when 'receipt' then 'أكدت المالية استلام المبلغ' when 'gps_payment' then 'أكدت المالية دفع مستحقات GPS' else 'سلّمت المالية المكافأة' end,
    t.ref_no || ' · ' || coalesce(t.type_name, '') || case when t.employee_name is not null then ' · ' || t.employee_name else '' end || case when t.amount > 0 then ' · ' || to_char(t.amount, 'FM999,999,999,990') || ' د.ع' else '' end, 'success');
  if t.kind = 'reward' and t.employee_id is not null then
    insert into public.notifications (user_id, title, body, type)
    select e.user_id, 'مكافأة من ' || app.treasury_actor_label(t.created_by), 'سُلِّمت لك مكافأة ' || case when t.reward_type = 'cash' then 'مالية بمبلغ ' || to_char(t.amount, 'FM999,999,999,990') || ' د.ع' else 'هدية' end || coalesce(': ' || t.details, ''), 'success'
    from public.employees e where e.id = t.employee_id and e.user_id is not null;
  end if;
  return app.treasury_json(t);
end$$;

create or replace function public.treasury_cancel(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare t public.treasury_transactions; v_fin boolean := app.has_role(array['finance_officer','super_admin']); v_exec boolean := app.has_role(array['executive_director','super_admin']); v_dep boolean := app.has_role(array['deputy_director']);
begin
  if not (v_fin or v_exec or v_dep) then raise exception 'EXEC_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'TREASURY_REASON_REQUIRED'; end if;
  select * into t from public.treasury_transactions where id = p_id for update;
  if t.id is null then raise exception 'TREASURY_NOT_FOUND'; end if;
  if t.status <> 'pending' then raise exception 'TREASURY_NOT_PENDING'; end if;   -- المؤكَّد لا يُلغى (سجل مالي نهائي)
  if not (v_fin or v_exec) and t.kind <> 'reward' then raise exception 'EXEC_FORBIDDEN'; end if;   -- 00203: المعاون يلغي مكافآته المعلّقة فقط
  update public.treasury_transactions set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason), updated_at = now() where id = p_id returning * into t;
  if v_fin and not ((v_exec or v_dep) and t.created_by = auth.uid()) then
    perform app.treasury_notify_origin(t, 'أعادت المالية الحركة ' || t.ref_no, 'السبب: ' || trim(p_reason), 'warning');
  else
    perform app.treasury_notify(array['finance_officer'], 'ألغى ' || app.treasury_actor_label(auth.uid()) || ' الحركة ' || t.ref_no, 'السبب: ' || trim(p_reason), '/finance/budget', 'warning');
  end if;
  return app.treasury_json(t);
end$$;

create or replace function public.treasury_list(p_from date default null, p_to date default null, p_kind text default null, p_status text default null, p_type_id uuid default null, p_employee_id uuid default null, p_search text default null, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_full boolean := app.has_role(array['executive_director','finance_officer','super_admin']); v_hr boolean := app.has_role(array['hr_officer', 'deputy_director']); /* 00203: المعاون يرى كل المكافآت (كـ HR) لا المستحقات/GPS */ v_emp uuid := app.current_employee_id();
begin
  if not (v_full or v_hr or v_emp is not null) then raise exception 'EXEC_FORBIDDEN'; end if;
  return (select coalesce(jsonb_agg(app.treasury_json(t) order by t.created_at desc), '[]'::jsonb) from (
    select * from public.treasury_transactions x
    where (v_full or (x.kind = 'reward' and (v_hr or x.employee_id = v_emp)))
      and (p_from is null or (x.created_at at time zone 'Asia/Baghdad')::date >= p_from)
      and (p_to is null or (x.created_at at time zone 'Asia/Baghdad')::date <= p_to)
      and (p_kind is null or x.kind = p_kind) and (p_status is null or x.status = p_status)
      and (p_type_id is null or x.type_id = p_type_id) and (p_employee_id is null or x.employee_id = p_employee_id)
      and (p_search is null or trim(p_search) = '' or x.ref_no ilike '%' || trim(p_search) || '%' or coalesce(x.employee_name, '') ilike '%' || trim(p_search) || '%' or coalesce(x.type_name, '') ilike '%' || trim(p_search) || '%' or coalesce(x.details, '') ilike '%' || trim(p_search) || '%')
    order by x.created_at desc limit greatest(1, least(coalesce(p_limit, 500), 5000))) t);
end$$;

create or replace function public.treasury_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_full boolean := app.has_role(array['executive_director','finance_officer','super_admin']); j jsonb;
begin
  if not (v_full or app.has_role(array['deputy_director'])) then raise exception 'EXEC_FORBIDDEN'; end if;
  j := (
    with r as (select * from public.treasury_transactions x
               where (p_from is null or (x.created_at at time zone 'Asia/Baghdad')::date >= p_from) and (p_to is null or (x.created_at at time zone 'Asia/Baghdad')::date <= p_to))
    select jsonb_build_object(
      -- الرصيد الكلي (لا يتأثر بالفلتر): المستلَم المؤكَّد − المكافآت النقدية المسلَّمة − تسديدات GPS المدفوعة
      'balance', (select coalesce(sum(case when kind = 'receipt' then amount else -amount end), 0) from public.treasury_transactions where status = 'confirmed' and affects_balance),
      'frozen', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind = 'receipt'),
      'pending_out', (select coalesce(sum(amount), 0) from public.treasury_transactions where status = 'pending' and kind <> 'receipt'),
      'pending_count', (select count(*) from public.treasury_transactions where status = 'pending'),
      'range', jsonb_build_object(
        'receipts_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'confirmed'),
        'receipts_pending', (select coalesce(sum(amount), 0) from r where kind = 'receipt' and status = 'pending'),
        'rewards_cash_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'reward' and reward_type = 'cash' and status = 'confirmed'),
        'rewards_count', (select count(*) from r where kind = 'reward' and status <> 'cancelled'),
        'gps_confirmed', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'confirmed'),
        'gps_pending', (select coalesce(sum(amount), 0) from r where kind = 'gps_payment' and status = 'pending'),
        'count', (select count(*) from r)),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type_id', type_id, 'name', type_name, 'confirmed', c, 'pending', p, 'count', n) order by c desc), '[]'::jsonb)
                  from (select type_id, type_name, coalesce(sum(amount) filter (where status = 'confirmed'), 0) c, coalesce(sum(amount) filter (where status = 'pending'), 0) p, count(*) n from r where kind = 'receipt' group by type_id, type_name) q),
      'rewards_by_type', (select coalesce(jsonb_object_agg(reward_type, n), '{}'::jsonb) from (select reward_type, count(*) n from r where kind = 'reward' and status <> 'cancelled' group by reward_type) q),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'receipts', rc, 'rewards', rw, 'gps', g) order by m), '[]'::jsonb)
                   from (select to_char(created_at at time zone 'Asia/Baghdad', 'YYYY-MM') m,
                                coalesce(sum(amount) filter (where kind = 'receipt' and status = 'confirmed'), 0) rc,
                                coalesce(sum(amount) filter (where kind = 'reward' and status = 'confirmed'), 0) rw,
                                coalesce(sum(amount) filter (where kind = 'gps_payment' and status = 'confirmed'), 0) g
                         from r group by 1) q)));
  -- 00203: معاون المدير المفوض يرى أرقام المكافآت فقط (لا رصيد القاصة ولا المستحقات)
  if not v_full then
    j := jsonb_build_object('rewards_by_type', j -> 'rewards_by_type',
      'range', jsonb_build_object('rewards_count', j -> 'range' -> 'rewards_count', 'rewards_cash_confirmed', j -> 'range' -> 'rewards_cash_confirmed'));
  end if;
  return j;
end$$;

create or replace function public.exec_employee_lookup(p_q text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees e where e.archived_at is null and (e.employment_status is null or e.employment_status <> 'terminated')
          and (trim(coalesce(p_q, '')) = '' or e.full_name ilike '%' || trim(p_q) || '%' or e.employee_number ilike '%' || trim(p_q) || '%') order by e.full_name limit 20) e
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['executive_director','deputy_director','super_admin']) $$;
grant execute on function public.exec_employee_lookup(text) to authenticated;

-- ─── فعاليات الشركة: التصاميم المكتملة للمدير التنفيذي ─────────────────────────
drop policy if exists "media designs: قراءة" on public.media_designs;
create policy "media designs: قراءة" on public.media_designs for select to authenticated
  using (app.has_role(array['media_officer', 'super_admin']) or (status = 'completed' and app.has_role(array['executive_director'])));
drop policy if exists "media photos: قراءة للمدير التنفيذي" on storage.objects;
create policy "media photos: قراءة للمدير التنفيذي" on storage.objects for select to authenticated
  using (bucket_id = 'media-photos' and app.has_role(array['executive_director']));

create or replace function public.exec_completed_designs(p_from date default null, p_to date default null, p_sector text default null, p_period_type text default null)
returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'sector_parent', d.sector_parent, 'period_type', d.period_type, 'period_start', d.period_start, 'period_end', d.period_end,
           'cover_image_path', d.cover_image_path, 'photo_count', d.photo_count, 'completed_at', d.completed_at, 'completed_by_name', app.user_display_name(d.completed_by),
           'work_types', (select coalesce(jsonb_agg(distinct p.work_type), '[]'::jsonb) from public.media_design_photos p where p.design_id = d.id)) order by d.period_end desc, d.completed_at desc), '[]'::jsonb)
  from public.media_designs d
  where app.has_role(array['executive_director','super_admin']) and d.status = 'completed'
    and (p_from is null or d.period_end >= p_from) and (p_to is null or d.period_start <= p_to)
    and (p_sector is null or d.sector_parent = p_sector) and (p_period_type is null or d.period_type = p_period_type) $$;
grant execute on function public.exec_completed_designs(date, date, text, text) to authenticated;

-- تفاصيل التصميم: الإعلام دائماً، والمدير التنفيذي للمكتمل فقط (+ إرجاع fit/zoom التي كانت تُفقد)
drop function if exists public.media_design_detail(uuid);
create function public.media_design_detail(p_id uuid)
returns table(design jsonb, photo_id uuid, source_photo_id uuid, source_submission_id uuid, work_type text, storage_path text, caption text, report_caption text, sort_order integer, display_fit text, display_zoom numeric)
language plpgsql stable security definer set search_path = public, app as $$
declare d public.media_designs;
begin
  select * into d from public.media_designs where id = p_id;
  if not found then raise exception 'MEDIA_DESIGN_NOT_FOUND'; end if;
  if not (app.has_role(array['media_officer', 'super_admin']) or (d.status = 'completed' and app.has_role(array['executive_director']))) then raise exception 'MEDIA_FORBIDDEN'; end if;
  return query
  select to_jsonb(d), dp.id, dp.source_photo_id, dp.source_submission_id, dp.work_type, dp.storage_path, dp.caption, dp.report_caption, dp.sort_order, dp.display_fit, dp.display_zoom
    from public.media_design_photos dp where dp.design_id = p_id order by dp.work_type, dp.sort_order;
end$$;
