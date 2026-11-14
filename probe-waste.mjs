// probe-waste — مراجعة حيّة لوحدة «خريطة النفايات (بقع التوقف)» — قراءة فقط، بلا أي كتابة
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
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
const errs = [], failed = [], rpc = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().replace(/\s+/g, ' ').slice(0, 200)) })
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)))
page.on('response', async r => {
  if (!r.url().includes('supabase.co')) return
  const n = r.url().split('/').pop()
  if (r.status() >= 400) { const t = await r.text().catch(() => ''); failed.push(`${r.status()} ${n} :: ${t.slice(0, 160)}`) }
  else if (r.url().includes('/rpc/')) rpc.push(n)
})
const clean = s => (s || '').replace(/\s+/g, ' ').trim()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
const creds = [['imad@akram.iq', '1234567890'], ['imad@akram.iq', '123456789k'], ['ops2@akram.iq', '1234567890'], ['ops2@akram.iq', '123456789k']]
let ok = null
for (const [email, pass] of creds) {
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"]', pass)
  await page.click('button[type="submit"]'); await page.waitForTimeout(7000)
  if (!page.url().includes('/login')) { ok = email; break }
}
console.log('دخل الحساب:', ok ?? '❌ فشل الدخول بكل المحاولات', '→', new URL(page.url()).pathname)
if (!ok) { await browser.close(); process.exit(0) }

await page.goto(`${BASE}/ops-room/waste-map`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(12000)
console.log('المسار:', new URL(page.url()).pathname)
console.log('الخطأ الظاهر:', clean(await page.locator('[data-testid="waste-map-error"]').innerText().catch(() => '')) || '(لا شيء)')
console.log('عدّاد أعلى الصفحة:', clean(await page.locator('header, [data-testid="exec-page-header"]').first().innerText().catch(() => '')).slice(0, 320))
console.log('الشهر المعروض:', await page.locator('[data-testid="waste-map-month"]').inputValue().catch(() => '?'))
console.log('خيارات الأشهر:', (await page.locator('[data-testid="waste-map-month"] option').allInnerTexts().catch(() => [])).join(' | '))
console.log('المقارنة الشهرية:', clean(await page.locator('[data-testid="waste-map-comparison"]').innerText().catch(() => '')).slice(0, 300))
const spots = await page.locator('.waste-spot').count()
console.log('علامات على الخريطة:', spots)
console.log('قائمة أعلى البقع:', clean(await page.locator('[data-testid="waste-map-list"]').innerText().catch(() => '')).slice(0, 300))
await page.screenshot({ path: '/home/user/shots/waste-map-live.png' })

// فلاتر + لوحة تفاصيل بقعة
const list = page.locator('[data-testid^="waste-list-"]').first()
if (await list.count()) {
  await list.click(); await page.waitForTimeout(6000)
  console.log('\nلوحة التفاصيل:', clean(await page.locator('[data-testid="hotspot-panel"]').innerText().catch(() => '')).slice(0, 600))
  await page.screenshot({ path: '/home/user/shots/waste-map-detail.png' })
}
await page.getByTestId('waste-filter-class-heavy').click().catch(() => {}); await page.waitForTimeout(2500)
console.log('\nبعد فلترة «ثقيل» فقط — عدّاد:', clean(await page.locator('[data-testid="exec-page-header"]').first().innerText().catch(() => '')).slice(0, 200))

console.log('\nنداءات RPC:', [...new Set(rpc)].join(', ') || '(لا شيء)')
console.log('أخطاء كونسول:', [...new Set(errs)].filter(t => !/WebSocket|\[vite\]|Outdated/.test(t)).join(' ⏐ ') || '(لا شيء)')
console.log('نداءات فاشلة:', [...new Set(failed)].join(' ⏐ ') || '(لا شيء)')
await browser.close()
