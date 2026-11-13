// probe4 — فحص بوابات مدير غرفة العمليات: نص المحتوى الفعلي + الأخطاء المرئية + الجرس
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.route('**/*.supabase.co/**', async route => {
  const req = route.request()
  try {
    const h = { ...req.headers() }
    for (const k of ['origin', 'referer', 'host', 'content-length']) delete h[k]
    const res = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined })
    const b = Buffer.from(await res.arrayBuffer())
    const hd = {}
    res.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) hd[k] = v })
    hd['access-control-allow-origin'] = '*'
    await route.fulfill({ status: res.status, headers: hd, body: b })
  } catch { await route.abort() }
})
const page = await ctx.newPage()
const consoleErrs = [], failed = [], rpcCalls = []
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().replace(/\s+/g, ' ').slice(0, 220)) })
page.on('pageerror', e => consoleErrs.push('PAGEERROR: ' + String(e).slice(0, 220)))
page.on('response', async r => {
  if (!r.url().includes('supabase.co')) return
  const name = r.url().split('/').slice(-1)[0]
  if (r.status() >= 400) { const t = await r.text().catch(() => ''); failed.push(`${r.status()} ${name} :: ${t.slice(0, 200)}`) }
  else if (r.url().includes('/rpc/')) rpcCalls.push(name)
})
const clean = s => (s || '').replace(/\s+/g, ' ').trim()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
await page.fill('input[type="email"], input[name="email"]', 'siaf@akram.iq')
await page.fill('input[type="password"]', '123456789k')
await page.click('button[type="submit"]'); await page.waitForTimeout(9000)
console.log('بعد الدخول →', page.url())

const KEYWORDS = ['خطأ', 'فشل', 'تعذر', 'تعذّر', 'غير مصرح', 'Forbidden', 'Unauthorized', 'ممنوع', 'لا توجد صلاحية', 'حدث خطأ', 'Error']
for (const path of ['/ops-room-manager', '/ops-room-manager/approvals', '/ops-room-manager/fuel-reports']) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000)
  const main = page.locator('main').first()
  const mainText = clean(await main.innerText().catch(() => ''))
  const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => [])
  const visibleText = clean(await page.locator('body').innerText())
  const hits = KEYWORDS.filter(k => visibleText.includes(k))
  console.log(`\n=== ${path} → ${new URL(page.url()).pathname}`)
  console.log('محتوى الصفحة:', mainText.slice(0, 420) || '(فارغ)')
  console.log('role=alert:', alerts.map(clean).filter(Boolean).join(' | ') || '(لا شيء)')
  console.log('كلمات خطأ ظاهرة:', hits.join(', ') || '(لا شيء)')
  await page.screenshot({ path: `/home/user/shots/opm-r31${path.replace(/\//g, '-')}.png` }).catch(() => {})
}

// الجرس
await page.goto(BASE + '/ops-room-manager', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000)
const bell = page.locator('button[aria-label*="إشعار"], button[aria-label*="تنبيه"], [data-testid*="notification"]').first()
if (await bell.count()) {
  await bell.click(); await page.waitForTimeout(4000)
  const panel = clean(await page.locator('body').innerText())
  const idx = panel.indexOf('الإشعارات')
  console.log('\n=== الجرس ===')
  console.log('النص حول «الإشعارات»:', panel.slice(Math.max(0, idx), idx + 400) || panel.slice(0, 400))
  await page.screenshot({ path: '/home/user/shots/opm-bell-r31.png' }).catch(() => {})
} else console.log('\nلم أجد زر الإشعارات')

console.log('\n--- نداءات RPC ناجحة ---'); console.log([...new Set(rpcCalls)].join(', ') || '(لا شيء)')
console.log('\n--- أخطاء الكونسول ---'); console.log([...new Set(consoleErrs)].filter(t => !t.includes('WebSocket') && !t.includes('[vite]')).slice(0, 12).join('\n') || '(لا شيء)')
console.log('\n--- نداءات فاشلة ---'); console.log([...new Set(failed)].slice(0, 12).join('\n') || '(لا شيء)')
await browser.close()
