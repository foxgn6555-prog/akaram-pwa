-- 00168 · وحدة «استقبال الشكاوى» في غرفة العمليات + صفحة المواطن العامة
--
--   المواطن (بلا حساب — اسم + هاتف → رمز جلسة):
--     citizen_sign_in → token؛ citizen_complaint_submit (اسم ثلاثي، تفاصيل، موقع، صور اختيارية)؛
--     citizen_my_complaints (حالة الشكوى)؛ محادثة حيّة مع الدعم: citizen_chat_request/state/send/close/rate.
--   غرفة العمليات: قائمة الشكاوى، إسناد لمسؤول قسم (⇒ قيد المعالجة تلقائياً)، تعليق/إنجاز بسبب، طابور الدعم،
--     استلام المحادثة والرد وإغلاقها، إعدادات الصفحة العامة (نبذة + أرقام التواصل).
--   مسؤول القسم: شكاوى المواطنين المسندة إليه + تحديث حالتها.
--   التقارير: citizen_complaints_report(from,to) لمعاون المدير المفوض والمدير المفوض وغرفة العمليات.
--
--   هذه الشكاوى منفصلة تماماً عن وحدة الشكاوى (البريد الحكومي 00047) — جداول وحالات ومسار خاص.

-- ═══════════════════════════════════════ الجداول ═══════════════════════════════════════
create table if not exists public.citizen_accounts (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null unique,                -- 07XXXXXXXXX موحّد
  token         uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
alter table public.citizen_accounts enable row level security;
comment on table public.citizen_accounts is 'هوية مبسّطة للمواطن (اسم + هاتف) — الوصول عبر token فقط من دوال security definer';

create sequence if not exists public.citizen_complaint_seq;
create table if not exists public.citizen_complaints (
  id                uuid primary key default gen_random_uuid(),
  ref_no            text not null unique,
  citizen_id        uuid not null references public.citizen_accounts (id) on delete cascade,
  full_name         text not null,                   -- الاسم الثلاثي كما كتبه في الشكوى
  phone             text not null,
  details           text not null,
  lat               double precision,
  lng               double precision,
  address_text      text,
  status            text not null default 'new' check (status in ('new', 'in_progress', 'on_hold', 'resolved')),
  assigned_to       uuid references auth.users (id) on delete set null,   -- مسؤول القسم
  assigned_by       uuid references auth.users (id) on delete set null,
  assigned_at       timestamptz,
  hold_reason       text,
  resolution_note   text,
  resolved_at       timestamptz,
  citizen_rating    smallint check (citizen_rating between 1 and 5),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.citizen_complaints enable row level security;
create index if not exists idx_citizen_complaints_citizen  on public.citizen_complaints (citizen_id, created_at desc);
create index if not exists idx_citizen_complaints_status   on public.citizen_complaints (status, created_at desc);
create index if not exists idx_citizen_complaints_assignee on public.citizen_complaints (assigned_to) where assigned_to is not null;

create table if not exists public.citizen_complaint_photos (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.citizen_complaints (id) on delete cascade,
  path          text not null,
  created_at    timestamptz not null default now()
);
alter table public.citizen_complaint_photos enable row level security;
create index if not exists idx_citizen_complaint_photos on public.citizen_complaint_photos (complaint_id);

create table if not exists public.citizen_complaint_events (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.citizen_complaints (id) on delete cascade,
  kind          text not null check (kind in ('created', 'assigned', 'status', 'note', 'rated')),
  from_status   text,
  to_status     text,
  note          text,
  actor_id      uuid references auth.users (id) on delete set null,
  actor_name    text,
  created_at    timestamptz not null default now()
);
alter table public.citizen_complaint_events enable row level security;
create index if not exists idx_citizen_complaint_events on public.citizen_complaint_events (complaint_id, created_at);

create table if not exists public.citizen_chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  citizen_id      uuid not null references public.citizen_accounts (id) on delete cascade,
  status          text not null default 'waiting' check (status in ('waiting', 'active', 'closed')),
  agent_id        uuid references auth.users (id) on delete set null,
  agent_name      text,
  requested_at    timestamptz not null default now(),
  accepted_at     timestamptz,
  closed_at       timestamptz,
  closed_by       text check (closed_by in ('citizen', 'agent', 'system')),
  rating          smallint check (rating between 1 and 5),
  rating_note     text,
  first_reply_at  timestamptz
);
alter table public.citizen_chat_sessions enable row level security;
create index if not exists idx_citizen_chat_sessions_status  on public.citizen_chat_sessions (status, requested_at);
create index if not exists idx_citizen_chat_sessions_citizen on public.citizen_chat_sessions (citizen_id, requested_at desc);

create table if not exists public.citizen_chat_messages (
  id          bigserial primary key,
  session_id  uuid not null references public.citizen_chat_sessions (id) on delete cascade,
  sender      text not null check (sender in ('citizen', 'agent', 'system')),
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.citizen_chat_messages enable row level security;
create index if not exists idx_citizen_chat_messages on public.citizen_chat_messages (session_id, id);

create table if not exists public.citizen_portal_settings (
  id          smallint primary key default 1 check (id = 1),
  org_name    text not null default 'شركة جزيرة الأكارم',
  about       text not null default 'شركة جزيرة الأكارم للخدمات البلدية — نعمل على نظافة مدينتكم وخدمتكم على مدار الساعة. يسعدنا استقبال شكاواكم وملاحظاتكم ومتابعتها حتى المعالجة.',
  phones      jsonb not null default '[]'::jsonb,       -- [{label, number}]
  hours       text not null default 'الدعم الفني متاح يومياً من 8 صباحاً حتى 8 مساءً',
  address     text,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.citizen_portal_settings enable row level security;
insert into public.citizen_portal_settings (id) values (1) on conflict (id) do nothing;

-- RLS: لا وصول مباشر لأي جدول — كل شيء عبر الدوال. (المواطن مجهول؛ غرفة العمليات قراءة فقط لعرض الصور)
create policy "citizen complaints: staff read" on public.citizen_complaints for select to authenticated
  using (app.has_role(array['ops_room', 'super_admin', 'deputy_director', 'executive_director']) or assigned_to = auth.uid());
create policy "citizen complaint photos: staff read" on public.citizen_complaint_photos for select to authenticated
  using (exists (select 1 from public.citizen_complaints c where c.id = complaint_id
                 and (app.has_role(array['ops_room', 'super_admin', 'deputy_director', 'executive_director']) or c.assigned_to = auth.uid())));
create policy "citizen settings: anyone read" on public.citizen_portal_settings for select to anon, authenticated using (true);

-- ═══════════════════════════════════════ التخزين ═══════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('citizen-complaints', 'citizen-complaints', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- المواطن يرفع إلى مجلد token الخاص به فقط (التحقق عبر دالة definer حتى لا يُكشف الجدول)
create or replace function app.citizen_token_valid(p_token text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.citizen_accounts a where a.token::text = p_token and a.last_seen_at > now() - interval '30 days')
$$;
revoke all on function app.citizen_token_valid(text) from public;
grant execute on function app.citizen_token_valid(text) to anon, authenticated;

drop policy if exists "citizen storage: citizen upload own folder" on storage.objects;
create policy "citizen storage: citizen upload own folder" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'citizen-complaints' and app.citizen_token_valid((storage.foldername(name))[1]));
drop policy if exists "citizen storage: staff read" on storage.objects;
create policy "citizen storage: staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'citizen-complaints' and (
    app.has_role(array['ops_room', 'super_admin', 'deputy_director', 'executive_director'])
    or exists (select 1 from public.citizen_complaint_photos p join public.citizen_complaints c on c.id = p.complaint_id
               where p.path = name and c.assigned_to = auth.uid())));

-- ═══════════════════════════════════════ مساعدات ═══════════════════════════════════════
create or replace function app.citizen_norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '00964%' then d := '0' || substr(d, 6);
  elsif d like '964%' then d := '0' || substr(d, 4); end if;
  if d !~ '^07[0-9]{9}$' then raise exception 'CITIZEN_PHONE_INVALID'; end if;
  return d;
end$$;

create or replace function app.citizen_by_token(p_token uuid) returns public.citizen_accounts
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts;
begin
  select * into a from public.citizen_accounts where token = p_token;
  if not found then raise exception 'CITIZEN_SESSION_INVALID'; end if;
  update public.citizen_accounts set last_seen_at = now() where id = a.id and last_seen_at < now() - interval '1 minute';
  return a;
end$$;

create or replace function app.citizen_is_staff() returns boolean
language sql stable security definer set search_path = public, app as $$ select app.has_role(array['ops_room', 'super_admin']) $$;

create or replace function app.citizen_actor_name() returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce((select e.full_name from public.employees e where e.user_id = auth.uid()), 'غرفة العمليات')
$$;

create or replace function app.citizen_status_label(s text) returns text language sql immutable as $$
  select case s when 'new' then 'جديدة' when 'in_progress' then 'قيد المعالجة' when 'on_hold' then 'معلقة' when 'resolved' then 'تمت المعالجة' else s end
$$;

create or replace function app.citizen_complaint_json(c public.citizen_complaints, p_full boolean default false) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', c.id, 'ref_no', c.ref_no, 'full_name', c.full_name, 'phone', case when p_full then c.phone else null end,
    'details', c.details, 'lat', c.lat, 'lng', c.lng, 'address_text', c.address_text,
    'status', c.status, 'status_label', app.citizen_status_label(c.status),
    'assigned_to', case when p_full then c.assigned_to else null end,
    'assignee_name', (select e.full_name from public.employees e where e.user_id = c.assigned_to),
    'assigned_at', c.assigned_at, 'hold_reason', c.hold_reason, 'resolution_note', c.resolution_note, 'resolved_at', c.resolved_at,
    'citizen_rating', c.citizen_rating, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path) order by p.created_at) from public.citizen_complaint_photos p where p.complaint_id = c.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'from', e.from_status, 'to', e.to_status, 'to_label', app.citizen_status_label(e.to_status),
                                                            'note', e.note, 'actor', case when p_full then e.actor_name else null end, 'at', e.created_at) order by e.created_at)
                        from public.citizen_complaint_events e where e.complaint_id = c.id), '[]'::jsonb)
  )
$$;

-- ═══════════════════════════════════════ دوال المواطن (anon) ═══════════════════════════════════════
create or replace function public.citizen_portal_info() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('org_name', s.org_name, 'about', s.about, 'phones', s.phones, 'hours', s.hours, 'address', s.address,
                            'support_online', exists (select 1 from public.citizen_chat_sessions x where x.status = 'active' and x.accepted_at > now() - interval '1 hour'))
  from public.citizen_portal_settings s where s.id = 1
$$;

create or replace function public.citizen_sign_in(p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_phone text; a public.citizen_accounts; v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if length(v_name) < 3 or length(v_name) > 80 then raise exception 'CITIZEN_NAME_INVALID'; end if;
  v_phone := app.citizen_norm_phone(p_phone);
  insert into public.citizen_accounts (full_name, phone) values (v_name, v_phone)
  on conflict (phone) do update set full_name = excluded.full_name, last_seen_at = now(), token = gen_random_uuid()
  returning * into a;
  return jsonb_build_object('token', a.token, 'full_name', a.full_name, 'phone', a.phone);
end$$;

create or replace function public.citizen_complaint_submit(p_token uuid, p_full_name text, p_details text, p_lat double precision default null,
                                                           p_lng double precision default null, p_address text default null, p_photos text[] default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts; c public.citizen_complaints; v_name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')); ph text;
begin
  a := app.citizen_by_token(p_token);
  if array_length(regexp_split_to_array(v_name, ' '), 1) < 3 then raise exception 'CITIZEN_NAME_TRIPLE_REQUIRED'; end if;
  if length(btrim(coalesce(p_details, ''))) < 10 then raise exception 'CITIZEN_DETAILS_SHORT'; end if;
  if length(p_details) > 4000 then raise exception 'CITIZEN_DETAILS_LONG'; end if;
  if (select count(*) from public.citizen_complaints x where x.citizen_id = a.id and x.created_at > now() - interval '1 day') >= 5 then
    raise exception 'CITIZEN_DAILY_LIMIT';
  end if;
  if coalesce(array_length(p_photos, 1), 0) > 5 then raise exception 'CITIZEN_PHOTOS_LIMIT'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'CITIZEN_LOCATION_INVALID'; end if;
  insert into public.citizen_complaints (ref_no, citizen_id, full_name, phone, details, lat, lng, address_text)
  values ('CC-' || to_char(now() at time zone 'Asia/Baghdad', 'YYYY') || '-' || lpad(nextval('public.citizen_complaint_seq')::text, 5, '0'),
          a.id, v_name, a.phone, btrim(p_details), p_lat, p_lng, nullif(btrim(p_address), ''))
  returning * into c;
  foreach ph in array coalesce(p_photos, '{}') loop
    if split_part(ph, '/', 1) <> a.token::text then raise exception 'CITIZEN_PHOTO_PATH_INVALID'; end if;
    insert into public.citizen_complaint_photos (complaint_id, path) values (c.id, ph);
  end loop;
  insert into public.citizen_complaint_events (complaint_id, kind, to_status, actor_name) values (c.id, 'created', 'new', v_name);
  perform app.notify_by_role(array['ops_room'], 'شكوى مواطن جديدة ' || c.ref_no, left(v_name || ' — ' || c.details, 140), 'info', '/ops-room/citizen-complaints?c=' || c.id);
  return app.citizen_complaint_json(c, false);
end$$;

create or replace function public.citizen_my_complaints(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts;
begin
  a := app.citizen_by_token(p_token);
  return coalesce((select jsonb_agg(app.citizen_complaint_json(c, false) order by c.created_at desc) from public.citizen_complaints c where c.citizen_id = a.id), '[]'::jsonb);
end$$;

create or replace function public.citizen_complaint_rate(p_token uuid, p_complaint uuid, p_stars int) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts;
begin
  a := app.citizen_by_token(p_token);
  if p_stars not between 1 and 5 then raise exception 'CITIZEN_RATING_INVALID'; end if;
  update public.citizen_complaints set citizen_rating = p_stars, updated_at = now() where id = p_complaint and citizen_id = a.id and status = 'resolved';
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_RATABLE'; end if;
  insert into public.citizen_complaint_events (complaint_id, kind, note, actor_name) values (p_complaint, 'rated', p_stars || '/5', a.full_name);
end$$;

-- ── المحادثة الحية ──
create or replace function app.citizen_chat_json(s public.citizen_chat_sessions, p_after bigint default 0) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', s.id, 'status', s.status, 'agent_name', s.agent_name, 'requested_at', s.requested_at, 'accepted_at', s.accepted_at,
    'closed_at', s.closed_at, 'closed_by', s.closed_by, 'rating', s.rating,
    'queue_position', case when s.status = 'waiting' then (select count(*) from public.citizen_chat_sessions q where q.status = 'waiting' and q.requested_at < s.requested_at) + 1 end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'at', m.created_at) order by m.id)
                          from public.citizen_chat_messages m where m.session_id = s.id and m.id > p_after), '[]'::jsonb))
$$;

create or replace function public.citizen_chat_request(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts; s public.citizen_chat_sessions;
begin
  a := app.citizen_by_token(p_token);
  select * into s from public.citizen_chat_sessions where citizen_id = a.id and status <> 'closed' order by requested_at desc limit 1;
  if not found then
    insert into public.citizen_chat_sessions (citizen_id) values (a.id) returning * into s;
    insert into public.citizen_chat_messages (session_id, sender, body) values (s.id, 'system', 'تم استلام طلبك، سيرد عليك أحد أعضاء فريق الدعم الفني خلال لحظات.');
    perform app.notify_by_role(array['ops_room'], 'طلب محادثة دعم فني', a.full_name || ' (' || a.phone || ') بانتظار الرد', 'warning', '/ops-room/citizen-complaints?tab=support');
  end if;
  return app.citizen_chat_json(s, 0);
end$$;

create or replace function public.citizen_chat_state(p_token uuid, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts; s public.citizen_chat_sessions;
begin
  a := app.citizen_by_token(p_token);
  select * into s from public.citizen_chat_sessions where citizen_id = a.id order by (status <> 'closed') desc, requested_at desc limit 1;
  if not found then return null; end if;
  return app.citizen_chat_json(s, p_after);
end$$;

create or replace function public.citizen_chat_send(p_token uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts; s public.citizen_chat_sessions; v_id bigint;
begin
  a := app.citizen_by_token(p_token);
  if length(btrim(coalesce(p_body, ''))) = 0 or length(p_body) > 2000 then raise exception 'CITIZEN_MESSAGE_INVALID'; end if;
  select * into s from public.citizen_chat_sessions where citizen_id = a.id and status <> 'closed' order by requested_at desc limit 1;
  if not found then raise exception 'CITIZEN_CHAT_CLOSED'; end if;
  if (select count(*) from public.citizen_chat_messages m where m.session_id = s.id and m.sender = 'citizen' and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'CITIZEN_RATE_LIMIT';
  end if;
  insert into public.citizen_chat_messages (session_id, sender, body) values (s.id, 'citizen', btrim(p_body)) returning id into v_id;
  return v_id;
end$$;

create or replace function public.citizen_chat_close(p_token uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts;
begin
  a := app.citizen_by_token(p_token);
  update public.citizen_chat_sessions set status = 'closed', closed_at = now(), closed_by = 'citizen' where citizen_id = a.id and status <> 'closed';
end$$;

create or replace function public.citizen_chat_rate(p_token uuid, p_session uuid, p_stars int, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare a public.citizen_accounts;
begin
  a := app.citizen_by_token(p_token);
  if p_stars not between 1 and 5 then raise exception 'CITIZEN_RATING_INVALID'; end if;
  update public.citizen_chat_sessions set rating = p_stars, rating_note = nullif(btrim(p_note), '') where id = p_session and citizen_id = a.id and status = 'closed';
  if not found then raise exception 'CITIZEN_CHAT_NOT_RATABLE'; end if;
end$$;

-- ═══════════════════════════════════════ غرفة العمليات ═══════════════════════════════════════
create or replace function public.ops_citizen_complaints_list(p_status text default null, p_search text default null, p_from date default null, p_to date default null, p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(app.citizen_complaint_json(c, true) order by
                      case c.status when 'new' then 0 when 'in_progress' then 1 when 'on_hold' then 2 else 3 end, c.created_at desc)
    from (select * from public.citizen_complaints c
          where (p_status is null or c.status = p_status)
            and (p_from is null or (c.created_at at time zone 'Asia/Baghdad')::date >= p_from)
            and (p_to   is null or (c.created_at at time zone 'Asia/Baghdad')::date <= p_to)
            and (p_search is null or btrim(p_search) = '' or c.ref_no ilike '%' || p_search || '%' or c.full_name ilike '%' || p_search || '%'
                 or c.phone like '%' || regexp_replace(p_search, '\D', '', 'g') || '%' or c.details ilike '%' || p_search || '%')
          order by c.created_at desc limit greatest(1, least(p_limit, 2000))) c), '[]'::jsonb);
end$$;

create or replace function public.ops_citizen_managers() returns table (user_id uuid, full_name text, department_name text)
language sql stable security definer set search_path = public, app as $$
  select ur.user_id, coalesce(e.full_name, 'مسؤول قسم') as full_name, d.name as department_name
  from public.user_roles ur
  left join public.employees e on e.user_id = ur.user_id
  left join public.departments d on d.id = e.department_id
  where ur.role = 'department_manager' and app.citizen_is_staff()
  order by coalesce(e.full_name, ur.user_id::text)
$$;

create or replace function public.ops_citizen_complaint_assign(p_complaint uuid, p_user uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints; v_name text;
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user and role = 'department_manager') then raise exception 'CITIZEN_ASSIGNEE_NOT_MANAGER'; end if;
  select * into c from public.citizen_complaints where id = p_complaint for update;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if c.status = 'resolved' then raise exception 'CITIZEN_COMPLAINT_RESOLVED'; end if;
  select coalesce(e.full_name, 'مسؤول قسم') into v_name from public.employees e where e.user_id = p_user;
  update public.citizen_complaints
     set assigned_to = p_user, assigned_by = auth.uid(), assigned_at = now(), status = 'in_progress', hold_reason = null, updated_at = now()
   where id = p_complaint returning * into c;
  insert into public.citizen_complaint_events (complaint_id, kind, from_status, to_status, note, actor_id, actor_name)
  values (p_complaint, 'assigned', c.status, 'in_progress', coalesce(nullif(btrim(p_note), ''), 'أُسندت إلى ' || coalesce(v_name, '')), auth.uid(), app.citizen_actor_name());
  perform app.hr_notify(p_user, 'شكوى مواطن مسندة إليك ' || c.ref_no, left(c.full_name || ' — ' || c.details, 140), '/manager/citizen-complaints?c=' || c.id, 'cc_assign:' || c.id || ':' || p_user, 'warning');
  return app.citizen_complaint_json(c, true);
end$$;

create or replace function public.citizen_complaint_set_status(p_complaint uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints; v_staff boolean := app.citizen_is_staff(); v_prev text;
begin
  if p_status not in ('new', 'in_progress', 'on_hold', 'resolved') then raise exception 'CITIZEN_STATUS_INVALID'; end if;
  select * into c from public.citizen_complaints where id = p_complaint for update;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if not v_staff and c.assigned_to is distinct from auth.uid() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if p_status = 'in_progress' and c.assigned_to is null then raise exception 'CITIZEN_ASSIGNEE_REQUIRED'; end if;
  if p_status in ('on_hold', 'resolved') and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'CITIZEN_NOTE_REQUIRED'; end if;
  if p_status = 'new' and not v_staff then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if c.status = p_status then return app.citizen_complaint_json(c, v_staff); end if;
  v_prev := c.status;
  update public.citizen_complaints
     set status = p_status,
         hold_reason = case when p_status = 'on_hold' then btrim(p_note) else null end,
         resolution_note = case when p_status = 'resolved' then btrim(p_note) else resolution_note end,
         resolved_at = case when p_status = 'resolved' then now() else null end,
         assigned_to = case when p_status = 'new' then null else assigned_to end,
         updated_at = now()
   where id = p_complaint returning * into c;
  insert into public.citizen_complaint_events (complaint_id, kind, from_status, to_status, note, actor_id, actor_name)
  values (p_complaint, 'status', v_prev, p_status, nullif(btrim(p_note), ''), auth.uid(), app.citizen_actor_name());
  if not v_staff then
    perform app.notify_by_role(array['ops_room'], 'تحديث شكوى مواطن ' || c.ref_no, app.citizen_actor_name() || ': ' || app.citizen_status_label(p_status), 'info', '/ops-room/citizen-complaints?c=' || c.id);
  end if;
  return app.citizen_complaint_json(c, v_staff);
end$$;

create or replace function public.citizen_complaint_add_note(p_complaint uuid, p_note text) returns void
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints;
begin
  select * into c from public.citizen_complaints where id = p_complaint;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if not (app.citizen_is_staff() or c.assigned_to = auth.uid()) then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'CITIZEN_NOTE_REQUIRED'; end if;
  insert into public.citizen_complaint_events (complaint_id, kind, note, actor_id, actor_name) values (p_complaint, 'note', btrim(p_note), auth.uid(), app.citizen_actor_name());
  update public.citizen_complaints set updated_at = now() where id = p_complaint;
end$$;

-- مسؤول القسم: المسندة إليه
create or replace function public.mgr_citizen_complaints() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(app.citizen_complaint_json(c, true) order by case c.status when 'in_progress' then 0 when 'on_hold' then 1 else 2 end, c.created_at desc), '[]'::jsonb)
  from public.citizen_complaints c where c.assigned_to = auth.uid()
$$;

-- ── طابور الدعم ──
create or replace function public.ops_citizen_chat_queue() returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'citizen_name', a.full_name, 'phone', a.phone, 'requested_at', s.requested_at, 'accepted_at', s.accepted_at,
      'agent_id', s.agent_id, 'agent_name', s.agent_name, 'mine', coalesce(s.agent_id = auth.uid(), false),
      'last_message', (select m.body from public.citizen_chat_messages m where m.session_id = s.id and m.sender <> 'system' order by m.id desc limit 1),
      'last_at', (select max(m.created_at) from public.citizen_chat_messages m where m.session_id = s.id),
      'unread', (select count(*) from public.citizen_chat_messages m where m.session_id = s.id and m.sender = 'citizen'
                 and m.id > coalesce((select max(x.id) from public.citizen_chat_messages x where x.session_id = s.id and x.sender = 'agent'), 0)))
      order by case s.status when 'waiting' then 0 else 1 end, s.requested_at)
    from public.citizen_chat_sessions s join public.citizen_accounts a on a.id = s.citizen_id
    where s.status <> 'closed' or s.closed_at > now() - interval '1 day'), '[]'::jsonb);
end$$;

create or replace function public.ops_citizen_chat_accept(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.citizen_chat_sessions; v_name text := app.citizen_actor_name();
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  update public.citizen_chat_sessions set status = 'active', agent_id = auth.uid(), agent_name = v_name, accepted_at = now()
   where id = p_session and status = 'waiting' returning * into s;
  if not found then
    select * into s from public.citizen_chat_sessions where id = p_session;
    if not found or s.status = 'closed' then raise exception 'CITIZEN_CHAT_CLOSED'; end if;
    if s.agent_id <> auth.uid() then raise exception 'CITIZEN_CHAT_TAKEN'; end if;
    return app.citizen_chat_json(s, 0);
  end if;
  insert into public.citizen_chat_messages (session_id, sender, body) values (s.id, 'system', 'انضم ' || v_name || ' من فريق الدعم الفني إلى المحادثة.');
  return app.citizen_chat_json(s, 0);
end$$;

create or replace function public.ops_citizen_chat_messages(p_session uuid, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.citizen_chat_sessions;
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  select * into s from public.citizen_chat_sessions where id = p_session;
  if not found then raise exception 'CITIZEN_CHAT_NOT_FOUND'; end if;
  return app.citizen_chat_json(s, p_after) || jsonb_build_object('citizen_name', (select full_name from public.citizen_accounts where id = s.citizen_id),
                                                                  'phone', (select phone from public.citizen_accounts where id = s.citizen_id));
end$$;

create or replace function public.ops_citizen_chat_send(p_session uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public, app as $$
declare s public.citizen_chat_sessions; v_id bigint;
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 or length(p_body) > 2000 then raise exception 'CITIZEN_MESSAGE_INVALID'; end if;
  select * into s from public.citizen_chat_sessions where id = p_session for update;
  if not found or s.status = 'closed' then raise exception 'CITIZEN_CHAT_CLOSED'; end if;
  if s.status = 'waiting' then
    update public.citizen_chat_sessions set status = 'active', agent_id = auth.uid(), agent_name = app.citizen_actor_name(), accepted_at = now() where id = s.id returning * into s;
  elsif s.agent_id <> auth.uid() then raise exception 'CITIZEN_CHAT_TAKEN'; end if;
  insert into public.citizen_chat_messages (session_id, sender, body) values (s.id, 'agent', btrim(p_body)) returning id into v_id;
  if s.first_reply_at is null then update public.citizen_chat_sessions set first_reply_at = now() where id = s.id; end if;
  return v_id;
end$$;

create or replace function public.ops_citizen_chat_close(p_session uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  update public.citizen_chat_sessions set status = 'closed', closed_at = now(), closed_by = 'agent' where id = p_session and status <> 'closed';
  if found then
    insert into public.citizen_chat_messages (session_id, sender, body) values (p_session, 'system', 'أُغلقت المحادثة من قبل فريق الدعم. شكراً لتواصلك معنا — يمكنك تقييم المحادثة.');
  end if;
end$$;

-- ── إعدادات الصفحة العامة ──
create or replace function public.ops_citizen_settings_save(p_about text, p_phones jsonb, p_hours text, p_address text default null, p_org_name text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.citizen_is_staff() then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if jsonb_typeof(coalesce(p_phones, '[]'::jsonb)) <> 'array' then raise exception 'CITIZEN_PHONES_INVALID'; end if;
  update public.citizen_portal_settings
     set about = coalesce(nullif(btrim(p_about), ''), about), phones = coalesce(p_phones, '[]'::jsonb), hours = coalesce(nullif(btrim(p_hours), ''), hours),
         address = nullif(btrim(p_address), ''), org_name = coalesce(nullif(btrim(p_org_name), ''), org_name), updated_by = auth.uid(), updated_at = now()
   where id = 1;
  return public.citizen_portal_info();
end$$;

-- ═══════════════════════════════════════ التقارير ═══════════════════════════════════════
create or replace function public.citizen_complaints_report(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_out jsonb;
begin
  if not app.has_role(array['ops_room', 'super_admin', 'deputy_director', 'executive_director']) then raise exception 'CITIZEN_FORBIDDEN'; end if;
  if p_to < p_from or p_to - p_from > 370 then raise exception 'CITIZEN_RANGE_INVALID'; end if;
  with c as (
    select * from public.citizen_complaints x where (x.created_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  ), s as (
    select * from public.citizen_chat_sessions x where (x.requested_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', p_to - p_from + 1),
    'complaints', jsonb_build_object(
      'total', (select count(*) from c),
      'new', (select count(*) from c where status = 'new'),
      'in_progress', (select count(*) from c where status = 'in_progress'),
      'on_hold', (select count(*) from c where status = 'on_hold'),
      'resolved', (select count(*) from c where status = 'resolved'),
      'unassigned_over_24h', (select count(*) from c where status = 'new' and created_at < now() - interval '24 hours'),
      'avg_resolution_hours', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1) from c where resolved_at is not null),
      'avg_assign_hours', (select round(avg(extract(epoch from (assigned_at - created_at)) / 3600)::numeric, 1) from c where assigned_at is not null),
      'avg_rating', (select round(avg(citizen_rating)::numeric, 2) from c where citizen_rating is not null),
      'rated', (select count(*) from c where citizen_rating is not null),
      'with_location', (select count(*) from c where lat is not null),
      'with_photos', (select count(*) from c where exists (select 1 from public.citizen_complaint_photos p where p.complaint_id = c.id)),
      'by_assignee', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(e.full_name, 'غير مسند'), 'total', t.n, 'resolved', t.r, 'on_hold', t.h) order by t.n desc)
                               from (select assigned_to, count(*) n, count(*) filter (where status = 'resolved') r, count(*) filter (where status = 'on_hold') h from c group by assigned_to) t
                               left join public.employees e on e.user_id = t.assigned_to), '[]'::jsonb),
      'series', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'count', n, 'resolved', r) order by d)
                          from (select (created_at at time zone 'Asia/Baghdad')::date d, count(*) n, count(*) filter (where status = 'resolved') r from c group by 1) t), '[]'::jsonb),
      'oldest_open', coalesce((select jsonb_agg(jsonb_build_object('ref_no', ref_no, 'name', full_name, 'status', status, 'status_label', app.citizen_status_label(status),
                                                                    'age_hours', round(extract(epoch from (now() - created_at)) / 3600), 'assignee', (select e.full_name from public.employees e where e.user_id = c.assigned_to)) order by created_at)
                               from (select * from c where status <> 'resolved' order by created_at limit 10) c), '[]'::jsonb)
    ),
    'support', jsonb_build_object(
      'sessions', (select count(*) from s),
      'answered', (select count(*) from s where accepted_at is not null),
      'abandoned', (select count(*) from s where accepted_at is null and status = 'closed'),
      'waiting_now', (select count(*) from public.citizen_chat_sessions where status = 'waiting'),
      'avg_wait_minutes', (select round(avg(extract(epoch from (accepted_at - requested_at)) / 60)::numeric, 1) from s where accepted_at is not null),
      'avg_first_reply_minutes', (select round(avg(extract(epoch from (first_reply_at - requested_at)) / 60)::numeric, 1) from s where first_reply_at is not null),
      'avg_rating', (select round(avg(rating)::numeric, 2) from s where rating is not null),
      'rated', (select count(*) from s where rating is not null),
      'messages', (select count(*) from public.citizen_chat_messages m where m.session_id in (select id from s) and m.sender <> 'system'),
      'by_agent', coalesce((select jsonb_agg(jsonb_build_object('name', agent_name, 'sessions', n, 'avg_rating', ar) order by n desc)
                            from (select agent_name, count(*) n, round(avg(rating)::numeric, 2) ar from s where agent_id is not null group by agent_name) t), '[]'::jsonb)
    ),
    'generated_at', now()
  ) into v_out;
  return v_out;
end$$;

-- ═══════════════════════════════════════ الصلاحيات ═══════════════════════════════════════
revoke all on function app.citizen_norm_phone(text), app.citizen_by_token(uuid), app.citizen_is_staff(), app.citizen_actor_name(),
  app.citizen_complaint_json(public.citizen_complaints, boolean), app.citizen_chat_json(public.citizen_chat_sessions, bigint) from public, anon, authenticated;

grant execute on function public.citizen_portal_info(), public.citizen_sign_in(text, text),
  public.citizen_complaint_submit(uuid, text, text, double precision, double precision, text, text[]), public.citizen_my_complaints(uuid),
  public.citizen_complaint_rate(uuid, uuid, int), public.citizen_chat_request(uuid), public.citizen_chat_state(uuid, bigint),
  public.citizen_chat_send(uuid, text), public.citizen_chat_close(uuid), public.citizen_chat_rate(uuid, uuid, int, text)
  to anon, authenticated;

grant execute on function public.ops_citizen_complaints_list(text, text, date, date, int), public.ops_citizen_managers(),
  public.ops_citizen_complaint_assign(uuid, uuid, text), public.citizen_complaint_set_status(uuid, text, text), public.citizen_complaint_add_note(uuid, text),
  public.mgr_citizen_complaints(), public.ops_citizen_chat_queue(), public.ops_citizen_chat_accept(uuid), public.ops_citizen_chat_messages(uuid, bigint),
  public.ops_citizen_chat_send(uuid, text), public.ops_citizen_chat_close(uuid), public.ops_citizen_settings_save(text, jsonb, text, text, text),
  public.citizen_complaints_report(date, date)
  to authenticated;

grant usage, select on sequence public.citizen_complaint_seq to anon, authenticated;
