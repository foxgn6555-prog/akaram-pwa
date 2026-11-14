import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800)
await p.fill('input[type=email]', 'admin@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
await p.waitForTimeout(1200)

// ① إنشاء مستخدم — نص التلميح
await p.goto(B + '/it/user-management/create', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
const createHint = await p.evaluate(() => {
  const t = document.body.innerText
  const m = t.match(/(\d+) أحرف فأكثر[^\n]*/)
  return m ? m[0] : null
})
console.log('CREATE hint:', createHint)

// ② دعم الدخول — التلميح وminLength
await p.goto(B + '/it/login-support', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000)
const support = await p.evaluate(() => {
  const tabs = [...document.querySelectorAll('button')].map((b) => b.innerText.trim())
  return { tabs: tabs.filter((t) => t.length < 25).slice(0, 12) }
})
console.log('SUPPORT tabs:', JSON.stringify(support))

// ③ بطاقة مستخدم — زر إعادة الضبط
await p.goto(B + '/it/user-management/list', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
const firstUser = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/it/user-management/"]')].find((x) => /[0-9a-f]{8}-/.test(x.getAttribute('href')))
  return a ? a.getAttribute('href') : null
})
console.log('first user link:', firstUser)
if (firstUser) {
  await p.goto(B + firstUser, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
  const btn = p.locator('[data-testid="reset-password-btn"]')
  const before = await btn.isDisabled()
  await p.fill('[data-testid="new-password"]', 'Abc123456')   // ٩
  await p.waitForTimeout(300)
  const nine = await btn.isDisabled()
  await p.fill('[data-testid="new-password"]', 'Abc1234567k') // ١٠
  await p.waitForTimeout(300)
  const ten = await btn.isDisabled()
  const hint = await p.evaluate(() => (document.body.innerText.match(/\((\d+) أحرف فأكثر[^)]*\)/) ?? [null])[0])
  const phoneBlocked = await p.evaluate(() => document.body.innerText.includes('لا يوجد رقم هاتف مسجل'))
  console.log('RESET btn disabled → empty:', before, '| 9 chars:', nine, '| 10 chars:', ten, '| hint:', hint, '| no-phone:', phoneBlocked)
}
await b.close()
