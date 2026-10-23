-- 00337: تقرير أداء الموافقات — زمن كل خطوة (من لحظة وصولها للموافِق حتى القرار)، المتأخرون، التصعيدات، التفويضات.
-- (1) عمود pending_at يُضبط تلقائياً (زناد) عند تحوّل المهمة إلى pending — يعمل مع كل مسارات الإنشاء/التفعيل.
-- (2) approval_performance_report(p_from, p_to): للتطوير المركزية والمدير المفوض (it_admin / super_admin).

alter table public.approval_tasks add column if not exists pending_at timestamptz;
-- تقريب للمهام القديمة: وقت الإنشاء
update public.approval_tasks set pending_at = created_at where pending_at is null and status <> 'waiting';

create or replace function app.approval_tasks_set_pending_at() returns trigger language plpgsql as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') and new.pending_at is null then new.pending_at := now(); end if;
  return new;
end$$;
drop trigger if exists approval_tasks_pending_at on public.approval_tasks;
create trigger approval_tasks_pending_at before insert or update of status on public.approval_tasks for each row execute function app.approval_tasks_set_pending_at();

create or replace function app.approval_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'time_permit' then 'زمنية' when 'advance' then 'سلفة' when 'termination' then 'إنهاء خدمة'
                     when 'supplies' then 'مستلزمات' when 'disclosure' then 'إفصاح' else coalesce(p_kind, '—') end
$$;

create or replace function public.approval_performance_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare d_from date := coalesce(p_from, (current_date - 29)); d_to date := coalesce(p_to, current_date); res jsonb;
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'APPROVAL_REPORT_FORBIDDEN'; end if;
  if d_to < d_from then raise exception 'APPROVAL_REPORT_DATES_INVALID'; end if;
  with decided as (
    select t.*, extract(epoch from (t.decided_at - coalesce(t.pending_at, t.created_at))) / 3600.0 as hours
    from public.approval_tasks t
    where t.status in ('approved','rejected') and t.decided_at is not null and t.decided_at::date between d_from and d_to
  ), open_t as (
    select t.*, extract(epoch from (now() - coalesce(t.pending_at, t.created_at))) / 3600.0 as hours
    from public.approval_tasks t where t.status = 'pending'
  ), escalated as (
    select t.* from public.approval_tasks t where t.escalated_at is not null and t.escalated_at::date between d_from and d_to
  )
  select jsonb_build_object(
    'from', d_from, 'to', d_to,
    'summary', jsonb_build_object(
      'decided', (select count(*) from decided), 'approved', (select count(*) from decided where status = 'approved'), 'rejected', (select count(*) from decided where status = 'rejected'),
      'avg_hours', (select round(avg(hours)::numeric, 1) from decided), 'median_hours', (select round((percentile_cont(0.5) within group (order by hours))::numeric, 1) from decided),
      'within_sla', (select count(*) from decided where due_at is not null and decided_at <= due_at), 'with_sla', (select count(*) from decided where due_at is not null),
      'delegated', (select count(*) from decided where decided_for is not null and decided_for <> decided_by),
      'escalated', (select count(*) from escalated),
      'open_now', (select count(*) from open_t), 'overdue_now', (select count(*) from open_t where due_at is not null and due_at < now()),
      'open_avg_hours', (select round(avg(hours)::numeric, 1) from open_t)),
    'by_kind', coalesce((select jsonb_agg(x order by x -> 'decided' desc) from (
      select jsonb_build_object('kind', k.request_kind, 'label', app.approval_kind_label(k.request_kind), 'decided', count(*), 'avg_hours', round(avg(hours)::numeric, 1), 'max_hours', round(max(hours)::numeric, 1),
                                'rejected', count(*) filter (where status = 'rejected'), 'open_now', (select count(*) from open_t o where o.request_kind = k.request_kind)) x
      from decided k group by k.request_kind) s), '[]'::jsonb),
    'by_step', coalesce((select jsonb_agg(x order by x -> 'avg_hours' desc nulls last) from (
      select jsonb_build_object('kind', k.request_kind, 'kind_label', app.approval_kind_label(k.request_kind), 'step_label', k.step_label, 'decided', count(*), 'avg_hours', round(avg(hours)::numeric, 1), 'max_hours', round(max(hours)::numeric, 1),
                                'overdue', count(*) filter (where due_at is not null and decided_at > due_at), 'open_now', (select count(*) from open_t o where o.request_kind = k.request_kind and o.step_label = k.step_label)) x
      from decided k group by k.request_kind, k.step_label) s), '[]'::jsonb),
    'by_approver', coalesce((select jsonb_agg(x order by x -> 'overdue_now' desc, x -> 'avg_hours' desc nulls last) from (
      select jsonb_build_object('user_id', u.uid, 'name', app.user_display_name(u.uid),
                                'decided', (select count(*) from decided d where d.decided_by = u.uid), 'avg_hours', (select round(avg(hours)::numeric, 1) from decided d where d.decided_by = u.uid),
                                'as_delegate', (select count(*) from decided d where d.decided_by = u.uid and d.decided_for is not null and d.decided_for <> u.uid),
                                'pending_now', (select count(*) from open_t o where u.uid = any(o.approvers)), 'overdue_now', (select count(*) from open_t o where u.uid = any(o.approvers) and o.due_at is not null and o.due_at < now())) x
      from (select decided_by as uid from decided union select unnest(approvers) from open_t) u where u.uid is not null) s), '[]'::jsonb),
    'open_tasks', coalesce((select jsonb_agg(x order by x -> 'hours' desc) from (
      select jsonb_build_object('task_id', o.id, 'kind', o.request_kind, 'kind_label', app.approval_kind_label(o.request_kind), 'step_no', o.step_no, 'step_label', o.step_label, 'hours', round(o.hours::numeric, 1),
                                'due_at', o.due_at, 'overdue', (o.due_at is not null and o.due_at < now()), 'escalated', o.escalated_at is not null,
                                'approvers', (select string_agg(app.user_display_name(a), '، ') from unnest(o.approvers) a)) x
      from open_t o limit 50) s), '[]'::jsonb),
    'escalations', coalesce((select jsonb_agg(x order by x -> 'escalated_at' desc) from (
      select jsonb_build_object('task_id', e.id, 'kind_label', app.approval_kind_label(e.request_kind), 'step_label', e.step_label, 'escalated_at', e.escalated_at, 'status', e.status,
                                'approvers', (select string_agg(app.user_display_name(a), '، ') from unnest(e.approvers) a)) x from escalated e limit 50) s), '[]'::jsonb)
  ) into res;
  return res;
end$$;
grant execute on function public.approval_performance_report(date, date) to authenticated;
