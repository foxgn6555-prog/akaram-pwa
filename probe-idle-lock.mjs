import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()

async function run(email, portalPath, idle) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 90)) })
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(800)
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', '123456789k')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
  await p.goto(B + portalPath, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000)
  const before = { path: p.url().replace(B, ''), textLen: (await p.evaluate(() => document.body.innerText.length)) }
  let out = { before, idle, consoleErrors: errs.length }
  if (idle) {
    await p.clock.install({ time: new Date() })
    await p.clock.fastForward('29:20')   // ٢٩:٢٠ ⇒ نافذة التحذير
    await p.waitForTimeout(800)
    out.warningVisible = await p.evaluate(() => !!document.querySelector('[data-testid="session-idle-warning"]'))
    out.warningText = await p.evaluate(() => document.querySelector('[data-testid="session-idle-warning"]')?.innerText.replace(/\s+/g, ' ').slice(0, 60) ?? null)
    if (out.warningVisible) await p.screenshot({ path: `/home/user/فحص-قبل-الإطلاق-بيانات/قفل-الخمول-${portalPath.replace(/\W+/g, '-')}.png` })
    await p.clock.fastForward('01:10')   // تجاوز ٣٠ دقيقة
    await p.waitForTimeout(2500)
    out.afterIdlePath = await p.evaluate(() => location.pathname)
    out.onLoginForm = await p.evaluate(() => !!document.querySelector('input[type=password]'))
  }
  await ctx.close()
  return out
}
console.log('FINANCE  ', JSON.stringify(await run('fin@akram.iq', '/finance', true)))
console.log('ADMIN    ', JSON.stringify(await run('nn@akram.iq', '/admin', true)))
console.log('GARAGE(لا قفل)', JSON.stringify(await run('garage@akram.iq', '/central-garage', true)))
await b.close()
