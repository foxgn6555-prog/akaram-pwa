import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()

// ① الزائر: صفحة المواطن (دوال citizen_* بدور anon)
{
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  const bad = []
  p.on('response', (r) => { if (r.status() >= 400 && /rpc\/citizen|rest\/v1/.test(r.url())) bad.push(r.status() + ' ' + r.url().split('/rest/v1/')[1]?.slice(0, 30)) })
  await p.goto(B + '/citizen', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(5000)
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160))
  console.log('ANON /citizen =>', JSON.stringify({ bad: bad.slice(0, 3), textLen: txt.length, text: txt.slice(0, 90) }))
  await ctx.close()
}

// ② حسابات: صفحات تعتمد على RPC كثيفة + سياسات RLS
const cases = [
  ['hr@akram.iq', ['/hr/attendance', '/hr/employees', '/hr/leaves']],
  ['fin@akram.iq', ['/finance/payroll', '/finance/contractor-wages']],
  ['imad@akram.iq', ['/ops-room', '/ops-room/disclosures']],
  ['admin@akram.iq', ['/it/devops/status', '/it/user-management/list']],
  ['jasem@akram.iq', ['/deputy/overtime']],
]
for (const [email, paths] of cases) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-IQ' })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)) })
  p.on('response', (r) => { if (r.status() === 403 || r.status() === 500) errs.push(r.status() + ' ' + r.url().slice(-40)) })
  try {
    await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(700)
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', '123456789k')
    await p.click('button[type=submit]')
    await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
    for (const path of paths) {
      await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
      const st = await p.evaluate(() => ({ len: document.body.innerText.length, main: !!document.querySelector('main, [data-testid="app-main"]') }))
      console.log(`  ${email} ${path} => len=${st.len} main=${st.main}`)
    }
    console.log(`  ${email} errors=${errs.length}`, errs.slice(0, 2))
  } catch (e) { console.log('  FAIL', email, String(e).slice(0, 80)) }
  await ctx.close()
}
await b.close()
