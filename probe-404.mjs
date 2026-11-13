import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()

// ١) زائر غير مسجّل
const anon = await b.newContext({ viewport: { width: 1280, height: 900 } })
const pa = await anon.newPage()
await pa.goto(B + '/xyz-not-a-page', { waitUntil: 'domcontentloaded' })
await pa.waitForTimeout(2500)
console.log('ANON', JSON.stringify({ url: pa.url().replace(B, ''), path: await pa.evaluate(() => location.pathname) }))
await anon.close()

// ٢) مستخدم مسجّل
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900)
await p.fill('input[type=email]', 'garage@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
await p.waitForTimeout(1200)

const check = async (path) => {
  await p.goto(B + path, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3000)
  return p.evaluate(() => {
    const nf = document.querySelector('[data-testid="not-found-page"]')
    const nav = document.querySelectorAll('nav a').length
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? null
    const shown = nf?.querySelector('[dir="ltr"]')?.textContent?.trim() ?? null
    return { path: location.pathname, hasNav: nav > 0, navLinks: nav, h1, showsPath: shown, homeBtn: !!document.querySelector('[data-testid="not-found-home"]'), bodyText: document.body.innerText.length }
  })
}
console.log('IN-SESSION unknown :', JSON.stringify(await check('/central-garage/zzz-not-a-page')))
console.log('IN-SESSION deep    :', JSON.stringify(await check('/central-garage/vehicles-database/does-not-exist')))
console.log('ROOT unknown       :', JSON.stringify(await check('/zzz-top-level')))
console.log('VALID page (بدون تراجع):', JSON.stringify(await check('/central-garage/vehicles-database')))

// زر العودة
await p.goto(B + '/central-garage/zzz-not-a-page', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
await p.click('[data-testid="not-found-home"]'); await p.waitForTimeout(2000)
console.log('after home click ->', await p.evaluate(() => location.pathname))
await b.close()
