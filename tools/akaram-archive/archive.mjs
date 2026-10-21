#!/usr/bin/env node
/**
 * akaram-archive — أداة الأرشيف البارد (تعمل على ويندوز/لينكس/ماك، Node 18+)
 *   node archive.mjs list
 *   node archive.mjs status  PKG-...
 *   node archive.mjs pull    PKG-... --to   D:\Archive
 *   node archive.mjs verify  PKG-... --from D:\Archive --disk "قرص-1"
 *  تدخل بحساب IT (بريد في config.json، كلمة السر تُطلب عند التشغيل أو AKARAM_ARCHIVE_PASSWORD) — لا مفاتيح خدمة.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import { chunk, compareDisk, fileKey, fmtBytes, isSha256, newManifest, parseArgs, pendingItems, recordDownloaded, recordMissing, safeLocalPath, sha256Hex, toDownloadedPayload } from './lib/core.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const BATCH = 200
const log = (...a) => console.log(...a)

async function loadConfig() {
  const p = join(here, 'config.json')
  if (!existsSync(p)) throw new Error('config.json غير موجود — انسخ config.example.json إلى config.json واملأه')
  const cfg = JSON.parse(await readFile(p, 'utf8'))
  if (!/^https:\/\/.+/.test(cfg.supabase_url ?? '')) throw new Error('supabase_url يجب أن يبدأ بـ https://')
  if (!cfg.anon_key) throw new Error('anon_key مطلوب (المفتاح العام نفسه المستخدم في الموقع)')
  if (!cfg.email) throw new Error('email مطلوب (حساب التطوير المركزية)')
  return cfg
}
function askHidden(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const w = rl._writeToOutput; rl._writeToOutput = (s) => { if (s.includes(q)) w.call(rl, q) }
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a) })
  })
}
async function login(cfg) {
  const sb = createClient(cfg.supabase_url, cfg.anon_key, { auth: { persistSession: false, autoRefreshToken: true } })
  const password = process.env.AKARAM_ARCHIVE_PASSWORD || await askHidden(`كلمة سر ${cfg.email}: `)
  const { error } = await sb.auth.signInWithPassword({ email: cfg.email, password })
  if (error) throw new Error(`فشل تسجيل الدخول: ${error.message}`)
  return sb
}
const rpc = async (sb, fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data }
async function findPackage(sb, code) {
  const list = (await rpc(sb, 'cold_archive_packages_list')) ?? []
  const p = list.find((x) => x.code === code)
  if (!p) throw new Error(`الحزمة ${code} غير موجودة — جرّب: node archive.mjs list`)
  return rpc(sb, 'cold_archive_package_get', { p_id: p.id })
}
async function allItems(sb, pkgId) {
  const out = []; let after = 0
  for (;;) {
    const rows = (await rpc(sb, 'cold_archive_items_list', { p_package: pkgId, p_after: after, p_limit: 1000 })) ?? []
    out.push(...rows); if (rows.length < 1000) break; after = rows[rows.length - 1].id
  }
  return out
}
const manifestPath = (dir, code) => join(dir, code, 'manifest.json')
async function readManifest(dir, code) { const p = manifestPath(dir, code); return existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : null }
async function writeManifest(dir, code, m) { const p = manifestPath(dir, code); await mkdir(dirname(p), { recursive: true }); await writeFile(p + '.tmp', JSON.stringify(m, null, 2)); await rename(p + '.tmp', p) }
function hashFile(p) { return new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(p).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej) }) }

/* ───── الأوامر ───── */
async function cmdList(sb) {
  const list = (await rpc(sb, 'cold_archive_packages_list')) ?? []
  if (list.length === 0) return log('لا حزم.')
  for (const p of list) log(`${p.code}  ${p.status.padEnd(9)}  ${String(p.file_count).padStart(6)} ملف  ${fmtBytes(p.total_bytes).padStart(10)}  نُزِّل ${p.downloaded_count}/${p.file_count}  نسخ ${p.verified_copies}/${p.required_copies}`)
}
async function cmdStatus(sb, code) {
  const p = await findPackage(sb, code)
  log(`${p.code} — ${p.status}\nالفترة ${p.period_from} → ${p.period_to} · ${p.file_count} ملف · ${fmtBytes(p.total_bytes)}\nنُزِّل ${p.downloaded_count}/${p.file_count} · نسخ متحقَّق منها ${p.verified_copies}/${p.required_copies}${p.purge_available_at ? ` · الحذف متاح من ${p.purge_available_at}` : ''}`)
  for (const c of p.copies ?? []) log(`  قرص «${c.disk_label}» — ${c.ok_count} ملف — ${c.verified_at}`)
}
async function cmdPull(sb, cfg, code, dir) {
  if (!dir) throw new Error('حدد المجلد: --to D:\\Archive')
  dir = resolve(dir)
  const p = await findPackage(sb, code)
  if (!['ready', 'verified'].includes(p.status)) throw new Error(`حالة الحزمة ${p.status} لا تسمح بالتنزيل`)
  const items = await allItems(sb, p.id)
  const m = (await readManifest(dir, code)) ?? newManifest(p, cfg.supabase_url)
  if (m.package?.id && m.package.id !== p.id) throw new Error('البيان في هذا المجلد يخص حزمة أخرى بنفس الرمز — استخدم مجلداً آخر')
  const todo = pendingItems(items, m)
  log(`الحزمة ${code}: ${items.length} عنصر · يلزم تنزيل ${todo.length} · المجلد ${join(dir, code)}`)
  let done = 0, bytes = 0, missing = 0, failed = 0, pendingReport = []
  const flush = async () => {
    if (pendingReport.length === 0) return
    const r = await rpc(sb, 'cold_archive_items_downloaded', { p_package: p.id, p_items: toDownloadedPayload(pendingReport) })
    if (r?.rejected) log(`  ⚠ رُفض ${r.rejected} سجلاً من المنصة`)
    pendingReport = []; await writeManifest(dir, code, m)
  }
  for (const it of todo) {
    const local = join(dir, code, safeLocalPath(it.bucket, it.storage_path))
    try {
      const { data, error } = await sb.storage.from(it.bucket).download(it.storage_path)
      if (error) {
        const msg = String(error.message ?? error)
        if (/not found|404|object not found/i.test(msg)) { await rpc(sb, 'cold_archive_item_missing', { p_package: p.id, p_bucket: it.bucket, p_path: it.storage_path }); recordMissing(m, it); missing++; log(`  ✗ مفقود في التخزين: ${it.bucket}/${it.storage_path}`); continue }
        throw new Error(msg)
      }
      const buf = Buffer.from(await data.arrayBuffer())
      await mkdir(dirname(local), { recursive: true })
      await writeFile(local + '.part', buf); await rename(local + '.part', local)
      const sha = sha256Hex(buf)
      recordDownloaded(m, it, sha, buf.length)
      pendingReport.push(m.files[fileKey(it.bucket, it.storage_path)])
      done++; bytes += buf.length
      if (done % 25 === 0) log(`  … ${done}/${todo.length} (${fmtBytes(bytes)})`)
      if (pendingReport.length >= BATCH) await flush()
    } catch (e) { failed++; log(`  ! فشل ${it.bucket}/${it.storage_path}: ${e.message}`) }
  }
  await flush()
  // إعادة إبلاغ كل البصمات المعروفة (يعالج حالة انقطاع سابق قبل الإبلاغ)
  const known = Object.values(m.files).filter((e) => isSha256(e.sha256))
  for (const part of chunk(known, BATCH)) await rpc(sb, 'cold_archive_items_downloaded', { p_package: p.id, p_items: toDownloadedPayload(part) })
  const after = await rpc(sb, 'cold_archive_package_get', { p_id: p.id })
  log(`\nتم: نُزِّل الآن ${done} (${fmtBytes(bytes)}) · مفقود ${missing} · فشل ${failed}\nالمنصة: نُزِّل ${after.downloaded_count}/${after.file_count}`)
  if (failed > 0) { log('أعد تشغيل نفس الأمر لاستكمال الملفات الفاشلة.'); process.exitCode = 2 }
  else if (after.downloaded_count >= after.file_count) log(`اكتمل التنزيل. التالي:\n  node archive.mjs verify ${code} --from "${dir}" --disk "اسم-القرص"`)
}
async function cmdVerify(sb, code, dir, disk) {
  if (!dir) throw new Error('حدد المجلد: --from D:\\Archive'); if (!disk) throw new Error('حدد اسم القرص: --disk "قرص-1"')
  dir = resolve(dir)
  const m = await readManifest(dir, code)
  if (!m) throw new Error(`لا يوجد manifest.json للحزمة ${code} في ${dir}`)
  const p = await findPackage(sb, code)
  if (m.package?.id !== p.id) throw new Error('البيان لا يخص هذه الحزمة')
  const entries = Object.values(m.files); const hashes = new Map(); let i = 0
  log(`التحقق من ${entries.length} ملف على القرص «${disk}» …`)
  for (const e of entries) {
    const local = join(dir, code, e.local)
    try { await stat(local); hashes.set(fileKey(e.bucket, e.path), await hashFile(local)) } catch { hashes.set(fileKey(e.bucket, e.path), null) }
    if (++i % 100 === 0) log(`  … ${i}/${entries.length}`)
  }
  const { ok, corrupt, absent } = compareDisk(m, hashes)
  for (const c of corrupt) log(`  ✗ تالف: ${c.bucket}/${c.path}`)
  for (const a of absent) log(`  ✗ غير موجود على القرص: ${a.bucket}/${a.path}`)
  log(`مطابق ${ok.length} · تالف ${corrupt.length} · ناقص ${absent.length}`)
  if (corrupt.length || absent.length) { log('أعد تشغيل pull لإصلاح الملفات التالفة/الناقصة ثم كرر التحقق.'); process.exitCode = 2; return }
  const r = await rpc(sb, 'cold_archive_copy_verify', { p_package: p.id, p_disk_label: disk, p_ok_hashes: ok })
  log(`✔ سُجِّلت النسخة «${disk}». النسخ ${r.verified_copies}/${r.required_copies} · حالة الحزمة: ${r.status}${r.purge_available_at ? ` · الحذف متاح من ${r.purge_available_at}` : ''}`)
}
const HELP = `akaram-archive — أداة الأرشيف البارد
  list                                  عرض الحزم
  status PKG-...                        حالة حزمة
  pull   PKG-... --to   <مجلد>           تنزيل ملفات الحزمة وحساب البصمات (يستأنف تلقائياً)
  verify PKG-... --from <مجلد> --disk <اسم>   التحقق من نسخة القرص وتسجيلها في المنصة`

async function main() {
  const { command, code, opts } = parseArgs(process.argv.slice(2))
  if (command === 'help' || command === '--help') return log(HELP)
  const cfg = await loadConfig(); const sb = await login(cfg)
  try {
    if (command === 'list') return await cmdList(sb)
    if (!code) throw new Error('رمز الحزمة مطلوب (PKG-…)')
    if (command === 'status') return await cmdStatus(sb, code)
    if (command === 'pull') return await cmdPull(sb, cfg, code, opts.to)
    if (command === 'verify') return await cmdVerify(sb, code, opts.from, opts.disk)
    log(HELP); process.exitCode = 1
  } finally { await sb.auth.signOut().catch(() => {}) }
}
main().catch((e) => { console.error(`خطأ: ${e.message}`); process.exitCode = 1 })
