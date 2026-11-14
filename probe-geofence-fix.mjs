import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const CASES = [
  { email: 'jasem@akram.iq', role: 'deputy_director', path: '/deputy/stop-hotspots', expect: 'allow' },
  { email: 'exec@akram.iq', role: 'executive_director', path: '/executive/stop-hotspots', expect: 'allow' },
  { email: 'imad@akram.iq', role: 'ops_room', path: '/ops-room/waste-map', expect: 'allow' },
  { email: 'emp@akram.iq', role: 'employee', path: null, expect: 'deny' },
]
const b = await chromium.launch()
const out = []
for (const c of CASES) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  const rpc = []
  p.on('response', async (r) => { if (r.url().includes('gps_lvn_map_geofences')) rpc.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 90) }) })
  await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  await p.fill('input[type=email]', c.email); await p.fill('input[type=password]', '123456789k')
  await p.click('button[type=submit]')
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await p.waitForTimeout(1500)
  let pageInfo = null
  if (c.path) {
    await p.goto(B + c.path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000)
    pageInfo = await p.evaluate(() => ({
      warn: !!document.querySelector('[data-testid="waste-map-geofences-error"]'),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    }))
  } else {
    // دور غير مخوّل: ننادي الدالة مباشرة من جلسة المتصفح
    const res = await p.evaluate(async () => {
      const raw = Object.entries(localStorage).find(([k]) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      const token = raw ? JSON.parse(raw[1]).access_token : null
      if (!token) return { error: 'no token' }
      const url = 'https://rzpitdsuwgprzfvrlkdn.supabase.co/rest/v1/rpc/gps_lvn_map_geofences'
      const k = JSON.parse(raw[1]).access_token
      const supabaseUrl = window.__SUPA_URL || null
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}`, apikey: k }, body: '{}' })
      return { status: r.status, body: (await r.text()).slice(0, 90) }
    }).catch((e) => ({ error: String(e).slice(0, 80) }))
    pageInfo = { direct: res }
  }
  out.push({ ...c, rpc, pageInfo })
  console.log(JSON.stringify({ email: c.email, role: c.role, rpc, pageInfo }))
  await ctx.close()
}
await b.close()
