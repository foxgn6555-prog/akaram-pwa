-- 00398-هـ: تصفير مستقل لمستودع GPS، مرة واحدة لكل طلب، مع تجميد الكتابات وحماية التخزين الآخر.
-- يعمل حتى إن لم يُطبّق ملف 0007 القديم؛ يُبطِل الدالة الخطرة السابقة.
drop function if exists public.wh_wipe_all();
create table if not exists public.wh_reset_runs (
 id uuid primary key, state text not null check (state in ('waiting','prepared','done')),
 was_paused boolean not null, wipe_data boolean not null, reset_settings boolean not null, started_at timestamptz not null default now(), finished_at timestamptz, result jsonb
);
create table if not exists public.wh_reset_files (
 reset_id uuid not null references public.wh_reset_runs(id), object_id uuid not null,
 name text not null, created_at timestamptz, updated_at timestamptz,
 primary key(reset_id, object_id)
);
alter table public.wh_reset_runs enable row level security;
alter table public.wh_reset_files enable row level security;
revoke all on public.wh_reset_runs,public.wh_reset_files from public,anon,authenticated;

create or replace function public.wh_reset_guard() returns trigger
language plpgsql security definer set search_path=public,storage as $$
begin
 if current_setting('app.wh_reset',true)='1' then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_table_schema='storage' then
   if tg_op='DELETE' or (tg_op='UPDATE' and old.bucket_id <> 'gps-archive' and new.bucket_id <> 'gps-archive') or (tg_op='INSERT' and new.bucket_id <> 'gps-archive') then if tg_op='DELETE' then return old; else return new; end if; end if;
 end if;
 if exists(select 1 from public.wh_reset_runs where state in ('waiting','prepared')) then
   raise exception 'GPS_WAREHOUSE_RESET_IN_PROGRESS';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['wh_vehicles','wh_pull_jobs','wh_raw_points','wh_stops','wh_hotspots','wh_archive_files'] loop
  execute format('drop trigger if exists wh_reset_guard on public.%I',t);
  execute format('create trigger wh_reset_guard before insert or update or delete on public.%I for each row execute function public.wh_reset_guard()',t);
 end loop;
end $$;
drop trigger if exists wh_reset_guard on storage.objects;
create trigger wh_reset_guard before insert or update or delete on storage.objects for each row execute function public.wh_reset_guard();

create or replace function public.wh_reset_prepare(p_id uuid,p_wipe_data boolean,p_reset_settings boolean) returns jsonb
language plpgsql security definer set search_path=public,storage as $$
declare r public.wh_reset_runs; s public.wh_settings; n bigint;
begin
 if p_id is null then raise exception 'GPS_WAREHOUSE_RESET_ID_REQUIRED'; end if;
 if not coalesce(p_wipe_data,false) and not coalesce(p_reset_settings,false) then raise exception 'GPS_WAREHOUSE_RESET_SCOPE_REQUIRED'; end if;
 select * into s from public.wh_settings where id=1 for update;
 if not found then raise exception 'GPS_WAREHOUSE_SETTINGS_MISSING'; end if;
 select * into r from public.wh_reset_runs where id=p_id for update;
 if r.id is not null and (r.wipe_data is distinct from p_wipe_data or r.reset_settings is distinct from p_reset_settings) then raise exception 'GPS_WAREHOUSE_RESET_SCOPE_CHANGED'; end if;
 if r.state='done' then return jsonb_build_object('state','done','result',r.result); end if;
 if exists(select 1 from public.wh_reset_runs where id<>p_id and state in ('waiting','prepared')) then raise exception 'GPS_WAREHOUSE_RESET_BUSY'; end if;
 if r.id is null then
  insert into public.wh_reset_runs(id,state,was_paused,wipe_data,reset_settings) values(p_id,'waiting',s.paused,p_wipe_data,p_reset_settings) returning * into r;
 end if;
 update public.wh_settings set paused=true where id=1;
 if s.pull_locked_until is not null and s.pull_locked_until > now() then
  return jsonb_build_object('state','waiting');
 end if;
 if r.state='waiting' then
  -- يمنع دخول عمليات كتابة جديدة حتى تُسجَّل اللقطة ويصبح الحارس فعالاً.
  lock table public.wh_vehicles,public.wh_pull_jobs,public.wh_raw_points,public.wh_stops,public.wh_hotspots,public.wh_archive_files,storage.objects in share row exclusive mode;
  insert into public.wh_reset_files(reset_id,object_id,name,created_at,updated_at)
   select p_id,o.id,o.name,o.created_at,o.updated_at from storage.objects o where p_wipe_data and o.bucket_id='gps-archive';
  update public.wh_reset_runs set state='prepared' where id=p_id;
 end if;
 select count(*) into n from public.wh_reset_files f join storage.objects o on o.id=f.object_id where f.reset_id=p_id;
 return jsonb_build_object('state','prepared','files_remaining',n);
end $$;

create or replace function public.wh_reset_files_batch(p_id uuid,p_limit int default 500)
returns table(name text) language plpgsql stable security definer set search_path=public,storage as $$
begin
 if not exists(select 1 from public.wh_reset_runs where id=p_id and state='prepared') then raise exception 'GPS_WAREHOUSE_RESET_NOT_PREPARED'; end if;
 if exists(select 1 from public.wh_reset_files f join storage.objects o on o.id=f.object_id where f.reset_id=p_id
           and (o.bucket_id<>'gps-archive' or o.name<>f.name or o.created_at is distinct from f.created_at or o.updated_at is distinct from f.updated_at)) then
   raise exception 'GPS_WAREHOUSE_RESET_FILE_CHANGED';
 end if;
 return query select f.name from public.wh_reset_files f join storage.objects o on o.id=f.object_id
  where f.reset_id=p_id order by f.name limit greatest(1,least(coalesce(p_limit,500),1000));
end $$;

create or replace function public.wh_reset_execute(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,storage as $$
declare r public.wh_reset_runs; t text; n bigint; all_rows bigint:=0; cnt jsonb:='{}'::jsonb; out jsonb; sets text;
begin
 select * into r from public.wh_reset_runs where id=p_id for update;
 if r.state='done' then return r.result; end if;
 if r.state is distinct from 'prepared' then raise exception 'GPS_WAREHOUSE_RESET_NOT_PREPARED'; end if;
 if exists(select 1 from public.wh_reset_files f join storage.objects o on o.id=f.object_id where f.reset_id=p_id) then raise exception 'GPS_WAREHOUSE_RESET_FILES_PENDING'; end if;
 perform set_config('app.wh_reset','1',true);
 if r.wipe_data then
  foreach t in array array['wh_stops','wh_hotspots','wh_raw_points','wh_archive_files','wh_pull_jobs','wh_vehicles'] loop
   execute format('select count(*) from public.%I',t) into n;
   cnt:=cnt||jsonb_build_object(t,n); all_rows:=all_rows+n;
  end loop;
  -- الجداول الستة المختارة صراحةً بلا CASCADE: يحرر المساحة دون جداول أخرى.
  truncate table public.wh_stops,public.wh_hotspots,public.wh_raw_points,public.wh_archive_files,public.wh_pull_jobs,public.wh_vehicles;
 end if;
 if r.reset_settings then
  select string_agg(format('%I=default',a.attname),', ') into sets from pg_attribute a
   join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid='public.wh_settings'::regclass and a.attnum>0 and not a.attisdropped
    and a.attname not in ('id','paused','pull_locked_until');
  if sets is not null then execute 'update public.wh_settings set '||sets||' where id=1'; end if;
 end if;
 out:=jsonb_build_object('rows_deleted',all_rows,'per_table',cnt,'settings_reset',r.reset_settings,'files_deleted',(select count(*) from public.wh_reset_files where reset_id=p_id));
 update public.wh_reset_runs set state='done',finished_at=now(),result=out where id=p_id;
 update public.wh_settings set paused=case when r.reset_settings then false else r.was_paused end,pull_locked_until=null where id=1;
 return out;
end $$;
revoke all on function public.wh_reset_guard(),public.wh_reset_prepare(uuid,boolean,boolean),public.wh_reset_files_batch(uuid,int),public.wh_reset_execute(uuid) from public,anon,authenticated;
grant execute on function public.wh_reset_prepare(uuid,boolean,boolean),public.wh_reset_files_batch(uuid,int),public.wh_reset_execute(uuid) to service_role;
insert into public.wh_schema_version(version,note) values(8,'00398-هـ تصفير مستقل آمن') on conflict(version) do nothing;

-- إحصاء مستقل دقيق للمستودع فقط، ويستثني أي حاوية أخرى.
create or replace function public.wh_ping() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'reset_rows', (select count(*) from public.wh_vehicles)+(select count(*) from public.wh_pull_jobs)+(select count(*) from public.wh_raw_points)+(select count(*) from public.wh_stops)+(select count(*) from public.wh_hotspots)+(select count(*) from public.wh_archive_files),
    'reset_files', (select count(*) from storage.objects where bucket_id='gps-archive'),
    'reset_settings_rows', (select count(*) from public.wh_settings),
    'schema_version', (select max(version) from public.wh_schema_version),
    'vehicles', (select count(*) from public.wh_vehicles where active),
    'jobs', jsonb_build_object(
      'queued', (select count(*) from public.wh_pull_jobs where status = 'queued'),
      'running', (select count(*) from public.wh_pull_jobs where status = 'running'),
      'done', (select count(*) from public.wh_pull_jobs where status = 'done'),
      'failed', (select count(*) from public.wh_pull_jobs where status = 'failed')),
    'raw_points', (select count(*) from public.wh_raw_points),
    'stops', (select count(*) from public.wh_stops),
    'hotspots', (select count(*) from public.wh_hotspots),
    'hotspots_by_month', coalesce((select jsonb_object_agg(to_char(month, 'YYYY-MM'), c) from (select month, count(*) c from public.wh_hotspots group by month) q), '{}'::jsonb),
    'archive_files', (select count(*) from public.wh_archive_files),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0) from storage.objects o),
    'storage_objects', (select count(*) from storage.objects),
    'settings', (select to_jsonb(s) - 'id' - 'pull_locked_until' from public.wh_settings s where id = 1),
    'progress', public.wh_progress(),
    'server_time', now());
$$;

revoke all on function public.wh_ping() from public,anon,authenticated;
