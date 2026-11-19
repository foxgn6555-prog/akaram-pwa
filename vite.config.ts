import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { pwaConfig } from './src/config/pwa.config'

/**
 * ملاحظة معمارية: مصدر الحقيقة الوحيد للـ Path Aliases هو tsconfig.paths.json،
 * ويقرأه Vite عبر vite-tsconfig-paths — لا تكرار للـ aliases هنا أبداً.
 */
/**
 * معاينة Arena داخل iframe: script منع التأطير في index.html ينقل الصفحة خارج المعاينة.
 * يُزال فقط عند بناء معاينة محلية بمتغير AKARAM_PREVIEW_FRAME=1؛ بناء الإنتاج العادي لا يتأثر.
 */
const previewFrame = process.env.AKARAM_PREVIEW_FRAME === '1'

/**
 * بصمة البناء: تُحقن في الحزمة كي يعرف الدعم أي نسخة يعمل عليها المستخدم،
 * وتُمرَّر إلى Sentry كـ release فترتبط الأخطاء ببناء محدّد.
 * الشكل: 4.0.0+a1b2c3d  (نسخة package.json + أول 7 من SHA)
 */
const appVersion = (() => {
  let version = '0.0.0'
  try {
    version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string }).version ?? version
  } catch { /* يبقى الافتراضي */ }
  let sha = 'nogit'
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || sha
  } catch { /* بيئة بلا git (حزمة مصدر) */ }
  return `${version}+${sha}`
})()

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    VitePWA(pwaConfig),
    {
      name: 'arena-preview-frame',
      apply: 'build',
      transformIndexHtml(html) {
        if (!previewFrame) return html
        return html.replace(/<script>\s*if \(window\.top !== window\.self\)[\s\S]*?<\/script>/, '')
      },
    },
    // 00289: تشغيل على الهاتف عبر https (الموقع والكاميرا لا يعملان على http) — `npm run dev:phone`
    ...(process.env.DEV_HTTPS === '1' ? [basicSsl()] : []),
    // CSP متساهل في التطوير فقط (HMR/preamble) — build الإنتاج يبقى صارماً
    {
      name: 'dev-csp-relax',
      apply: 'serve',
      transformIndexHtml: (html) =>
        html
          .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
          .replace("connect-src 'self'", "connect-src 'self' ws: wss:"), // HMR من الهاتف عبر IP الشبكة أيضاً
    },
  ],
  // اعتماديات ثقيلة تُحمَّل كسولاً فقط: تُحسَّن مسبقاً كي لا يعيد Vite التحسين أثناء الجلسة (504 Outdated Optimize Dep)
  optimizeDeps: { include: ['recharts', 'exceljs', 'leaflet', 'react-leaflet'] },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react-router'],
          'react-core': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          validation: ['zod'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          monitoring: ['@sentry/react'],
          i18n: ['i18next', 'react-i18next'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,

    // السماح بمضيف المعاينة (أعمال البيئة السحابية) — لا يؤثر على الإنتاج
    allowedHosts: true,
  },
})
