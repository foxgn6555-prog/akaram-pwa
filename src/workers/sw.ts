/**
 * Service Worker — Workbox عبر vite-plugin-pwa (injectManifest).
 *  · التطوير: صفر اعتراض — كل الطلبات تمر عادي (لا precache ولا routes)
 *  · الإنتاج: precache + App Shell + صور NetworkFirst
 *  · بيانات Supabase (rest/auth/storage/functions): NetworkOnly —
 *    يمرر الطلب الأصلي كما هو بلا أي كاش (إصلاح عيب الاختطاف السابق).
 */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  precacheAndRoute,
  createHandlerBoundToURL,
  cleanupOutdatedCaches,
} from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

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
  // 00349 B: لا skipWaiting تلقائي — الإصدار الجديد ينتظر ضغط «حدّث الآن» في الواجهة
  // (registerType = prompt؛ الرسالة SKIP_WAITING أدناه هي التي تفعّله)، ثم clientsClaim يسيطر ويعاد التحميل مرة واحدة.
  precacheAndRoute(manifest)
  cleanupOutdatedCaches()
  clientsClaim()

  const appShellHandler = createHandlerBoundToURL('index.html')
  const offlineHandler = createHandlerBoundToURL('offline.html')

  /**
   * ٣-هـ: القشرة (index.html) تُخدم **من الشبكة أولاً** لا من precache.
   *
   * لماذا: على iPhone يبقى عامل الخدمة "معلَّقاً" أياماً، فكان يُقدَّم index.html قديماً
   * يشير إلى assets/index-OLD.js غير الموجود بعد النشر ⇒ لا شيء يُركَّب و<div id="root">
   * يبقى فارغاً (شاشة تحميل أبدية). الشبكة أولاً تضمن أن القشرة دائمًا مطابقة للأصول المنشورة،
   * ويبقى العمل دون اتصال عبر نسخة القشرة المحفوظة ثم precache ثم offline.html.
   */
  const SHELL_CACHE = 'app-shell-r1'
  const SHELL_KEY = new URL('/__app_shell__', self.location.origin).toString()
  const NAV_TIMEOUT_MS = 3000

  const navigationHandler = async (params: { request: Request }) => {
    // ① الشبكة (بمهلة قصيرة) — القشرة الطازجة والأصول المتوافقة معها
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS)
    try {
      const fresh = await fetch(params.request, { signal: controller.signal })
      if (fresh && fresh.ok) {
        try {
          const cache = await caches.open(SHELL_CACHE)
          await cache.put(SHELL_KEY, fresh.clone())
        } catch { /* تخزين محجوب/ممتلئ — لا يمنع العرض */ }
        return fresh
      }
    } catch {
      /* انقطاع أو مهلة — ننتقل إلى الاحتياط */
    } finally {
      clearTimeout(timer)
    }
    // ② آخر قشرة ناجحة من الشبكة
    try {
      const cached = await (await caches.open(SHELL_CACHE)).match(SHELL_KEY)
      if (cached) return cached
    } catch { /* تجاهل */ }
    // ③ قشرة البناء (precache) — متوافقة دائمًا مع أصول هذا الإصدار
    try {
      return await appShellHandler(params as never)
    } catch {
      return offlineHandler(params as never)
    }
  }

  registerRoute(
    new NavigationRoute(
      navigationHandler as never,
      {
        /**
         * 00349 ج: لا نبتلع كل تنقل. مسار بامتداد ملف (PDF/Excel/صورة/خط) أو أصول
         * التقارير ليس صفحة تطبيق — لو عاد app shell لرأى المستخدم التطبيق مكان الملف.
         * مسارات التطبيق نفسها بلا امتدادات، فلا تتأثر.
         */
        denylist: [/\/report-assets\//, /\.[a-z0-9]{2,5}$/i],
      },
    ),
  )

  registerRoute(
    ({ request }) => request.destination === 'image',
    new NetworkFirst({ cacheName: 'images', networkTimeoutSeconds: 5 }),
  )

  // حزم التصدير الثقيلة (Excel/PDF/Word/تصوير الصفحة) مستبعدة من precache —
  // أول تثبيت لا يدفع 2.3MB إضافية على بيانات الهاتف. تُخزَّن عند أول استخدام فعلي
  // فتعمل بلا اتصال بعد ذلك، وتُقلَّم بحد أقصى 20 مدخلاً/30 يوماً كي لا تتراكم نسخ البناء القديمة.
  registerRoute(
    ({ url }) => /^\/assets\/(exceljs\.min|jspdf\.es\.min|html2canvas\.esm|design-word|pdf)-/.test(url.pathname),
    new CacheFirst({
      cacheName: 'heavy-export',
      plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
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
  // vite-plugin-pwa يرسل { type: 'SKIP_WAITING' }؛ الصيغة النصية للتوافق مع القديم
  const data: unknown = event.data
  if (data === 'SKIP_WAITING' || (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING')) void self.skipWaiting()
})

type PushPayload = {
  title?: string
  body?: string
  link?: string
  priority?: string
  category?: string
  notificationId?: string
  deliveryId?: string
}
self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() as PushPayload) ?? {}
  } catch {
    payload = { body: event.data?.text() ?? 'لديك إشعار جديد' }
  }
  const link = payload.link?.startsWith('/') ? payload.link : '/',
    trackedUrl = new URL(link, self.location.origin)
  if (payload.deliveryId) trackedUrl.searchParams.set('_push', payload.deliveryId)
  const trackedLink = `${trackedUrl.pathname}${trackedUrl.search}${trackedUrl.hash}`
  event.waitUntil(
    self.registration.showNotification(payload.title?.slice(0, 160) || 'إشعار جديد', {
      body: payload.body?.slice(0, 1000),
      icon: '/icons/icon-192.png',
      badge: '/icons/logo-128.png',
      tag: payload.notificationId || `${payload.category ?? 'system'}:${link}`,
      requireInteraction: payload.priority === 'critical',
      silent: false,
      data: { link: trackedLink, notificationId: payload.notificationId },
    }),
  )
})
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const link =
    typeof event.notification.data?.link === 'string' &&
    event.notification.data.link.startsWith('/')
      ? event.notification.data.link
      : '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        const windowClient = client as WindowClient
        if ('focus' in windowClient) {
          await windowClient.focus()
          await windowClient.navigate(link)
          return
        }
      }
      await self.clients.openWindow(link)
    })(),
  )
})
