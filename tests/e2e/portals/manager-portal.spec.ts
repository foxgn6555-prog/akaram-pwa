/** رحلة مسؤول القسم. الجزء التشغيلي يحتاج حساب department_manager حقيقياً في بيئة E2E. */
import{expect,test}from'@playwright/test'
const email=process.env.E2E_MANAGER_EMAIL;const password=process.env.E2E_MANAGER_PASSWORD

test.describe('بوابة مسؤول القسم — تذاكر الشكاوى',()=>{
 test('المسار محمي ويعيد غير المسجل إلى الدخول',async({page})=>{await page.goto('/manager/complaints');await expect(page).toHaveURL(/\/login/);await expect(page.getByTestId('login-submit')).toBeVisible()})
 test('يعرض قائمة التذاكر ويفتح تفاصيل التذكرة كاملة',async({page})=>{test.skip(!email||!password,'يلزم E2E_MANAGER_EMAIL وE2E_MANAGER_PASSWORD لحساب مسؤول لديه تذكرة');await page.goto('/login');await page.getByTestId('login-email').fill(email!);await page.getByTestId('login-password').fill(password!);await page.getByTestId('login-submit').click();await expect(page).toHaveURL(/\/manager/);await page.goto('/manager/complaints');await expect(page.getByRole('heading',{name:'الشكاوى المسندة إليّ'})).toBeVisible();const open=page.getByRole('link',{name:'فتح التذكرة'}).first();await expect(open).toBeVisible();await open.click();await expect(page).toHaveURL(/\/manager\/complaints\/[0-9a-f-]+/);await expect(page.getByText(/المحلة/).first()).toBeVisible();await expect(page.getByText(/الزقاق/).first()).toBeVisible();await expect(page.getByText(/GPS|الموقع الحالي/)).toHaveCount(0)})
})
