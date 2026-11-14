/**
 * فحص ما قبل الإطلاق — معاينة حيّة (Playwright على dev server)
 * لا يكتب شيئًا في قاعدة البيانات: تسجيل دخول + تنقل + قياس.
 * الاستخدام: node probe-launch-audit.mjs <mode>   حيث mode ∈ {anon, portals, crawl}
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173'
const MODE = process.argv[2] ?? 'anon'
const OUT = process.env.AUDIT_OUT ?? '/tmp/audit'
fs.mkdirSync(OUT, { recursive: true })

const PASSWORDS = ['123456789k']   // مُتحقَّق حسابًا حسابًا في probe-passwords.mjs
const ACCOUNTS = [
  ['admin@akram.iq', 'it_admin + hr_officer + ops_room'],
  ['nn@akram.iq', 'super_admin'],
  ['siaf@akram.iq', 'ops_room_manager'],
  ['jasem@akram.iq', 'deputy_director'],
  ['exec@akram.iq', 'executive_director'],
  ['hr@akram.iq', 'hr_officer'],
  ['ms1@akram.iq', 'department_manager'],
  ['fin@akram.iq', 'finance_officer'],
  ['garage@akram.iq', 'central_garage_officer'],
  ['comp@akram.iq', 'complaints_officer'],
  ['media@akram.iq', 'media_officer'],
  ['follow@akram.iq', 'follow_up'],
  ['emp@akram.iq', 'employee'],
  ['field@akram.iq', 'field_ops'],
  ['admops@akram.iq', 'admin_ops'],
  ['adm@akram.iq', 'maintenance'],
  ['ss@akram.iq', 'transfer_station'],
  ['imad@akram.iq', 'ops_room'],
]
const PORTALS = ['/employee', '/hr', '/manager', '/finance', '/it', '/admin', '/field-ops', '/admin-ops',
  '/maintenance', '/transfer-station', '/executive', '/deputy', '/ops-room', '/ops-room-manager',
  '/complaints', '/media', '/central-garage', '/follow-up']

const NOISE = [/React DevTools/i, /\[vite\]/i, /Download the React DevTools/i, /Failed to load resource: the server responded with a status of 401/i, /favicon/i, /preload/i]
const isNoise = (t = '') => NOISE.some((r) => r.test(t))

const FORBIDDEN = ['غير مصرح', 'ليس لديك صلاحية', 'لا تملك صلاحية', '403', 'ممنوع الوصول', 'وصول غير مسموح']
const CRASH = ['حدث خطأ غير متوقع', 'Something went wrong', 'ErrorBoundary', 'تعذر تحميل الصفحة', 'لا يمكن عرض']
const spinner = (t) => /جارٍ التحميل|جار التحميل|يُحمّل|loading/i.test(t)

function attach(page, bucket) {
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const t = m.text()
    if (isNoise(t)) return
    bucket.console.push({ type: m.type(), text: t.slice(0, 300) })
  })
  page.on('pageerror', (e) => bucket.pageErrors.push(String(e.message).slice(0, 300)))
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (/favicon|hot-update|@vite|\.map$/.test(u)) return
    bucket.failed.push({ url: u.slice(0, 160), err: (r.failure()?.errorText ?? '').slice(0, 80) })
  })
  page.on('response', (r) => {
    const u = r.url()
    if (r.status() < 400) return
    if (/favicon|hot-update|@vite|\.map$/.test(u)) return
    bucket.http.push({ status: r.status(), url: u.slice(0, 160) })
  })
  page.on('dialog', (d) => d.dismiss().catch(() => {}))
}

async function newPage(ctx) {
  const page = await ctx.newPage()
  const bucket = { console: [], pageErrors: [], failed: [], http: [] }
  attach(page, bucket)
  page.setDefaultTimeout(15000)
  return { page, bucket }
}

async function visit(page, bucket, path, { wait = 4200 } = {}) {
  bucket.console.length, bucket.pageErrors.length, bucket.failed.length, bucket.http.length
  const started = Date.now()
  let status = 'ok'
  try {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 20000 })
  } catch (e) {
    status = 'nav-fail'
  }
  await page.waitForTimeout(wait)
  const grab = async () => page.evaluate(() => {
    const txt = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
    const imgs = [...document.images]
    return {
      title: document.title,
      dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      lang: document.documentElement.lang,
      textLen: txt.length,
      text: txt.slice(0, 400),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 5),
      links: document.querySelectorAll('a[href]').length,
      buttons: document.querySelectorAll('button').length,
      inputsNoLabel: [...document.querySelectorAll('input:not([type=hidden])')].filter((i) => {
        const id = i.id
        const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`)
        return !hasLabel && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.getAttribute('placeholder') && !i.closest('label')
      }).length,
      h1: document.querySelectorAll('h1').length,
      mainLandmark: !!document.querySelector('main,[role=main]'),
    }
  })
  let info = await grab()
  let retried = false
  if (info.textLen < 120) {   // تحميل بارد في dev: نمنح الصفحة فرصة ثانية
    await page.waitForTimeout(7000)
    info = await grab(); retried = true
  }
  const low = info.text.toLowerCase()
  const flags = []
  if (FORBIDDEN.some((f) => info.text.includes(f)) || /\/403/.test(page.url())) flags.push('403')
  if (CRASH.some((c) => info.text.includes(c))) flags.push('CRASH')
  if (spinner(info.text) && info.text.length < 400) flags.push('STUCK_SPINNER')
  if (info.textLen < 120) flags.push('NEAR_EMPTY')
  if (info.overflowX > 8) flags.push('OVERFLOW_X')
  if (info.brokenImgs.length) flags.push('BROKEN_IMG')
  if (bucket.pageErrors.length) flags.push('PAGE_ERROR')
  const errs = bucket.console.filter((c) => c.type === 'error')
  if (errs.length) flags.push('CONSOLE_ERROR')
  const bad = bucket.http.filter((h) => h.status >= 500)
  if (bad.length) flags.push('HTTP_5XX')
  return {
    path, url: page.url().replace(BASE, ''), ms: Date.now() - started, retried, status, flags,
    ...info, text: info.text.slice(0, 220),
    console: bucket.console.slice(0, 6), pageErrors: bucket.pageErrors.slice(0, 4),
    failed: bucket.failed.slice(0, 4), http: bucket.http.slice(0, 6),
  }
}

async function login(ctx, email) {
  const { page, bucket } = await newPage(ctx)
  let ok = false, used = null, landing = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const pw = PASSWORDS[0]
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', pw)
    await page.click('button[type=submit], form button[type=submit]').catch(() => page.keyboard.press('Enter'))
    // انتظار فعلي لتغيّر المسار بدل مدة ثابتة
    await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(1500)
    if (!/\/login/.test(page.url())) { ok = true; used = pw; landing = page.url().replace(BASE, ''); break }
    // انتظار عند تقييد المعدّل ثم محاولة ثانية واحدة
    const t = await page.evaluate(() => document.body.innerText)
    if (/مقفل|محاولات/i.test(t)) break
    await page.waitForTimeout(45000)
  }

  const res = { ok, used, landing, errors: bucket.pageErrors.slice(0, 2), console: bucket.console.filter(c => c.type === 'error').slice(0, 3) }
  if (!ok) await page.screenshot({ path: `${OUT}/login-fail-${email.split('@')[0]}.png` })
  await page.close()
  return res
}

const results = {}
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

if (MODE === 'anon') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
  const { page, bucket } = await newPage(ctx)
  const paths = ['/', '/login', '/forgot-password', '/reset-password', '/403', '/citizen', '/admin', '/it', '/nonexistent-page-xyz']
  results.anonymous = []
  for (const p of paths) {
    bucket.console.length = 0; bucket.pageErrors.length = 0; bucket.failed.length = 0; bucket.http.length = 0
    const r = await visit(page, bucket, p)
    if (r.flags.length) await page.screenshot({ path: `${OUT}/anon-${p.replace(/\W+/g, '_')}.png`, fullPage: false })
    results.anonymous.push(r)
  }
  await ctx.close()
}

if (MODE === 'portals') {
  results.portals = []
  const FROM = Number(process.env.FROM ?? 0), TO = Number(process.env.TO ?? ACCOUNTS.length)
  for (const [email, role] of ACCOUNTS.slice(FROM, TO)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
    const lg = await login(ctx, email)
    const row = { email, role, login: lg, visits: [] }
    if (lg.ok) {
      for (const p of PORTALS) {
        const { page, bucket } = await newPage(ctx)
        const r = await visit(page, bucket, p, { wait: 3000 })
        row.visits.push(r)
        if (r.flags.some((f) => !['403', 'NEAR_EMPTY', 'CONSOLE_ERROR'].includes(f))) { try { await page.screenshot({ path: `${OUT}/portal-${email.split('@')[0]}${p.replace(/\//g, '-')}.png` }) } catch {} }
        await page.close().catch(() => {})
      }
    }
    results.portals.push(row)
    fs.writeFileSync(`${OUT}/portals.json`, JSON.stringify(results, null, 1))
    console.log('✔', email, lg.ok ? `(بوابة: ${lg.landing})` : 'LOGIN FAILED', new Date().toISOString().slice(11,19))
    await ctx.close()
    await new Promise((r) => setTimeout(r, 3000))
  }
}

if (MODE === 'crawl') {
  // زحف كامل على روابط الشريط الجانبي لحساب محدَّد
  const email = process.argv[3]
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
  const lg = await login(ctx, email)
  results.crawl = { email, login: lg, portals: [] }
  const MAXLINKS = Number(process.env.MAXLINKS ?? 12)
  if (lg.ok) {
    for (const portal of PORTALS) {
      const { page, bucket } = await newPage(ctx)
      bucket.console.length = 0; bucket.pageErrors.length = 0; bucket.failed.length = 0; bucket.http.length = 0
      const root = await visit(page, bucket, portal, { wait: 2600 })
      if (root.flags.includes('403') || /\/403/.test(root.url)) { results.crawl.portals.push({ portal, blocked: true }); continue }
      const links = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')))].filter((h) => h && !h.startsWith('//')))
      const pages = []
      for (const l of links.slice(0, MAXLINKS)) {
        bucket.console.length = 0; bucket.pageErrors.length = 0; bucket.failed.length = 0; bucket.http.length = 0
        const r = await visit(page, bucket, l, { wait: 2000 })
        pages.push(r)
        if (r.flags.some((f) => !['403'].includes(f))) { try { await page.screenshot({ path: `${OUT}/crawl${l.replace(/\W+/g, '_')}.png` }) } catch {} }
      }
      results.crawl.portals.push({ portal, links: links.length, pages })
      fs.writeFileSync(`${OUT}/crawl.json`, JSON.stringify(results, null, 1))
      console.log('✔', portal, '→', links.length, 'رابط،', pages.length, 'صفحة', new Date().toISOString().slice(11,19))
      await page.close().catch(() => {})
    }
  }
  await ctx.close()
}

if (MODE === 'responsive') {
  results.responsive = []
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
  const lg = await login(ctx0, 'admin@akram.iq')
  const storage = await ctx0.storageState()
  await ctx0.close()
  for (const [w, h, name] of [[390, 844, 'phone'], [768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ar-IQ', storageState: storage })
    const { page, bucket } = await newPage(ctx)
    for (const p of ['/it', '/it/users', '/admin', '/ops-room', '/login', '/citizen']) {
      bucket.console.length = 0; bucket.pageErrors.length = 0; bucket.failed.length = 0; bucket.http.length = 0
      const r = await visit(page, bucket, p, { wait: 2200 })
      results.responsive.push({ viewport: name, ...r })
      if (r.flags.includes('OVERFLOW_X')) await page.screenshot({ path: `${OUT}/resp-${name}${p.replace(/\//g, '-')}.png` })
    }
    await ctx.close()
  }
  results.login = lg
}


if (MODE === 'deep') {
  const plan = JSON.parse(fs.readFileSync(process.env.PLAN ?? '/tmp/audit/plan.json', 'utf8'))
  results.deep = []
  for (const { email, portal, pages } of plan) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
    let lg = await login(ctx, email)
    for (let i = 0; i < 2 && !lg.ok; i++) { await new Promise(r => setTimeout(r, 20000)); lg = await login(ctx, email) }
    // حماية من نتائج كاذبة: كل صفحة يجب ألّا تكون شاشة دخول
    if (lg.ok) {
      const probe = await ctx.newPage()
      await probe.goto(BASE + pages[0], { waitUntil: 'domcontentloaded' }).catch(() => {})
      await probe.waitForTimeout(2500)
      if (/\/login/.test(probe.url())) lg = { ok: false, reason: 'SESSION_NOT_ESTABLISHED' }
      await probe.close().catch(() => {})
    }
    const row = { email, portal, login: lg, pages: [] }
    if (lg.ok) {
      for (const p of pages) {
        const { page, bucket } = await newPage(ctx)
        const r = await visit(page, bucket, p, { wait: 2600 })
        row.pages.push(r)
        if (r.flags.some(f => !['403'].includes(f))) { try { await page.screenshot({ path: `${OUT}/deep${p.replace(/\W+/g, '_')}.png` }) } catch {} }
        await page.close().catch(() => {})
      }
    }
    results.deep.push(row)
    fs.writeFileSync(`${OUT}/deep.json`, JSON.stringify(results, null, 1))
    const bad = row.pages.filter(p => p.flags.some(f => f !== '403')).length
    console.log('✔', portal.padEnd(18), email.padEnd(20), row.pages.length, 'صفحة ·', bad, 'ملاحظة', new Date().toISOString().slice(11, 19))
    await ctx.close()
    await new Promise(r => setTimeout(r, 4000))
  }
}

await browser.close()
fs.writeFileSync(`${OUT}/${MODE}.json`, JSON.stringify(results, null, 1))
console.log('WROTE', `${OUT}/${MODE}.json`)
