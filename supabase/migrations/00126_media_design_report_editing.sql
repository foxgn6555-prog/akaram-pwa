-- 00126: تحرير تقرير التصميم المصور وحفظه في القاعدة
--  · ورقة نص لكل نوع عمل (الورقة التي تلي الغلاف) — جدول media_design_sheets
--  · عبارة قابلة للتعديل فوق كل صورة في صفحات 4-صور — media_design_photos.report_caption
--  · RPC حفظ واحد يرفع الورقات والعبارات دفعة واحدة لمسؤول الإعلام
alter table public.media_design_photos
  add column if not exists report_caption text;

create table if not exists public.media_design_sheets (
  design_id  uuid not null references public.media_designs(id) on delete cascade,
  work_type  text not null,
  sheet_text text not null default '',
  updated_at timestamptz not null default now(),
  primary key (design_id, work_type)
);
alter table public.media_design_sheets enable row level security;
create policy "sheets: قراءة للمصادَقين"
  on public.media_design_sheets for select to authenticated using (true);

-- تفاصيل التصميم تشمل عبارة التقرير فوق الصورة
drop function if exists public.media_design_detail(uuid);
create function public.media_design_detail(p_id uuid)
returns table(
  design jsonb,
  photo_id uuid,
  source_photo_id uuid,
  source_submission_id uuid,
  work_type text,
  storage_path text,
  caption text,
  report_caption text,
  sort_order integer
)
language plpgsql stable security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  select * into d from public.media_designs where id = p_id;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;
  return query
  select to_jsonb(d), dp.id, dp.source_photo_id, dp.source_submission_id,
         dp.work_type, dp.storage_path, dp.caption, dp.report_caption, dp.sort_order
    from public.media_design_photos dp
   where dp.design_id = p_id
   order by dp.work_type, dp.sort_order;
end;
$$;

-- ورقات النص الخاصة بتصميم
create or replace function public.media_design_sheets_list(p_id uuid)
returns table (work_type text, sheet_text text)
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  return query
  select s.work_type, s.sheet_text
    from public.media_design_sheets s
   where s.design_id = p_id
   order by s.work_type;
end;
$$;

-- حفظ تحرير التقرير: الورقات + العبارات فوق الصور (مصفوفات jsonb)
create or replace function public.media_design_report_save(
  p_id uuid,
  p_sheets jsonb,
  p_captions jsonb
)
returns void
language plpgsql security definer
set search_path = public, app
as $$
declare
  el jsonb;
  v_text text;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if not exists (select 1 from public.media_designs where id = p_id) then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;

  if p_sheets is not null then
    if jsonb_typeof(p_sheets) <> 'array' then raise exception 'MEDIA_REPORT_PAYLOAD_INVALID'; end if;
    for el in select * from jsonb_array_elements(p_sheets) loop
      v_text := trim(coalesce(el->>'text', ''));
      if length(v_text) > 300 then raise exception 'MEDIA_REPORT_TEXT_TOO_LONG'; end if;
      insert into public.media_design_sheets (design_id, work_type, sheet_text)
      values (p_id, el->>'work_type', v_text)
      on conflict (design_id, work_type)
      do update set sheet_text = excluded.sheet_text, updated_at = now();
    end loop;
  end if;

  if p_captions is not null then
    if jsonb_typeof(p_captions) <> 'array' then raise exception 'MEDIA_REPORT_PAYLOAD_INVALID'; end if;
    for el in select * from jsonb_array_elements(p_captions) loop
      v_text := trim(coalesce(el->>'text', ''));
      if length(v_text) > 120 then raise exception 'MEDIA_REPORT_TEXT_TOO_LONG'; end if;
      update public.media_design_photos
         set report_caption = nullif(v_text, '')
       where id = (el->>'row_id')::uuid and design_id = p_id;
    end loop;
  end if;
end;
$$;

grant execute on function public.media_design_detail(uuid) to authenticated;
grant execute on function public.media_design_sheets_list(uuid) to authenticated;
grant execute on function public.media_design_report_save(uuid, jsonb, jsonb) to authenticated;
