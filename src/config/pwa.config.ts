/**
 * إعداد vite-plugin-pwa — المصدر الوحيد (يُستهلك في vite.config.ts).
 * استراتيجية injectManifest: SW مخصص في src/workers/sw.ts يديره Workbox.
 */
import type { VitePWAOptions } from 'vite-plugin-pwa'

export const pwaConfig: Partial<VitePWAOptions> = {
  strategies: 'injectManifest',
  srcDir: 'src/workers',
  filename: 'sw.ts',
  // 00349 B: prompt — التحديث بموافقة المستخدم («حدّث الآن») بدل إعادة تحميل مفاجئة
  registerType: 'prompt',
  // offline.html يلتقطه نمط glob الافتراضي (html) فيدخل precache مرة واحدة؛
  // إضافته هنا كانت تُدرجه مرتين. robots.txt ليس ضمن نمط glob فيحتاج ذكراً صريحاً.
  includeAssets: ['robots.txt'],
  manifest: {
    name: 'جزيرة الأكارم — النظام الإلكتروني',
    short_name: 'الأكارم',
    description: 'جزيرة الأكارم — نظام إدارة شركة البلدية: الموظفون، الطلبات، الرواتب، الحضور',
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'ar',
    dir: 'rtl',
    categories: ['business', 'productivity'],
    theme_color: '#005f8d',
    background_color: '#f8fafc',
    display: 'standalone',
    // السماح بكل الاتجاهات — التدوير لا يكسر التخطيط (الشريط/المحتوى متجاوبان)
    orientation: 'any',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  injectManifest: {
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    /**
     * 00349 C: استبعاد حزم التصدير الثقيلة من التثبيت المسبق.
     * كانت كلها تُنزَّل لكل مستخدم (≈2.3MB) حتى لو لم يفتح تصديراً واحداً، ما يثقل
     * أول تثبيت على بيانات الهاتف ويزيد احتمال فشل التثبيت (وفشله = لا تحديثات أبداً).
     * تبقى تعمل: تُخزَّن عند أول استخدام عبر مسار CacheFirst في src/workers/sw.ts.
     */
    globIgnores: [
      // ٣-هـ: بصمة الإصدار وحارس الإقلاع يجب أن يُقرآ من الشبكة لا من precache
      'version.json',
      'boot-watchdog.js',
      '**/exceljs.min-*.js',
      '**/jspdf.es.min-*.js',
      '**/html2canvas.esm-*.js',
      '**/design-word-*.js',
      '**/pdf-*.js',
    ],
  },
  devOptions: { enabled: false },  // معطل في dev — SW يتعارض مع HMR ويخزن ردود قديمة
}
