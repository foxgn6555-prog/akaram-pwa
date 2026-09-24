/**
 * وكيل جسر الشبكة الداخلية (zk_bridge) — منصة أكرم / بوابة التطوير المركزية.
 *
 * يعمل على أي حاسوب داخل شبكة الجهة يرى الجهاز على المنفذ 4370، يسحب كل سجلات الحضور من ذاكرة
 * الجهاز (بروتوكول ZK الثنائي عبر node-zklib) ويرسل الجديد منها إلى Edge biometric-bridge بمفتاح الجهاز.
 *
 *   node bridge.mjs            → تشغيل دائم (كل interval_minutes)
 *   node bridge.mjs --once     → دورة واحدة ثم خروج (مناسب لمجدول ويندوز/cron)
 *   node bridge.mjs --test     → اختبار الاتصال بالأجهزة فقط (بلا إرسال)
 *   CONFIG=path/to/config.json (افتراضي ./config.json)  STATE=path/to/state.json (افتراضي ./state.json)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deviceLocalString, mapZkAttendance, mapZkUser, maxLocal, sinceFilter } from './lib/bridge-protocol.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const CONFIG = process.env.CONFIG ?? path.join(here, 'config.json')
const STATE = process.env.STATE ?? path.join(here, 'state.json')
const AGENT = 'akaram-zk-bridge/1.0.0'
const args = new Set(process.argv.slice(2))
const log = (...a) => console.log(new Date().toISOString(), ...a)

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)) }

export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('config.json مفقود أو غير صالح — انسخ config.example.json')
  if (!/^https:\/\/.+/.test(cfg.supabase_url ?? '')) throw new Error('supabase_url يجب أن يبدأ بـ https://')
  if (!Array.isArray(cfg.devices) || cfg.devices.length === 0) throw new Error('devices فارغة')
  for (const d of cfg.devices) {
    if (!d.serial || !d.ip) throw new Error('كل جهاز يحتاج serial وip')
    if (!/^zkb_[0-9a-f]{48}$/.test(d.bridge_key ?? '')) throw new Error(`bridge_key غير صالح للجهاز ${d.serial} — ولّده من بوابة التطوير المركزية`)
  }
  return { interval_minutes: 5, ...cfg, devices: cfg.devices.map((d) => ({ port: 4370, comm_key: 0, send_users: true, ...d })) }
}

async function readDevice(dev) {
  // اسم الحزمة عبر متغير كي لا يحاول أي مجمّع (vite/vitest) حلّها — تُثبَّت بـ npm install داخل هذا المجلد فقط
  const pkg = 'node-zklib'
  const { default: ZKLib } = await import(/* @vite-ignore */ pkg)
  const zk = new ZKLib(dev.ip, dev.port, 10000, 4000, Number(dev.comm_key) || 0)
  await zk.createSocket()
  try {
    const info = await zk.getInfo().catch(() => null)
    const att = await zk.getAttendances()
    const punches = (att?.data ?? []).map(mapZkAttendance).filter(Boolean)
    let users = []
    if (dev.send_users) {
      const u = await zk.getUsers().catch(() => ({ data: [] }))
      users = (u?.data ?? []).map(mapZkUser).filter(Boolean)
    }
    let deviceTime = null
    try { deviceTime = deviceLocalString(await zk.getTime()) } catch { /* بعض الأجهزة لا تدعمه */ }
    return { info, punches, users, deviceTime }
  } finally {
    await zk.disconnect().catch(() => {})
  }
}

export async function post(cfg, dev, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${cfg.supabase_url.replace(/\/$/, '')}/functions/v1/biometric-bridge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Serial': dev.serial, 'X-Bridge-Key': dev.bridge_key },
    body: JSON.stringify({ ...body, agent: AGENT }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`HTTP ${res.status} ${json.error ?? ''} ${json.detail ?? ''}`.trim())
  return json
}

export async function cycle(cfg, state, { testOnly = false, read = readDevice, send = post } = {}) {
  const summary = []
  for (const dev of cfg.devices) {
    const st = state[dev.serial] ?? {}
    try {
      const { info, punches, users, deviceTime } = await read(dev)
      const fresh = sinceFilter(punches, st.last_local)
      log(`[${dev.serial}] ${dev.ip}:${dev.port} · في الذاكرة ${punches.length} · جديد ${fresh.length} · مستخدمون ${users.length}` +
          (deviceTime ? ` · وقت الجهاز ${deviceTime}` : '') + (info ? ` · سعة ${info.logCounts}/${info.logCapacity}` : ''))
      if (testOnly) { summary.push({ serial: dev.serial, ok: true, total: punches.length }); continue }
      // دفعات ≤ 5000 (حد الخادم)
      let result = { received: 0, inserted: 0, duplicates: 0, unmatched: 0, users: 0 }
      for (let i = 0; i < Math.max(1, Math.ceil(fresh.length / 4000)); i++) {
        const chunk = fresh.slice(i * 4000, (i + 1) * 4000)
        const r = await send(cfg, dev, { punches: chunk, users: i === 0 ? users : [] })
        for (const k of Object.keys(result)) result[k] += Number(r[k] ?? 0)
      }
      state[dev.serial] = { last_local: maxLocal(punches) ?? st.last_local ?? null, last_ok_at: new Date().toISOString(), last_error: null }
      log(`[${dev.serial}] ✅ أُرسل ${result.received} · مُدرج ${result.inserted} · مكرر ${result.duplicates} · غير مطابَق ${result.unmatched}`)
      summary.push({ serial: dev.serial, ok: true, ...result })
    } catch (e) {
      const msg = (e?.err?.message ?? e?.message ?? String(e)).slice(0, 300)
      log(`[${dev.serial}] ❌ ${msg}`)
      state[dev.serial] = { ...st, last_error: msg, last_error_at: new Date().toISOString() }
      // أبلغ المنصة بالفشل كي يظهر في سجل العمليات (إن كان الخادم نفسه متاحاً)
      if (!testOnly) await send(cfg, dev, { punches: [], error: msg }).catch((e2) => log(`[${dev.serial}] تعذر إبلاغ المنصة: ${e2.message}`))
      summary.push({ serial: dev.serial, ok: false, error: msg })
    }
  }
  if (!testOnly) saveState(state)
  return summary
}

async function main() {
  const cfg = validateConfig(loadJson(CONFIG, null))
  const state = loadJson(STATE, {})
  log(`${AGENT} · ${cfg.devices.length} جهاز · ${args.has('--test') ? 'اختبار' : args.has('--once') ? 'دورة واحدة' : `كل ${cfg.interval_minutes} دقيقة`}`)
  if (args.has('--test') || args.has('--once')) {
    const s = await cycle(cfg, state, { testOnly: args.has('--test') })
    process.exit(s.every((x) => x.ok) ? 0 : 1)
  }
  for (;;) {
    await cycle(cfg, state)
    await new Promise((r) => setTimeout(r, Math.max(1, cfg.interval_minutes) * 60_000))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('فشل التشغيل:', e.message); process.exit(2) })
}
