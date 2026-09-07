do $$
declare u uuid:=gen_random_uuid();r uuid;
begin
 insert into auth.users(id,email)values(u,'report-archive@test.iq');
 insert into public.user_roles(user_id,role)values(u,'complaints_officer');
 insert into public.complaint_reports(report_date,sector,title,created_by)values('2026-09-07','karrada','مسودة للحذف',u)returning id into r;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',u::text,true);
 begin perform public.complaint_archive_report(r,'');raise exception'EMPTY_REASON_ACCEPTED';exception when others then if sqlerrm='EMPTY_REASON_ACCEPTED'then raise;end if;end;
 perform public.complaint_archive_report(r,'مسودة غير مطلوبة');
 if not exists(select 1 from public.complaint_reports where id=r and status='archived'and archived_at is not null)then raise exception'REPORT_ARCHIVE_FAILED';end if;
 raise notice'✅ حذف التقرير آمن: سبب إلزامي ونقل إلى الأرشيف دون حذف فعلي';
end$$;
