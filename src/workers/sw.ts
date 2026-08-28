/**
 * Service Worker — Workbox عبر vite-plugin-pwa (injectManifest).
 *  · التطوير: صفر اعتراض — كل الطلبات تمر عادي (لا precache ولا routes)
 *  · الإنتاج: precache + App Shell + صور NetworkFirst
 *  · بيانات Supabase (rest/auth/storage/functions): NetworkOnly —
 *    يمرر الطلب الأصلي كما هو بلا أي كاش (إصلاح عيب الاختطاف السابق).
 */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'

// Workbox يحقن قائمة الإنتاج هنا — فارغة تماماً في التطوير
declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string } | string> }

// قراءة واحدة (Workbox يشترط موضعاً واحداً للسلسلة الحرفية)
const manifest: Array<{ url: string } | string> = self.__WB_MANIFEST
const IS_DEV = manifest.length === 0

if (IS_DEV) {
  // ── وضع التطوير: بلا أي routes — الـ SW شفاف تماماً ──
  self.addEventListener('install', () => void self.skipWaiting())
  self.addEventListener('activate', () => void self.clients.claim())
  console.info('[sw] وضع التطوير — SW شفاف بلا اعتراض (سلوك مقصود)')
} else {
  // ── وضع الإنتاج ──
  precacheAndRoute(manifest)
  cleanupOutdatedCaches()
  clientsClaim()

  const appShellHandler = createHandlerBoundToURL('index.html')
  const offlineHandler = createHandlerBoundToURL('offline.html')

  registerRoute(
    new NavigationRoute(async (params) => {
      try {
        return await appShellHandler(params)
      } catch {
        return offlineHandler(params)
      }
    }),
  )

  registerRoute(
    ({ request }) => request.destination === 'image',
    new NetworkFirst({ cacheName: 'images', networkTimeoutSeconds: 5 }),
  )

  // بيانات Supabase الحساسة: مرور شبكي خالص — يمرر الطلب الأصلي بلا كاش
  registerRoute(
    ({ url }) =>
      ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1'].some((p) =>
        url.pathname.startsWith(p),
      ),
    new NetworkOnly(),
  )

  console.info('[sw] الإنتاج — precache + App Shell + NetworkOnly للـ API')
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting()
})
