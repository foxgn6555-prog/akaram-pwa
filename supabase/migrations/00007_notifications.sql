-- ═══════════════════════════════════════════════════════════════
-- 00007 · الإشعارات + Trigger التوليد التلقائي + RLS
-- الإنشاء يتم فقط عبر triggers بـ SECURITY DEFINER — لا إدراج مباشر من العملاء.
-- ═══════════════════════════════════════════════════════════════

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text,
  type       text not null default 'info' check (type in ('info', 'success', 'warning', 'error')),
  link       text,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- المستخدم يرى/يعدّل إشعاراته هو فقط (تحديد قراءة/تجاهل)
create policy "notifications: قراءة إشعاراتي" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "notifications: تحديث إشعاراتي" on public.notifications
  for update to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: حذف إشعاراتي" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

create index idx_notifications_user       on public.notifications (user_id, created_at desc);
create index idx_notifications_unread     on public.notifications (user_id) where not is_read;

-- ── توليد إشعار تلقائي عند تغيّر حالة طلب ──
create or replace function app.notify_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  emp_name    text;
begin
  if old.status = new.status then
    return new;
  end if;

  select e.user_id, e.full_name into target_user, emp_name
  from public.employees e
  where e.id = new.employee_id;

  if target_user is null then
    return new;
  end if;

  insert into public.notifications (user_id, title, body, type, link)
  values (
    target_user,
    'تحديث حالة الطلب',
    format('طلبك رقم %s أصبح بالحالة: %s', new.id, new.status),
    case when new.status = 'rejected' then 'error'
         when new.status in ('approved', 'completed') then 'success'
         else 'info' end,
    '/employee/requests/' || new.id
  );

  return new;
end;
$$;

create trigger trg_requests_notify
  after update of status on public.requests
  for each row execute function app.notify_request_status_change();
