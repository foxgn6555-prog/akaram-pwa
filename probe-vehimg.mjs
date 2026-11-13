import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
await p.fill('input[type=email]', 'garage@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
await p.waitForTimeout(1200)
console.log('after login:', await p.evaluate(() => location.pathname))
for (const path of ['/central-garage/drivers-dispatch', '/central-garage/vehicles-database']) {
  await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000)
  const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map((i) => ({
    src: (i.getAttribute('src') || '').slice(0, 60),
    hasSrc: !!i.getAttribute('src'),
    nw: i.naturalWidth, nh: i.naturalHeight,
  })))
  const rows = await p.evaluate(() => document.querySelectorAll('[data-testid^="dispatch-row-"]').length)
  console.log(path, 'rows=', rows, JSON.stringify(imgs, null, 1))
}
await b.close()
