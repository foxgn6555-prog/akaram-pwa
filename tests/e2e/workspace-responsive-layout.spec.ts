import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Isolated visual-layout test: representative table markup, real shared CSS.
// The business workflows are covered separately by the React unit tests.
const css = readFileSync(resolve(process.cwd(), 'src/portals/shared/workspace-refresh.css'), 'utf8')
const records = [
  ['حضور الموظف', 'سجلات الحضور'],
  ['مراجعة الموظف', 'الاستقطاعات'],
  ['راتب الموظف', 'كشف الرواتب'],
] as const

for (const width of [360, 768, 1024, 1440]) {
  test(`تنسيق السجلات على عرض ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.setContent(`<html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${css}</style></head><body style="margin:0"><main class="workspace-refresh" style="padding:12px">${records.map(([name, section]) => `
      <section class="workspace-card"><div class="workspace-card-head"><h2>${section}</h2></div>
      <div class="workspace-table-region"><table class="workspace-records" style="min-width:920px"><thead><tr><th>الموظف</th><th>القيمة</th><th>الإجراءات</th></tr></thead>
      <tbody><tr class="workspace-record"><td class="workspace-primary" data-label="الموظف">${name}</td><td data-label="القيمة">125,000</td><td class="workspace-actions" data-label="الإجراءات"><button type="button">تفاصيل</button></td></tr></tbody></table></div></section>`).join('')}</main></body></html>`)
    const row = page.locator('.workspace-record').first()
    await expect(row).toHaveCSS('display', width < 1024 ? 'grid' : 'table-row')
    await expect(page.locator('.workspace-record')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'تفاصيل' })).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const tableWidth = await page.locator('.workspace-records').first().evaluate((el) => el.getBoundingClientRect().width)
    if (width < 1024) expect(tableWidth).toBeLessThan(width)
    else expect(tableWidth).toBeGreaterThanOrEqual(920)
  })
}
