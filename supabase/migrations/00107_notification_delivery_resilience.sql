-- 00107 · موثوقية Web Push وتتبع التفاعل وتنبيهات تقدم الصيانة المتبادلة
alter table public.notification_push_deliveries
 add column clicked_at timestamptz;
create index notification_push_delivery_owner_status_idx
 on public.notification_push_deliveries(subscription_id,status,created_at desc);

-- لا تُنشأ عمليات إرسال لاشتراكات منتهية حتى لو بقيت فعالة من جلسة قديمة.
create or replace function app.queue_notification_push()returns trigger language plpgsql security definer set search_path=public,app as $$begin
 insert into public.notification_push_deliveries(notification_id,subscription_id,next_attempt_at)
 select new.id,s.id,case when new.priority='critical'then now()else app.notification_next_push_time(p.quiet_from,p.quiet_to)end
 from public.notification_push_subscriptions s join public.notification_preferences p on p.user_id=s.user_id
 where new.push_allowed and s.user_id=new.user_id and s.is_active
 and(s.expiration_time is null or to_timestamp(s.expiration_time/1000.0)>now())
 and p.push_enabled and(not p.critical_only or new.priority='critical')
 on conflict(notification_id,subscription_id)do nothing;return new;end$$;

-- يعيد العمليات التي تعطلت أثناء تنفيذ Edge إلى الطابور، وينهيها بعد حد المحاولات.
drop function public.notification_claim_push(integer,uuid);
create function public.notification_claim_push(p_limit integer default 50,p_user_id uuid default null)
returns table(delivery_id uuid,notification_id uuid,subscription_id uuid,endpoint text,p256dh text,auth_key text,title text,body text,link text,priority text,category text)
language plpgsql security definer set search_path=public as $$begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'PUSH_SERVICE_ONLY';end if;
 if p_limit not between 1 and 100 then raise exception'PUSH_LIMIT_INVALID';end if;
 update public.notification_push_subscriptions set is_active=false,last_error='PUSH_SUBSCRIPTION_EXPIRED',updated_at=now()
 where is_active and expiration_time is not null and to_timestamp(expiration_time/1000.0)<=now();
 update public.notification_push_deliveries set status=case when attempts>=5 then'failed'else'pending'end,
 next_attempt_at=now(),claimed_at=null,last_error='PUSH_PROCESSING_TIMEOUT'
 where status='processing'and claimed_at<now()-interval'5 minutes';
 return query with picked as(
  select d.id from public.notification_push_deliveries d join public.notification_push_subscriptions s on s.id=d.subscription_id
  where d.status='pending'and d.next_attempt_at<=now()and s.is_active and(p_user_id is null or s.user_id=p_user_id)
  order by d.next_attempt_at,d.created_at for update skip locked limit p_limit
 ),claimed as(
  update public.notification_push_deliveries d set status='processing',claimed_at=now(),attempts=attempts+1
  from picked where d.id=picked.id returning d.*
 )
 select c.id,c.notification_id,s.id,s.endpoint,s.p256dh,s.auth_key,n.title,coalesce(n.body,''),coalesce(n.link,'/'),n.priority,n.category
 from claimed c join public.notification_push_subscriptions s on s.id=c.subscription_id join public.notifications n on n.id=c.notification_id;
end$$;

-- يسجل نقرة Push للمستخدم المالك فقط، ويجعل الإشعار مقروءاً في المركز نفسه.
create or replace function public.notification_record_push_interaction(p_delivery_id uuid)returns boolean
language plpgsql security definer set search_path=public as $$declare nid uuid;begin
 if auth.uid()is null then raise exception'PUSH_UNAUTHENTICATED';end if;
 update public.notification_push_deliveries d set clicked_at=coalesce(d.clicked_at,now())
 from public.notification_push_subscriptions s
 where d.id=p_delivery_id and d.subscription_id=s.id and s.user_id=auth.uid()and d.status='sent'
 returning d.notification_id into nid;
 if nid is null then return false;end if;
 update public.notifications set is_read=true,read_at=coalesce(read_at,now())where id=nid and user_id=auth.uid();
 return true;
end$$;

-- ملخص صحة كل جهاز دون كشف endpoint أو مفاتيح الاشتراك.
drop function public.notification_push_devices();
create function public.notification_push_devices()
returns table(id uuid,platform text,device_name text,is_active boolean,last_used_at timestamptz,created_at timestamptz,pending_count bigint,sent_count bigint,failed_count bigint,last_sent_at timestamptz,last_clicked_at timestamptz,health text)
language plpgsql stable security definer set search_path=public as $$begin
 if auth.uid()is null then raise exception'PUSH_UNAUTHENTICATED';end if;
 return query select s.id,s.platform,s.device_name,s.is_active,s.last_used_at,s.created_at,
 count(*)filter(where d.status in('pending','processing')),count(*)filter(where d.status='sent'),count(*)filter(where d.status='failed'),max(d.sent_at),max(d.clicked_at),
 case when not s.is_active then'disabled'when s.failure_count>=3 then'degraded'when s.last_used_at is not null then'healthy'else'new'end
 from public.notification_push_subscriptions s left join public.notification_push_deliveries d on d.subscription_id=s.id
 where s.user_id=auth.uid()group by s.id order by s.updated_at desc;
end$$;
create or replace function public.notification_disable_push_device(p_subscription_id uuid)returns boolean
language plpgsql security definer set search_path=public as $$begin
 if auth.uid()is null then raise exception'PUSH_UNAUTHENTICATED';end if;
 update public.notification_push_subscriptions set is_active=false,updated_at=now()where id=p_subscription_id and user_id=auth.uid()and is_active;
 if not found then return false;end if;
 update public.notification_push_deliveries set status='cancelled'where subscription_id=p_subscription_id and status in('pending','processing');
 if not exists(select 1 from public.notification_push_subscriptions where user_id=auth.uid()and is_active)then
  update public.notification_preferences set push_enabled=false,updated_at=now()where user_id=auth.uid();
 end if;return true;
end$$;

-- مراحل التشخيص والإصلاح والجاهزية تصل إلى المسؤول والكراج مع منع تكرار المرحلة/ربع التقدم.
create or replace function app.notify_maintenance_case_progress()returns trigger language plpgsql security definer set search_path=public,app as $$declare v public.garage_vehicles;stage text;bucket integer;begin
 if new.status not in('diagnosing','waiting_parts','in_repair','paused','ready')then return new;end if;
 if new.status=old.status and new.progress=old.progress and new.expected_completion_at is not distinct from old.expected_completion_at then return new;end if;
 select*into v from public.garage_vehicles where id=new.vehicle_id;bucket:=least(100,(new.progress/25)*25);
 stage:=case new.status when'diagnosing'then'التشخيص'when'waiting_parts'then'انتظار القطع'when'in_repair'then'الإصلاح'when'paused'then'متوقفة مؤقتاً'else'جاهزة'end;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
 select distinct x.user_id,'تحديث صيانة: '||stage,format('%s · DB %s — الإنجاز %s%%',v.vehicle_name,v.db_number,new.progress),
 case when new.status='ready'then'success'when new.status='paused'then'warning'else'info'end,'maintenance',case when new.status='ready'then'high'else'normal'end,
 x.link,'maintenance_case',new.id,'فتح حالة الصيانة','maintenance_case:'||new.id::text||':progress:'||new.status||':'||bucket
 from(
  select new.manager_id user_id,'/manager/vehicle-trips'::text link
  union all
  select ur.user_id,'/central-garage/maintenance-coordination'from public.user_roles ur where ur.role in('central_garage_officer','super_admin')
 )x where x.user_id is not null
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 return new;
end$$;
create trigger trg_notify_maintenance_case_progress after update of status,progress,expected_completion_at on public.vehicle_maintenance_cases
 for each row execute function app.notify_maintenance_case_progress();

create function public.notification_delivery_operations(p_hours integer default 24)
returns table(active_devices bigint,degraded_devices bigint,pending bigint,processing bigint,sent bigint,failed bigint,clicked bigint,stale_processing bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;
 if p_hours not between 1 and 720 then raise exception'PUSH_OPERATIONS_RANGE_INVALID';end if;
 return query select
 (select count(*)from public.notification_push_subscriptions where is_active),
 (select count(*)from public.notification_push_subscriptions where is_active and failure_count>=3),
 count(*)filter(where d.status='pending'),count(*)filter(where d.status='processing'),count(*)filter(where d.status='sent'),count(*)filter(where d.status='failed'),count(*)filter(where d.clicked_at is not null),
 count(*)filter(where d.status='processing'and d.claimed_at<now()-interval'5 minutes')
 from public.notification_push_deliveries d where d.created_at>=now()-make_interval(hours=>p_hours);
end$$;

revoke all on function public.notification_record_push_interaction(uuid),public.notification_push_devices(),public.notification_disable_push_device(uuid),public.notification_delivery_operations(integer)from public,anon;
grant execute on function public.notification_record_push_interaction(uuid),public.notification_push_devices(),public.notification_disable_push_device(uuid),public.notification_delivery_operations(integer)to authenticated;
revoke all on function public.notification_claim_push(integer,uuid)from public,anon,authenticated;
grant execute on function public.notification_claim_push(integer,uuid)to service_role;
revoke all on function app.notify_maintenance_case_progress()from public,anon,authenticated;
