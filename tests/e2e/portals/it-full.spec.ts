/**
 * E2E البوابة التقنية — الرحلة الكاملة عبر كل الوحدات السبع
 * يتطلب حساب it_admin: E2E_IT_EMAIL / E2E_IT_PASSWORD
 */
import { test, expect } from '@playwright/test'

const IT_EMAIL = process.env.E2E_IT_EMAIL
const IT_PASSWORD = process.env.E2E_IT_PASSWORD

import type { Page } from '@playwright/test'

async function loginAsIT(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(IT_EMAIL as string)
  await page.getByTestId('login-password').fill(IT_PASSWORD as string)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/it/, { timeout: 15_000 })
}

test.describe('البوابة التقنية — الرحلة الكاملة', () => {
  test.skip(!IT_EMAIL || !IT_PASSWORD, 'متغيرات حساب IT غير مضبوطة')

  test('اللوحة الرئيسية تعرض إحصائيات حية', async ({ page }) => {
    await loginAsIT(page)
    await expect(page.getByTestId('dash-stats')).toBeVisible()
  })

  test('المستخدمون → الإنشاء → مصفوفة', async ({ page }) => {
    await loginAsIT(page)
    // وحدة المستخدمين (Hub)
    await page.getByRole('button', { name: 'إدارة المستخدمين' }).click()
    await expect(page.getByTestId('hub-user-management')).toBeVisible()
    // صفحة القائمة
    await page.getByTestId('hub-card-list').click()
    await expect(page).toHaveURL(/\/it\/user-management\/list/)
    // المصفوفة
    await page.getByRole('button', { name: 'مصفوفة الصلاحيات' }).click()
    await expect(page.getByTestId('perm-matrix')).toBeVisible()
  })

  test('الفروع: إنشاء فرع جديد', async ({ page }) => {
    await loginAsIT(page)
    await page.getByRole('button', { name: 'فروع الشركة' }).click()
    await page.getByTestId('toggle-branch-form').click()
    await page.getByTestId('branch-name').fill('فرع E2E')
    await page.getByTestId('branch-code').fill('E2E')
    await page.getByTestId('branch-submit').click()
    await expect(page.getByTestId('branches-table')).toContainText('فرع E2E')
  })

  test('التكاملات: البصمة تعرض رابط ADMS', async ({ page }) => {
    await loginAsIT(page)
    await page.getByRole('button', { name: 'التكاملات' }).click()
    await expect(page.getByTestId('adms-guide')).toBeVisible()
    await expect(page.getByTestId('adms-url')).toContainText('/functions/v1/adms-receiver')
  })

  test('قاعدة البيانات: جداول قابلة للنقر → تفاصيل', async ({ page }) => {
    await loginAsIT(page)
    await page.getByRole('button', { name: 'قاعدة البيانات' }).click()
    await page.getByTestId('hub-card-tables').click()
    await expect(page).toHaveURL(/\/it\/database\/tables/)
    // انقر جدول employees
    await page.locator('text=employees').first().click()
    await expect(page).toHaveURL(/\/it\/database\/tables\/employees/)
    await expect(page.getByTestId('columns-table')).toBeVisible()
  })

  test('التحديثات والمراقبة تعرض السجل', async ({ page }) => {
    await loginAsIT(page)
    await page.getByRole('button', { name: 'التحديثات والمراقبة' }).click()
    await expect(page.getByTestId('updates-stats')).toBeVisible()
  })

  test('طي الشريط الجانبي يعمل', async ({ page }) => {
    await loginAsIT(page)
    const sidebar = page.getByTestId('app-sidebar')
    const toggle = page.getByTestId('sidebar-collapse')
    await toggle.click()
    await expect(sidebar).toHaveClass(/lg:w-20/)
    await toggle.click()
    await expect(sidebar).toHaveClass(/lg:w-72/)
  })
})
