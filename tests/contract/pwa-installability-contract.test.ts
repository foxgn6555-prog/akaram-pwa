/** 00349 B — عقد قابلية التثبيت (PWA): المانيفست، الأيقونات الفعلية، SW، صفحة عدم الاتصال، وسوم iOS، وضع التحديث بالموافقة. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pwaConfig } from '@config/pwa.config'

const root = process.cwd()
const pub = (p: string) => join(root, 'public', p.replace(/^\//, ''))
/** أبعاد PNG من رأس IHDR */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file)
  expect(b.subarray(1, 4).toString('ascii'), file).toBe('PNG')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

describe('عقد قابلية التثبيت (00349 B)', () => {
  const manifest = pwaConfig.manifest
  if (!manifest) throw new Error('manifest missing')
  const m = manifest
  it('المانيفست يحمل الحقول التي يشترطها Chrome/Android', () => {
    expect(m.name).toBeTruthy(); expect(m.short_name).toBeTruthy()
    expect(m.start_url).toBe('/'); expect(m.scope).toBe('/'); expect(m.id).toBe('/')
    expect(m.display).toBe('standalone')
    expect(m.lang).toBe('ar'); expect(m.dir).toBe('rtl')
    expect(m.theme_color).toMatch(/^#/); expect(m.background_color).toMatch(/^#/)
  })
  it('أيقونات 192 و512 و512 maskable موجودة فعلاً بالأبعاد المعلنة', () => {
    const icons = m.icons!
    const sizes = icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192'); expect(sizes).toContain('512x512')
    expect(icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true)
    for (const i of icons) {
      const file = pub(i.src!)
      expect(existsSync(file), i.src).toBe(true)
      const [w, h] = i.sizes!.split('x').map(Number)
      expect(pngSize(file), i.src).toEqual({ w, h })
    }
    expect(pngSize(pub('/icons/apple-touch-icon.png'))).toEqual({ w: 180, h: 180 })
  })
  it('index.html: وسوم iOS + theme-color + apple-touch-icon', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    expect(html).toMatch(/name="apple-mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(/name="mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(/name="apple-mobile-web-app-title"/)
    expect(html).toMatch(/name="theme-color"/)
    expect(html).toMatch(/rel="apple-touch-icon"/)
  })
  it('Service Worker: precache + App Shell + صفحة عدم الاتصال + تحديث بالموافقة (prompt)', () => {
    const sw = readFileSync(join(root, 'src/workers/sw.ts'), 'utf8')
    expect(sw).toMatch(/precacheAndRoute\(manifest\)/)
    expect(sw).toMatch(/createHandlerBoundToURL\('index\.html'\)/)
    expect(sw).toMatch(/createHandlerBoundToURL\('offline\.html'\)/)
    expect(existsSync(pub('offline.html'))).toBe(true)
    expect(pwaConfig.includeAssets).toContain('offline.html')
    expect(pwaConfig.registerType).toBe('prompt')
    // لا skipWaiting تلقائي في الإنتاج — فقط عبر رسالة SKIP_WAITING
    const prod = sw.slice(sw.indexOf('} else {'))
    expect(prod).not.toMatch(/addEventListener\('install'/)
    expect(sw).toMatch(/SKIP_WAITING/)
  })
  it('main.tsx يربط التثبيت والتحديث بالواجهة', () => {
    const main = readFileSync(join(root, 'src/main.tsx'), 'utf8')
    expect(main).toMatch(/installPwaListeners\(\)/)
    expect(main).toMatch(/onNeedRefresh/)
    expect(main).toMatch(/pwaStore\.setNeedRefresh/)
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
    expect(app).toMatch(/<UpdateBanner \/>/)
    const shell = readFileSync(join(root, 'src/components/layout/AppShell.tsx'), 'utf8')
    expect(shell).toMatch(/<InstallBanner \/>/)
    const login = readFileSync(join(root, 'src/portals/public/pages/Login/LoginPage.tsx'), 'utf8')
    expect(login).toMatch(/<InstallAppButton/)
  })
})
