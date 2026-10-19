-- 00258 · (1) إعادة إسناد عنصر شكوى قيد المعالجة لمسؤول آخر من موظف الشكاوى بسبب موثّق وتبليغ الطرفين
--         (2) إعادة فتح شكوى مواطن «منتهية» تتطلب سبباً (مثل الإيقاف والإنهاء)، وتُصفّر تقييم المواطن وملاحظة الإنهاء مع حفظهما في السجل

create or replace function public.complaint_reassign_item(p_item_id uuid, p_manager_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_item public.complaint_items%rowtype; v_old uuid; v_ref text; v_new_name text; v_old_name text;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_ASSIGN_FORBIDDEN'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'COMPLAINT_REASSIGN_REASON_REQUIRED'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_manager_id and role = 'department_manager') then raise exception 'COMPLAINT_MANAGER_INVALID'; end if;
  select * into v_item from public.complaint_items where id = p_item_id for update;
  if not found then raise exception 'COMPLAINT_ITEM_NOT_FOUND'; end if;
  if v_item.status not in ('assigned', 'in_progress', 'returned') then raise exception 'COMPLAINT_REASSIGN_STATE_INVALID'; end if;
  if v_item.assigned_to = p_manager_id then raise exception 'COMPLAINT_REASSIGN_SAME_MANAGER'; end if;
  v_old := v_item.assigned_to;
  select reference_no into v_ref from public.complaints where id = v_item.complaint_id;
  select coalesce(full_name, 'مسؤول قسم') into v_new_name from public.employees where user_id = p_manager_id;
  select coalesce(full_name, 'المسؤول السابق') into v_old_name from public.employees where user_id = v_old;
  update public.complaint_items
     set assigned_to = p_manager_id, assigned_by = auth.uid(), assigned_at = now(), status = 'assigned', started_at = null, processed_at = null
   where id = p_item_id;
  insert into public.complaint_status_history (complaint_id, item_id, from_status, to_status, note, actor_id)
  values (v_item.complaint_id, p_item_id, v_item.status, 'assigned', format('إعادة إسناد من %s إلى %s — %s', v_old_name, v_new_name, trim(p_reason)), auth.uid());
  perform app.complaint_sync_parent_status(v_item.complaint_id);
  if v_old is not null then
    insert into public.notifications (user_id, title, body, type, link)
    values (v_old, 'سُحب منك موقع شكوى ' || coalesce(v_ref, ''), format('الموقع %s أُعيد إسناده إلى %s — السبب: %s', v_item.sequence_no, v_new_name, trim(p_reason)), 'warning', '/manager/complaints');
  end if;
  insert into public.notifications (user_id, title, body, type, link)
  values (p_manager_id, 'شكوى مسندة إليك (إعادة إسناد) ' || coalesce(v_ref, ''), format('الموقع %s — %s', v_item.sequence_no, trim(p_reason)), 'info', '/manager/complaints');
end $$;
revoke all on function public.complaint_reassign_item(uuid, uuid, text) from public, anon;
grant execute on function public.complaint_reassign_item(uuid, uuid, text) to authenticated;

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
  if c.status = p_status then return app.citizen_complaint_json(c, v_staff); end if;
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
  return app.citizen_complaint_json(c, v_staff);
end$$;
