-- 00257 · تدقيق سلسلة الشكاوى: حالة الشكوى الأم كانت تنحرف عن حالة عناصرها في مسار «العنصر الواحد»
--   Q3: إنجاز عنصر واحد من اثنين ⇒ الأم «قيد التدقيق» رغم أن الثاني ما زال مسنداً.
--   Q4: إعادة عنصر للمسؤول ⇒ الأم تبقى «قيد التدقيق» (مسار التذكرة يعيدها «قيد المعالجة»).
--   Q6: اعتماد كل العناصر فرادى ⇒ الأم لا تصل «جاهزة للإرسال» أبداً (مسار التذكرة يصل إليها).
--   الجذر: دالتا complaint_complete_item / complaint_review_item تحدّثان الأم بقيمة ثابتة أو لا تحدّثانها.
--   الحل: دالة واحدة app.complaint_sync_parent_status تشتق حالة الأم من عناصرها (لا تمس المرسلة/المؤرشفة)، وتُستدعى في المسارين.
--   Q7 (شكاوى المواطنين): حدث الإسناد يسجّل from_status بعد التحديث (دائماً in_progress) — صُحّح.

create or replace function app.complaint_sync_parent_status(p_complaint uuid) returns text
language plpgsql security definer set search_path = public, app as $$
declare cur text; nxt text; n_total int; n_approved int; n_review int; n_active int; n_assigned int;
begin
  select status into cur from public.complaints where id = p_complaint for update;
  if not found or cur in ('sent', 'archived') then return cur; end if;
  select count(*), count(*) filter (where status = 'approved'), count(*) filter (where status in ('processed', 'quality_review')),
         count(*) filter (where status in ('in_progress', 'returned')), count(*) filter (where status = 'assigned')
    into n_total, n_approved, n_review, n_active, n_assigned
    from public.complaint_items where complaint_id = p_complaint;
  if n_total = 0 then return cur; end if;
  nxt := case when n_approved = n_total then 'ready_to_send'
              when n_approved + n_review = n_total then 'quality_review'
              when n_active > 0 or n_approved + n_review > 0 then 'in_progress'   -- بدأ العمل على عنصر واحد على الأقل
              when n_assigned = n_total then 'assigned'
              when n_assigned > 0 then case when cur in ('assigned', 'in_progress') then cur else 'assigned' end
              else 'under_review' end;
  if nxt is distinct from cur then update public.complaints set status = nxt where id = p_complaint; end if;
  return nxt;
end $$;

create or replace function public.complaint_complete_item(p_item_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_old text; v_complaint uuid;
begin
  select status, complaint_id into v_old, v_complaint from public.complaint_items
    where id=p_item_id and assigned_to=auth.uid() for update;
  if not found or v_old <> 'in_progress' then raise exception 'COMPLAINT_COMPLETE_FORBIDDEN'; end if;
  if not exists (select 1 from public.complaint_media
    where item_id=p_item_id and media_kind='after' and captured_at >= (select started_at from public.complaint_items where id=p_item_id)) then
    raise exception 'COMPLAINT_AFTER_IMAGE_REQUIRED';
  end if;
  update public.complaint_items set status='processed', manager_notes=nullif(trim(p_notes),''), processed_at=now()
    where id=p_item_id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)
    values(v_complaint,p_item_id,v_old,'processed',p_notes,auth.uid());
  perform app.complaint_sync_parent_status(v_complaint);   -- 00257: لا «قيد التدقيق» قبل اكتمال كل العناصر
end $$;

create or replace function public.complaint_review_item(p_item_id uuid,p_approved boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype;v_next text;
begin
 if not app.has_role(array['complaints_officer','super_admin'])then raise exception 'COMPLAINT_REVIEW_FORBIDDEN';end if;
 select * into v_item from public.complaint_items where id=p_item_id for update;
 if not found or v_item.status not in('processed','quality_review')then raise exception 'COMPLAINT_NOT_REVIEWABLE';end if;
 if p_approved and not exists(select 1 from public.complaint_media where item_id=p_item_id and media_kind='after' and is_active)then raise exception 'COMPLAINT_AFTER_MEDIA_REQUIRED';end if;
 if not p_approved and nullif(trim(p_note),'')is null then raise exception 'COMPLAINT_RETURN_NOTE_REQUIRED';end if;
 v_next:=case when p_approved then'approved'else'returned'end;
 update public.complaint_items set status=v_next,reviewer_notes=nullif(trim(p_note),''),reviewed_at=clock_timestamp(),started_at=case when p_approved then started_at else null end,processed_at=case when p_approved then processed_at else null end where id=p_item_id;
 insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)values(v_item.complaint_id,p_item_id,v_item.status,v_next,p_note,auth.uid());
 perform app.complaint_sync_parent_status(v_item.complaint_id);   -- 00257
 if not p_approved and v_item.assigned_to is not null then insert into public.notifications(user_id,title,body,type,link)values(v_item.assigned_to,'أُعيدت معالجة شكوى',p_note,'warning','/manager/complaints');end if;
end $$;

-- ── شكاوى المواطنين: from_status الصحيح في حدث الإسناد ──
create or replace function public.ops_citizen_complaint_assign(p_complaint uuid, p_user uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints; v_name text; v_prev text;
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then raise exception 'CITIZEN_ASSIGNEE_NOT_MANAGER'; end if;
  select * into c from public.citizen_complaints where id = p_complaint for update;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if c.status = 'resolved' then raise exception 'CITIZEN_COMPLAINT_RESOLVED'; end if;
  v_prev := c.status;
  select coalesce(e.full_name, 'مسؤول قسم') into v_name from public.employees e where e.user_id = p_user;
  update public.citizen_complaints
     set assigned_to = p_user, assigned_by = auth.uid(), assigned_at = now(), status = 'in_progress', hold_reason = null, updated_at = now()
   where id = p_complaint returning * into c;
  insert into public.citizen_complaint_events (complaint_id, kind, from_status, to_status, note, actor_id, actor_name)
  values (p_complaint, 'assigned', v_prev, 'in_progress', coalesce(nullif(btrim(p_note), ''), 'أُسندت إلى ' || coalesce(v_name, '')), auth.uid(), app.citizen_actor_name());
  perform app.hr_notify(p_user, 'شكوى مواطن مسندة إليك ' || c.ref_no, left(c.full_name || ' — ' || c.details, 140), '/manager/citizen-complaints?c=' || c.id, 'cc_assign:' || c.id || ':' || p_user, 'warning');
  return app.citizen_complaint_json(c, true);
end$$;

-- تصحيح البيانات القائمة: الشكاوى غير المرسلة/المؤرشفة التي انحرفت حالتها عن عناصرها
do $$ declare r record; begin
  for r in select id from public.complaints where status not in ('sent', 'archived') loop perform app.complaint_sync_parent_status(r.id); end loop;
end $$;
