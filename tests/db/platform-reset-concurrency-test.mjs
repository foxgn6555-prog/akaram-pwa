// 00398-د: طلبان متزامنان من مستخدمَي IT لا ينشئان سلسلتَي تصفير معلّقتين.
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'

const dir = '/tmp/epg-reset-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54333, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
const config = { host: '127.0.0.1', port: 54333, user: 'postgres', password: 'pw', database: 'akram' }
let setup, a, b
try {
  await server.initialise(); await server.start(); await server.createDatabase('akram')
  setup = new pg.Client(config); await setup.connect()
  await setup.query("create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto;")
  await setup.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await setup.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql')).sort()) await setup.query(fs.readFileSync(`supabase/migrations/${f}`, 'utf8'))
  await setup.query(`insert into auth.users(id,email) values
    ('98700000-0000-0000-0000-000000000001','a@test.iq'),('98700000-0000-0000-0000-000000000002','b@test.iq'),('98700000-0000-0000-0000-000000000003','dep@test.iq');
    insert into public.user_roles(user_id,role) values
    ('98700000-0000-0000-0000-000000000001','it_admin'),('98700000-0000-0000-0000-000000000002','it_admin'),('98700000-0000-0000-0000-000000000003','deputy_director');
    select set_config('auth.user_id','98700000-0000-0000-0000-000000000001',false);
    select public.approval_chain_save('it_admin','platform_reset','[{"kind":"hierarchy","role":"deputy_director"}]'::jsonb,true);`)
  a = new pg.Client(config); b = new pg.Client(config); await a.connect(); await b.connect()
  for (const [c, uid] of [[a, '98700000-0000-0000-0000-000000000001'], [b, '98700000-0000-0000-0000-000000000002']]) {
    await c.query('begin'); await c.query("select set_config('auth.user_id',$1,true),set_config('app.dedup_window_seconds','0',true)", [uid])
  }
  const first = await a.query("select public.platform_reset_request(array['warehouse'],'تصفير') as result")
  if (first.rows[0].result.status !== 'pending_approval') throw new Error('first request not pending')
  const second = b.query("select public.platform_reset_request(array['warehouse'],'تصفير')").then(() => 'unexpected success', (e) => e.message)
  await new Promise((r) => setTimeout(r, 150))
  await a.query('commit')
  const message = await second
  if (!message.includes('RESET_ALREADY_PENDING')) throw new Error(`second request: ${message}`)
  await b.query('rollback')
  const { rows } = await setup.query("select count(*)::int n from public.platform_reset_requests where status='pending_approval'")
  if (rows[0].n !== 1) throw new Error(`pending count: ${rows[0].n}`)
  console.log('test ok: concurrent requests serialized; one pending')
} catch (e) {
  console.error('FAIL platform-reset concurrency:', e)
  process.exitCode = 1
} finally {
  if (a) await a.end().catch(() => undefined)
  if (b) await b.end().catch(() => undefined)
  if (setup) await setup.end().catch(() => undefined)
  await server.stop().catch(() => undefined)
}
