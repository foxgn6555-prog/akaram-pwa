/**
 * إعداد vite-plugin-pwa — المصدر الوحيد (يُستهلك في vite.config.ts).
 * استراتيجية injectManifest: SW مخصص في src/workers/sw.ts يديره Workbox.
 */
import type { VitePWAOptions } from 'vite-plugin-pwa'

export const pwaConfig: Partial<VitePWAOptions> = {
  strategies: 'injectManifest',
  srcDir: 'src/workers',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  includeAssets: ['offline.html', 'robots.txt'],
  manifest: {
    name: 'جزيرة الأكرام — النظام الإلكتروني',
    short_name: 'الأكرام',
    description: 'جزيرة الأكرام — نظام إدارة شركة البلدية: الموظفون، الطلبات، الرواتب، الحضور',
    lang: 'ar',
    dir: 'rtl',
    theme_color: '#005f8d',
    background_color: '#f8fafc',
    display: 'standalone',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  injectManifest: {
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  },
  devOptions: { enabled: false },  // معطل في dev — SW يتعارض مع HMR ويخزن ردود قديمة
}
