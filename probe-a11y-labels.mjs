import { chromium } from 'playwright'
import fs from 'node:fs'
const B = 'http://localhost:5173'
const targets = {
  'hr@akram.iq': ['/hr/attendance', '/hr/attendance-monthly', '/hr/leaves'],
  'ms1@akram.iq': ['/manager/photos'],
  'fin@akram.iq': ['/finance/contractor-wages'],
  'admin@akram.iq': ['/it/integrations/auto-deductions'],
  'admops@akram.iq': ['/admin-ops/contractors', '/admin-ops/disclosures'],
  'adm@akram.iq': ['/maintenance/vehicle-cases'],
  'ss@akram.iq': ['/transfer-station/carrier', '/transfer-station/disclosures', '/transfer-station/saksat', '/transfer-station/trips'],
  'exec@akram.iq': ['/executive/attendance-edits'],
  'jasem@akram.iq': ['/deputy/attendance-edits', '/deputy/overtime'],
  'imad@akram.iq': ['/ops-room/contractor-headcounts', '/ops-room/disclosures'],
  'garage@akram.iq': ['/central-garage/disclosures'],
  'follow@akram.iq': ['/follow-up/workers'],
}
const COLLECT = () => {
  const out = []
  const labelled = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return true
    if (el.getAttribute('aria-labelledby')) return true
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true
    if (el.closest('label')) return true
    if (el.getAttribute('title')?.trim()) return true
    return false
  }
  for (const el of document.querySelectorAll('input,select,textarea')) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase()
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) continue
    if (labelled(el)) continue
    const box = el.getBoundingClientRect()
    out.push({
      tag: el.tagName.toLowerCase(), type,
      testid: el.getAttribute('data-testid'), name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'), id: el.id || null,
      cls: (el.getAttribute('class') || '').slice(0, 80),
      parentText: (el.parentElement?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
      hidden: box.width === 0 && box.height === 0,
    })
  }
  return out
}
const b = await chromium.launch()
const results = []
for (const [email, paths] of Object.entries(targets)) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  try {
    await p.goto(B + '/login', { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(700)
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', '123456789k')
    await p.click('button[type=submit]')
    await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
    for (const path of paths) {
      await p.goto(B + path, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(4500)
      const found = await p.evaluate(COLLECT)
      results.push({ email, path, found })
    }
  } catch (e) {
    results.push({ email, error: String(e).slice(0, 120) })
  }
  await ctx.close()
}
fs.writeFileSync('/home/user/فحص-قبل-الإطلاق-بيانات/حقول-بلا-تسمية.json', JSON.stringify(results, null, 1))
console.log(JSON.stringify(results.map((r) => ({ path: r.path, n: r.found?.length, err: r.error })), null, 1))
await b.close()
