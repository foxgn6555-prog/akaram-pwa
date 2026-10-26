/**
 * 00350-D — E2E الإنفاذ الكامل للصلاحيات (قائمة + مسار + زر + خادم)
 * السيناريو: التطوير المركزية تمنع مدير القاطع من «إنشاء» في وحدة الأعطال (manager.breakdown:create) ثم من «عرض» وحدة الدعم:
 *   1) زر «تسجيل العطل» يصبح معطَّلاً ويحمل سبب المنع.
 *   2) استدعاء الدالة مباشرة من المتصفح (RPC) يُرفض من الخادم بـ PERMISSION_DENIED.
 *   3) وحدة الدعم تختفي من القائمة الجانبية والمسار المباشر يُعاد توجيهه.
 *   4) إزالة الاستثناءات تعيد كل شيء — لا أثر دائم على الحساب.
 * يتطلب: E2E_IT_EMAIL/E2E_IT_PASSWORD (it_admin) و E2E_MANAGER_EMAIL/E2E_MANAGER_PASSWORD (sector_manager).
 */
import { test, expect, type Page } from '@playwright/test'

const IT = { email: process.env.E2E_IT_EMAIL, password: process.env.E2E_IT_PASSWORD }
const MGR = { email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD }
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? 'e2e-anon-key'
const DENIED_TITLE = 'ليست لديك صلاحية هذا الإجراء — راجع التطوير المركزية'

async function login(page: Page, who: { email?: string; password?: string }, home: RegExp): Promise<void> {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(who.email as string)
  await page.getByTestId('login-password').fill(who.password as string)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(home, { timeout: 15_000 })
}
async function logout(page: Page): Promise<void> {
  await page.getByTestId('sidebar-logout').click()
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
}
/** يفتح بطاقة صلاحيات المدير داخل صفحة المستخدم ويضغط خلية (وحدة × إجراء) — النقرة الأولى على خلية مسموحة ⇒ استثناء منع */
async function openManagerPermissions(page: Page): Promise<void> {
  await page.goto('/it/user-management/list')
  await page.getByTestId('users-search').fill(MGR.email as string)
  await page.getByTestId('users-table').getByText(MGR.email as string).first().click()
  await expect(page.getByTestId('permissions-card')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('perm-portal-manager').click()
  await expect(page.getByTestId('perm-user-grid')).toBeVisible()
}
async function clickCell(page: Page, unit: string, action: string): Promise<void> {
  await page.getByTestId('perm-reason').fill('اختبار E2E — إنفاذ الصلاحيات')
  await page.getByTestId(`perm-${unit}-${action}`).click()
  await expect(page.getByTestId('perm-overrides')).toContainText(unit, { timeout: 10_000 })
}
async function clearOverride(page: Page, unit: string, action: string): Promise<void> {
  await page.getByTestId(`perm-override-clear-${unit}-${action}`).click()
  await expect(page.getByTestId(`perm-override-clear-${unit}-${action}`)).toHaveCount(0, { timeout: 10_000 })
}

test.describe('إنفاذ الصلاحيات من البطاقة حتى الخادم', () => {
  test.skip(!IT.email || !IT.password || !MGR.email || !MGR.password, 'حسابات E2E (IT + مدير قاطع) غير مضبوطة')
  test.describe.configure({ mode: 'serial' })

  test('قبل المنع: زر تسجيل العطل متاح ووحدة الدعم ظاهرة', async ({ page }) => {
    await login(page, MGR, /\/manager/)
    await page.goto('/manager/breakdown')
    await expect(page.getByTestId('bd-submit')).toBeEnabled()
    await expect(page.getByTestId('bd-submit')).not.toHaveAttribute('title', DENIED_TITLE)
    await expect(page.getByTestId('app-sidebar').getByRole('link', { name: /الدعم/ })).toBeVisible()
    await logout(page)
  })

  test('التطوير المركزية تمنع: manager.breakdown:create و manager.support:view', async ({ page }) => {
    await login(page, IT, /\/it/)
    await openManagerPermissions(page)
    await clickCell(page, 'manager.breakdown', 'create')
    await clickCell(page, 'manager.support', 'view')
    await expect(page.getByTestId('perm-audit')).toContainText('manager.breakdown')
    await logout(page)
  })

  test('بعد المنع: الزر معطَّل بسبب ظاهر، الخادم يرفض، القائمة والمسار محجوبان', async ({ page }) => {
    await login(page, MGR, /\/manager/)
    // 1) الزر
    await page.goto('/manager/breakdown')
    const btn = page.getByTestId('bd-submit')
    await expect(btn).toBeDisabled()
    await expect(btn).toHaveAttribute('title', DENIED_TITLE)
    // 2) الخادم — استدعاء مباشر يتجاوز الواجهة
    const serverError = await page.evaluate(async ({ url, anon }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      const token = key ? (JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string }).access_token : undefined
      if (!token) return 'NO_SESSION'
      const r = await fetch(`${url}/rest/v1/rpc/sector_submit_breakdown`, {
        method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_db_number: 'E2E-000', p_fault_type: 'e2e', p_notes: null }),
      })
      return r.ok ? 'NO_ERROR' : await r.text()
    }, { url: SUPABASE_URL, anon: SUPABASE_ANON })
    expect(serverError).toContain('PERMISSION_DENIED')
    // 3) القائمة والمسار
    await expect(page.getByTestId('app-sidebar').getByRole('link', { name: /الدعم/ })).toHaveCount(0)
    await page.goto('/manager/support')
    await expect(page).not.toHaveURL(/\/manager\/support$/, { timeout: 10_000 })
    await logout(page)
  })

  test('التنظيف: إزالة الاستثناءين يعيد الوصول كاملاً', async ({ page }) => {
    await login(page, IT, /\/it/)
    await openManagerPermissions(page)
    await clearOverride(page, 'manager.breakdown', 'create')
    await clearOverride(page, 'manager.support', 'view')
    await logout(page)
    await login(page, MGR, /\/manager/)
    await page.goto('/manager/breakdown')
    await expect(page.getByTestId('bd-submit')).toBeEnabled()
    await expect(page.getByTestId('app-sidebar').getByRole('link', { name: /الدعم/ })).toBeVisible()
  })
})
