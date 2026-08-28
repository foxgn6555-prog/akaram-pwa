/**
 * E2E: تسجيل الدخول → التوجيه للبوابة الصحيحة
 * يتطلب مستخدمين حقيقيين في بيئة الاختبار عبر متغيرات بيئة:
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD
 * إن لم تتوفر → يُتخطى الاختبار (لا فشل وهمي)
 */
import { test, expect } from '@playwright/test'

const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD

test.describe('تسجيل الدخول', () => {
  test('صفحة الدخول تعرض هوية جزيرة الأكرام', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/جزيرة الأكرام/)
    await expect(page.getByAltText('شعار جزيرة الأكرام')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('حقول فارغة → رسائل تحقق دون مغادرة الصفحة', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('موظف يدخل → يوجَّه لبوابة الموظف', async ({ page }) => {
    test.skip(!EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD, 'متغيرات بيانات E2E غير مضبوطة')
    await page.goto('/login')
    await page.getByTestId('login-email').fill(EMPLOYEE_EMAIL as string)
    await page.getByTestId('login-password').fill(EMPLOYEE_PASSWORD as string)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/employee/, { timeout: 15_000 })
  })

  test('كلمة مرور خاطئة → رسالة آمنة عامة', async ({ page }) => {
    test.skip(!EMPLOYEE_EMAIL, 'متغيرات بيانات E2E غير مضبوطة')
    await page.goto('/login')
    await page.getByTestId('login-email').fill(EMPLOYEE_EMAIL as string)
    await page.getByTestId('login-password').fill('WrongPassword999')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-error')).toBeVisible()
    await expect(page.getByTestId('login-error')).toContainText('غير صحيحة')
  })
})
