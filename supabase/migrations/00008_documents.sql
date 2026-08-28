-- ═══════════════════════════════════════════════════════════════
-- 00008 · الوثائق (Metadata فقط — الملفات في Storage · انظر 00015)
-- ═══════════════════════════════════════════════════════════════

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  bucket      text not null check (bucket in ('employee-documents', 'payroll', 'avatars')),
  path        text not null,
  file_name   text not null,
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0),
  category    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (bucket, path)
);

alter table public.documents enable row level security;

-- المالك يرى وثائقه
create policy "documents: قراءة وثائقي" on public.documents
  for select to authenticated
  using (employee_id = (select app.current_employee_id()));

-- HR / IT / Super Admin يرون الكل
create policy "documents: قراءة للإدارات" on public.documents
  for select to authenticated
  using (app.has_role(array['hr_officer', 'it_admin', 'super_admin']));

-- رفع: المالك لوثائقه أو HR
create policy "documents: رفع" on public.documents
  for insert to authenticated
  with check (employee_id = (select app.current_employee_id())
              or (app.has_role(array['hr_officer', 'super_admin'])));

create policy "documents: حذف بواسطة HR" on public.documents
  for delete to authenticated
  using (app.has_role(array['hr_officer', 'super_admin']));

create index idx_documents_employee on public.documents (employee_id);
create index idx_documents_bucket   on public.documents (bucket);

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function app.set_updated_at();
