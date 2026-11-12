import { chromium } from 'playwright'
const BASE='http://127.0.0.1:3000'
const browser=await chromium.launch()
const ctx=await browser.newContext({viewport:{width:1440,height:950}})
await ctx.route('**/*.supabase.co/**',async route=>{const req=route.request();try{const h={...req.headers()};for(const k of ['origin','referer','host','content-length'])delete h[k];const res=await fetch(req.url(),{method:req.method(),headers:h,body:['GET','HEAD'].includes(req.method())?undefined:req.postData()??undefined});const b=Buffer.from(await res.arrayBuffer());const hd={};res.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding'].includes(k))hd[k]=v});hd['access-control-allow-origin']='*';await route.fulfill({status:res.status,headers:hd,body:b})}catch{await route.abort()}})
const page=await ctx.newPage()
const consoleErrs=[];const failed=[]
page.on('console',m=>{if(m.type()==='error')consoleErrs.push(m.text().replace(/\s+/g,' ').slice(0,200))})
page.on('pageerror',e=>consoleErrs.push('PAGEERROR: '+String(e).slice(0,200)))
page.on('response',async r=>{if(r.url().includes('supabase.co')&&r.status()>=400){const t=await r.text().catch(()=>'');failed.push(`${r.status()} ${r.url().split('/').slice(-2).join('/')} :: ${t.slice(0,120)}`)}})
await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});await page.waitForTimeout(3000)
await page.fill('input[type="email"], input[name="email"]','siaf@akram.iq');await page.fill('input[type="password"]','123456789k');await page.click('button[type="submit"]');await page.waitForTimeout(8000)
for (const path of ['/ops-room-manager','/ops-room-manager/approvals','/ops-room-manager/fuel-reports']) {
  await page.goto(BASE+path,{waitUntil:'domcontentloaded'});await page.waitForTimeout(7000)
  console.log(`\n=== ${path} → ${page.url()}`)
  const body=await page.locator('body').innerText()
  console.log('نص الصفحة (٠٤٠ حرف):', body.replace(/\s+/g,' ').slice(0,240))
}
// جرس الإشعارات
const bell=page.locator('button[aria-label*="إشعار"], button[aria-label*="تنبيه"], [data-testid*="notification"]').first()
if(await bell.count()){await bell.click();await page.waitForTimeout(3500)
  const t=await page.locator('body').innerText();console.log('\nبعد فتح الجرس:', t.replace(/\s+/g,' ').slice(0,300))
}else console.log('\nلم أجد زر الإشعارات')
await page.screenshot({path:'/home/user/shots/opm-bell.png',fullPage:false}).catch(()=>{})
console.log('\n--- أخطاء الكونسول ---');console.log([...new Set(consoleErrs)].slice(0,12).join('\n')||'(لا شيء)')
console.log('\n--- نداءات فاشلة ---');console.log([...new Set(failed)].slice(0,12).join('\n')||'(لا شيء)')
await browser.close()
