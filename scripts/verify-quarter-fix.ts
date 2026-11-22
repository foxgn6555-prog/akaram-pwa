/**
 * تحقق فعلي على PostgreSQL حقيقي (PGlite = Postgres 18 بـWASM).
 * يُشغَّل: npx tsx scripts/verify-quarter-fix.ts
 *
 * يُثبت ① أن العيب حقيقي (٤ أرباع ⇒ ٥ صفوف) ② أن الإصلاح يعمل (٢٠ صفاً)
 * ③ أن إعادة الإرسال آمنة والاسم اليدوي محفوظ.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const ROOT = process.cwd()
const MIG = (n: string) => readFile(join(ROOT, 'supabase/migrations', n), 'utf8')
const ZONE = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, extra = ''): void {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

const SCHEMA = `
create schema if not exists app;
create schema if not exists auth;

/* PGlite بلا pgcrypto — بديل بسيط يكفي للتحقق (توليد UUID عشوائي) */
create or replace function gen_random_uuid() returns uuid
language sql volatile as $$
  select (lpad(to_hex((random()*4294967295)::bigint), 8, '0') || '-' ||
          lpad(to_hex((random()*65535)::int), 4, '0') || '-' ||
          '4' || substr(lpad(to_hex((random()*4095)::int), 3, '0'), 1, 3) || '-' ||
          '8' || substr(lpad(to_hex((random()*4095)::int), 3, '0'), 1, 3) || '-' ||
          lpad(to_hex((random()*281474976710655)::bigint), 12, '0'))::uuid
$$;

create table public.map_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null, name text not null, geofence_id uuid);

create table public.map_streets (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.map_zones(id) on delete cascade,
  code text not null, name text, kind text not null, path jsonb not null,
  width_m numeric(5,1) not null default 6.0,
  length_m numeric(10,1) not null default 0,
  max_segment_m numeric(8,1),
  direction text not null default 'both',
  osm_way_id bigint, name_source text,
  status text not null default 'draft',
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, code));

create table public.map_alleys (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.map_zones(id) on delete cascade,
  mahalla_id uuid, code text not null, name text, path jsonb not null,
  width_m numeric(5,1) not null default 4.0,
  width_source text not null default 'default',
  length_m numeric(10,1) not null default 0,
  max_segment_m numeric(8,1),
  osm_way_id bigint, link_source text, name_source text,
  status text not null default 'draft', created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, code));

create table public.map_mahallas (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.map_zones(id) on delete cascade,
  code text not null, osm_number text, name text,
  boundary_state text not null default 'open', created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, code));

create table public.map_import_batches (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.map_zones(id) on delete cascade,
  file_name text, file_bytes bigint, geofence_id uuid,
  rows_total int not null default 0, rows_inserted int not null default 0,
  rows_updated int not null default 0, rows_skipped int not null default 0,
  preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), created_by uuid);

create table public.map_import_skips (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.map_zones(id) on delete cascade,
  table_name text not null, code text not null, name text,
  error_code text, error_msg text,
  created_at timestamptz not null default now(),
  unique (zone_id, table_name, code));

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

/* نقل حرفي من 20261122000000 (PGlite بلا PostGIS) */
create or replace function app.map_distance_m(p_lat1 float8, p_lng1 float8, p_lat2 float8, p_lng2 float8)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians(p_lng2 - p_lng1) / 2), 2)))
$$;

/* نقل حرفي من 20261122000000 — موجودة في القاعدة الفعلية قبل هجرة الإصلاح */
create or replace function app.map_line_length_m(p_path jsonb)
returns double precision language sql immutable as $$
  select coalesce(sum(app.map_distance_m(
      (e->0->>0)::float8, (e->0->>1)::float8,
      (e->1->>0)::float8, (e->1->>1)::float8)), 0)
  from jsonb_array_elements(
    case when jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) >= 2
         then (select jsonb_agg(jsonb_build_array(p_path->i, p_path->(i+1)))
                 from generate_series(0, jsonb_array_length(p_path) - 2) i)
         else '[]'::jsonb end
  ) e
$$;

create or replace function app.has_permission(p text) returns boolean
language sql stable as $$ select true $$;

create or replace function auth.uid() returns uuid
language sql stable as $$ select '${USER}'::uuid $$;
`

/** أربعة أرباع، كل واحد يبدأ ترقيمه من ٠٠٠١ — كما يفعل المولّد في الواجهة */
function quarterRows(q: number, from: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    code: `STR-${String(i + 1).padStart(4, '0')}`,
    kind: 'primary',
    name: 'ش جولة ٤',
    width_m: 12,
    width_source: 'default',
    osm_way_id: from + i,
    link_source: null,
    mahalla_num: null,
    path: [
      [33.3 + q * 0.001, 44.3 + i * 0.0001],
      [33.3 + q * 0.001, 44.3 + i * 0.0001 + 0.00005],
    ],
  }))
}

function alleyRows(q: number) {
  return [0, 1].map((i) => ({
    code: `ALY-${String(i + 1).padStart(4, '0')}`,
    kind: 'alley',
    name: null,
    width_m: 3,
    width_source: 'default',
    osm_way_id: q * 5000 + i,
    link_source: null,
    mahalla_num: null,
    path: [
      [33.31, 44.31 + q * 0.001],
      [33.311, 44.31 + q * 0.001],
    ],
  }))
}

async function main(): Promise<void> {
  const db = await PGlite.create()
  await db.exec(SCHEMA)

  // ── الدالة القديمة (قبل الإصلاح) ──
  const oldFn = await MIG('20261122001300_map_import_batch.sql')
  const s = oldFn.indexOf('create or replace function app.map_import_batch')
  const e = oldFn.indexOf('comment on function app.map_import_batch')
  await db.exec(oldFn.slice(s, e))
  await db.exec(`insert into public.map_zones (id, code, name) values ('${ZONE}', 'RTH', 'الرطبة')`)

  console.log('\n═══ ① قبل الإصلاح: هل العيب حقيقي؟ ═══')
  for (let q = 1; q <= 4; q++) {
    await db.query(`select app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)`, [
      ZONE,
      JSON.stringify(quarterRows(q, q * 1000, 5)),
      crypto.randomUUID(),
    ])
  }
  const before = await db.query<{ code: string }>(
    `select code from public.map_streets where zone_id = $1 order by code`,
    [ZONE],
  )
  check('٤ أرباع × ٥ صفوف ⇒ ٥ صفوف فقط (لا ٢٠)', before.rows.length === 5, `وجد ${before.rows.length}`)
  check(
    'الأكواد STR-0001..STR-0005 فقط',
    before.rows.map((r) => r.code).join(',') ===
      'STR-0001,STR-0002,STR-0003,STR-0004,STR-0005',
    before.rows.map((r) => r.code).join(','),
  )

  // ── تطبيق الإصلاح ──
  console.log('\n═══ ② بعد الإصلاح ═══')
  await db.exec(`delete from public.map_streets where zone_id = '${ZONE}'`)
  await db.exec(await MIG('20261124000100_map_import_quarter_key.sql'))

  const perQ: number[] = []
  for (let q = 1; q <= 4; q++) {
    const res = await db.query<{ inserted: number }>(
      `select (app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)->>'inserted')::int as inserted`,
      [ZONE, JSON.stringify(quarterRows(q, q * 1000, 5)), crypto.randomUUID()],
    )
    perQ.push(res.rows[0]!.inserted)
  }
  const after = await db.query<{ code: string }>(
    `select code from public.map_streets where zone_id = $1 order by code`,
    [ZONE],
  )
  check('٢٠ صفاً — مجموع الأرباع كاملاً', after.rows.length === 20, `وجد ${after.rows.length}`)
  if (after.rows.length !== 20) {
    const err = await db.query<{ errors: unknown }>(
      `select (app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)->'errors') as errors`,
      [ZONE, JSON.stringify(quarterRows(1, 1000, 5)), crypto.randomUUID()])
    console.log('    تفاصيل الخطأ:', JSON.stringify(err.rows[0]!.errors).slice(0, 400))
  }
  check('كل ربع أدرج ٥ (لا تحديث)', perQ.join(',') === '5,5,5,5', perQ.join(','))
  check('الأكواد متسلسلة ١..٢٠ بلا تكرار', after.rows[19]?.code === 'STR-0020', after.rows[19]?.code)

  console.log('\n═══ ③ الاستيراد المتكرر والاسم اليدوي ═══')
  await db.query(`select app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)`, [
    ZONE,
    JSON.stringify(quarterRows(1, 1000, 5)),
    crypto.randomUUID(),
  ])
  const cnt = await db.query<{ c: number }>(
    `select count(*)::int c from public.map_streets where zone_id = $1`,
    [ZONE],
  )
  check('إعادة إرسال ربع لا تُضاعف', cnt.rows[0]!.c === 20, `${cnt.rows[0]!.c}`)

  const dup = await db.query(
    `select osm_way_id from public.map_streets where zone_id = $1 group by 1 having count(*) > 1`,
    [ZONE],
  )
  check('لا تكرار في osm_way_id', dup.rows.length === 0)

  await db.query(
    `update public.map_streets set name = 'اسم صحّحه الموظف', name_source = 'manual'
     where zone_id = $1 and code = 'STR-0001'`,
    [ZONE],
  )
  await db.query(`select app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)`, [
    ZONE,
    JSON.stringify(quarterRows(1, 1000, 5)),
    crypto.randomUUID(),
  ])
  const nm = await db.query<{ name: string }>(
    `select name from public.map_streets where zone_id = $1 and code = 'STR-0001'`,
    [ZONE],
  )
  check('الاسم اليدوي محفوظ', nm.rows[0]!.name === 'اسم صحّحه الموظف', nm.rows[0]!.name)

  const nx = await db.query<{ code: string }>(
    `select app.map_next_code($1, 'map_streets', 'STR-0001') as code`,
    [ZONE],
  )
  check('الترقيم التالي = STR-0021', nx.rows[0]!.code === 'STR-0021', nx.rows[0]!.code)

  console.log('\n═══ ④ الأزقة (نفس العيب) ═══')
  for (let q = 1; q <= 3; q++) {
    await db.query(`select app.map_import_batch($1, $2::jsonb, '[]'::jsonb, $3, '{}'::jsonb)`, [
      ZONE,
      JSON.stringify(alleyRows(q)),
      crypto.randomUUID(),
    ])
  }
  const al = await db.query<{ c: number }>(
    `select count(*)::int c from public.map_alleys where zone_id = $1`,
    [ZONE],
  )
  check('٣ أرباع × ٢ أزقة ⇒ ٦ أزقة', al.rows[0]!.c === 6, `${al.rows[0]!.c}`)

  // ── ⑤ الطول والتباعد يُحفظان (كانا صفراً دائماً) ──
  console.log('\n═══ ⑤ length_m وmax_segment_m ═══')
  const lm = await db.query<{ length_m: string; max_segment_m: string }>(
    `select length_m::text, max_segment_m::text from public.map_streets
     where zone_id = $1 and code = 'STR-0001'`, [ZONE])
  const lenVal = Number(lm.rows[0]?.length_m ?? 0)
  const maxVal = Number(lm.rows[0]?.max_segment_m ?? 0)
  check('length_m محسوب (> 0)', lenVal > 0, `القيمة ${lenVal}`)
  check('max_segment_m محسوب (> 0)', maxVal > 0, `القيمة ${maxVal}`)
  check('max_segment_m ≤ length_m (منطقياً)', maxVal <= lenVal + 0.01, `${maxVal} > ${lenVal}`)

  const idx = await db.query<{ indexname: string }>(
    `select indexname from pg_indexes where tablename = 'map_streets' and indexname = 'map_streets_zone_osm_uk'`,
  )
  check('الفهرس الفريد على osm_way_id أُنشئ', idx.rows.length === 1)

  console.log(`\n═══ النتيجة: ${pass} ✓ · ${fail} ✗ ═══\n`)
  await db.close()
  if (fail > 0) process.exit(1)
}

await main()
