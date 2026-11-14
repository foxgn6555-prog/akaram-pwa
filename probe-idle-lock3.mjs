import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()
async function run(email, path) {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  await p.clock.install({ time: new Date('2026-11-10T09:00:00') })
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600)
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', '123456789k')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
  await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  await p.clock.fastForward(29 * 60_000 + 30_000); await p.waitForTimeout(400)
  const warn = await p.evaluate(() => !!document.querySelector('[data-testid="session-idle-warning"]'))
  await p.clock.fastForward(31 * 60_000); await p.waitForTimeout(1500)
  const after = await p.evaluate(() => ({ path: location.pathname, login: !!document.querySelector('input[type=password]') }))
  await ctx.close()
  return { email, path, warning: warn, after }
}
console.log(JSON.stringify(await run('nn@akram.iq', '/admin')))
console.log(JSON.stringify(await run('garage@akram.iq', '/central-garage')))
console.log(JSON.stringify(await run('hr@akram.iq', '/hr')))
await b.close()
