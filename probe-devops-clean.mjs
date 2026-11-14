import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
const errs = [], http = [], reqs = []
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 110)) })
p.on('response', (r) => { if (r.status() >= 400 && !/favicon|hot-update/.test(r.url())) http.push(r.status() + ' ' + r.url().split('/functions/v1/')[1]?.slice(0, 30)) })
p.on('request', (r) => { if (r.url().includes('/functions/v1/')) reqs.push(r.url().split('/functions/v1/')[1]?.slice(0, 30)) })
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
await p.fill('input[type=email]', 'admin@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
await p.waitForTimeout(1500)
errs.length = 0; http.length = 0; reqs.length = 0
await p.goto(B + '/it/devops/status', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(8000)
const grid = await p.evaluate(() => {
  const g = document.querySelector('[data-testid="edge-grid"]')
  if (!g) return null
  return [...g.querySelectorAll('[data-testid^="edge-"]')].map((n) => ({
    id: n.getAttribute('data-testid'),
    text: (n.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
  }))
})
const summary = await p.evaluate(() => document.querySelector('[data-testid="edge-summary"]')?.textContent ?? null)
console.log(JSON.stringify({ consoleErrors: errs, http4xx: http, probed: [...new Set(reqs)].sort(), summary, cards: grid?.length, gpsReceiver: grid?.find(c => c.id.includes('gps-receiver')), webhooks: grid?.find(c => c.id.includes('webhooks')) }, null, 1))
await b.close()
