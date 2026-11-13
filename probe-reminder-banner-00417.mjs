import { chromium } from 'playwright'

const B = 'http://localhost:5173'
const b = await chromium.launch()

async function login(ctx, email) {
  const p = await ctx.newPage()
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('input[type=email]', { timeout: 15000 })
  await p.fill('input[type=email]', email)
  await p.fill('input[type=password]', '123456789k')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(5000)
  return p
}

// ① المدير المفوض (nn@) — وصلته تقرير النشاط غير المقروء ⇒ يجب أن يظهر banner
const ctx1 = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
const p1 = await login(ctx1, 'nn@akram.iq')
const url1 = p1.url()
const banner1 = await p1.locator('[data-testid="activity-reminder-banner"]').count()
const bannerText = banner1 ? await p1.locator('[data-testid="activity-reminder-banner"]').innerText() : ''
console.log('nn@ akram.iq ->', url1)
console.log('  banner present:', banner1)
console.log('  banner text:', bannerText.replace(/\s+/g, ' ').slice(0, 120))

// ② إخفاء التذكير يقرئه
if (banner1) {
  await p1.locator('[data-testid="activity-reminder-banner"] button').click()
  await p1.waitForTimeout(1500)
  const after = await p1.locator('[data-testid="activity-reminder-banner"]').count()
  console.log('  بعد الإخفاء — banner زال:', after === 0)
}

// ③ مستخدم بلا تذكير أمني (hr@) — لا يظهر banner
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
const p2 = await login(ctx2, 'hr@akram.iq')
const banner2 = await p2.locator('[data-testid="activity-reminder-banner"]').count()
console.log('hr@ akram.iq ->', p2.url(), '| banner present:', banner2)

await b.close()
