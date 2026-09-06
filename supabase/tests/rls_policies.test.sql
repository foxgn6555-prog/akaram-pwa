-- اختبارات pgTAP فعلية لتمكين RLS وحواجز دورة الشكاوى.
begin;
select plan(24);

select ok(relrowsecurity, 'RLS employees') from pg_class where oid='public.employees'::regclass;
select ok(relrowsecurity, 'RLS requests') from pg_class where oid='public.requests'::regclass;
select ok(relrowsecurity, 'RLS payrolls') from pg_class where oid='public.payrolls'::regclass;
select ok(relrowsecurity, 'RLS complaint inbox') from pg_class where oid='public.complaint_inbox_messages'::regclass;
select ok(relrowsecurity, 'RLS complaints') from pg_class where oid='public.complaints'::regclass;
select ok(relrowsecurity, 'RLS complaint items') from pg_class where oid='public.complaint_items'::regclass;
select ok(relrowsecurity, 'RLS complaint media') from pg_class where oid='public.complaint_media'::regclass;
select ok(relrowsecurity, 'RLS email deliveries') from pg_class where oid='public.complaint_email_deliveries'::regclass;
select ok(relrowsecurity, 'RLS reports') from pg_class where oid='public.complaint_reports'::regclass;
select ok(relrowsecurity, 'RLS report items') from pg_class where oid='public.complaint_report_items'::regclass;

select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_items' and policyname='complaint items: assignee read'), 'assignee item policy');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_media' and policyname='complaint media: assignee read'), 'assignee media policy');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_media' and policyname='complaint media: assignee add after'), 'assignee after upload policy');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_reports' and policyname='complaint reports: officer select'), 'officer report policy');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_email_deliveries' and policyname='complaint deliveries: officer read'), 'officer delivery policy');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='complaint storage: manager upload after'), 'manager storage policy');

select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_inbox' and not tgisinternal), 'no delete inbox trigger');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaints' and not tgisinternal), 'no delete complaint trigger');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_items' and not tgisinternal), 'no delete items trigger');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_media' and not tgisinternal), 'no delete media trigger');
select ok(exists(select 1 from pg_trigger where tgname='trg_complaint_reports_guard' and not tgisinternal), 'report transition guard');
select ok(exists(select 1 from pg_trigger where tgname='trg_complaint_delivery_lifecycle' and not tgisinternal), 'delivery lifecycle trigger');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename='complaint_reports' and cmd='DELETE'), 'no report delete policy');
select ok(to_regprocedure('public.complaint_approve_report(uuid,text,boolean)') is not null, 'report approval RPC');

select * from finish();
rollback;
