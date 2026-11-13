// probe6 — فحص تفاعلي: أنماط تقرير الوقود الأربعة + التصدير + الموافقات + الجرس
import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true })
await ctx.route('**/*.supabase.co/**', async route => {
  const req = route.request()
  try {
    const h = { ...req.headers() }
    for (const k of ['origin', 'referer', 'host', 'content-length']) delete h[k]
    const res = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined })
    const b = Buffer.from(await res.arrayBuffer())
    const hd = {}
    res.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) hd[k] = v })
    hd['access-control-allow-origin'] = '*'
    await route.fulfill({ status: res.status, headers: hd, body: b })
  } catch { await route.abort() }
})
const page = await ctx.newPage()
const errs = [], failed = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().replace(/\s+/g, ' ').slice(0, 200)) })
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)))
page.on('response', async r => {
  if (r.url().includes('supabase.co') && r.status() >= 400) { const t = await r.text().catch(() => ''); failed.push(`${r.status()} ${r.url().split('/').pop()} :: ${t.slice(0, 160)}`) }
})
const clean = s => (s || '').replace(/\s+/g, ' ').trim()
const step = async (label, fn) => {
  const before = errs.length, beforeF = failed.length
  let note = ''
  try { note = (await fn()) || '' } catch (e) { note = 'EXC: ' + String(e).slice(0, 120) }
  await page.waitForTimeout(1500)
  const newE = errs.slice(before), newF = failed.slice(beforeF)
  console.log(`${newE.length || newF.length ? '❌' : '✅'} ${label}${note ? ' — ' + note : ''}`)
  if (newE.length) console.log('   console:', [...new Set(newE)].slice(0, 3).join(' ⏐ '))
  if (newF.length) console.log('   net:', [...new Set(newF)].slice(0, 3).join(' ⏐ '))
}

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
await page.fill('input[type="email"], input[name="email"]', 'siaf@akram.iq')
await page.fill('input[type="password"]', '123456789k')
await page.click('button[type="submit"]'); await page.waitForTimeout(9000)

console.log('\n########## تقارير الوقود ##########')
await page.goto(`${BASE}/ops-room-manager/fuel-reports`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000)

for (const mode of ['تقرير شامل', 'تقرير آلية واحدة', 'آليات محددة', 'حركات المخزون']) {
  await step(`نمط «${mode}»`, async () => {
    const b = page.getByRole('button', { name: mode, exact: false }).first()
    if (!(await b.count())) return 'الزر غير موجود'
    await b.click(); await page.waitForTimeout(2500)
    const rows = await page.locator('table tbody tr').count()
    return `صفوف الجدول: ${rows}`
  })
}

// اختيار آلية بعد 00403
await step('تقرير آلية واحدة + اختيار آلية', async () => {
  await page.getByRole('button', { name: 'تقرير آلية واحدة', exact: false }).first().click(); await page.waitForTimeout(1500)
  const combo = page.locator('select, [role="combobox"], input[list]').first()
  if (!(await combo.count())) return 'لا يوجد منتقي آليات'
  const opts = await combo.locator('option').allInnerTexts().catch(() => [])
  if (opts.length > 1) { await combo.selectOption({ index: 1 }).catch(() => {}); await page.waitForTimeout(3000); return `آليات: ${opts.length - 1}` }
  await combo.click(); await page.waitForTimeout(1500)
  const items = await page.locator('[role="option"]').count()
  if (items) await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(3000)
  return `عناصر القائمة: ${items}`
})

for (const exp of ['CSV', 'Excel', 'طباعة']) {
  await step(`تصدير/إخراج «${exp}»`, async () => {
    const b = page.getByRole('button', { name: exp, exact: false }).first()
    if (!(await b.count())) return 'الزر غير موجود'
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), b.click()])
    await page.waitForTimeout(2000)
    return dl ? `تنزيل: ${dl.suggestedFilename()}` : 'بلا تنزيل (طباعة/نافذة)'
  })
}

await step('فلتر «من / إلى» (تغيير التاريخ)', async () => {
  const d = page.locator('input[type="date"]')
  if (!(await d.count())) return 'لا يوجد حقل تاريخ'
  await d.first().fill('2026-11-01'); await page.waitForTimeout(3000); return 'تم'
})

console.log('\n########## الموافقات ##########')
await page.goto(`${BASE}/ops-room-manager/approvals`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000)
await step('زر «تفويض موافقاتي أثناء غيابي» يفتح النافذة', async () => {
  const b = page.getByRole('button', { name: /تفويض/ }).first()
  if (!(await b.count())) return 'الزر غير موجود'
  await b.click(); await page.waitForTimeout(2500)
  const dlg = await page.locator('[role="dialog"]').count()
  const txt = clean(await page.locator('[role="dialog"]').first().innerText().catch(() => ''))
  if (dlg) await page.keyboard.press('Escape')
  return dlg ? `نافذة مفتوحة: ${txt.slice(0, 90)}` : 'لم تُفتح نافذة'
})

console.log('\n########## الرئيسية + الجرس ##########')
await page.goto(`${BASE}/ops-room-manager`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000)
await step('زر «فتح الموافقات» من الرئيسية', async () => {
  const b = page.getByRole('button', { name: /فتح الموافقات/ }).first().or(page.getByRole('link', { name: /فتح الموافقات/ }).first())
  if (!(await b.count())) return 'الزر غير موجود'
  await b.click(); await page.waitForTimeout(4000)
  return 'المسار: ' + new URL(page.url()).pathname
})
await step('فتح الجرس', async () => {
  const bell = page.locator('button[aria-label*="إشعار"], button[aria-label*="تنبيه"]').first()
  if (!(await bell.count())) return 'لا زر'
  await bell.click(); await page.waitForTimeout(3000)
  const panel = page.locator('[role="dialog"], [data-radix-popper-content-wrapper], aside').first()
  const t = clean(await panel.innerText().catch(() => ''))
  return t.slice(0, 160) || 'فارغ'
})

console.log('\n--- كل أخطاء الكونسول (بعد استبعاد HMR) ---')
console.log([...new Set(errs)].filter(t => !/WebSocket|\[vite\]|Outdated Optimize Dep/.test(t)).join('\n') || '(لا شيء)')
console.log('\n--- كل النداءات الفاشلة ---')
console.log([...new Set(failed)].join('\n') || '(لا شيء)')
await browser.close()
