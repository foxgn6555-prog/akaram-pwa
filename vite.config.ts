import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaConfig } from './src/config/pwa.config'

/**
 * ملاحظة معمارية: مصدر الحقيقة الوحيد للـ Path Aliases هو tsconfig.paths.json،
 * ويقرأه Vite عبر vite-tsconfig-paths — لا تكرار للـ aliases هنا أبداً.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    VitePWA(pwaConfig),
    // CSP متساهل في التطوير فقط (HMR/preamble) — build الإنتاج يبقى صارماً
    {
      name: 'dev-csp-relax',
      apply: 'serve',
      transformIndexHtml: (html) =>
        html
          .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
          .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5173"),
    },
  ],
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
