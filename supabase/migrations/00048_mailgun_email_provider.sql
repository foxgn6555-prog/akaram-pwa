-- ═══════════════════════════════════════════════════════════════
-- 00048 · Mailgun: سجل الإرسال وأحداث التسليم
-- الأسرار لا تُخزّن في DB؛ تبقى في Supabase Edge Function Secrets.
-- ═══════════════════════════════════════════════════════════════

create table public.complaint_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid references public.complaints(id),
  provider text not null default 'mailgun' check (provider = 'mailgun'),
  provider_message_id text unique,
  sender text not null,
  recipients text[] not null check (cardinality(recipients) > 0),
  subject text not null,
  attachment_paths text[] not null default '{}',
  status text not null default 'queued' check (status in (
    'queued','accepted','delivered','temporary_failure','permanent_failure','rejected'
  )),
  error_message text,
  sent_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaint_email_events (
  id bigint generated always as identity primary key,
  delivery_id uuid references public.complaint_email_deliveries(id) on delete cascade,
  provider_event_id text unique,
  event_type text not null,
  severity text,
  recipient text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_complaint_deliveries_complaint on public.complaint_email_deliveries(complaint_id,created_at desc);
create index idx_complaint_deliveries_status on public.complaint_email_deliveries(status,created_at desc);
create index idx_complaint_events_delivery on public.complaint_email_events(delivery_id,event_at desc);

alter table public.complaint_email_deliveries enable row level security;
alter table public.complaint_email_events enable row level security;

create policy "complaint deliveries: officer read" on public.complaint_email_deliveries
  for select to authenticated using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint events: officer read" on public.complaint_email_events
  for select to authenticated using (app.has_role(array['complaints_officer','super_admin']));

-- الكتابة تتم من Edge Functions باستخدام service_role فقط.
create trigger trg_complaint_deliveries_updated before update on public.complaint_email_deliveries
  for each row execute function app.set_updated_at();
