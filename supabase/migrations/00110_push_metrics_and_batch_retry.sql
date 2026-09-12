-- 00110 · مؤشرات Push الزمنية وإعادة المحاولة الجماعية المدققة
create or replace function public.notification_push_metrics(p_hours integer default 24)
returns table(bucket_start timestamptz,total bigint,sent bigint,failed bigint,clicked bigint,average_attempts numeric,success_rate numeric,interaction_rate numeric)
language plpgsql stable security definer set search_path=public,app as $$begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;if p_hours not between 1 and 720 then raise exception'PUSH_OPERATIONS_RANGE_INVALID';end if;
 return query with buckets as(select generate_series(date_trunc('hour',now()-make_interval(hours=>p_hours-1)),date_trunc('hour',now()),interval'1 hour')b),agg as(select date_trunc('hour',d.created_at)b,count(*)total,count(*)filter(where d.status='sent')sent,count(*)filter(where d.status='failed')failed,count(*)filter(where d.clicked_at is not null)clicked,round(avg(d.attempts),2)avg_attempts from public.notification_push_deliveries d where d.created_at>=now()-make_interval(hours=>p_hours)group by 1)
 select x.b,coalesce(a.total,0),coalesce(a.sent,0),coalesce(a.failed,0),coalesce(a.clicked,0),coalesce(a.avg_attempts,0),case when coalesce(a.total,0)=0 then 0 else round(a.sent*100.0/a.total,2)end,case when coalesce(a.sent,0)=0 then 0 else round(a.clicked*100.0/a.sent,2)end from buckets x left join agg a using(b)order by x.b;
end$$;

create or replace function public.notification_push_batch_retry(p_delivery_ids uuid[],p_reason text)
returns integer language plpgsql security definer set search_path=public,app as $$declare n integer;begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'PUSH_OPERATIONS_FORBIDDEN';end if;
 if cardinality(p_delivery_ids)not between 1 and 50 or cardinality(p_delivery_ids)<>cardinality(array(select distinct unnest(p_delivery_ids)))or length(trim(coalesce(p_reason,'')))not between 3 and 500 then raise exception'PUSH_BATCH_RETRY_INVALID';end if;
 with eligible as(select d.id,d.subscription_id from public.notification_push_deliveries d join public.notification_push_subscriptions s on s.id=d.subscription_id where d.id=any(p_delivery_ids)and d.status in('failed','cancelled')and s.is_active for update of d),updated as(update public.notification_push_deliveries d set status='pending',attempts=0,next_attempt_at=now(),claimed_at=null,sent_at=null,last_http_status=null,last_error=null from eligible e where d.id=e.id returning d.id,d.subscription_id),logged as(insert into public.notification_push_admin_actions(actor_id,action,delivery_id,subscription_id,reason)select auth.uid(),'retry_delivery',u.id,u.subscription_id,trim(p_reason)from updated u returning 1)select count(*)into n from logged;
 if n<>cardinality(p_delivery_ids)then raise exception'PUSH_BATCH_RETRY_NOT_ALLOWED';end if;return n;
end$$;
revoke all on function public.notification_push_metrics(integer),public.notification_push_batch_retry(uuid[],text)from public,anon;
grant execute on function public.notification_push_metrics(integer),public.notification_push_batch_retry(uuid[],text)to authenticated;
