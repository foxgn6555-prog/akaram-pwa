-- 00109 · إجراءات Push مدققة وتفاصيل الجهاز الآمنة
create table public.notification_push_admin_actions(
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 action text not null check(action in('retry_delivery','cancel_delivery','disable_device')),
 delivery_id uuid references public.notification_push_deliveries(id)on delete set null,
 subscription_id uuid references public.notification_push_subscriptions(id)on delete set null,
 reason text not null check(length(trim(reason))between 3 and 500),
 created_at timestamptz not null default now()
);
alter table public.notification_push_admin_actions enable row level security;
create index push_admin_actions_created_idx on public.notification_push_admin_actions(created_at desc);
create index push_admin_actions_target_idx on public.notification_push_admin_actions(delivery_id,subscription_id);
create trigger trg_audit_notification_push_admin_actions after insert or update or delete on public.notification_push_admin_actions for each row execute function app.audit_trigger();

create or replace function public.notification_push_admin_action(p_action text,p_delivery_id uuid default null,p_subscription_id uuid default null,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public,app as $$declare d public.notification_push_deliveries;s uuid;begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;
 if p_action not in('retry_delivery','cancel_delivery','disable_device')or length(trim(coalesce(p_reason,'')))not between 3 and 500 then raise exception'PUSH_ADMIN_ACTION_INVALID';end if;
 if p_action in('retry_delivery','cancel_delivery')then
  if p_delivery_id is null or p_subscription_id is not null then raise exception'PUSH_ADMIN_TARGET_INVALID';end if;
  select*into d from public.notification_push_deliveries where id=p_delivery_id for update;if not found then raise exception'PUSH_DELIVERY_NOT_FOUND';end if;s:=d.subscription_id;
  if p_action='retry_delivery'then
   if d.status not in('failed','cancelled')or not exists(select 1 from public.notification_push_subscriptions where id=s and is_active)then raise exception'PUSH_RETRY_NOT_ALLOWED';end if;
   update public.notification_push_deliveries set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,sent_at=null,last_http_status=null,last_error=null where id=d.id;
  else
   if d.status not in('pending','processing')then raise exception'PUSH_CANCEL_NOT_ALLOWED';end if;
   update public.notification_push_deliveries set status='cancelled',claimed_at=null,last_error='PUSH_CANCELLED_BY_ADMIN'where id=d.id;
  end if;
 else
  if p_subscription_id is null or p_delivery_id is not null then raise exception'PUSH_ADMIN_TARGET_INVALID';end if;s:=p_subscription_id;
  update public.notification_push_subscriptions set is_active=false,last_error='PUSH_DISABLED_BY_ADMIN',updated_at=now()where id=s and is_active;if not found then raise exception'PUSH_DEVICE_DISABLE_NOT_ALLOWED';end if;
  update public.notification_push_deliveries set status='cancelled',claimed_at=null,last_error='PUSH_DEVICE_DISABLED_BY_ADMIN'where subscription_id=s and status in('pending','processing');
 end if;
 insert into public.notification_push_admin_actions(actor_id,action,delivery_id,subscription_id,reason)values(auth.uid(),p_action,p_delivery_id,s,trim(p_reason));return true;
end$$;

-- إضافة معرف الاشتراك الآمن للتمكن من تعطيل الجهاز من شاشة العمليات دون كشف endpoint أو المفاتيح.
drop function public.notification_push_delivery_page(integer,text,text,integer,integer);
create function public.notification_push_delivery_page(p_hours integer default 24,p_status text default null,p_platform text default null,p_limit integer default 50,p_offset integer default 0)
returns table(delivery_id uuid,notification_id uuid,subscription_id uuid,status text,attempts integer,created_at timestamptz,next_attempt_at timestamptz,sent_at timestamptz,clicked_at timestamptz,last_http_status integer,platform text,device_name text,priority text,category text,title text,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;
 if p_hours not between 1 and 720 or p_limit not between 1 and 100 or p_offset not between 0 and 10000 or(p_status is not null and p_status not in('pending','processing','sent','failed','cancelled'))or(p_platform is not null and p_platform not in('android','ios','windows','macos','linux','unknown'))then raise exception'PUSH_DELIVERY_FILTER_INVALID';end if;
 return query select d.id,d.notification_id,d.subscription_id,d.status,d.attempts,d.created_at,d.next_attempt_at,d.sent_at,d.clicked_at,d.last_http_status,s.platform,s.device_name,n.priority,n.category,n.title,count(*)over()
 from public.notification_push_deliveries d join public.notification_push_subscriptions s on s.id=d.subscription_id join public.notifications n on n.id=d.notification_id
 where d.created_at>=now()-make_interval(hours=>p_hours)and(p_status is null or d.status=p_status)and(p_platform is null or s.platform=p_platform)
 order by d.created_at desc limit p_limit offset p_offset;
end$$;

revoke all on table public.notification_push_admin_actions from public,anon,authenticated;
revoke all on function public.notification_push_admin_action(text,uuid,uuid,text),public.notification_push_delivery_page(integer,text,text,integer,integer)from public,anon;
grant execute on function public.notification_push_admin_action(text,uuid,uuid,text),public.notification_push_delivery_page(integer,text,text,integer,integer)to authenticated;
