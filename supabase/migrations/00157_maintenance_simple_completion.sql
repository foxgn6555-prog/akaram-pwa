-- 00157 · تبسيط الصيانة إلى خطوة واحدة (قرار المستخدم):
--   وصول الآلية → تأكيد الوصول → تدخل تلقائياً «قيد التشخيص والإصلاح» والوقت يُحسب تلقائياً
--   → عند الانتهاء: نموذج واحد «إنهاء الصيانة»: الفنيون (واحد أو أكثر) + القطع من المخزن (نوع أو أكثر، الكلفة تلقائية)
--     + التشخيص + الأعمال المنفذة + أجور خارجية (اختياري) → الحالة جاهزة ومعتمدة مباشرة → إرسال للعمل/الكراج.
--   لا نسبة إنجاز يدوية، لا موعد متوقع، لا كلفة تقديرية، لا اعتماد منفصل، لا تقدم مراحل يدوي (المراحل تُغلق تلقائياً).
--   الدوال القديمة (update_case / approve_readiness / advance_stage) تبقى للتوافق والتصحيح.

create or replace function public.maintenance_complete_case(
  p_case_id uuid,
  p_diagnosis text,
  p_work_notes text,
  p_technician_ids uuid[],
  p_parts jsonb default '[]'::jsonb,        -- [{"item_id": uuid, "quantity": numeric}]
  p_service_cost numeric default 0,         -- أجور/خدمة خارجية (اختياري)
  p_notes text default null
)
returns public.vehicle_maintenance_cases language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := auth.uid(); c public.vehicle_maintenance_cases; t uuid; part jsonb; v_item uuid; v_qty numeric;
  v_diag text := nullif(trim(coalesce(p_diagnosis, '')), ''); v_work text := nullif(trim(coalesce(p_work_notes, '')), '');
begin
  if not app.has_role(array['maintenance']) then raise exception 'MAINTENANCE_FORBIDDEN'; end if;
  select * into c from public.vehicle_maintenance_cases where id = p_case_id for update;
  if not found or c.arrived_at is null or c.completed_at is not null then raise exception 'MAINTENANCE_CASE_NOT_OPEN'; end if;
  if c.readiness_approved_at is not null then raise exception 'MAINTENANCE_READINESS_ALREADY_APPROVED'; end if;
  if v_diag is null then raise exception 'MAINTENANCE_READY_REQUIRES_DIAGNOSIS'; end if;
  if v_work is null then raise exception 'MAINTENANCE_READY_REQUIRES_WORK_NOTES'; end if;
  if coalesce(p_service_cost, 0) < 0 then raise exception 'MAINTENANCE_COST_INVALID'; end if;

  -- الفنيون: تعيين من لم يُعيَّن بعد (يتحقق أنهم على مسمى فني)
  foreach t in array coalesce(p_technician_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and employee_id = t and released_at is null) then
      perform public.maintenance_assign_technician(c.id, t, null);
    end if;
  end loop;
  if not exists (select 1 from public.vehicle_maintenance_case_technicians where case_id = c.id and released_at is null) then raise exception 'MAINTENANCE_READY_REQUIRES_TECHNICIAN'; end if;

  -- القطع: صرف من المخزن + تركيب فوري (الكلفة بسعر المخزن)
  if p_parts is not null and jsonb_typeof(p_parts) = 'array' then
    for part in select * from jsonb_array_elements(p_parts) loop
      v_item := nullif(part->>'item_id', '')::uuid; v_qty := coalesce((part->>'quantity')::numeric, 0);
      if v_item is null or v_qty <= 0 then raise exception 'MAINTENANCE_ISSUE_INVALID'; end if;
      perform public.maintenance_issue_and_install(c.id, v_item, v_qty, null, true);
    end loop;
  end if;
  -- أي قطعة مصروفة سابقاً وغير مركّبة تُعدّ مركّبة الآن (إنهاء الصيانة يعني تركيبها)
  update public.vehicle_maintenance_parts set part_status = 'installed', installed_at = now(), installed_by = u where case_id = c.id and part_status = 'issued';

  update public.vehicle_maintenance_cases set
    status = 'ready', progress = 100, diagnosis = v_diag, work_notes = v_work,
    assigned_technician = app.maintenance_technicians_text(c.id),
    service_cost = coalesce(p_service_cost, 0), actual_cost = coalesce(p_service_cost, 0) + parts_actual_cost,
    ready_at = coalesce(ready_at, now()), ready_declared_by = u,
    readiness_approved_at = now(), readiness_approved_by = u, readiness_approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = c.id returning * into c;

  insert into public.vehicle_maintenance_updates(case_id, status, progress, diagnosis, work_notes, parts_notes, assigned_technician, estimated_cost, actual_cost, delay_reason, expected_completion_at, created_by)
  values (c.id, 'ready', 100, c.diagnosis, c.work_notes, app.maintenance_parts_summary(c.id), c.assigned_technician, c.estimated_cost, c.actual_cost, null, null, u);

  -- المراحل تُغلق تلقائياً: تشخيص/إصلاح/فحص مكتملة، التسليم نشط
  update public.vehicle_maintenance_stages set status = 'completed', completed_at = now(), completed_by = u, started_at = coalesce(started_at, now()), started_by = coalesce(started_by, u)
   where case_id = c.id and stage_key in ('arrival', 'diagnosis', 'repair', 'inspection') and status <> 'completed';
  update public.vehicle_maintenance_stages set status = 'active', started_at = coalesce(started_at, now()), started_by = coalesce(started_by, u)
   where case_id = c.id and stage_key = 'handover' and status <> 'completed';
  return c;
end$$;
revoke all on function public.maintenance_complete_case(uuid, text, text, uuid[], jsonb, numeric, text) from public, anon;
grant execute on function public.maintenance_complete_case(uuid, text, text, uuid[], jsonb, numeric, text) to authenticated;
