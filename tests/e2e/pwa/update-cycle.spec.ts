/**
 * دورة تحديث إنتاجية فعلية: تسجيل SW من بناء dist، محاكاة نشر نسخة ثانية،
 * الانتظار ثم التفعيل بعد موافقة المستخدم، مع بقاء بيانات المتصفح محفوظة.
 * التشغيل: npm run build && E2E_PWA_UPDATE_TEST=1 npx playwright test tests/e2e/pwa/update-cycle.spec.ts --project=chromium
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import { test, expect } from '@playwright/test'

const distDir = resolve(process.cwd(), 'dist')
const swPath = resolve(distDir, 'sw.js')
const canRunUpdateCycle = process.env.E2E_PWA_UPDATE_TEST === '1' && existsSync(swPath)
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function send(res: ServerResponse, status: number, body: Buffer | string, contentType: string): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  })
  res.end(body)
}

function createProductionSimulationServer() {
  const originalServiceWorker = readFileSync(swPath)
  let release = 1
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

    if (pathname === '/sw.js') {
      // اختلاف بايت صالح في ملف الـ SW يحاكي ناتج نشر جديداً مع إبقاء بقية البناء كما هو.
      const body = release === 1
        ? originalServiceWorker
        : Buffer.concat([originalServiceWorker, Buffer.from('\n/* simulated production release 2 */\n')])
      send(res, 200, body, 'text/javascript; charset=utf-8')
      return
    }

    let filePath = resolve(distDir, `.${pathname}`)
    if (filePath !== distDir && !filePath.startsWith(`${distDir}${sep}`)) {
      send(res, 403, 'Forbidden', 'text/plain; charset=utf-8')
      return
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html')
    if (!existsSync(filePath) && (req.headers.accept ?? '').includes('text/html')) {
      filePath = resolve(distDir, 'index.html')
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8')
      return
    }

    send(res, 200, readFileSync(filePath), MIME_TYPES[extname(filePath)] ?? 'application/octet-stream')
  })

  return {
    server,
    publishReleaseTwo: (): void => { release = 2 },
  }
}

test.describe('تحديث إنتاجي للـ PWA', () => {
  test.skip(!canRunUpdateCycle, 'يتطلب بناء dist/ وتفعيل E2E_PWA_UPDATE_TEST=1')

  test('يكتشف إصداراً جديداً، يعيد عرض التنبيه المؤجل، ثم يفعّله دون مسح بيانات المتصفح', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'تحديث Service Worker غير مستقر في WebKit ضمن Playwright')

    const simulation = createProductionSimulationServer()
    await new Promise<void>((resolveListen, reject) => {
      simulation.server.once('error', reject)
      simulation.server.listen(0, '127.0.0.1', resolveListen)
    })
    const address = simulation.server.address() as AddressInfo
    const origin = `http://127.0.0.1:${address.port}`
    const context = await browser.newContext({ serviceWorkers: 'allow' })
    const page = await context.newPage()

    try {
      await page.goto(`${origin}/login`)
      await expect(page.getByTestId('login-submit')).toBeVisible()
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.ready
        return Boolean(registration.active && navigator.serviceWorker.controller)
      }, undefined, { timeout: 30_000 })
      // أول SW يسيطر على الصفحة فيعيدها main.tsx مرة واحدة؛ انتظر اكتمال إعادة التحميل الابتدائية.
      await page.waitForLoadState('load')
      await expect(page.getByTestId('login-submit')).toBeVisible()
      await page.evaluate(() => localStorage.setItem('pwa-update-cycle-test', 'preserved'))
      const firstLoadTime = await page.evaluate(() => performance.timeOrigin)

      simulation.publishReleaseTwo()
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/')
        if (!registration) throw new Error('Service Worker registration missing')
        await registration.update()
      })
      await expect(page.getByTestId('pwa-update-banner')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('pwa-update-later').click()
      await expect(page.getByTestId('pwa-update-banner')).toHaveCount(0)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(page.getByTestId('pwa-update-banner')).toBeVisible()
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(firstLoadTime)

      const nextLoad = page.waitForEvent('load')
      await page.getByTestId('pwa-update-now').click()
      await nextLoad
      await expect(page.getByTestId('login-submit')).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('pwa-update-cycle-test'))).toBe('preserved')
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/')
        return Boolean(navigator.serviceWorker.controller?.state === 'activated' && !registration?.waiting)
      }, undefined, { timeout: 30_000 })
    } finally {
      await context.close()
      await new Promise<void>((resolveClose) => simulation.server.close(() => resolveClose()))
    }
  })
})
