/**
 * فحص حيّ بعد تغيير نصف القطر إلى 40 م (00389) — قراءة فقط، بلا أي كتابة.
 * ① الدخول بحساب غرفة العمليات ② /ops-room/waste-map ③ قراءة سطر الحدود + العدّاد + الأشهر
 * ④ فتح لوحة بقعة والتحقق من «الموقع» الجديد بلا أي رسالة «غير متاح» / أخطاء شبكة.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const EMAIL = process.env.EMAIL || 'admin@akram.iq'
const PASS = process.env.PASS || '123456789k'
const results = []
const ok = (n, c, x = '') => results.push(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`)

const browser = await chromium.launch({ args: ['--disable-web-security', '--disable-site-isolation-trials'] })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)) })

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.fill('input[type="email"], input[name="email"]', EMAIL)
await page.fill('input[type="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForTimeout(6000)
ok('تسجيل الدخول', !page.url().includes('/login'), page.url())

await page.goto(`${BASE}/ops-room/waste-map`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
ok('الخريطة محمّلة', (await page.locator('[data-testid="waste-map"]').count()) > 0)
ok('لا رسالة خطأ على الصفحة', (await page.locator('[data-testid="waste-map-error"]').count()) === 0)
ok('لا فشل بلاطات', (await page.locator('[data-testid="waste-map-tile-failed"]').count()) === 0)

const thresholds = await page.locator('[data-testid="waste-map-thresholds"]').innerText().catch(() => '')
ok('سطر الحدود يعرض نصف القطر', /نصف\s*قطر/.test(thresholds), thresholds.replace(/\n/g, ' | ').slice(0, 160))
const counter = await page.locator('[data-testid="waste-map-counter"]').innerText().catch(() => '')
ok('عدّاد البقع يعمل', counter.trim().length > 0, counter.replace(/\n/g, ' | ').slice(0, 160))
const hidden = await page.locator('[data-testid="waste-map-sectors-hidden"]').innerText().catch(() => '')
if (hidden) results.push(`ℹ️ قواطع بلا بقع: ${hidden.trim()}`)

// الشهور المتاحة
const months = await page.locator('[data-testid="waste-map-month"] option').allInnerTexts().catch(() => [])
results.push(`ℹ️ الأشهر: ${months.join(' ، ')}`)

// أكبر قيمة في القائمة (أعلى بقعة)
const list = await page.locator('[data-testid="waste-map-list"]').innerText().catch(() => '')
results.push(`ℹ️ أول سطور القائمة: ${list.split('\n').slice(0, 6).join(' / ').slice(0, 200)}`)

// تفاصيل بقعة
const marker = page.locator('[data-testid="waste-map-markers"] > *').first()
if (await marker.count()) {
  await marker.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2500)
  if (await page.locator('[data-testid="hotspot-panel"]').count()) {
    const addr = await page.locator('[data-testid="hotspot-panel-address"]').innerText().catch(() => '')
    ok('لوحة البقعة تعرض «الموقع»', addr.trim().length > 0, addr.replace(/\n/g, ' | ').slice(0, 120))
    ok('لا «غير متاح» في الموقع', !/غير متاح/.test(addr), addr.slice(0, 60))
  } else results.push('ℹ️ لم تُفتح اللوحة من العلامة (يُفتح من القائمة)')
}
const row = page.locator('[data-testid="waste-map-list"] button, [data-testid="waste-map-list"] [role="button"]').first()
if (await row.count()) {
  await row.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2500)
  const addr = await page.locator('[data-testid="hotspot-panel-address"]').innerText().catch(() => '')
  ok('اللوحة من القائمة تعرض الموقع', addr.trim().length > 0, addr.replace(/\n/g, ' | ').slice(0, 120))
}
await page.screenshot({ path: '/home/user/shots/waste-map-r40.png', fullPage: false })

const netFails = errors.filter((e) => !/favicon|manifest|vapid|push|ResizeObserver|401|PGRST|Failed to fetch i18n|i18next/i.test(e))
ok('لا أخطاء كونسول', netFails.length === 0, netFails.slice(0, 3).join(' ⏐ '))
console.log(results.join('\n'))
await browser.close()
