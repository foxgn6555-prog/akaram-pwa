// probe7 — قبول مرئي لإشعار 00404: عدّاد الجرس + قائمة الإشعارات + الرابط
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
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
const errs = [], failed = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().replace(/\s+/g, ' ').slice(0, 180)) })
page.on('response', async r => { if (r.url().includes('supabase.co') && r.status() >= 400) failed.push(`${r.status()} ${r.url().split('/').pop()}`) })
const clean = s => (s || '').replace(/\s+/g, ' ').trim()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
await page.fill('input[type="email"], input[name="email"]', 'siaf@akram.iq')
await page.fill('input[type="password"]', '123456789k')
await page.click('button[type="submit"]'); await page.waitForTimeout(9000)

const bell = page.locator('button[aria-label*="إشعار"], button[aria-label*="تنبيه"]').first()
const bellHtml = clean(await bell.evaluate(el => el.outerHTML).catch(() => ''))
console.log('زر الجرس:', bellHtml.slice(0, 260))
await page.screenshot({ path: '/home/user/shots/opm-bell-badge-r31.png' })

await bell.click(); await page.waitForTimeout(3500)
const drawer = page.locator('aside, [role="dialog"], [data-state="open"]').filter({ hasText: 'إشعار' }).first()
const txt = clean(await drawer.innerText().catch(() => ''))
console.log('\nقائمة الإشعارات:', txt.slice(0, 400) || '(لم أقرأ القائمة)')
await page.screenshot({ path: '/home/user/shots/opm-bell-list-r31.png' })

const item = page.getByText('TEST 00404', { exact: false }).first()
if (await item.count()) {
  await item.click(); await page.waitForTimeout(5000)
  console.log('\nبعد الضغط على الإشعار → المسار:', new URL(page.url()).pathname)
} else console.log('\n❌ الإشعار التجريبي غير ظاهر في القائمة')

console.log('\nأخطاء الكونسول:', [...new Set(errs)].filter(t => !/WebSocket|\[vite\]|Outdated/.test(t)).join(' ⏐ ') || '(لا شيء)')
console.log('نداءات فاشلة:', [...new Set(failed)].join(' ⏐ ') || '(لا شيء)')
await browser.close()
