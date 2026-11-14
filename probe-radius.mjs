// probe-radius — فحص حيّ: زر نصف القطر في بوابة IT + سطر الحدود في خريطة النفايات (بلا أي تنفيذ تغيير)
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
const errs = [], failed = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().replace(/\s+/g, ' ').slice(0, 160)) })
page.on('response', async r => { if (r.url().includes('supabase.co') && r.status() >= 400) failed.push(`${r.status()} ${r.url().split('/').pop()}`) })
const clean = s => (s || '').replace(/\s+/g, ' ').trim()

// ── ١) بوابة IT: بطاقة مستودع GPS ──
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
await page.fill('input[type="email"], input[name="email"]', 'admin@akram.iq')
await page.fill('input[type="password"]', '123456789k')
await page.click('button[type="submit"]'); await page.waitForTimeout(8000)
console.log('دخول IT →', new URL(page.url()).pathname)

await page.goto(`${BASE}/it/integrations/gps-health`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(9000)
console.log('مسار بطاقة المستودع:', new URL(page.url()).pathname)
const card = page.locator('[data-testid="gps-warehouse-card"]').first()
if (await card.count()) {
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500)
  const ctrl = page.locator('[data-testid="gps-warehouse-radius-control"]').first()
  console.log('بطاقة المستودع ظاهرة:', true)
  console.log('عنصر التحكم:', (await ctrl.count()) ? clean(await ctrl.innerText()).slice(0, 300) : '❌ غير موجود')
  const sel = page.locator('[data-testid="gps-warehouse-radius-select"]').first()
  if (await sel.count()) {
    console.log('الخيارات:', (await sel.locator('option').allInnerTexts()).join(' · '))
    console.log('القيمة المختارة:', await sel.inputValue())
    const btn = page.locator('[data-testid="gps-warehouse-radius-apply"]').first()
    console.log('الزر معطّل (لأن القيمة = الحالية):', await btn.isDisabled())
    await page.screenshot({ path: '/home/user/shots/radius-it-control.png', fullPage: false })
    // لا نضغط الزر — تغيير حقيقي يحتاج إذنًا صريحًا
  }
} else console.log('❌ لم أجد بطاقة مستودع GPS في هذه الصفحة')

// ── ٢) خريطة النفايات: سطر الحدود يعرض نصف القطر ──
await page.goto(`${BASE}/ops-room/waste-map`, { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(9000)
const th = page.locator('[data-testid="waste-map-thresholds"]').first()
console.log('\nمسار الخريطة:', new URL(page.url()).pathname)
console.log('سطر الحدود:', (await th.count()) ? clean(await th.innerText()).slice(0, 220) : '(لا وصول — متوقع لأن IT لا يملك وحدة الخريطة)')
const hidden = page.locator('[data-testid="waste-map-sectors-hidden"]').first()
console.log('تلميح القواطع المخفية:', (await hidden.count()) ? clean(await hidden.innerText()) : '(لا شيء)')

console.log('\nأخطاء كونسول:', [...new Set(errs)].filter(t => !/WebSocket|\[vite\]|Outdated|nominatim|Content Security/.test(t)).join(' ⏐ ') || '(لا شيء)')
console.log('نداءات فاشلة:', [...new Set(failed)].join(' ⏐ ') || '(لا شيء)')
await browser.close()
