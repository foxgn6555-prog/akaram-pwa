-- 00095 · مركز الإشعارات المؤسسي وربط بلاغ الصيانة بالكراج دون تعطيل الحركة
alter table public.notifications
 add column category text not null default 'system',
 add column priority text not null default 'normal',
 add column entity_type text,
 add column entity_id uuid,
 add column action_label text,
 add column dedupe_key text,
 add column dismissed_at timestamptz,
 add column expires_at timestamptz,
 add constraint notifications_category_check check(category in('system','departure','maintenance','garage','station','gps','complaints','security')),
 add constraint notifications_priority_check check(priority in('low','normal','high','critical')),
 add constraint notifications_title_length check(length(trim(title))between 1 and 160),
 add constraint notifications_body_length check(length(coalesce(body,''))<=1000),
 add constraint notifications_link_internal check(link is null or link~'^/[a-zA-Z0-9/_?=&.-]+$');
create unique index notifications_dedupe_user on public.notifications(user_id,dedupe_key)where dedupe_key is not null;
create index notifications_center_idx on public.notifications(user_id,dismissed_at,created_at desc);

drop policy if exists "notifications: تحديث إشعاراتي" on public.notifications;
drop policy if exists "notifications: حذف إشعاراتي" on public.notifications;

create table public.notification_preferences(
 user_id uuid primary key references auth.users(id)on delete cascade,
 in_app_enabled boolean not null default true,
 sound_enabled boolean not null default true,
 push_enabled boolean not null default false,
 critical_only boolean not null default false,
 quiet_from time,
 quiet_to time,
 updated_at timestamptz not null default now(),
 constraint notification_quiet_pair check((quiet_from is null)=(quiet_to is null))
);
alter table public.notification_preferences enable row level security;
create policy "notification preferences own read" on public.notification_preferences for select to authenticated using(user_id=auth.uid());

create or replace function public.notification_center(p_limit integer default 30,p_before timestamptz default null)
returns table(id uuid,title text,body text,type text,category text,priority text,link text,is_read boolean,read_at timestamptz,created_at timestamptz,entity_type text,entity_id uuid,action_label text)
language plpgsql stable security definer set search_path=public,app as $$begin
 if auth.uid()is null then raise exception'NOTIFICATIONS_UNAUTHENTICATED';end if;
 if p_limit not between 1 and 50 then raise exception'NOTIFICATIONS_LIMIT_INVALID';end if;
 return query select n.id,n.title,n.body,n.type,n.category,n.priority,n.link,n.is_read,n.read_at,n.created_at,n.entity_type,n.entity_id,n.action_label from public.notifications n where n.user_id=auth.uid()and n.dismissed_at is null and(n.expires_at is null or n.expires_at>now())and(p_before is null or n.created_at<p_before)order by n.created_at desc limit p_limit;
end$$;
create or replace function public.notification_unread_count()returns bigint language sql stable security definer set search_path=public as $$select count(*)from public.notifications where user_id=auth.uid()and not is_read and dismissed_at is null and(expires_at is null or expires_at>now())$$;
create or replace function public.notification_mark_read(p_id uuid)returns void language plpgsql security definer set search_path=public as $$begin update public.notifications set is_read=true,read_at=coalesce(read_at,now())where id=p_id and user_id=auth.uid()and dismissed_at is null;if not found then raise exception'NOTIFICATION_NOT_FOUND';end if;end$$;
create or replace function public.notification_mark_all_read()returns integer language plpgsql security definer set search_path=public as $$declare n integer;begin update public.notifications set is_read=true,read_at=coalesce(read_at,now())where user_id=auth.uid()and not is_read and dismissed_at is null;get diagnostics n=row_count;return n;end$$;
create or replace function public.notification_dismiss(p_id uuid)returns void language plpgsql security definer set search_path=public as $$begin update public.notifications set dismissed_at=now(),is_read=true,read_at=coalesce(read_at,now())where id=p_id and user_id=auth.uid()and dismissed_at is null;if not found then raise exception'NOTIFICATION_NOT_FOUND';end if;end$$;
create or replace function public.notification_get_preferences()returns public.notification_preferences language plpgsql security definer set search_path=public as $$declare r public.notification_preferences;begin if auth.uid()is null then raise exception'NOTIFICATIONS_UNAUTHENTICATED';end if;insert into public.notification_preferences(user_id)values(auth.uid())on conflict(user_id)do nothing;select*into r from public.notification_preferences where user_id=auth.uid();return r;end$$;
create or replace function public.notification_update_preferences(p_in_app boolean,p_sound boolean,p_push boolean,p_critical_only boolean,p_quiet_from time default null,p_quiet_to time default null)returns public.notification_preferences language plpgsql security definer set search_path=public as $$declare r public.notification_preferences;begin if auth.uid()is null then raise exception'NOTIFICATIONS_UNAUTHENTICATED';end if;if (p_quiet_from is null)<>(p_quiet_to is null)then raise exception'NOTIFICATION_QUIET_PAIR_REQUIRED';end if;insert into public.notification_preferences(user_id,in_app_enabled,sound_enabled,push_enabled,critical_only,quiet_from,quiet_to)values(auth.uid(),p_in_app,p_sound,p_push,p_critical_only,p_quiet_from,p_quiet_to)on conflict(user_id)do update set in_app_enabled=excluded.in_app_enabled,sound_enabled=excluded.sound_enabled,push_enabled=excluded.push_enabled,critical_only=excluded.critical_only,quiet_from=excluded.quiet_from,quiet_to=excluded.quiet_to,updated_at=now()returning*into r;return r;end$$;

-- بلاغ الصيانة لا ينتظر موافقة، لكنه يصل فوراً إلى الكراج المركزي للتنسيق والمتابعة.
create or replace function app.notify_garage_new_maintenance_case()returns trigger language plpgsql security definer set search_path=public,app as $$declare v public.garage_vehicles;begin
 select*into v from public.garage_vehicles where id=new.vehicle_id;
 insert into public.notifications(user_id,title,body,type,category,priority,link,entity_type,entity_id,action_label,dedupe_key)
 select distinct ur.user_id,'بلاغ آلية متجهة إلى الصيانة',format('%s · DB %s — %s',v.vehicle_name,v.db_number,new.fault_type),case when new.priority='critical'then'error'else'warning'end,'maintenance',case when new.priority='critical'then'critical'when new.priority='urgent'then'high'else'normal'end,'/central-garage/drivers-dispatch','maintenance_case',new.id,'فتح الانطلاقية','maintenance_case:'||new.id::text||':garage'
 from public.user_roles ur where ur.role in('central_garage_officer','super_admin')
 on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
 return new;
end$$;
create trigger trg_notify_garage_new_maintenance after insert on public.vehicle_maintenance_cases for each row execute function app.notify_garage_new_maintenance_case();

revoke all on function public.notification_center(integer,timestamptz),public.notification_unread_count(),public.notification_mark_read(uuid),public.notification_mark_all_read(),public.notification_dismiss(uuid),public.notification_get_preferences(),public.notification_update_preferences(boolean,boolean,boolean,boolean,time,time)from public,anon;
grant execute on function public.notification_center(integer,timestamptz),public.notification_unread_count(),public.notification_mark_read(uuid),public.notification_mark_all_read(),public.notification_dismiss(uuid),public.notification_get_preferences(),public.notification_update_preferences(boolean,boolean,boolean,boolean,time,time)to authenticated;
revoke all on function app.notify_garage_new_maintenance_case()from public,anon,authenticated;
