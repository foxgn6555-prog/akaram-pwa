/**
 * E2E (00349 B): وضع عدم الاتصال
 *  الجزء 1 (خادم التطوير): انقطاع الشبكة ⇒ شريط «غير متصل» يظهر ويختفي بعودتها، والصفحة تبقى تفاعلية.
 *  الجزء 2 (بناء إنتاجي فقط — يتطلب E2E_PWA_PREVIEW_URL، مثل: npm run build && npm run preview):
 *    بعد تسجيل Service Worker، إعادة التحميل دون شبكة تعرض التطبيق من الذاكرة (App Shell) لا صفحة خطأ المتصفح.
 *    يُتخطى إن لم يُضبط المتغير (لا فشل وهمي) — خادم التطوير لا يسجّل SW عمداً.
 */
import { test, expect } from '@playwright/test'

const PREVIEW_URL = process.env.E2E_PWA_PREVIEW_URL

test.describe('عدم الاتصال', () => {
  test('انقطاع الشبكة ⇒ شريط «غير متصل»، وعودتها تخفيه', async ({ page, context }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-submit')).toBeVisible()
    await context.setOffline(true)
    const banner = page.getByRole('status').filter({ hasText: 'غير متصل' })
    await expect(banner).toBeVisible()
    // الصفحة ما زالت تعمل: التحقق المحلي للحقول لا يحتاج شبكة
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await context.setOffline(false)
    await expect(banner).toHaveCount(0)
  })

  test('بناء إنتاجي: إعادة التحميل دون شبكة تعرض التطبيق من ذاكرة Service Worker', async ({ page, context, browserName }) => {
    test.skip(!PREVIEW_URL, 'E2E_PWA_PREVIEW_URL غير مضبوط (يتطلب npm run build && npm run preview)')
    test.skip(browserName === 'webkit', 'WebKit في Playwright لا يدعم setOffline مع Service Worker بثبات')
    await page.goto(`${PREVIEW_URL}/login`)
    await expect(page.getByTestId('login-submit')).toBeVisible()
    // انتظار سيطرة الـ SW واكتمال الـ precache
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready
      return !!reg.active && !!navigator.serviceWorker.controller
    }, undefined, { timeout: 30_000 })
    await context.setOffline(true)
    await page.reload()
    await expect(page).toHaveTitle(/جزيرة الأكارم/)
    await expect(page.getByTestId('login-submit')).toBeVisible()
    await context.setOffline(false)
  })
})
