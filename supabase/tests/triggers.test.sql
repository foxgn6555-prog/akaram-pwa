-- اختبارات pgTAP لتثبيت triggers الحرجة فعلياً.
begin;
select plan(12);
select ok(exists(select 1 from pg_trigger where tgname='trg_requests_workflow' and not tgisinternal),'request workflow');
select ok(exists(select 1 from pg_trigger where tgname='trg_requests_notify' and not tgisinternal),'request notification');
select ok(exists(select 1 from pg_trigger where tgname='trg_requests_version' and not tgisinternal),'request version');
select ok(exists(select 1 from pg_trigger where tgname='trg_audit_employees' and not tgisinternal),'employee audit');
select ok(exists(select 1 from pg_trigger where tgname='trg_audit_user_roles' and not tgisinternal),'role audit');
select ok(exists(select 1 from pg_trigger where tgname='trg_complaint_items_version' and not tgisinternal),'complaint item version');
select ok(exists(select 1 from pg_trigger where tgname='trg_complaint_reports_guard' and not tgisinternal),'report transition guard');
select ok(exists(select 1 from pg_trigger where tgname='trg_complaint_delivery_lifecycle' and not tgisinternal),'delivery lifecycle');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaints' and not tgisinternal),'complaint no delete');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_items' and not tgisinternal),'item no delete');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_media' and not tgisinternal),'media no delete');
select ok(exists(select 1 from pg_trigger where tgname='trg_no_delete_complaint_reports' and not tgisinternal),'report no delete');
select * from finish();
rollback;
