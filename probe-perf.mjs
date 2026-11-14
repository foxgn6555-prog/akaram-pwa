/** قياس أداء خريطة النفايات: زمن الحمولة، حجمها، عدد العلامات، وزمن أول رسم */
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-web-security','--disable-site-isolation-trials'] })
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
const p = await ctx.newPage()
const net = []
p.on('response', async (r) => {
  const u = r.url()
  if (u.includes('rpc/gps_hotspots') || u.includes('/rest/v1/')) {
    const len = Number(r.headers()['content-length'] || 0)
    let body = 0
    try { body = (await r.body()).length } catch {}
    net.push({ url: u.split('/rest/v1/')[1]?.slice(0, 40), status: r.status(), len, body })
  }
})
await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
await p.fill('input[type="email"]','admin@akram.iq'); await p.fill('input[type="password"]','123456789k')
await p.click('button[type="submit"]'); await p.waitForTimeout(6000)
const t0 = performance.now()
await p.goto('http://127.0.0.1:5173/ops-room/waste-map', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-testid="waste-map-counter"]', { timeout: 60000 })
const tCounter = Math.round(performance.now() - t0)
await p.waitForTimeout(4000)
const markers = await p.locator('.leaflet-marker-icon, .leaflet-interactive').count()
const nodes = await p.evaluate(() => document.querySelectorAll('*').length)
const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null)
const t = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const paint = performance.getEntriesByType('paint').map(x=>`${x.name}=${Math.round(x.startTime)}`); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), paint } })
console.log(JSON.stringify({ tCounterMs: tCounter, markers, domNodes: nodes, heapMB: heap, nav: t, calls: net }, null, 1))
await p.screenshot({ path: '/home/user/shots/perf-waste-map.png' })
await b.close()
