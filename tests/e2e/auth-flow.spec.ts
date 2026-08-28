/**
 * ⚑ E2E — Auth Flow (نمط Kyvzon)
 * يختبر: التوجيه حسب الدور · منع الوصول غير المصرح · حماية تصعيد الصلاحيات
 */
import { test, expect } from '@playwright/test'

test.describe('Auth & RBAC', () => {
  test('غير مسجل → يُوجّه إلى /login', async ({ page }) => {
    await page.goto('/it/user-management')
    await expect(page).toHaveURL(/.*login.*/)
  })

  test('صفحة الدخول تعرض شعار جزيرة الأكرام', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByAltText('شعار جزيرة الأكرام')).toBeVisible()
    await expect(page.getByText('جزيرة الأكرام')).toBeVisible()
  })

  test('حقول فارغة → رسائل تحقق', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
  })

  test('موظف يحاول دخول /admin → يُرفض', async ({ page }) => {
    // يتطلب حساب موظف حقيقي في staging
    test.skip(!process.env.E2E_EMPLOYEE_EMAIL, 'متغيرات حساب الموظف غير مضبوطة')
    await page.goto('/login')
    await page.getByLabel('البريد الإلكتروني').fill(process.env.E2E_EMPLOYEE_EMAIL!)
    await page.getByLabel('كلمة المرور').fill(process.env.E2E_EMPLOYEE_PASSWORD!)
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click()
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/(employee|403)/)
  })
})
