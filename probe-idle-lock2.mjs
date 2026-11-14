import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
const errs = []
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 90)) })

await p.clock.install({ time: new Date('2026-11-10T09:00:00') })
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(600)
await p.fill('input[type=email]', 'fin@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
await p.waitForTimeout(2500)
console.log('landed at', await p.evaluate(() => location.pathname))

// ٢٩:٢٠ خمول ⇒ نافذة التحذير
await p.clock.fastForward(29 * 60_000 + 20_000)
await p.waitForTimeout(500)
let warn = await p.evaluate(() => {
  const n = document.querySelector('[data-testid="session-idle-warning"]')
  return n ? n.innerText.replace(/\s+/g, ' ').slice(0, 70) : null
})
console.log('warning @29:20 =>', warn)
if (warn) await p.screenshot({ path: '/home/user/فحص-قبل-الإطلاق-بيانات/قفل-الخمول-المالية.png' })

// «أنا هنا» تُصفّر
await p.click('[data-testid="session-idle-keep"]')
await p.waitForTimeout(300)
await p.clock.fastForward(10 * 60_000)
await p.waitForTimeout(500)
console.log('after "أنا هنا" +10min =>', await p.evaluate(() => ({ path: location.pathname, banner: !!document.querySelector('[data-testid="session-idle-warning"]') })))

// تجاوز المهلة بلا نشاط ⇒ خروج
await p.clock.fastForward(31 * 60_000)
await p.waitForTimeout(1500)
console.log('after idle 31min =>', await p.evaluate(() => ({ path: location.pathname, loginForm: !!document.querySelector('input[type=password]') })))
console.log('consoleErrors', errs.length, errs.slice(0, 2))
await b.close()
