/**
 * E2E البوابة التقنية — يتطلب حساب it_admin حقيقي في staging:
 *   E2E_IT_EMAIL / E2E_IT_PASSWORD
 */
import { test, expect } from '@playwright/test'

const IT_EMAIL = process.env.E2E_IT_EMAIL
const IT_PASSWORD = process.env.E2E_IT_PASSWORD

test.describe('البوابة التقنية', () => {
  test('دخول it_admin → يهبط في اللوحة الحية للبوابة /it', async ({ page }) => {
    test.skip(!IT_EMAIL || !IT_PASSWORD, 'متغيرات حساب IT غير مضبوطة')
    await page.goto('/login')
    await page.getByTestId('login-email').fill(IT_EMAIL as string)
    await page.getByTestId('login-password').fill(IT_PASSWORD as string)
    await page.getByTestId('login-submit').click()
    // البوابة الافتراضية للدور = /it (اللوحة الحية) — انظر portal.router.ts
    await expect(page).toHaveURL(/\/it$/)
    await expect(page.getByTestId('app-sidebar')).toContainText('إدارة المستخدمين')
    await expect(page.getByTestId('app-sidebar')).toContainText('قاعدة البيانات')
  })

  test('وحدة قاعدة البيانات → Hub ثم صفحة الجداول تعرض بطاقات الصحة', async ({ page }) => {
    test.skip(!IT_EMAIL || !IT_PASSWORD, 'متغيرات حساب IT غير مضبوطة')
    await page.goto('/login')
    await page.getByTestId('login-email').fill(IT_EMAIL as string)
    await page.getByTestId('login-password').fill(IT_PASSWORD as string)
    await page.getByTestId('login-submit').click()
    // النقر على الوحدة → صفحتها المركزية (Hub)
    await page.getByRole('button', { name: 'قاعدة البيانات' }).click()
    await expect(page.getByTestId('hub-database')).toBeVisible()
    // من الـ Hub → صفحة الجداول
    await page.getByTestId('hub-card-tables').click()
    await expect(page.getByTestId('db-cards')).toBeVisible()
    await expect(page.getByTestId('db-tables')).toBeVisible()
  })

  test('موظف عادي يحاول /it → 403', async ({ page }) => {
    test.skip(!process.env.E2E_EMPLOYEE_EMAIL, 'متغيرات حساب الموظف غير مضبوطة')
    await page.goto('/login')
    await page.getByTestId('login-email').fill(process.env.E2E_EMPLOYEE_EMAIL as string)
    await page.getByTestId('login-password').fill(process.env.E2E_EMPLOYEE_PASSWORD as string)
    await page.getByTestId('login-submit').click()
    await page.goto('/it/user-management')
    await expect(page).toHaveURL(/\/403/)
  })
})
