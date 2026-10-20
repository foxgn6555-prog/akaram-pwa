-- 00307 · تدقيق القاصة والمكافآت:
--   (1) كانت المالية تستطيع تأكيد صرف نقدي (مكافأة نقدية/تسديد GPS/تسليم سلفة) ورصيد القاصة لا يكفي ⇒ رصيد سالب. الآن TREASURY_INSUFFICIENT.
--   (2) «الإجازة التشجيعية» كانت نصاً فقط؛ الآن يحدد المانح عدد الأيام (0.5 … 30) وتُقيَّد فوراً في دفتر رصيد الإجازات (kind = adjust) وتظهر في الحركة (leave_days).

alter table public.treasury_transactions add column if not exists leave_days numeric null;

create or replace function app.treasury_balance() returns numeric language sql stable security definer set search_path = public, app as $$
  select coalesce(sum(case when kind in ('receipt','advance_repayment') then amount else -amount end), 0) from public.treasury_transactions where status = 'confirmed' and affects_balance
$$;

drop function if exists public.exec_treasury_record(text, numeric, uuid, uuid, text, text);
create or replace function public.exec_treasury_record(p_kind text, p_amount numeric default null, p_type_id uuid default null, p_employee_id uuid default null, p_reward_type text default null, p_details text default null, p_days numeric default null)
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
  if p_kind = 'reward' and p_reward_type = 'incentive_leave' then
    -- 00307: الإجازة التشجيعية تضيف أياماً فعلية إلى رصيد إجازات الموظف
    if p_days is null or p_days <= 0 or p_days > 30 or p_days * 2 <> floor(p_days * 2) then raise exception 'TREASURY_LEAVE_DAYS_INVALID'; end if;
  end if;

  insert into public.treasury_transactions (ref_no, kind, amount, type_id, type_name, employee_id, employee_name, employee_number, reward_type, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at)
  values (app.treasury_next_ref(), p_kind, case when p_kind = 'reward' and p_reward_type <> 'cash' then 0 else coalesce(p_amount, 0) end, rt.id,
          case p_kind when 'receipt' then rt.name when 'gps_payment' then 'تسديد مستحقات GPS' else 'مكافأة موظف' end,
          e.id, e.full_name, e.employee_number, case when p_kind = 'reward' then p_reward_type end, nullif(trim(coalesce(p_details, '')), ''),
          case when v_needs_fin then 'pending' else 'confirmed' end,
          p_kind = 'receipt' or p_kind = 'gps_payment' or p_reward_type = 'cash',
          auth.uid(), v_me, case when v_needs_fin then null else auth.uid() end, case when v_needs_fin then null else now() end)
  returning * into t;
  if p_kind = 'reward' and p_reward_type = 'incentive_leave' then
    update public.treasury_transactions set leave_days = p_days where id = t.id returning * into t;
    insert into public.hr_leave_ledger (employee_id, year, kind, days, note, created_by)
    values (e.id, extract(year from app.hr_local_date(now()))::int, 'adjust', p_days, 'إجازة تشجيعية ' || t.ref_no || coalesce(' · ' || t.details, ''), auth.uid());
  end if;

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

grant execute on function public.exec_treasury_record(text, numeric, uuid, uuid, text, text, numeric) to authenticated;
revoke all on function public.exec_treasury_record(text, numeric, uuid, uuid, text, text, numeric) from public, anon;
create or replace function public.finance_treasury_confirm(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare t public.treasury_transactions;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  select * into t from public.treasury_transactions where id = p_id for update;
  if t.id is null then raise exception 'TREASURY_NOT_FOUND'; end if;
  if t.status <> 'pending' then raise exception 'TREASURY_NOT_PENDING'; end if;
  if t.affects_balance and t.kind <> 'receipt' and app.treasury_balance() < t.amount then raise exception 'TREASURY_INSUFFICIENT'; end if;   -- 00307
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

create or replace function public.advance_deliver(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.advances; tx uuid; m date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if not app.has_role(array['finance_officer','super_admin']) then raise exception 'ADVANCE_FORBIDDEN'; end if;
  select * into a from public.advances where id = p_id for update;
  if a.id is null then raise exception 'ADVANCE_NOT_FOUND'; end if;
  if a.status <> 'approved' then raise exception 'ADVANCE_NOT_APPROVED'; end if;
  if app.treasury_balance() < a.amount then raise exception 'TREASURY_INSUFFICIENT'; end if;   -- 00307
  insert into public.treasury_transactions (ref_no, kind, amount, type_name, employee_id, employee_name, employee_number, details, status, affects_balance, created_by, created_by_name, confirmed_by, confirmed_at, finance_note)
  values (app.treasury_next_ref(), 'advance', a.amount, 'تسليم سلفة — ' || a.type_name, a.employee_id, a.employee_name, a.employee_number, a.ref_no || ' · ' || app.advance_method_label(a.repayment_method), 'confirmed', true,
          auth.uid(), app.user_display_name(auth.uid()), auth.uid(), now(), nullif(trim(coalesce(p_note, '')), ''))
  returning id into tx;
  update public.advances set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), delivery_note = nullif(trim(coalesce(p_note, '')), ''), start_month = m, treasury_tx_id = tx, updated_at = now() where id = p_id;
  perform app.advance_log(p_id, 'delivered', a.amount, p_note);
  perform app.hr_notify(a.requested_by, 'سُلّمت السلفة ' || a.ref_no, a.employee_name || ' · ' || to_char(a.amount, 'FM999,999,999') || ' د.ع · يبدأ الاستقطاع من شهر ' || to_char(m, 'YYYY-MM'), '/ops-room/advances', 'advance_dlv:' || a.id::text, 'success');
  select * into a from public.advances where id = p_id;
  return app.advance_json(a);
end$$;
