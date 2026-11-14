import { chromium } from 'playwright'
const ANON = process.env.ANON
const B = 'http://localhost:5173'
const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'ar-IQ' }); const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
await p.fill('input[type=email]', 'emp@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
await p.waitForTimeout(1500)
const res = await p.evaluate(async (anon) => {
  const raw = Object.entries(localStorage).find(([k]) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  const tok = raw ? JSON.parse(raw[1]).access_token : null
  const r = await fetch('https://rzpitdsuwgprzfvrlkdn.supabase.co/rest/v1/rpc/gps_lvn_map_geofences', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, apikey: anon }, body: '{}' })
  return { status: r.status, body: (await r.text()).slice(0, 80) }
}, ANON)
console.log('employee →', JSON.stringify(res))
await b.close()
