-- 20261203000300 · حضوريات الآليات المؤجرة — الرواتب والاعتماد (معاون ← مالية)
--   · الراتب تحدّده المالية فقط: شهري أو يومي، لكل سائق × آلية × شهر.
--   · المستحق = الراتب − (أيام الغياب × قيمة اليوم) − الضريبة.
--       monthly ⇒ قيمة اليوم = monthly_amount / أيام الشهر؛ المستحق الأساسي = monthly_amount × (أيام الحضور / أيام الشهر)
--       daily   ⇒ قيمة اليوم = daily_amount؛  المستحق الأساسي = daily_amount × أيام الحضور
--   · الضريبة: fixed ⇒ مبلغ الشهر كما هو؛ percent ⇒ نسبة من المستحق الأساسي.
--   · سلسلة الاعتماد: draft ← (إرسال غرفة العمليات) ← deputy_approved ← (دفع المالية) ← finance_paid.
--     الرفض متاح للمعاون وللمالية قبل الدفع، ويُسجَّل السبب.

-- ── ① حفظ راتب سائق ────────────────────────────────────────────────────────
create or replace function public.rented_salary_save(
  p_driver_external_id uuid, p_vehicle_id uuid, p_month date,
  p_salary_mode text, p_amount numeric, p_note text default null
) returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_before jsonb; v_m date := date_trunc('month', p_month)::date; v_status text;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'RENTED_SALARY_FORBIDDEN'; end if;
  if p_salary_mode not in ('monthly', 'daily') then raise exception 'RENTED_SALARY_MODE_INVALID'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'RENTED_SALARY_AMOUNT_INVALID'; end if;
  if not exists (select 1 from public.garage_vehicles
                  where id = p_vehicle_id and ownership_type = 'rented' and archived_at is null) then
    raise exception 'RENTED_VEHICLE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.station_external_drivers where id = p_driver_external_id) then
    raise exception 'RENTED_DRIVER_NOT_FOUND';
  end if;

  -- لا تعديل بعد الدفع
  select status into v_status from public.rented_attendance_months where month = v_m;
  if v_status = 'finance_paid' then raise exception 'RENTED_MONTH_LOCKED'; end if;

  select to_jsonb(x) into v_before from public.rented_driver_salaries x
   where x.driver_external_id = p_driver_external_id and x.vehicle_id = p_vehicle_id and x.month = v_m;

  insert into public.rented_driver_salaries
         (driver_external_id, vehicle_id, month, salary_mode, monthly_amount, daily_amount, note, set_by)
  values (p_driver_external_id, p_vehicle_id, v_m, p_salary_mode,
          case when p_salary_mode = 'monthly' then p_amount else 0 end,
          case when p_salary_mode = 'daily'   then p_amount else 0 end,
          p_note, auth.uid())
  on conflict (driver_external_id, vehicle_id, month) do update
     set salary_mode    = excluded.salary_mode,
         monthly_amount = excluded.monthly_amount,
         daily_amount   = excluded.daily_amount,
         note           = excluded.note,
         set_by         = auth.uid(),
         updated_at     = now();

  insert into public.rented_attendance_audit (entity, entity_id, action, before, after, reason, actor)
  values ('salary', p_driver_external_id || ':' || p_vehicle_id || ':' || to_char(v_m, 'YYYY-MM'), 'save', v_before,
          jsonb_build_object('salary_mode', p_salary_mode, 'amount', p_amount), p_note, auth.uid());
end$$;

-- ── ② حساب التسوية لشهر (يُستخدم في الكشف والاعتماد) ───────────────────────
-- يعيد صفاً لكل (سائق خارجي، آلية) له راتب أو حضور في الشهر.
create or replace function app.rented_settlement_rows(p_month date)
returns table (
  driver_external_id uuid, driver_name text, contractor_name text,
  vehicle_id uuid, db_number text, vehicle_name text, garage_parent_sector text,
  present_days int, absent_days int, days_in_month int,
  salary_mode text, monthly_amount numeric, daily_amount numeric, daily_value numeric,
  base_amount numeric, absence_deduction numeric, tax_mode text, tax_value numeric, tax_amount numeric,
  net_amount numeric, tons_discharged numeric, monthly_target_tons numeric, tons_per_trip numeric,
  trips_required int, has_salary boolean, tax_set boolean
)
language sql stable security definer set search_path = public, app as $$
  with m as (
    select date_trunc('month', p_month)::date as first_day,
           (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date as last_day,
           extract(day from (date_trunc('month', p_month) + interval '1 month' - interval '1 day'))::int as dim
  ),
  att as (
    select a.driver_external_id, a.vehicle_id,
           count(*) filter (where a.status = 'present')::int as present_days,
           count(*) filter (where a.status = 'absent')::int  as absent_days,
           coalesce(sum(a.tons_discharged), 0) as tons
      from public.rented_attendance_days a, m
     where a.day between m.first_day and m.last_day
     group by a.driver_external_id, a.vehicle_id
  ),
  keys as (
    select driver_external_id, vehicle_id from att
    union
    select s.driver_external_id, s.vehicle_id from public.rented_driver_salaries s, m where s.month = m.first_day
  )
  select k.driver_external_id,
         ed.full_name,
         ed.contractor_name,
         k.vehicle_id,
         v.db_number,
         v.vehicle_name,
         v.garage_parent_sector,
         coalesce(att.present_days, 0),
         coalesce(att.absent_days, 0),
         m.dim,
         s.salary_mode,
         s.monthly_amount,
         s.daily_amount,
         case when s.salary_mode = 'monthly' then round(s.monthly_amount / m.dim, 2)
              when s.salary_mode = 'daily'   then s.daily_amount
              else 0 end as daily_value,
         -- المستحق الأساسي = قيمة اليوم × أيام الحضور (يومي) أو monthly_amount / أبعاد الشهر × الحضور (شهري)
         case when s.salary_mode = 'monthly' then round(s.monthly_amount * coalesce(att.present_days, 0) / m.dim, 2)
              when s.salary_mode = 'daily'   then round(s.daily_amount * coalesce(att.present_days, 0), 2)
              else 0 end as base_amount,
         -- خصم الغياب = التزام كامل الشهر − المستحق الأساسي (لا يقل عن صفر)
         case when s.salary_mode is null then 0
              when s.salary_mode = 'monthly'
                   then greatest(round(s.monthly_amount - (s.monthly_amount * coalesce(att.present_days, 0) / m.dim), 2), 0)
              else 0 end as absence_deduction,
         t.mode,
         coalesce(t.fixed_amount, t.pct),
         case when t.mode = 'fixed' then t.fixed_amount
              when t.mode = 'percent' then round(
                (case when s.salary_mode = 'monthly' then (s.monthly_amount * coalesce(att.present_days, 0) / m.dim)
                      when s.salary_mode = 'daily'   then (s.daily_amount * coalesce(att.present_days, 0))
                      else 0 end) * t.pct / 100, 2)
              else 0 end as tax_amount,
         case when s.salary_mode is null then 0
              else greatest(
                (case when s.salary_mode = 'monthly' then round(s.monthly_amount * coalesce(att.present_days, 0) / m.dim, 2)
                      when s.salary_mode = 'daily'   then round(s.daily_amount * coalesce(att.present_days, 0), 2)
                      else 0 end)
                - (case when t.mode = 'fixed' then coalesce(t.fixed_amount, 0)
                        when t.mode = 'percent' then round(
                          (case when s.salary_mode = 'monthly' then (s.monthly_amount * coalesce(att.present_days, 0) / m.dim)
                                when s.salary_mode = 'daily'   then (s.daily_amount * coalesce(att.present_days, 0))
                                else 0 end) * t.pct / 100, 2)
                        else 0 end), 0) end as net_amount,
         coalesce(att.tons, 0),
         coalesce(ds.monthly_target_tons, 0),
         ds.tons_per_trip,
         case when ds.tons_per_trip is null or ds.tons_per_trip = 0 then null
              else ceil(coalesce(ds.monthly_target_tons, 0) / ds.tons_per_trip)::int end,
         s.driver_external_id is not null,
         t.vehicle_id is not null
    from keys k
    join public.station_external_drivers ed on ed.id = k.driver_external_id
    join public.garage_vehicles v           on v.id  = k.vehicle_id
    cross join m
    left join att on att.driver_external_id = k.driver_external_id and att.vehicle_id = k.vehicle_id
    left join public.rented_driver_salaries s
           on s.driver_external_id = k.driver_external_id and s.vehicle_id = k.vehicle_id and s.month = m.first_day
    left join public.rented_vehicle_taxes t on t.vehicle_id = k.vehicle_id
    left join public.rented_vehicle_discharge_settings ds on ds.vehicle_id = k.vehicle_id
$$;

-- ── ③ كشف المستحقات (المالية) ──────────────────────────────────────────────
create or replace function public.rented_payroll_sheet(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_m date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date;
  v_rows jsonb; v_tot jsonb; v_month jsonb;
begin
  if not app.has_role(array['finance_officer', 'deputy_director', 'executive_director', 'super_admin']) then
    raise exception 'RENTED_SALARY_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.db_number), '[]'::jsonb) into v_rows
    from app.rented_settlement_rows(v_m) r;

  select jsonb_build_object(
           'base',     coalesce(sum(base_amount), 0),
           'absence',  coalesce(sum(absence_deduction), 0),
           'tax',      coalesce(sum(tax_amount), 0),
           'net',      coalesce(sum(net_amount), 0),
           'drivers',  count(distinct driver_external_id),
           'rows_with_salary', count(*) filter (where has_salary)
         ) into v_tot
    from app.rented_settlement_rows(v_m);

  select to_jsonb(x) into v_month from public.rented_attendance_months x where x.month = v_m;

  return jsonb_build_object(
    'month',  to_char(v_m, 'YYYY-MM'),
    'status', coalesce(v_month->>'status', 'draft'),
    'month_row', v_month,
    'totals', v_tot,
    'rows',   v_rows
  );
end$$;

-- ── ④ إرسال الشهر للاعتماد (غرفة العمليات) ─────────────────────────────────
create or replace function public.rented_month_submit(p_month date default null)
returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_m date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'RENTED_ATT_FORBIDDEN'; end if;
  if v_m >= date_trunc('month', (now() at time zone 'Asia/Baghdad')::date)::date then
    raise exception 'RENTED_MONTH_NOT_ENDED';
  end if;
  perform app.rented_attendance_sync_range(v_m, (v_m + interval '1 month')::date - 1);

  insert into public.rented_attendance_months (month, status, submitted_by, submitted_at)
  values (v_m, 'draft', auth.uid(), now())
  on conflict (month) do update
     set status = 'draft', submitted_by = auth.uid(), submitted_at = now(),
         deputy_by = null, deputy_at = null, deputy_note = null,
         finance_by = null, finance_at = null, finance_note = null,
         updated_at = now()
   where public.rented_attendance_months.status in ('draft', 'rejected');
end$$;

-- ── ⑤ اعتماد المعاون (أو رفضه) ─────────────────────────────────────────────
create or replace function public.rented_month_decide_deputy(p_month date, p_approve boolean, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_m date := date_trunc('month', p_month)::date; v_st text;
begin
  if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'RENTED_TAX_FORBIDDEN'; end if;
  select status into v_st from public.rented_attendance_months where month = v_m for update;
  if not found then raise exception 'RENTED_MONTH_NOT_SUBMITTED'; end if;
  if v_st <> 'draft' then raise exception 'RENTED_MONTH_WRONG_STATE'; end if;

  update public.rented_attendance_months
     set status      = case when p_approve then 'deputy_approved' else 'rejected' end,
         deputy_by   = auth.uid(),
         deputy_at   = now(),
         deputy_note = nullif(trim(coalesce(p_note, '')), ''),
         updated_at  = now()
   where month = v_m;

  insert into public.rented_attendance_audit (entity, entity_id, action, after, reason, actor)
  values ('month', to_char(v_m, 'YYYY-MM'), case when p_approve then 'deputy_approve' else 'deputy_reject' end,
          jsonb_build_object('status', case when p_approve then 'deputy_approved' else 'rejected' end),
          p_note, auth.uid());
end$$;

-- ── ⑥ دفع المالية (إغلاق الشهر) ────────────────────────────────────────────
create or replace function public.rented_month_pay(p_month date, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public, app as $$
declare v_m date := date_trunc('month', p_month)::date; v_st text; v_no_salary int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'RENTED_SALARY_FORBIDDEN'; end if;
  select status into v_st from public.rented_attendance_months where month = v_m for update;
  if not found then raise exception 'RENTED_MONTH_NOT_SUBMITTED'; end if;
  if v_st <> 'deputy_approved' then raise exception 'RENTED_MONTH_NOT_APPROVED'; end if;

  -- لا دفع لمن لم تُحدَّد رواتبهم (صفوف الحضور وحدها لا تُصرف)
  select count(*) into v_no_salary from app.rented_settlement_rows(v_m) r
   where (not r.has_salary) and coalesce(r.present_days, 0) > 0;
  if v_no_salary > 0 then raise exception 'RENTED_SALARY_MISSING' using detail = v_no_salary::text; end if;

  update public.rented_attendance_months
     set status = 'finance_paid', finance_by = auth.uid(), finance_at = now(),
         finance_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
   where month = v_m;

  insert into public.rented_attendance_audit (entity, entity_id, action, after, reason, actor)
  values ('month', to_char(v_m, 'YYYY-MM'), 'finance_pay', jsonb_build_object('status', 'finance_paid'), p_note, auth.uid());
end$$;

-- ── ⑦ سجل التدقيق (قراءة) ──────────────────────────────────────────────────
create or replace function public.rented_attendance_audit_list(p_limit int default 200)
returns table (id uuid, entity text, entity_id text, action text, before jsonb, after jsonb, reason text, actor_name text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.entity, a.entity_id, a.action, a.before, a.after, a.reason, app.user_display_name(a.actor), a.created_at
    from public.rented_attendance_audit a
   where app.has_role(array['deputy_director', 'finance_officer', 'super_admin'])
   order by a.created_at desc
   limit least(coalesce(p_limit, 200), 1000)
$$;

-- ── ⑧ الصلاحيات ────────────────────────────────────────────────────────────
grant execute on function public.rented_attendance_month(date, text)      to authenticated;
grant execute on function public.rented_attendance_garages()              to authenticated;
grant execute on function public.rented_attendance_set_day(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.rented_discharge_save(uuid, numeric, numeric, text)     to authenticated;
grant execute on function public.rented_discharge_list()                 to authenticated;
grant execute on function public.rented_tax_save(uuid, text, numeric, text) to authenticated;
grant execute on function public.rented_tax_clear(uuid, text)            to authenticated;
grant execute on function public.rented_tax_list()                       to authenticated;
grant execute on function public.rented_salary_save(uuid, uuid, date, text, numeric, text) to authenticated;
grant execute on function public.rented_payroll_sheet(date)              to authenticated;
grant execute on function public.rented_month_submit(date)               to authenticated;
grant execute on function public.rented_month_decide_deputy(date, boolean, text) to authenticated;
grant execute on function public.rented_month_pay(date, text)            to authenticated;
grant execute on function public.rented_attendance_audit_list(int)       to authenticated;
