import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-web-security','--disable-site-isolation-trials'] })
const p = await (await b.newContext()).newPage()
await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
console.log(JSON.stringify(await p.evaluate(async () => ({
  supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
  regs: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : -1,
})), null, 1))
await b.close()
