-- 00245 · إزالة أخطاء الإنتاج المتكررة في لوحة الأخطاء (التطوير المركزية) — جذرياً
--   ① بوابة المتعهد: contractor_me / contractor_my_month كانتا ترفعان CONTRACTOR_NOT_ASSIGNED كل دقيقة لأي حساب غير مُسنَد
--      (مثل المدير المفوض الذي يفتح كل البوابات منذ 00268). الآن تعيدان لا شيء والواجهة تعرض «لم تُعيَّن بعد». إجراءات المتعهد الفعلية ما زالت تتطلب الإسناد.
--   ② بوابة المتابعة: gbs_container_request_location رفضت المدير المفوض (GBS_FORBIDDEN) رغم أن كل بوابات المتابعة متاحة له.
--   ③ الكشوفات: APPROVAL_NO_APPROVER عندما يكون الرافع هو حساب المدير المفوض الوحيد (لا معاون ولا مدير مفوض آخر) — يعتمد بنفسه؛ وكذلك في سلاسل الموافقات المضبوطة.
--   ④ الإعلام: حذف صورة محذوفة مسبقاً (نقرة مكررة/تبويب آخر) أو إضافة صورة مصدر حُذفت من الأرشيف لم تعد تُفشل العملية.
-- لا تغيير في الجداول.

create or replace function public.contractor_me()
returns table(user_id uuid, full_name text, manager_user_id uuid, manager_name text, sector_id smallint, area_name text, parent_sector text, shift text,
              today date, checked_in_today boolean, checkin_at timestamptz, in_zone boolean, selfie_path text, team_photo_path text,
              today_headcount int, month_days int, month_headcount_total int, month_locked boolean, zone_defined boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; d date := app.baghdad_today();
begin
  if auth.uid() is null then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  select cp.* into p from public.contractor_profiles cp where cp.user_id = auth.uid() and cp.is_active;
  if p.user_id is null then return; end if;  -- 00245: غير مُسنَد ⇒ لا صفوف (الواجهة تعرض «لم تُعيَّن بعد») بدل خطأ متكرر
  return query
  select p.user_id, app.manager_display_name(p.user_id), p.manager_user_id, app.manager_display_name(p.manager_user_id), p.sector_id, s.name, s.parent_sector, p.shift,
    d, c.id is not null, c.checked_at, c.in_zone, c.selfie_path, c.team_photo_path,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.log_date = d and x.source = 'contractor'),
    (select count(*)::int from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.source = 'contractor' and x.headcount > 0 and date_trunc('month', x.log_date) = date_trunc('month', d)),
    (select coalesce(sum(x.headcount), 0)::int from public.contractor_daily_counts x where x.contractor_user_id = p.user_id and x.source = 'contractor' and date_trunc('month', x.log_date) = date_trunc('month', d)),
    app.contractor_month_locked(d),
    exists (select 1 from public.gps_geofences g where g.sector_id = p.sector_id and g.is_active)
  from public.sectors s
  left join public.contractor_checkins c on c.contractor_user_id = p.user_id and c.log_date = d
  where s.id = p.sector_id;
end$$;

create or replace function public.contractor_my_month(p_month date default null)
returns table(log_date date, checked_in boolean, checkin_at timestamptz, in_zone boolean, headcount int)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  if auth.uid() is null then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  select cp.* into p from public.contractor_profiles cp where cp.user_id = auth.uid() and cp.is_active;
  if p.user_id is null then return; end if;
  return query
  select g.d::date, c.id is not null, c.checked_at, c.in_zone, x.headcount
  from generate_series(m, least(m + interval '1 month' - interval '1 day', app.baghdad_today()::timestamp), interval '1 day') g(d)
  left join public.contractor_checkins c on c.contractor_user_id = p.user_id and c.log_date = g.d::date
  left join public.contractor_daily_counts x on x.contractor_user_id = p.user_id and x.log_date = g.d::date and x.source = 'contractor'
  order by g.d;
end$$;

create or replace function public.gbs_container_request_location(
  p_container_id uuid, p_latitude float8 default null, p_longitude float8 default null, p_accuracy float8 default null,
  p_note text default null, p_status text default null)
returns uuid
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); c public.gbs_containers; uid uuid; who text; has_loc boolean; new_status text; k text; status_ar text; body_txt text;
begin
  if u is null or not app.has_role(array['follow_up','department_manager','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  has_loc := p_latitude is not null or p_longitude is not null;
  if has_loc and (p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception 'GBS_LOCATION_INVALID';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then raise exception 'GBS_STATUS_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) > 500 then raise exception 'GBS_NOTES_INVALID'; end if;
  select * into c from public.gbs_containers where id = p_container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if not (c.sector_id = any(coalesce(app.gbs_read_sectors(u), array[c.sector_id]))) then
    raise exception 'GBS_OUT_OF_SECTOR';
  end if;
  new_status := case when p_status is not null and p_status <> c.status then p_status else null end;
  k := case when has_loc and new_status is not null then 'both' when has_loc then 'location' when new_status is not null then 'status' else null end;
  if k is null then raise exception 'GBS_NOTHING_TO_UPDATE'; end if;
  if exists(select 1 from public.gbs_container_updates u0
             where u0.container_id = c.id and u0.requested_by = u and u0.state = 'pending') then
    raise exception 'GBS_UPDATE_ALREADY_PENDING';
  end if;
  insert into public.gbs_container_updates(container_id, requested_by, proposed_status, note, kind,
                                           proposed_latitude, proposed_longitude, accuracy_m, previous_latitude, previous_longitude)
  values(c.id, u, coalesce(new_status, c.status), nullif(trim(coalesce(p_note,'')),''), k,
         p_latitude, p_longitude, p_accuracy, c.latitude, c.longitude)
  returning gbs_container_updates.id into uid;
  who := app.manager_display_name(u);
  status_ar := case new_status when 'ok' then 'سليمة' when 'damaged' then 'متضررة' when 'replace' then 'يجب استبدالها' when 'missing' then 'مفقودة' else null end;
  body_txt := format('%s · %s — %s', c.code, c.label, coalesce(who, 'المتابعة'));
  if has_loc then
    body_txt := body_txt || format(' اقترح موقعاً جديداً (%s, %s)%s', round(p_latitude::numeric, 6), round(p_longitude::numeric, 6),
                case when p_accuracy is not null then format(' · دقة ±%s م', round(p_accuracy)) else '' end);
  end if;
  if new_status is not null then
    body_txt := body_txt || case when has_loc then ' · ' else ' اقترح ' end || 'الحالة: ' || status_ar;
  end if;
  insert into public.notifications(user_id, title, body, type, link)
  select ur.user_id, case k when 'location' then 'طلب تحديث موقع حاوية' when 'status' then 'طلب تحديث حالة حاوية' else 'طلب تحديث موقع وحالة حاوية' end,
         body_txt, 'info', '/ops-room/gbs-containers'
  from public.user_roles ur
  where ur.role in ('ops_room','super_admin');
  return uid;
end$$;

create or replace function public.disclosure_submit(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; v_chain uuid; who uuid[]; who2 uuid[];
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
  if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_SUBMITTABLE'; end if;
  delete from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id;  -- سلسلة جديدة عند إعادة الرفع
  v_chain := app.approval_open('disclosure', p_id, auth.uid());
  if v_chain is null then
    -- بلا سلسلة مضبوطة: المعاون ثم المدير المفوض (الافتراضي)
    select coalesce(array_agg(distinct ur.user_id), '{}') into who  from public.user_roles ur where ur.role = 'deputy_director' and ur.user_id <> auth.uid();
    select coalesce(array_agg(distinct ur.user_id), '{}') into who2 from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> auth.uid();
    if cardinality(who) = 0 and cardinality(who2) = 0 then
      -- 00245: لا يوجد مُعتمِد آخر في النظام (حساب المدير المفوض الوحيد يرفع بنفسه) ⇒ يعتمد المدير المفوض نفسه بدل تعطيل الوحدة
      if app.has_role(array['super_admin']) then who2 := array[auth.uid()];
      else raise exception 'APPROVAL_NO_APPROVER'; end if;
    end if;
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note) values
      ('disclosure', p_id, 1, 'معاون المدير المفوض (افتراضي)', who, case when cardinality(who) = 0 then 'skipped' else 'pending' end, case when cardinality(who) = 0 then 'لا يوجد معاون — تُخطّيت' end),
      ('disclosure', p_id, 2, 'المدير المفوض (افتراضي)', who2, case when cardinality(who2) = 0 then 'skipped' when cardinality(who) = 0 then 'pending' else 'waiting' end, case when cardinality(who2) = 0 then 'لا يوجد مدير مفوض — تُخطّيت' end);
    perform app.approval_notify_step('disclosure', p_id, (select min(step_no) from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id and status = 'pending'));
  end if;
  update public.disclosures set status = 'pending', submitted_at = now(), chain_id = v_chain, return_reason = null, returned_by = null, returned_at = null,
    resubmit_count = case when d.status = 'returned' then resubmit_count + 1 else resubmit_count end where id = p_id;
  perform app.disclosure_event(p_id, case when d.status = 'returned' then 'resubmitted' else 'submitted' end, null, d.amount);
  return public.disclosure_get(p_id);
end$$;

create or replace function app.approval_open(p_kind text, p_request uuid, p_requester uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare c public.approval_chains; s jsonb; i int := 0; who uuid[]; first_step int;
begin
  c := app.approval_chain_for(p_requester, p_kind);
  if c.id is null then return null; end if;
  for s in select * from jsonb_array_elements(c.steps) loop
    i := i + 1;
    who := app.approval_resolve_step(s, p_requester);
    insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
    values (p_kind, p_request, c.id, i, app.approval_step_label(s), who,
            case when cardinality(who) = 0 then 'skipped' else 'waiting' end,
            case when cardinality(who) = 0 then 'لا يوجد مُعتمِد لهذه الخطوة — تُخطّيت تلقائياً' end);
  end loop;
  select min(step_no) into first_step from public.approval_tasks where request_kind = p_kind and request_id = p_request and status = 'waiting';
  if first_step is null then
    delete from public.approval_tasks where request_kind = p_kind and request_id = p_request;
    -- 00245: السلسلة المضبوطة لا تُحلّ إلى أحد غير الطالب؛ إن كان الطالب مديراً مفوضاً فهو المُعتمِد الأخير
    if exists (select 1 from public.user_roles ur where ur.user_id = p_requester and ur.role = 'super_admin') then
      insert into public.approval_tasks (request_kind, request_id, chain_id, step_no, step_label, approvers, status, note)
      values (p_kind, p_request, c.id, 1, 'المدير المفوض', array[p_requester], 'pending', 'لا يوجد مُعتمِد آخر في السلسلة — المدير المفوض يعتمد بنفسه');
      perform app.approval_notify_step(p_kind, p_request, 1);
      return c.id;
    end if;
    raise exception 'APPROVAL_NO_APPROVER';
  end if;
  update public.approval_tasks set status = 'pending' where request_kind = p_kind and request_id = p_request and step_no = first_step;
  perform app.approval_notify_step(p_kind, p_request, first_step);
  return c.id;
end$$;

create or replace function public.media_design_photo_remove(p_photo_row_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  select d1.* into d from public.media_design_photos dp
    join public.media_designs d1 on d1.id = dp.design_id
   where dp.id = p_photo_row_id
   for update of dp;
  if not found then
    return null;  -- 00245: الصورة حُذفت مسبقاً (نقرة مكررة/تبويب آخر) ⇒ عملية عاطلة بلا خطأ
  end if;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  delete from public.media_design_photos where id = p_photo_row_id;
  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id;
  return (select photo_count from public.media_designs where id = d.id);
end;
$$;

create or replace function public.media_design_add_photos(p_id uuid, p_photos jsonb)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
  ph jsonb;
  src public.media_submission_photos;
  v_seq integer;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then
    raise exception 'MEDIA_DESIGN_PHOTOS_INVALID';
  end if;
  select * into d from public.media_designs where id = p_id for update;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  select coalesce(max(sort_order), 0) into v_seq from public.media_design_photos where design_id = d.id;

  for ph in select * from jsonb_array_elements(p_photos) loop
    select * into src from public.media_submission_photos
     where id = (ph->>'photo_id')::uuid;
    if not found then
      continue;  -- 00245: صورة مصدر حُذفت من الأرشيف بعد اختيارها ⇒ تُتخطى بدل إفشال الإضافة كلها
    end if;
    if exists (select 1 from public.media_design_photos x where x.design_id = d.id and x.source_photo_id = src.id) then
      continue;  -- موجودة أصلاً في التصميم
    end if;
    v_seq := v_seq + 1;
    insert into public.media_design_photos
      (design_id, source_photo_id, source_submission_id, work_type, storage_path, caption, sort_order)
    values (
      d.id, src.id, src.submission_id,
      coalesce(nullif(trim(coalesce(ph->>'work_type', '')), ''), 'عام'),
      src.storage_path, nullif(trim(coalesce(ph->>'caption', '')), ''),
      v_seq
    );
  end loop;

  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id
   returning * into d;
  return d;
end;
$$;

create or replace function public.media_design_photos_remove(p_photo_row_ids uuid[])
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  v_design uuid;
  v_designs integer;
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_photo_row_ids is null or cardinality(p_photo_row_ids) = 0 then
    raise exception 'MEDIA_DESIGN_PHOTOS_INVALID';
  end if;
  select count(distinct design_id), (array_agg(design_id))[1] into v_designs, v_design
    from public.media_design_photos where id = any(p_photo_row_ids);
  if coalesce(v_designs, 0) = 0 then return null; end if;  -- 00245: كلها محذوفة مسبقاً ⇒ عاطلة بلا خطأ
  if v_designs <> 1 then raise exception 'MEDIA_DESIGN_PHOTOS_INVALID'; end if;
  select * into d from public.media_designs where id = v_design for update;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  delete from public.media_design_photos where id = any(p_photo_row_ids);
  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id;
  return (select photo_count from public.media_designs where id = d.id);
end;
$$;
