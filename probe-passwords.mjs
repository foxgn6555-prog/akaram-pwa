import { chromium } from 'playwright'
const B = process.env.AUDIT_BASE ?? 'http://localhost:5173'
const EMAILS = ['admin@akram.iq','nn@akram.iq','siaf@akram.iq','jasem@akram.iq','exec@akram.iq','hr@akram.iq','ms1@akram.iq','fin@akram.iq','garage@akram.iq','comp@akram.iq','media@akram.iq','follow@akram.iq','emp@akram.iq','field@akram.iq','admops@akram.iq','adm@akram.iq','ss@akram.iq','imad@akram.iq']
const PWS = ['1234567890','123456789k']
const b = await chromium.launch(); const out = {}
for (const email of EMAILS) {
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, locale:'ar-IQ' })
  const p = await ctx.newPage(); let found = null, landing = null
  for (const pw of PWS) {
    await p.goto(B+'/login', {waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw)
    await p.click('button[type=submit]').catch(()=>{})
    await p.waitForTimeout(4500)
    if (!/\/login/.test(p.url())) { found = pw; landing = p.url().replace(B,''); break }
    const t = await p.evaluate(()=>document.body.innerText)
    if (/مقفل|محاولات كثيرة/.test(t)) { found = 'LOCKED'; break }
  }
  out[email] = { pw: found, landing }
  console.log(email.padEnd(20), found ?? 'FAIL', landing ?? '')
  await ctx.close(); await new Promise(r=>setTimeout(r,1500))
}
await b.close(); console.log(JSON.stringify(out))
