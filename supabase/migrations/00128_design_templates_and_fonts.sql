-- 00128: قوالب صفحات التقرير وخطوطه — محفوظة على التصميم
--  · template_style jsonb: {photo_layout, sheet_style, summary_theme, font}
alter table public.media_designs
  add column if not exists template_style jsonb;

drop function if exists public.media_design_report_save(uuid, jsonb, jsonb, jsonb, jsonb);
create or replace function public.media_design_report_save(
  p_id uuid,
  p_sheets jsonb,
  p_captions jsonb,
  p_summary jsonb default null,
  p_colors jsonb default null,
  p_style jsonb default null
)
returns void
language plpgsql security definer
set search_path = public, app
as $$
declare
  el jsonb;
  v_text text;
  v_fit text;
  v_zoom numeric;
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
      v_fit := el->>'fit';
      v_zoom := (el->>'zoom')::numeric;
      if v_fit is not null and v_fit not in ('contain', 'cover') then
        raise exception 'MEDIA_PHOTO_FIT_INVALID';
      end if;
      if v_zoom is not null and (v_zoom < 0.5 or v_zoom > 3) then
        raise exception 'MEDIA_PHOTO_ZOOM_INVALID';
      end if;
      update public.media_design_photos
         set report_caption = nullif(v_text, ''),
             display_fit = coalesce(v_fit, display_fit),
             display_zoom = coalesce(v_zoom, display_zoom)
       where id = (el->>'row_id')::uuid and design_id = p_id;
    end loop;
  end if;

  if p_summary is not null then
    if jsonb_typeof(p_summary) <> 'object' then raise exception 'MEDIA_REPORT_PAYLOAD_INVALID'; end if;
    update public.media_designs set summary = p_summary where id = p_id;
  end if;

  if p_colors is not null then
    if jsonb_typeof(p_colors) <> 'object' then raise exception 'MEDIA_REPORT_PAYLOAD_INVALID'; end if;
    update public.media_designs set template_colors = p_colors where id = p_id;
  end if;

  if p_style is not null then
    if jsonb_typeof(p_style) <> 'object' then raise exception 'MEDIA_REPORT_PAYLOAD_INVALID'; end if;
    update public.media_designs set template_style = p_style where id = p_id;
  end if;
end;
$$;

grant execute on function public.media_design_report_save(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
