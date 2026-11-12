/**
 * فحص حيّ لحساب مدير غرفة العمليات الجديد (siaf@akram.iq).
 * قراءة فقط: لا موافقة ولا رفض ولا أي كتابة.
 */
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3000'
const out = []
const ok = (n, c, e = '') => out.push(`${c ? '✅' : '❌'} ${n}${e ? ' — ' + e : ''}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
// تمرير نداءات Supabase عبر Node ⇒ يتجاوز حجب CORS في المعاينة المحلية
await ctx.route('**/*.supabase.co/**', async (route) => {
  const req = route.request()
  try {
    const h = { ...req.headers() }
    for (const k of ['origin', 'referer', 'host', 'content-length']) delete h[k]
    const res = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined })
    const body = Buffer.from(await res.arrayBuffer())
    const headers = {}
    res.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) headers[k] = v })
    headers['access-control-allow-origin'] = '*'
    await route.fulfill({ status: res.status, headers, body })
  } catch { await route.abort() }
})
const page = await ctx.newPage()
page.on('response', async (r) => {
  if (r.url().includes('supabase.co') && r.status() >= 400) {
    const body = await r.text().catch(() => '')
    console.log(`  [net ${r.status()}] ${r.url().split('/').slice(-1)[0]} :: ${body.slice(0, 200)}`)
  }
})
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.fill('input[type="email"], input[name="email"]', 'siaf@akram.iq')
await page.fill('input[type="password"]', '123456789k')
await page.click('button[type="submit"]')
await page.waitForTimeout(8000)
ok('تسجيل الدخول بكلمة السر المطلوبة', !page.url().includes('/login'), page.url())
ok('الهبوط في بوابة مدير غرفة العمليات', page.url().includes('/ops-room-manager'), page.url())

const dash = await page.locator('[data-testid="ops-manager-dashboard"]').count()
ok('الرئيسية تُعرَض', dash > 0, `elements=${dash}`)
const pending = (await page.locator('[data-testid="opm-pending"]').innerText().catch(() => '?')).replace(/\s+/g, ' ')
ok('بطاقة «بانتظار قرارك» ظاهرة', pending !== '?', pending)
const navUnits = await page.locator('nav a, aside a').allInnerTexts().catch(() => [])
const flat = navUnits.join(' | ')
ok('الشريط يعرض «طلبات الموافقة»', flat.includes('طلبات الموافقة'))
ok('الشريط يعرض «تقارير الوقود»', flat.includes('تقارير الوقود'))
ok('لا يظهر شيء من بوابة غرفة العمليات الكبيرة', !flat.includes('بيانات وتقارير العمليات') && !flat.includes('الحاويات'))
await page.screenshot({ path: '/home/user/shots/opm-dashboard.png', fullPage: true }).catch(() => {})

await page.goto(`${BASE}/ops-room-manager/fuel-reports`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
const rep = await page.locator('[data-testid="garage-reports-page"]').count()
ok('صفحة تقارير الوقود تُعرَض', rep > 0, `elements=${rep}`)
const alert = await page.locator('[role="alert"]').count()
const stat = (await page.locator('[data-testid="exec-page-header-stats"]').innerText().catch(() => '')).replace(/\s+/g, ' ')
ok('التقرير جلب بيانات فعلية (لا رسالة خطأ)', alert === 0, stat || '—')
await page.screenshot({ path: '/home/user/shots/opm-fuel.png', fullPage: true }).catch(() => {})

await page.goto(`${BASE}/ops-room-manager/approvals`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7000)
const inbox = await page.locator('[data-testid="sm-requests"]').count()
ok('صفحة الموافقات تُعرَض', inbox > 0, `elements=${inbox}`)

// العزل: مسارات بوابات أخرى ⇒ 403
for (const p of ['/admin', '/central-garage', '/hr']) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  ok(`لا يصل إلى ${p}`, page.url().includes('/403'), page.url())
}

console.log(out.join('\n'))
const rel = errors.filter((e) => !/WebSocket|vite\] failed to connect|favicon|manifest/i.test(e))
console.log(`\nأخطاء كونسول غير متوقعة: ${rel.length}`)
rel.slice(0, 5).forEach((e) => console.log('  • ' + e))
await browser.close()
