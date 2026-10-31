-- 00398-هـ: الملف بلا تاريخ لا يُحذف عميانياً ولا يُعد اكتمالاً.
create or replace function public.platform_reset_storage_finish(p_id uuid,p_deleted int default 0) returns jsonb
language plpgsql volatile security definer set search_path=public,app,storage as $$
declare q public.platform_reset_requests; left_n bigint;
begin
 select * into q from public.platform_reset_requests where id=p_id for update;
 if q.id is null then raise exception 'RESET_NOT_FOUND'; end if;
 if not (app.has_role(array['it_admin','super_admin']) or coalesce(q.executed_by=auth.uid(),false)) then raise exception 'IT_FORBIDDEN'; end if;
 if q.status <> 'done' or q.executed_at is null then raise exception 'RESET_NOT_EXECUTED'; end if;
 if q.storage_done_at is not null then return jsonb_build_object('id',p_id,'remaining',0,'done',true); end if;
 -- الملف بلا تاريخ إنشاء لا يجوز حذفه عميانياً ولا إعلانه مكتملاً؛ يبقى معلّقاً للمراجعة.
 select count(*) into left_n from storage.objects o where o.bucket_id=any(q.storage_buckets)
  and (o.created_at is null or (o.created_at <= q.executed_at and (o.updated_at is null or o.updated_at <= q.executed_at)));
 update public.platform_reset_requests set storage_deleted=storage_deleted+greatest(coalesce(p_deleted,0),0),
  storage_done_at=case when left_n=0 then now() else null end,updated_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'remaining',left_n,'done',left_n=0);
end $$;
