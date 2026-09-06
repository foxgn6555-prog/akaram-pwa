import{expect,test}from'@playwright/test'

test.describe('أخطاء JavaScript في المتصفح',()=>{
 test('صفحة الدخول تعمل دون pageerror أو console.error',async({page})=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(`pageerror: ${error.message}`))
  page.on('console',message=>{if(message.type()==='error')errors.push(`console.error: ${message.text()}`)})
  const response=await page.goto('/login',{waitUntil:'networkidle'})
  expect(response?.ok()).toBeTruthy()
  await expect(page.getByAltText('شعار جزيرة الأكرام')).toBeVisible()
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(errors).toEqual([])
 })
 test('الانتقال إلى مسار محمي دون جلسة لا يسبب انهيار JavaScript',async({page})=>{
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message))
  await page.goto('/complaints/inbox',{waitUntil:'networkidle'})
  await expect(page).toHaveURL(/\/login/)
  expect(pageErrors).toEqual([])
 })
})
