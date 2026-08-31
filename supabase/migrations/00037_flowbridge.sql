-- ═══════════════════════════════════════════════════════════════
-- 00037 · FlowBridge — مصمم التدفقات: تخزين حقيقي
--  · flowbridge_state: 3 مفاتيح (portals/graph/settings) — يخدمها
--    Edge Function flowbridge-api (عقد REST الموثق في public/flowbridge)
--  · الإدارة: it_admin / super_admin فقط (نفس نطاق بوابة IT)
--  · بث الأحداث الحية الآمن (بلا بيانات حساسة): انظر 00038_flowbridge_events.sql
-- ═══════════════════════════════════════════════════════════════

create table public.flowbridge_state (
  key         text primary key check (key in ('portals', 'graph', 'settings')),
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users (id) on delete set null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

comment on table public.flowbridge_state is
  'حالة مصمم التدفقات (FlowBridge) — عقد REST: /workflows/{portals|graph|settings}';

alter table public.flowbridge_state enable row level security;

create policy "fb: قراءة بواسطة IT" on public.flowbridge_state
  for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']));

create policy "fb: كتابة بواسطة IT" on public.flowbridge_state
  for all to authenticated
  using      (app.has_role(array['it_admin', 'super_admin']))
  with check (app.has_role(array['it_admin', 'super_admin']));

create trigger trg_fb_state_updated_at
  before update on public.flowbridge_state for each row execute function app.set_updated_at();
create trigger trg_fb_state_version
  before update on public.flowbridge_state for each row execute function app.bump_version();

-- تدقيق مخصص (المفتاح النصي وليس id) — يسجل من غيّر ماذا
create or replace function app.audit_flowbridge_state()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.audit_logs
    (table_name, record_id, operation, old_row, new_row, actor_id, actor_role)
  values
    ('flowbridge_state',
     coalesce(new.key, old.key),
     tg_op,
     case when tg_op <> 'INSERT' then to_jsonb(old) end,
     case when tg_op <> 'DELETE' then to_jsonb(new) end,
     auth.uid(), app.current_role());
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_flowbridge_state
  after insert or update or delete on public.flowbridge_state
  for each row execute function app.audit_flowbridge_state();

-- بذرة: 3 مفاتيح فارغة — لا بيانات وهمية (نفس فلسفة FlowBridge نفسه)
insert into public.flowbridge_state (key, value) values
  ('portals',  '[]'::jsonb),
  ('graph',    '{"nodes": [], "flows": []}'::jsonb),
  ('settings', '{"autosave": true, "apiUrl": "", "apiToken": "", "categories": ["عام"]}'::jsonb)
on conflict (key) do nothing;

-- ═══ Realtime: تفعيل البث الحي لحالة FlowBridge نفسها (تعاون متعدد المسؤولين) ═══
-- على Postgres عادي (بيئة اختبار محلية بلا Supabase) يُتخطى بأمان.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.flowbridge_state';
  end if;
exception
  when duplicate_object then null;
end $$;
