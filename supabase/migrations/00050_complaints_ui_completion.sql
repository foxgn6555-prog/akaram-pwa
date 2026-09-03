-- ═══════════════════════════════════════════════════════════════
-- 00050 · إكمال واجهات التفاصيل ومحرر التقرير مع حراسة التعديلات
-- ═══════════════════════════════════════════════════════════════

create or replace function app.complaint_report_item_guard()
returns trigger language plpgsql set search_path=public,app as $$
declare v_status text;
begin
  if auth.role()='service_role' or current_user not in ('authenticated','anon') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  select status into v_status from public.complaint_reports where id=coalesce(new.report_id,old.report_id);
  if v_status not in ('draft','quality_review','failed') then raise exception 'COMPLAINT_REPORT_ITEMS_LOCKED'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger trg_complaint_report_items_guard before insert or update or delete on public.complaint_report_items
  for each row execute function app.complaint_report_item_guard();

create or replace function public.complaint_update_report_draft(
  p_report_id uuid,
  p_title text,
  p_layout jsonb,
  p_recipients text[],
  p_items jsonb
) returns void language plpgsql security definer set search_path=public,app as $$
declare v_status text; v_item jsonb; v_email text;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  select status into v_status from public.complaint_reports where id=p_report_id for update;
  if not found or v_status not in ('draft','quality_review','failed') then raise exception 'COMPLAINT_REPORT_LOCKED'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'COMPLAINT_REPORT_TITLE_REQUIRED'; end if;
  if coalesce(array_length(p_recipients,1),0)=0 then raise exception 'COMPLAINT_REPORT_RECIPIENT_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_items,'[]')) <> 'array' then raise exception 'COMPLAINT_REPORT_ITEMS_INVALID'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_items,'[]'))) <>
     (select count(*) from public.complaint_report_items where report_id=p_report_id)
     or (select count(distinct x->>'itemId') from jsonb_array_elements(coalesce(p_items,'[]')) x) <>
        (select count(*) from public.complaint_report_items where report_id=p_report_id)
     or exists (select 1 from jsonb_array_elements(coalesce(p_items,'[]')) x
                where not exists (select 1 from public.complaint_report_items ri
                                  where ri.report_id=p_report_id and ri.item_id=(x->>'itemId')::uuid))
     or exists (select 1 from jsonb_array_elements(coalesce(p_items,'[]')) x
                where coalesce((x->>'displayOrder')::integer,0) < 1)
     or (select count(distinct (x->>'displayOrder')::integer) from jsonb_array_elements(coalesce(p_items,'[]')) x) <>
        (select count(*) from public.complaint_report_items where report_id=p_report_id)
     or not exists (select 1 from jsonb_array_elements(coalesce(p_items,'[]')) x where coalesce((x->>'included')::boolean,false))
  then raise exception 'COMPLAINT_REPORT_ITEMS_INVALID'; end if;
  foreach v_email in array p_recipients loop
    if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'COMPLAINT_REPORT_EMAIL_INVALID'; end if;
  end loop;
  update public.complaint_reports set title=trim(p_title),layout=coalesce(p_layout,'{}'),
    recipients=(select array_agg(distinct lower(trim(e))) from unnest(p_recipients) e),
    status='draft',pptx_path=null,approved_by=null,approved_at=null,delivery_id=null
    where id=p_report_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]')) loop
    update public.complaint_report_items set
      display_order=greatest(1,coalesce((v_item->>'displayOrder')::integer,display_order)),
      included=coalesce((v_item->>'included')::boolean,included),
      slide_layout=coalesce(v_item->'slideLayout',slide_layout)
      where report_id=p_report_id and item_id=(v_item->>'itemId')::uuid;
  end loop;
end $$;
grant execute on function public.complaint_update_report_draft(uuid,text,jsonb,text[],jsonb) to authenticated;
