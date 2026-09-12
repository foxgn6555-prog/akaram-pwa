-- 00108 · تسلسل صيانة موحد وتفاصيل تشغيل Push دون كشف مفاتيح الاشتراك

-- تنبيهات الوصول والعودة المكملة للقنوات الموجودة، من دون تكرار إشعار الجهة التي نفذت الإجراء.
create or replace function app.notify_maintenance_terminal_transitions()returns trigger
language plpgsql security definer set search_path=public,app as $$declare v public.garage_vehicles;begin
 select*into v from public.garage_vehicles where id=new.vehicle_id;
 if old.arrived_at is null and new.arrived_at is not null then
  insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
  select distinct ur.user_id,'أكدت الصيانة وصول الآلية',format('%s · DB %s وصلت وبدأت المتابعة',v.vehicle_name,v.db_number),'success','maintenance','high','/central-garage/maintenance-coordination','maintenance_case',new.id,'فتح التسلسل الزمني','maintenance_case:'||new.id::text||':arrived:garage'
  from public.user_roles ur where ur.role in('central_garage_officer','super_admin')
  on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 end if;
 if old.departed_maintenance_at is null and new.departed_maintenance_at is not null and new.status='to_work'then
  insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
  select distinct ur.user_id,'الآلية عائدة من الصيانة إلى العمل',format('%s · DB %s غادرت الصيانة بعد اعتماد الجاهزية',v.vehicle_name,v.db_number),'info','maintenance','high','/central-garage/maintenance-coordination','maintenance_case',new.id,'فتح التسلسل الزمني','maintenance_case:'||new.id::text||':departed-to-work:garage'
  from public.user_roles ur where ur.role in('central_garage_officer','super_admin')
  on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 end if;
 if old.completed_at is null and new.completed_at is not null and new.status='returned_to_work'then
  insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
  select distinct x.user_id,'اكتملت عودة الآلية إلى العمل',format('%s · DB %s أكد مسؤول القسم وصولها الفعلي',v.vehicle_name,v.db_number),'success','maintenance','high',x.link,'maintenance_case',new.id,'فتح التسلسل الزمني','maintenance_case:'||new.id::text||':returned-to-work:'||x.audience
  from(
   select ur.user_id,'/central-garage/maintenance-coordination'::text link,'garage'::text audience from public.user_roles ur where ur.role in('central_garage_officer','super_admin')
   union all select ur.user_id,'/maintenance/vehicle-cases','maintenance'from public.user_roles ur where ur.role='maintenance'
  )x on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 elsif old.completed_at is null and new.completed_at is not null and new.status='closed_at_garage'then
  insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
  select distinct ur.user_id,'اكتمل وصول الآلية إلى الكراج',format('%s · DB %s أكد الكراج وصولها الفعلي وإغلاق الحالة',v.vehicle_name,v.db_number),'success','maintenance','high','/maintenance/vehicle-cases','maintenance_case',new.id,'فتح التسلسل الزمني','maintenance_case:'||new.id::text||':closed-at-garage:maintenance'
  from public.user_roles ur where ur.role='maintenance'
  on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 end if;return new;
end$$;
create trigger trg_notify_maintenance_terminal_transitions after update of arrived_at,departed_maintenance_at,completed_at,status on public.vehicle_maintenance_cases for each row execute function app.notify_maintenance_terminal_transitions();

-- سجل زمني موحد قابل للرسم: البلاغ، القرارات، الطريق، التحديثات، القطع، الجاهزية والإغلاق.
create or replace function public.maintenance_case_events(p_case_id uuid)
returns table(event_key text,event_type text,title text,details text,happened_at timestamptz,actor_id uuid,status text,progress integer,sequence_no integer)
language plpgsql stable security definer set search_path=public,app as $$declare c public.vehicle_maintenance_cases;begin
 select*into c from public.vehicle_maintenance_cases where id=p_case_id;
 if not found or not(app.has_role(array['maintenance','central_garage_officer','ops_room','super_admin'])or c.manager_id=auth.uid())then raise exception'MAINTENANCE_CASE_FORBIDDEN';end if;
 return query
 with events as(
  select'case:reported'::text k,'case'::text t,'تسجيل العطل وإرسال الآلية'::text ttl,c.fault_type::text det,c.reported_at at,c.manager_id actor,'to_maintenance'::text st,0::int prog,0::int seq
  union all select'garage:decision','decision',case c.garage_decision_status when'acknowledged'then'أكد الكراج استلام البلاغ'when'approved'then'اعتمد الكراج حركة الصيانة'when'rejected'then'رفض الكراج حركة الصيانة'else'بانتظار إجراء الكراج'end,coalesce(c.garage_decision_notes,c.dispatch_policy),coalesce(c.garage_decided_at,c.reported_at),c.garage_decided_by,c.garage_decision_status,null,1 where c.garage_decision_status<>'not_required'
  union all select'leg:'||l.id::text||':departed','movement','غادرت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.departure_notes,l.departed_at,l.departed_by,'in_transit',null,l.sequence_no*10 from public.vehicle_trip_legs l where l.departure_id=c.departure_id
  union all select'leg:'||l.id::text||':arrived','movement','وصلت إلى '||case l.destination_type when'maintenance'then'الصيانة'when'work_site'then'موقع العمل'when'garage'then'الكراج'else'المحطة'end,l.arrival_notes,l.arrived_at,l.arrived_by,'arrived',null,l.sequence_no*10+1 from public.vehicle_trip_legs l where l.departure_id=c.departure_id and l.arrived_at is not null
  union all select'update:'||u.id::text,'maintenance_update','تحديث الصيانة: '||u.status,coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason,'تحديث حالة'),u.created_at,u.created_by,u.status,u.progress,1000+row_number()over(order by u.created_at)::int from public.vehicle_maintenance_updates u where u.case_id=c.id
  union all select'part:'||p.id::text,'part',case p.part_status when'installed'then'تم تركيب قطعة'when'returned'then'أعيدت قطعة للمخزون'else'صُرفت قطعة للصيانة'end,p.part_name||' · '||p.quantity||' '||p.unit,coalesce(p.installed_at,p.returned_at,p.created_at),p.created_by,p.part_status,null,2000+row_number()over(order by p.created_at)::int from public.vehicle_maintenance_parts p where p.case_id=c.id
  union all select'case:ready','readiness','إعلان جاهزية الآلية',coalesce(c.readiness_approval_notes,'اكتملت أعمال الصيانة'),c.ready_at,c.ready_declared_by,'ready',100,3000 where c.ready_at is not null
  union all select'case:approved-ready','readiness','اعتماد الجاهزية للمغادرة',coalesce(c.readiness_approval_notes,'تم اعتماد الجاهزية'),c.readiness_approved_at,c.readiness_approved_by,'ready',100,3001 where c.readiness_approved_at is not null
  union all select'case:completed','completion',case c.status when'returned_to_work'then'تأكيد العودة الفعلية إلى العمل'when'closed_at_garage'then'تأكيد الوصول الفعلي إلى الكراج'else'إغلاق حالة الصيانة'end,coalesce(c.work_notes,c.diagnosis,'اكتملت الدورة'),c.completed_at,null,c.status,100,4000 where c.completed_at is not null
 )select e.k,e.t,e.ttl,e.det,e.at,e.actor,e.st,e.prog,e.seq from events e order by e.at,e.seq;
end$$;

-- لا تُصعّد حالة مغلقة، ويبقى التصعيد إشعاراً واحداً يتوزع على كل أجهزة المستلم.
create or replace function public.notification_evaluate_workflow_escalations()returns integer language plpgsql security definer set search_path=public,app as $$declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'WORKFLOW_SERVICE_ONLY';end if;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,dedupe_key)
 select ur.user_id,'تأخر إجراء الكراج على طلب صيانة',format('طلب DB %s ما زال %s منذ %s دقيقة',v.db_number,case c.garage_decision_status when'awaiting_ack'then'دون تأكيد استلام'else'بانتظار الموافقة'end,floor(extract(epoch from(now()-c.reported_at))/60)),'error','maintenance','critical','/central-garage/maintenance-coordination','maintenance_case',c.id,'maintenance_case:'||c.id::text||':escalation'
 from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=c.vehicle_id
 join lateral(select p.escalation_minutes from public.notification_workflow_policies p where p.event_key='maintenance_dispatch'and p.enabled and(p.sector_id is null or p.sector_id=d.sector_id)and(p.vehicle_category is null or p.vehicle_category=v.vehicle_category)order by(p.sector_id is not null)::int+(p.vehicle_category is not null)::int desc limit 1)p on true
 join public.user_roles ur on ur.role in('it_admin','super_admin')
 where c.completed_at is null and c.garage_decision_status in('awaiting_ack','awaiting_approval')and now()-c.reported_at>make_interval(mins=>p.escalation_minutes)
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;get diagnostics n=row_count;return n;end$$;

-- تفاصيل تشغيلية للتطوير فقط، من دون endpoint أو p256dh أو auth_key.
create or replace function public.notification_push_delivery_page(p_hours integer default 24,p_status text default null,p_platform text default null,p_limit integer default 50,p_offset integer default 0)
returns table(delivery_id uuid,notification_id uuid,status text,attempts integer,created_at timestamptz,next_attempt_at timestamptz,sent_at timestamptz,clicked_at timestamptz,last_http_status integer,platform text,device_name text,priority text,category text,title text,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;
 if p_hours not between 1 and 720 or p_limit not between 1 and 100 or p_offset not between 0 and 10000 or(p_status is not null and p_status not in('pending','processing','sent','failed','cancelled'))or(p_platform is not null and p_platform not in('android','ios','windows','macos','linux','unknown'))then raise exception'PUSH_DELIVERY_FILTER_INVALID';end if;
 return query select d.id,d.notification_id,d.status,d.attempts,d.created_at,d.next_attempt_at,d.sent_at,d.clicked_at,d.last_http_status,s.platform,s.device_name,n.priority,n.category,n.title,count(*)over()
 from public.notification_push_deliveries d join public.notification_push_subscriptions s on s.id=d.subscription_id join public.notifications n on n.id=d.notification_id
 where d.created_at>=now()-make_interval(hours=>p_hours)and(p_status is null or d.status=p_status)and(p_platform is null or s.platform=p_platform)
 order by d.created_at desc limit p_limit offset p_offset;
end$$;

revoke all on function public.maintenance_case_events(uuid),public.notification_push_delivery_page(integer,text,text,integer,integer)from public,anon;
grant execute on function public.maintenance_case_events(uuid),public.notification_push_delivery_page(integer,text,text,integer,integer)to authenticated;
revoke all on function app.notify_maintenance_terminal_transitions()from public,anon,authenticated;
