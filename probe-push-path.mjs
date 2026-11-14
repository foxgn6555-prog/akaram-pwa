/**
 * إثبات أن عقد التفعيل يمرّ من فحص «عامل الخدمة» حين يوجد عامل مسجَّل — بلا أي اشتراك أو إرسال.
 * نُسجّل عامل خدمة وهميًا (اعتراض مسار) ونوهم الصفحة بأن الإذن لم يُطلب بعد، ثم نضغط الزر.
 */
import { chromium } from 'playwright'
const SW = `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));`
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-web-security', '--disable-site-isolation-trials'] })
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
await ctx.addInitScript(() => {
  try { Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true }) } catch { }
})
const p = await ctx.newPage()
const out = {}
await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
await p.fill('input[type="email"]', 'admin@akram.iq'); await p.fill('input[type="password"]', '123456789k')
await p.click('button[type="submit"]'); await p.waitForTimeout(6000)
// تسجيل عامل خدمة كما تفعل النسخة المنشورة
out.registered = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.register('/dev-sw.js')
  await navigator.serviceWorker.ready
  return { scope: reg.scope, hasPushManager: 'PushManager' in window, state: reg.active?.state ?? reg.installing?.state }
})
await p.goto('http://127.0.0.1:5173/it', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
// main.tsx في وضع التطوير يُلغي أي SW — نسجّله الآن يدويًا كما تفعل النسخة المنشورة، بلا إعادة تحميل
out.afterDevCleanup = await p.evaluate(async () => {
  const before = (await navigator.serviceWorker.getRegistrations()).length
  await navigator.serviceWorker.register('/dev-sw.js')
  await navigator.serviceWorker.ready
  const after = (await navigator.serviceWorker.getRegistrations()).length
  return { before, after }
})
await p.waitForTimeout(1200)
await p.locator('button[aria-label^="الإشعارات"]').first().click({ force: true })
await p.waitForTimeout(4000)
out.noWorkerMsg = await p.locator('[data-testid="push-banner-no-worker"]').count()
out.banner = await p.locator('[data-testid="push-enable-banner"]').count()
out.button = await p.locator('[data-testid="push-enable-now"]').count()
if (out.button) {
  await p.locator('[data-testid="push-enable-now"]').click()
  await p.waitForTimeout(4000)
  out.toastAfterClick = (await p.locator('div[aria-live="polite"]').innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 200)
  out.permissionNow = await p.evaluate(() => Notification.permission)
}
await p.screenshot({ path: '/home/user/shots/push-worker-path.png' })
console.log(JSON.stringify(out, null, 1))
await b.close()
