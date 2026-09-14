-- 00120 · إغلاق مسارات القراءة المباشرة وملفات الآليات والصيانة بين القاطعين.

create or replace function app.maintenance_case_allowed(p_case_id uuid)returns boolean
language sql stable security definer set search_path=public,app as $$
 select exists(
  select 1 from public.vehicle_maintenance_cases c
  where c.id=p_case_id and(
   app.has_role(array['maintenance','ops_room','super_admin'])
   or c.manager_id=auth.uid()
   or(app.has_role(array['central_garage_officer'])and app.garage_vehicle_allowed(c.vehicle_id))
  )
 )
$$;
revoke all on function app.maintenance_case_allowed(uuid)from public,anon;
grant execute on function app.maintenance_case_allowed(uuid)to authenticated;

drop policy if exists "maintenance cases authorized read"on public.vehicle_maintenance_cases;
create policy "maintenance cases scoped read"on public.vehicle_maintenance_cases for select to authenticated using(app.maintenance_case_allowed(id));

drop policy if exists "maintenance updates authorized read"on public.vehicle_maintenance_updates;
create policy "maintenance updates scoped read"on public.vehicle_maintenance_updates for select to authenticated using(app.maintenance_case_allowed(case_id));

drop policy if exists "maintenance parts authorized read"on public.vehicle_maintenance_parts;
create policy "maintenance parts scoped read"on public.vehicle_maintenance_parts for select to authenticated using(app.maintenance_case_allowed(case_id));

drop policy if exists "maintenance attachments authorized read"on public.vehicle_maintenance_attachments;
create policy "maintenance attachments scoped read"on public.vehicle_maintenance_attachments for select to authenticated using(app.maintenance_case_allowed(case_id));

-- مسار الصورة وحده لا يكفي: القراءة تتطلب أن تكون الصورة مسجلة لآلية ضمن نطاق المستخدم.
drop policy if exists "garage vehicle images authorized read"on storage.objects;
create policy "garage vehicle images scoped read"on storage.objects for select to authenticated using(
 bucket_id='garage-vehicles'and exists(
  select 1 from public.garage_vehicles v
  where v.image_path=storage.objects.name and app.garage_vehicle_allowed(v.id)
 )
);

-- ملفات حالة الصيانة تتبع نطاق الحالة نفسها، وليس مجرد امتلاك دور الكراج.
drop policy if exists "maintenance files read"on storage.objects;
create policy "maintenance files scoped read"on storage.objects for select to authenticated using(
 bucket_id='maintenance-attachments'and exists(
  select 1 from public.vehicle_maintenance_attachments a
  where a.storage_path=storage.objects.name and app.maintenance_case_allowed(a.case_id)
 )
);
