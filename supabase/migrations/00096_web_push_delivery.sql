-- 00096 · اشتراكات Web Push وطابور تسليم موثوق متعدد الأجهزة
create table public.notification_push_subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,
 endpoint text not null unique,p256dh text not null,auth_key text not null,expiration_time bigint,
 user_agent text,platform text not null default 'unknown',device_name text,
 is_active boolean not null default true,failure_count integer not null default 0,last_used_at timestamptz,last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint push_endpoint_check check(length(endpoint)between 20 and 2048 and endpoint~'^https://'),
 constraint push_key_check check(length(p256dh)between 40 and 255 and length(auth_key)between 8 and 255),
 constraint push_platform_check check(platform in('android','ios','windows','macos','linux','unknown')),
 constraint push_failure_check check(failure_count between 0 and 20)
);
create index push_subscription_user on public.notification_push_subscriptions(user_id,is_active);
alter table public.notification_push_subscriptions enable row level security;
create policy "push subscriptions own read" on public.notification_push_subscriptions for select to authenticated using(user_id=auth.uid());

create table public.notification_push_deliveries(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.notifications(id)on delete cascade,
 subscription_id uuid not null references public.notification_push_subscriptions(id)on delete cascade,
 status text not null default 'pending',attempts integer not null default 0,next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,sent_at timestamptz,last_http_status integer,last_error text,created_at timestamptz not null default now(),
 unique(notification_id,subscription_id),
 constraint push_delivery_status_check check(status in('pending','processing','sent','failed','cancelled')),
 constraint push_delivery_attempts_check check(attempts between 0 and 8)
);
create index push_delivery_queue on public.notification_push_deliveries(status,next_attempt_at)where status in('pending','processing');
alter table public.notification_push_deliveries enable row level security;

create or replace function app.notification_next_push_time(p_from time,p_to time)returns timestamptz language plpgsql stable set search_path=pg_catalog as $$declare local_now timestamp:=now()at time zone'Asia/Baghdad';t time:=local_now::time;target timestamp;begin
 if p_from is null or p_to is null then return now();end if;
 if p_from<p_to and t>=p_from and t<p_to then target:=local_now::date+p_to;
 elsif p_from>p_to and t>=p_from then target:=local_now::date+1+p_to;
 elsif p_from>p_to and t<p_to then target:=local_now::date+p_to;
 else return now();end if;
 return target at time zone'Asia/Baghdad';
end$$;

create or replace function app.queue_notification_push()returns trigger language plpgsql security definer set search_path=public,app as $$begin
 insert into public.notification_push_deliveries(notification_id,subscription_id,next_attempt_at)
 select new.id,s.id,case when new.priority='critical'then now()else app.notification_next_push_time(p.quiet_from,p.quiet_to)end
 from public.notification_push_subscriptions s join public.notification_preferences p on p.user_id=s.user_id
 where s.user_id=new.user_id and s.is_active and p.push_enabled and(not p.critical_only or new.priority='critical')
 on conflict(notification_id,subscription_id)do nothing;
 return new;
end$$;
create trigger trg_queue_notification_push after insert on public.notifications for each row execute function app.queue_notification_push();

create or replace function public.notification_register_push(p_endpoint text,p_p256dh text,p_auth text,p_expiration bigint default null,p_user_agent text default null,p_platform text default'unknown',p_device_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$declare r uuid;begin
 if auth.uid()is null then raise exception'PUSH_UNAUTHENTICATED';end if;
 if length(trim(coalesce(p_endpoint,'')))not between 20 and 2048 or p_endpoint!~'^https://'or length(p_p256dh)not between 40 and 255 or length(p_auth)not between 8 and 255 or p_platform not in('android','ios','windows','macos','linux','unknown')then raise exception'PUSH_SUBSCRIPTION_INVALID';end if;
 insert into public.notification_push_subscriptions(user_id,endpoint,p256dh,auth_key,expiration_time,user_agent,platform,device_name)
 values(auth.uid(),p_endpoint,p_p256dh,p_auth,p_expiration,left(p_user_agent,500),p_platform,left(trim(p_device_name),100))
 on conflict(endpoint)do update set user_id=auth.uid(),p256dh=excluded.p256dh,auth_key=excluded.auth_key,expiration_time=excluded.expiration_time,user_agent=excluded.user_agent,platform=excluded.platform,device_name=excluded.device_name,is_active=true,failure_count=0,last_error=null,updated_at=now()returning id into r;
 insert into public.notification_preferences(user_id,push_enabled)values(auth.uid(),true)on conflict(user_id)do update set push_enabled=true,updated_at=now();return r;
end$$;
create or replace function public.notification_unregister_push(p_endpoint text)returns void language plpgsql security definer set search_path=public as $$begin
 update public.notification_push_subscriptions set is_active=false,updated_at=now()where user_id=auth.uid()and endpoint=p_endpoint;
 if not exists(select 1 from public.notification_push_subscriptions where user_id=auth.uid()and is_active)then update public.notification_preferences set push_enabled=false,updated_at=now()where user_id=auth.uid();end if;
end$$;
create or replace function public.notification_push_devices()returns table(id uuid,platform text,device_name text,is_active boolean,last_used_at timestamptz,created_at timestamptz)language plpgsql stable security definer set search_path=public as $$begin if auth.uid()is null then raise exception'PUSH_UNAUTHENTICATED';end if;return query select s.id,s.platform,s.device_name,s.is_active,s.last_used_at,s.created_at from public.notification_push_subscriptions s where s.user_id=auth.uid()order by s.updated_at desc;end$$;

create or replace function public.notification_claim_push(p_limit integer default 50,p_user_id uuid default null)
returns table(delivery_id uuid,subscription_id uuid,endpoint text,p256dh text,auth_key text,title text,body text,link text,priority text,category text)
language plpgsql security definer set search_path=public as $$begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'PUSH_SERVICE_ONLY';end if;if p_limit not between 1 and 100 then raise exception'PUSH_LIMIT_INVALID';end if;
 return query with picked as(select d.id from public.notification_push_deliveries d join public.notification_push_subscriptions s on s.id=d.subscription_id where d.status='pending'and d.next_attempt_at<=now()and s.is_active and(p_user_id is null or s.user_id=p_user_id)order by d.next_attempt_at,d.created_at for update skip locked limit p_limit),claimed as(update public.notification_push_deliveries d set status='processing',claimed_at=now(),attempts=attempts+1 from picked where d.id=picked.id returning d.*)
 select c.id,s.id,s.endpoint,s.p256dh,s.auth_key,n.title,coalesce(n.body,''),coalesce(n.link,'/'),n.priority,n.category from claimed c join public.notification_push_subscriptions s on s.id=c.subscription_id join public.notifications n on n.id=c.notification_id;
end$$;
create or replace function public.notification_finish_push(p_delivery_id uuid,p_success boolean,p_http_status integer default null,p_error text default null,p_permanent boolean default false)returns void language plpgsql security definer set search_path=public as $$declare sid uuid;tries int;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'PUSH_SERVICE_ONLY';end if;
 select subscription_id,attempts into sid,tries from public.notification_push_deliveries where id=p_delivery_id and status='processing'for update;if not found then return;end if;
 if p_success then update public.notification_push_deliveries set status='sent',sent_at=now(),last_http_status=p_http_status,last_error=null where id=p_delivery_id;update public.notification_push_subscriptions set failure_count=0,last_used_at=now(),last_error=null,updated_at=now()where id=sid;
 else update public.notification_push_deliveries set status=case when p_permanent or tries>=5 then'failed'else'pending'end,next_attempt_at=now()+make_interval(mins=>least(60,power(2,tries)::int)),last_http_status=p_http_status,last_error=left(p_error,500)where id=p_delivery_id;update public.notification_push_subscriptions set failure_count=least(20,failure_count+1),last_error=left(p_error,500),is_active=case when p_permanent then false else is_active end,updated_at=now()where id=sid;end if;
end$$;

-- قيمة Push مشتقة من وجود جهاز نشط، ولا يمكن لنموذج التفضيلات تعطيل أجهزة أخرى بالخطأ.
create or replace function public.notification_update_preferences(p_in_app boolean,p_sound boolean,p_push boolean,p_critical_only boolean,p_quiet_from time default null,p_quiet_to time default null)returns public.notification_preferences language plpgsql security definer set search_path=public as $$declare r public.notification_preferences;actual_push boolean;begin
 if auth.uid()is null then raise exception'NOTIFICATIONS_UNAUTHENTICATED';end if;if(p_quiet_from is null)<>(p_quiet_to is null)then raise exception'NOTIFICATION_QUIET_PAIR_REQUIRED';end if;select exists(select 1 from public.notification_push_subscriptions where user_id=auth.uid()and is_active)into actual_push;
 insert into public.notification_preferences(user_id,in_app_enabled,sound_enabled,push_enabled,critical_only,quiet_from,quiet_to)values(auth.uid(),p_in_app,p_sound,actual_push,p_critical_only,p_quiet_from,p_quiet_to)on conflict(user_id)do update set in_app_enabled=excluded.in_app_enabled,sound_enabled=excluded.sound_enabled,push_enabled=excluded.push_enabled,critical_only=excluded.critical_only,quiet_from=excluded.quiet_from,quiet_to=excluded.quiet_to,updated_at=now()returning*into r;return r;
end$$;

revoke all on table public.notification_push_subscriptions,public.notification_push_deliveries from anon,authenticated;
grant select on public.notification_push_subscriptions to authenticated;
revoke all on function public.notification_register_push(text,text,text,bigint,text,text,text),public.notification_unregister_push(text),public.notification_push_devices()from public,anon;
grant execute on function public.notification_register_push(text,text,text,bigint,text,text,text),public.notification_unregister_push(text),public.notification_push_devices()to authenticated;
revoke all on function public.notification_claim_push(integer,uuid),public.notification_finish_push(uuid,boolean,integer,text,boolean)from public,anon,authenticated;
grant execute on function public.notification_claim_push(integer,uuid),public.notification_finish_push(uuid,boolean,integer,text,boolean)to service_role;
revoke all on function app.notification_next_push_time(time,time),app.queue_notification_push()from public,anon,authenticated;
