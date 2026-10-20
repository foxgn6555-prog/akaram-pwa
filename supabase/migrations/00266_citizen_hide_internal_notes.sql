-- 00310 · تدقيق بوابة المواطن: «ملاحظة داخلية» يضيفها الطاقم كانت تُرسَل ضمن JSON سجل المتابعة إلى المواطن (الواجهة تخفيها لكن البيانات تصل)،
--   واسم الموظف المكلَّف كان يُرسَل كذلك. الآن النسخة غير الكاملة (المواطن) تستثني أحداث note، وتخفي نص ملاحظة الإحالة (تعليمات العمليات/اسم المكلَّف) وassignee_name.
create or replace function app.citizen_complaint_json(c public.citizen_complaints, p_full boolean default false) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', c.id, 'ref_no', c.ref_no, 'full_name', c.full_name, 'phone', case when p_full then c.phone else null end,
    'details', c.details, 'lat', c.lat, 'lng', c.lng, 'address_text', c.address_text,
    'status', c.status, 'status_label', app.citizen_status_label(c.status),
    'assigned_to', case when p_full then c.assigned_to else null end,
    'assignee_name', case when p_full then (select e.full_name from public.employees e where e.user_id = c.assigned_to) end,   -- 00310: اسم الموظف للطاقم فقط
    'assigned_at', c.assigned_at, 'hold_reason', c.hold_reason, 'resolution_note', c.resolution_note, 'resolved_at', c.resolved_at,
    'citizen_rating', c.citizen_rating, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path) order by p.created_at) from public.citizen_complaint_photos p where p.complaint_id = c.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'from', e.from_status, 'to', e.to_status, 'to_label', app.citizen_status_label(e.to_status),
                                                            'note', case when p_full or e.kind in ('status', 'rated') then e.note end, 'actor', case when p_full then e.actor_name else null end, 'at', e.created_at) order by e.created_at)
                        from public.citizen_complaint_events e where e.complaint_id = c.id and (p_full or e.kind <> 'note')), '[]'::jsonb)   -- 00310: الملاحظات الداخلية لا تصل للمواطن
  )
$$;

-- المكلَّف (مسؤول القسم) ليس «طاقماً» لكنه مخوَّل برؤية الملاحظات: الدالة تتحقق من التكليف قبل أي تغيير، فالعائد كامل دائماً
create or replace function public.citizen_complaint_set_status(p_complaint uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints; v_staff boolean := app.citizen_is_staff(); v_prev text; v_reopen boolean; v_hist text;
begin
  if p_status not in ('new', 'in_progress', 'on_hold', 'resolved') then raise exception 'CITIZEN_STATUS_INVALID'; end if;
  select * into c from public.citizen_complaints where id = p_complaint for update;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if not v_staff and c.assigned_to is distinct from auth.uid() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if p_status = 'in_progress' and c.assigned_to is null then raise exception 'CITIZEN_ASSIGNEE_REQUIRED'; end if;
  v_reopen := c.status = 'resolved' and p_status <> 'resolved';
  if (p_status in ('on_hold', 'resolved') or v_reopen) and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'CITIZEN_NOTE_REQUIRED'; end if;
  if p_status = 'new' and not v_staff then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if c.status = p_status then return app.citizen_complaint_json(c, true); end if;
  v_prev := c.status;
  if v_reopen then
    v_hist := 'إعادة فتح بعد الإنهاء — السبب: ' || btrim(p_note)
           || coalesce(' · ملاحظة الإنهاء السابقة: ' || nullif(c.resolution_note, ''), '')
           || coalesce(' · تقييم المواطن السابق: ' || c.citizen_rating || '/5', '');
  end if;
  update public.citizen_complaints
     set status = p_status,
         hold_reason = case when p_status = 'on_hold' then btrim(p_note) else null end,
         resolution_note = case when p_status = 'resolved' then btrim(p_note) when v_reopen then null else resolution_note end,
         resolved_at = case when p_status = 'resolved' then now() else null end,
         citizen_rating = case when v_reopen then null else citizen_rating end,
         assigned_to = case when p_status = 'new' then null else assigned_to end,
         updated_at = now()
   where id = p_complaint returning * into c;
  insert into public.citizen_complaint_events (complaint_id, kind, from_status, to_status, note, actor_id, actor_name)
  values (p_complaint, 'status', v_prev, p_status, coalesce(v_hist, nullif(btrim(p_note), '')), auth.uid(), app.citizen_actor_name());
  if not v_staff or v_reopen then
    perform app.notify_by_role(array['ops_room'], case when v_reopen then 'إعادة فتح شكوى مواطن ' else 'تحديث شكوى مواطن ' end || c.ref_no,
      app.citizen_actor_name() || ': ' || app.citizen_status_label(p_status) || case when v_reopen then ' — ' || btrim(p_note) else '' end, case when v_reopen then 'warning' else 'info' end, '/ops-room/citizen-complaints?c=' || c.id);
  end if;
  return app.citizen_complaint_json(c, true);
end$$;
