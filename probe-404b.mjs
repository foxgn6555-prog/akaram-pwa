import { chromium } from 'playwright'
const B = 'http://localhost:5173'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, locale: 'ar-IQ' })
const p = await ctx.newPage()
await p.goto(B + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900)
await p.fill('input[type=email]', 'garage@akram.iq'); await p.fill('input[type=password]', '123456789k')
await p.click('button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 25000 })
await p.waitForTimeout(1500)

await p.goto(B + '/central-garage/zzz-not-a-page', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-testid="not-found-page"]', { timeout: 15000 })
await p.waitForTimeout(1200)
const info = await p.evaluate(() => {
  const nf = document.querySelector('[data-testid="not-found-page"]')
  const aside = document.querySelector('aside, [class*="sidebar"], [data-testid*="shell"], header')
  return {
    path: location.pathname,
    showsPath: nf?.querySelector('[dir="ltr"]')?.textContent?.trim(),
    insideShell: !!document.querySelector('aside') || document.body.innerText.includes('الانطلاقية'),
    sidebarVisible: !!document.querySelector('aside')?.getBoundingClientRect().width,
    headerText: document.querySelector('header')?.innerText?.replace(/\s+/g, ' ').slice(0, 60) ?? null,
    pageText: nf?.innerText.replace(/\s+/g, ' ').slice(0, 220),
  }
})
console.log('IN-SESSION:', JSON.stringify(info, null, 1))
await p.screenshot({ path: '/home/user/فحص-قبل-الإطلاق-بيانات/404-داخل-البوابة.png' })
await p.click('[data-testid="not-found-home"]')
await p.waitForTimeout(2500)
console.log('after home click ->', await p.evaluate(() => location.pathname))
await b.close()
