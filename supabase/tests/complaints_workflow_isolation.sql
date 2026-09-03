-- عزل دورة الشكاوى: مسؤول القسم يرى المسند إليه فقط.
-- تستخدم معاملة rollback لأن بيانات دورة الشكاوى ممنوعة من الحذف الفيزيائي.
begin;
do $$
declare
  v_officer uuid := '10000000-0000-0000-0000-000000000047';
  v_manager_a uuid := '20000000-0000-0000-0000-000000000047';
  v_manager_b uuid := '30000000-0000-0000-0000-000000000047';
  v_complaint_id uuid; v_item_id uuid; v_visible_count bigint;
begin
  insert into auth.users(id,email) values
    (v_officer,'complaints-officer-test@akram.iq'),
    (v_manager_a,'complaints-manager-a@akram.iq'),
    (v_manager_b,'complaints-manager-b@akram.iq');
  insert into public.user_roles(user_id,role) values
    (v_officer,'complaints_officer'),(v_manager_a,'department_manager'),(v_manager_b,'department_manager');
  insert into public.complaints(sector,status,created_by) values('karrada','under_review',v_officer) returning id into v_complaint_id;
  insert into public.complaint_items(complaint_id,sequence_no) values(v_complaint_id,1) returning id into v_item_id;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  perform public.complaint_assign_item(v_item_id,v_manager_a);

  perform set_config('request.jwt.claim.sub',v_manager_a::text,true);
  select count(*) into v_visible_count from public.complaint_items where id=v_item_id;
  if v_visible_count <> 1 then raise exception 'ISOLATION FAIL — المسؤول المسند إليه لا يرى موقعه'; end if;

  perform set_config('request.jwt.claim.sub',v_manager_b::text,true);
  select count(*) into v_visible_count from public.complaint_items where id=v_item_id;
  if v_visible_count <> 0 then raise exception 'ISOLATION FAIL — مسؤول آخر يرى موقعاً غير مسند إليه'; end if;
  select count(*) into v_visible_count from public.complaints where id=v_complaint_id;
  if v_visible_count <> 0 then raise exception 'ISOLATION FAIL — مسؤول آخر يرى حزمة غير مسندة إليه'; end if;

  reset role;
  raise notice '✅ عزل الشكاوى: المسؤول يرى المسند إليه فقط';
end $$;
rollback;
