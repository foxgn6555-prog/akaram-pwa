-- ═══════════════════════════════════════════════════════════════
-- 00057 · تحليلات الشكاوى الزمنية للتقارير اليومية/الأسبوعية/الشهرية/النصف سنوية/السنوية
-- ═══════════════════════════════════════════════════════════════
create or replace function public.complaint_analytics(p_from date,p_to date,p_sector text default null)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_result jsonb;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_ANALYTICS_FORBIDDEN';end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>731 then raise exception 'COMPLAINT_ANALYTICS_RANGE_INVALID';end if;
  if p_sector is not null and p_sector not in('karrada','zaafaraniya') then raise exception 'COMPLAINT_SECTOR_INVALID';end if;
  with scoped as(
    select i.id,i.status,c.sector,timezone('Asia/Baghdad',c.received_at)::date received_date,
      exists(select 1 from public.complaint_media m where m.item_id=i.id and m.media_kind='after' and m.is_active) has_after
    from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where timezone('Asia/Baghdad',c.received_at)::date between p_from and p_to
      and(p_sector is null or c.sector=p_sector)and c.archived_at is null
  ),days as(select generate_series(p_from,p_to,interval '1 day')::date report_day),
  daily as(select d.report_day,count(s.id)::integer total,count(s.id)filter(where s.status='approved')::integer approved,
    count(s.id)filter(where s.status in('processed','quality_review'))::integer review,
    count(s.id)filter(where s.status in('assigned','in_progress','returned'))::integer active
    from days d left join scoped s on s.received_date=d.report_day group by d.report_day order by d.report_day),
  statuses as(select status,count(*)::integer count from scoped group by status),
  sectors as(select sector,count(*)::integer count,count(*)filter(where status='approved')::integer approved from scoped group by sector)
  select jsonb_build_object(
    'from',p_from,'to',p_to,'sector',p_sector,
    'summary',(select jsonb_build_object('total',count(*),'approved',count(*)filter(where status='approved'),
      'active',count(*)filter(where status in('assigned','in_progress','returned')),
      'review',count(*)filter(where status in('processed','quality_review')),
      'unassigned',count(*)filter(where status='under_review'),'withAfter',count(*)filter(where has_after))from scoped),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',report_day,'total',total,'approved',approved,'review',review,'active',active))from daily),'[]'::jsonb),
    'statuses',coalesce((select jsonb_agg(to_jsonb(statuses)order by status)from statuses),'[]'::jsonb),
    'sectors',coalesce((select jsonb_agg(to_jsonb(sectors)order by sector)from sectors),'[]'::jsonb)
  )into v_result;
  return v_result;
end $$;
revoke all on function public.complaint_analytics(date,date,text)from public,anon;
grant execute on function public.complaint_analytics(date,date,text)to authenticated;
