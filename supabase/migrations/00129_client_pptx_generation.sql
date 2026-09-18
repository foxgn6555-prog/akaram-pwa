-- 00129 · توليد PowerPoint داخل المتصفح وربط المسار بالتقرير.
-- التوليد صار داخل المتصفح بالوحدة المشتركة نفسها التي تبني المعاينة، فيرفع
-- الموظف الملف إلى دلو complaint-media (الصلاحية قائمة منذ 00047: «for all»
-- لموظفي الشكاوى على الدلو)، ثم يربط المسار ويعيد التقرير إلى قيد التدقيق.

create or replace function public.complaint_attach_pptx(p_report_id uuid, p_path text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not app.has_role(array['complaints_officer','super_admin']) then
    raise exception 'COMPLAINT_FORBIDDEN';
  end if;
  if coalesce(p_path, '') !~ '^reports/[0-9a-fA-F-]+/complaints-.+\.pptx$' then
    raise exception 'COMPLAINT_PPTX_PATH_INVALID';
  end if;
  update public.complaint_reports
     set pptx_path = p_path,
         status = 'quality_review',
         approved_by = null,
         approved_at = null,
         review_confirmed_at = null,
         reviewed_pptx_path = null,
         delivery_id = null
   where id = p_report_id;
  if not found then
    raise exception 'COMPLAINT_REPORT_NOT_FOUND';
  end if;
end $$;

grant execute on function public.complaint_attach_pptx(uuid, text) to authenticated;
