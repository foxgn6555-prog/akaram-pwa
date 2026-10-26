/**
 * E2E (00349 B): زر «ثبّت التطبيق» على صفحة الدخول
 *  · يظهر لكل متصفح غير مثبّت
 *  · Android/Chrome: التقاط beforeinstallprompt ⇒ النقر يفتح نافذة التثبيت الأصلية ثم يختفي الزر بعد القبول
 *  · iPhone (Safari بلا حدث): النقر يفتح دليل «مشاركة ← إضافة إلى الشاشة الرئيسية»
 * لا يحتاج بيانات دخول ولا بناء إنتاجي — يعمل على خادم التطوير.
 */
import { test, expect } from '@playwright/test'

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

test.describe('تثبيت التطبيق (PWA)', () => {
  test('الزر ظاهر على صفحة الدخول', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('pwa-install-button')).toBeVisible()
  })

  test('Android/Chrome: الحدث المحفوظ ⇒ نافذة التثبيت الأصلية ثم يختفي الزر', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('pwa-install-button')).toBeVisible()
    // محاكاة حدث المتصفح (لا يمكن إطلاقه حقيقياً دون HTTPS + معايير التثبيت)
    await page.evaluate(() => {
      const w = window as Window & { __pwaPrompted?: number }
      w.__pwaPrompted = 0
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt?: () => Promise<void>; userChoice?: Promise<unknown> }
      e.prompt = async () => { w.__pwaPrompted = (w.__pwaPrompted ?? 0) + 1 }
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
      window.dispatchEvent(e)
    })
    const btn = page.getByTestId('pwa-install-button')
    await expect(btn).toHaveAttribute('data-mode', 'native')
    await btn.click()
    await expect.poll(() => page.evaluate(() => (window as Window & { __pwaPrompted?: number }).__pwaPrompted)).toBe(1)
    await expect(page.getByTestId('pwa-install-guide')).toHaveCount(0)
    await expect(btn).toHaveCount(0)
  })

  test.describe('iPhone', () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    test('بلا حدث تثبيت ⇒ دليل المشاركة بالعربية', async ({ page }) => {
      await page.goto('/login')
      const btn = page.getByTestId('pwa-install-button')
      await expect(btn).toHaveAttribute('data-mode', 'ios')
      await btn.click()
      const guide = page.getByTestId('pwa-install-guide')
      await expect(guide).toBeVisible()
      await expect(guide).toHaveAttribute('data-platform', 'ios')
      await expect(guide).toContainText('إضافة إلى الشاشة الرئيسية')
      await expect(guide).toContainText('Safari')
      await guide.getByRole('button', { name: 'فهمت' }).click()
      await expect(guide).toHaveCount(0)
    })
  })
})
