do $$
declare v_layout jsonb;
begin
 select layout into v_layout from public.complaint_templates where name='القالب الرسمي قبل وبعد' order by created_at limit 1;
 if v_layout->>'accent'<>'#D269C8'
   or v_layout->>'title'<>'تقرير معالجة التلكؤات ليوم'
   or coalesce(v_layout->>'authorityLine','')=''
   or coalesce(v_layout->>'contractorLine','')=''
 then raise exception 'COMPLAINT_REPORT_BRANDING_DEFAULTS_FAIL';end if;
 raise notice '✅ هوية PowerPoint: القالب الرسمي يحمل اللون والعنوان والجهتين';
end $$;
