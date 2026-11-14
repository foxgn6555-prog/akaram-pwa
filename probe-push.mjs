/** فحص حيّ: هل تظهر لافتة تفعيل إشعارات الهاتف في مركز الإشعارات؟ (قراءة فقط) */
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-web-security','--disable-site-isolation-trials'] })
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 }, permissions: ['notifications'] })
await ctx.addInitScript(() => {
  // المعاينة السحابية تحجب إذن الإشعارات دائمًا؛ نوهم الصفحة بأن الإذن «لم يُطلب بعد»
  // لتصوير لافتة التفعيل وزرها فقط — بلا أي اشتراك ولا إرسال (لا نضغط الزر)
  try {
    Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true })
  } catch { }
})
const p = await ctx.newPage()
const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
const out = {}
await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800)
await p.fill('input[type="email"]','admin@akram.iq'); await p.fill('input[type="password"]','123456789k')
await p.click('button[type="submit"]'); await p.waitForTimeout(6000)
// زر الجرس
const bell = p.locator('button[aria-label^="الإشعارات"]').first()
out.bellFound = await bell.count()
await bell.click({ force: true }).catch(() => {})
await p.waitForTimeout(3000)
out.menuText = (await p.locator('[role="dialog"]').innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 220)
out.banner = await p.locator('[data-testid="push-enable-banner"]').count()
out.bannerDenied = await p.locator('[data-testid="push-banner-denied"]').count()
out.button = await p.locator('[data-testid="push-enable-now"]').count()
out.bannerText = (await p.locator('[data-testid="push-enable-banner"]').innerText().catch(() => '')).replace(/\n/g, ' | ')
// هل مفتاح VAPID وصل إلى النسخة؟
out.vapidKey = await p.evaluate(() => {
  const keys = Object.keys(import.meta?.env ?? {})
  return keys.length
}).catch(() => null)
out.errors = errs.slice(0, 4)
await p.screenshot({ path: '/home/user/shots/push-banner.png' })
console.log(JSON.stringify(out, null, 1))
await b.close()
