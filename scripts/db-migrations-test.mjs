import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'fs';
const dir = '/tmp/epgdata';
const pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 54329, persistent: false });
await pgs.initialise(); await pgs.start();
await pgs.createDatabase('akram');
const c = new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'pw', database: 'akram' });
await c.connect();
const run = async (label, sql) => { try { await c.query(sql); } catch (e) { console.error('FAIL', label, e.message, (e.where||'').split('\n').slice(0,3).join(' / '), e.position ? 'pos '+e.position : ''); process.exitCode = 1; await c.end(); await pgs.stop(); process.exit(1); } };
await run('roles', `do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;`);
await run('appschema', 'create schema if not exists app; create extension if not exists pgcrypto;');
await run('mock', fs.readFileSync('tests/db/supabase-mock.sql', 'utf8'));
const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
for (const f of files) await run(f, fs.readFileSync('supabase/migrations/' + f, 'utf8'));
console.log('migrations ok:', files.length);
for (const t of process.argv.slice(2)) { await run(t, fs.readFileSync(t, 'utf8')); console.log('test ok:', t); }
await c.end(); await pgs.stop();
