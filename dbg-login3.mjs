import { chromium } from 'playwright'
const B='http://localhost:5173', email=process.argv[2]??'admin@akram.iq', pw=process.argv[3]??'123456789k'
const b=await chromium.launch(); const ctx=await b.newContext({locale:'ar-IQ'}); const p=await ctx.newPage()
p.on('response', async r=>{ if(r.url().includes('/functions/v1/staff-login')) console.log('STAFF-LOGIN', r.status(), (await r.text().catch(()=>'')).slice(0,200)) })
await p.goto(B+'/login',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
await p.fill('input[type=email]',email); await p.fill('input[type=password]',pw)
await p.click('button[type=submit]'); await p.waitForTimeout(7000)
console.log('URL:',p.url())
console.log('MSG:',(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,180))
await b.close()
