import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const cases = [['jasem@akram.iq', '/deputy/stop-hotspots'], ['exec@akram.iq', '/executive/stop-hotspots']]
const b = await chromium.launch()
for (const [email, path] of cases) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  const errs = [], http = []
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
  p.on('response', (r) => { if (r.status() >= 400 && !/favicon|hot-update/.test(r.url())) http.push(r.status() + ' ' + r.url().slice(-60)) })
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', '123456789k')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await p.waitForTimeout(1500)
  errs.length = 0; http.length = 0
  await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000)
  const warn = await p.evaluate(() => !!document.querySelector('[data-testid="waste-map-geofences-error"]'))
  console.log(`${email.padEnd(18)} ${path.padEnd(28)} console_errors=${errs.length} http_4xx=${http.length} تحذير_الحدود=${warn ? 'ظاهر ❌' : 'غير موجود ✅'}`)
  if (errs.length) console.log('   ', errs.slice(0, 2))
  if (http.length) console.log('   ', http.slice(0, 2))
  await ctx.close()
}
await b.close()
