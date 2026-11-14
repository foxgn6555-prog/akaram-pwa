import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--no-sandbox'] })
for (const perms of [[], ['notifications']]) {
  const ctx = await b.newContext(perms.length ? { permissions: perms } : {})
  if (perms.length) await ctx.grantPermissions(perms, { origin: 'http://127.0.0.1:5173' })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'domcontentloaded' })
  const perm = await p.evaluate(() => ({ p: Notification.permission, isSecure: window.isSecureContext }))
  console.log(JSON.stringify({ perms: perms.join(',') || 'none', ...perm }))
  await ctx.close()
}
await b.close()
