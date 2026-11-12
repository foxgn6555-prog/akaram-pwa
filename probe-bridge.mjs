import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-web-security','--disable-site-isolation-trials'] })
const p = await (await b.newContext()).newPage()
await p.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2000)
await p.fill('input[type="email"]','admin@akram.iq'); await p.fill('input[type="password"]','123456789k')
await p.click('button[type="submit"]'); await p.waitForTimeout(7000)
const out = await p.evaluate(async () => {
  const res = {}
  const raw = localStorage.getItem('sb-rzpitdsuwgprzfvrlkdn-auth-token')
  let token = null
  try { token = JSON.parse(raw)?.access_token } catch { }
  if (!token) { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) { try { token = JSON.parse(localStorage.getItem(k))?.access_token } catch { } } }
  res.hasToken = !!token
  const call = async (body) => {
    const r = await fetch('https://rzpitdsuwgprzfvrlkdn.supabase.co/functions/v1/gps-warehouse', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: 'sb_publishable_MpVDKh80D0H1J5Q6v83-hQ_mIT-A9jn' }, body: JSON.stringify(body)
    })
    return { status: r.status, body: (await r.text()).slice(0, 300) }
  }
  res.hotspots_status = await call({ action: 'hotspots_status' })
  res.set_radius_dry = await call({ action: 'set_hotspot_radius', radius_m: 40, rebuild: false }) // نفس القيمة = لا تغيير
  return res
})
console.log(JSON.stringify(out, null, 2))
await b.close()
