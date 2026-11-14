import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const URL = '/it/user-management/696cd792-ea86-4335-84a1-7315ec8baf29'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800)
await p.fill('input[type=email]', 'admin@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
await p.goto(B + URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000)
const btn = p.locator('[data-testid="reset-password-btn"]')
const has = await btn.count()
let out = { hasButton: has > 0 }
if (has) {
  out.empty = await btn.isDisabled()
  await p.fill('[data-testid="new-password"]', 'Abc123456'); await p.waitForTimeout(250)
  out.nine = await btn.isDisabled()
  await p.fill('[data-testid="new-password"]', 'Abc1234567k'); await p.waitForTimeout(250)
  out.ten = await btn.isDisabled()
  out.hint = (await p.evaluate(() => document.body.innerText.match(/\((\d+) أحرف فأكثر[^)]*\)/)?.[0])) ?? null
  out.noPhone = await p.evaluate(() => document.body.innerText.includes('لا يوجد رقم هاتف مسجل'))
}
console.log(JSON.stringify(out))
await b.close()
