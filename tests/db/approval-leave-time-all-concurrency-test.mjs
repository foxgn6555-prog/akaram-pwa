/* global process, console, setTimeout */
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
const dir = '/tmp/epgdata-approval-all-concurrency'
fs.rmSync(dir, { recursive: true, force: true })
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54337, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
await server.initialise(); await server.start(); await server.createDatabase('akram')
const make = () => new pg.Client({ host: '127.0.0.1', port: 54337, user: 'postgres', password: 'pw', database: 'akram' })
const c = make(), c2 = make(); await c.connect(); await c2.connect()
try {
  await c.query('create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema app; create extension pgcrypto')
  await c.query(fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'))
  await c.query("select set_config('app.dedup_window_seconds','0',false)")
  for (const f of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  await c.query(`insert into auth.users(id,email) values('400f0000-0000-0000-0000-000000000001','race-all-it@t.iq'),('400f0000-0000-0000-0000-000000000002','race-all-dep@t.iq');
    insert into public.user_roles(user_id,role) values('400f0000-0000-0000-0000-000000000001','it_admin'),('400f0000-0000-0000-0000-000000000002','deputy_director');`)
  for (const conn of [c, c2]) await conn.query("select set_config('auth.user_id','400f0000-0000-0000-0000-000000000001',false),set_config('statement_timeout','4s',false)")
  const step = JSON.stringify([{ kind: 'account', user_id: '400f0000-0000-0000-0000-000000000002' }])
  const save = (conn, role, kind) => conn.query('select public.approval_chain_save($1,$2,$3::jsonb,true)', [role, kind, step])
  // معاملتان تتسابقان على نفس الدور: لا يمكن أن تتفعلا كلتاهما.
  await c.query('begin'); await save(c, 'employee', 'leave_time_all')
  let done = false
  const pending = save(c2, 'employee', 'time_permit').then(() => 'unexpected success', e => e.message).finally(() => { done = true })
  await new Promise(resolve => setTimeout(resolve, 250))
  if (done) throw new Error('second save did not wait')
  await c.query('commit')
  if (!(await pending).includes('APPROVAL_ALL_OVERLAP')) throw new Error('overlap was not rejected')
  let n = (await c.query("select count(*)::int n from public.approval_chains where requester_role='employee' and request_type in ('leave_time_all','leave','time_permit') and is_active")).rows[0].n
  if (n !== 1) throw new Error('overlapping active chains persisted')
  // لقطة معزولة قديمة: إما تعارض تسلسلي أو رفض التداخل، لا قبول خاطئ.
  await c2.query('begin isolation level repeatable read'); await c2.query('select count(*) from public.approval_chains')
  await save(c, 'field_ops', 'leave_time_all')
  const error = await save(c2, 'field_ops', 'leave').then(() => '', e => e.message)
  if (!/could not serialize|APPROVAL_ALL_OVERLAP/i.test(error)) throw new Error('repeatable read allowed stale overlap: ' + error)
  await c2.query('rollback')
  n = (await c.query("select count(*)::int n from public.approval_chains where requester_role='field_ops' and request_type in ('leave_time_all','leave','time_permit') and is_active")).rows[0].n
  if (n !== 1) throw new Error('repeatable read persisted conflicting chains')
  console.log('test ok: concurrent shared/specific chain; repeatable-read stale snapshot')
} catch (e) { console.error('FAIL approval all concurrency', e); process.exitCode = 1 }
finally { await c.end(); await c2.end(); await server.stop() }
