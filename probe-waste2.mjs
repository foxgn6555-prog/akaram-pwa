// probe-waste2 — قياس تراكب رأس الصفحة + تحقق سريع من الفلاتر والحسابات
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
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000)
await page.fill('input[type="email"], input[name="email"]', 'imad@akram.iq')
await page.fill('input[type="password"]', '1234567890')
await page.click('button[type="submit"]'); await page.waitForTimeout(8000)
await page.goto(`${BASE}/ops-room/waste-map`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(14000); console.log('URL:', page.url()); console.log('النص:', (await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,200))

const box = async (sel) => { const l = page.locator(sel).first(); return (await l.count()) ? await l.boundingBox() : null }
const sub = await box('header[data-testid="exec-page-header"] p')
const dl = await box('header[data-testid="exec-page-header"] dl')
const first = await box('[data-testid="exec-page-header-stats"] > div')
const inter = (a, b) => a && b && !(a.y + a.height <= b.y || b.y + b.height <= a.y)
console.log('subtitle:', sub && { y: Math.round(sub.y), h: Math.round(sub.height) })
console.log('stats dl:', dl && { y: Math.round(dl.y), h: Math.round(dl.height) })
console.log('first tile:', first && { y: Math.round(first.y), h: Math.round(first.height), bg: await page.locator('[data-testid="exec-page-header-stats"] > div').first().evaluate(e => getComputedStyle(e).backgroundColor) })
console.log('تراكب العنوان مع البطاقات؟', inter(sub, first) ? '⚠️ نعم' : 'لا')
console.log('subtitle height clamp:', sub && Math.round(sub.height))
const pEl = page.locator('header[data-testid="exec-page-header"] p').first()
console.log('subtitle computed:', await pEl.evaluate(e => ({ h: Math.round(e.getBoundingClientRect().height), lh: getComputedStyle(e).lineHeight, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '16')) })).catch(() => null))
const hd = await box('header[data-testid="exec-page-header"]')
console.log('header box:', hd && { y: Math.round(hd.y), h: Math.round(hd.height) })

// فلاتر: هل العدّادات تتغير مع الصنف؟
const readStats = async () => (await page.locator('[data-testid="exec-page-header-stats"]').innerText()).replace(/\s+/g, ' ')
console.log('\nالإحصاء قبل:', await readStats())
await page.getByTestId('waste-filter-class-light').click(); await page.waitForTimeout(1500)
console.log('بعد إضافة «خفيف»:', await readStats())
const sectorAll = await page.locator('[data-testid="waste-filter-sectors"] button').first().innerText()
console.log('عدّاد «الكل» في القاطع (لا يتأثر بالصنف):', sectorAll)
const unloc = await page.locator('[data-testid="waste-filter-sector-unlocated"]').innerText()
console.log('عدّاد «غير محدد»:', unloc)
await page.screenshot({ path: '/home/user/shots/waste-map-filters.png' })
await browser.close()
