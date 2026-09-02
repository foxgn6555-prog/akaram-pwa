/**
 * ⚑ E2E — Portal Navigation (نمط Kyvzon)
 * يختبر: التنقل بين الوحدات · البحث السريع · طي الشريط
 */
import { test, expect } from '@playwright/test'

const IT_EMAIL = process.env.E2E_IT_EMAIL
const IT_PASSWORD = process.env.E2E_IT_PASSWORD

test.describe('Portal Navigation', () => {
  test.skip(!IT_EMAIL || !IT_PASSWORD, 'متغيرات IT غير مضبوطة')

  test('البحث السريع يجد صفحات', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('البريد الإلكتروني').fill(IT_EMAIL!)
    await page.getByLabel('كلمة المرور').fill(IT_PASSWORD!)
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click()
    await expect(page).toHaveURL(/\/it/)

    // البحث السريع
    await page.getByRole('button', { name: /بحث سريع/ }).click()
    await page.getByPlaceholder('ابحث عن صفحة…').fill('الأرشيف')
    await expect(page.getByText('الأرشيف')).toBeVisible()
  })

  test('التحية تتغير حسب الوقت', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('البريد الإلكتروني').fill(IT_EMAIL!)
    await page.getByLabel('كلمة المرور').fill(IT_PASSWORD!)
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click()
    await expect(page).toHaveURL(/\/it/)

    // تحية موجودة (صباح/مساء/ليل — أي واحدة)
    const greeting = page.locator('text=/صباح الخير|مساء الخير|مساء النور|ليلة طيبة/')
    await expect(greeting.first()).toBeVisible()
  })

  test('طي وتوسيع الشريط الجانبي', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('البريد الإلكتروني').fill(IT_EMAIL!)
    await page.getByLabel('كلمة المرور').fill(IT_PASSWORD!)
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click()
    await expect(page).toHaveURL(/\/it/)

    const sidebar = page.getByTestId('app-sidebar')
    const toggle = page.getByTestId('sidebar-collapse')
    await toggle.click()
    await expect(sidebar).toHaveClass(/w-20/)
    await expect(sidebar).not.toHaveClass(/w-72/)
    await toggle.click()
    await expect(sidebar).toHaveClass(/w-72/)
    await expect(sidebar).not.toHaveClass(/w-20/)
  })
})
