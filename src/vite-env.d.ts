/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production'
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** بصمة البناء المحقونة من vite.config.ts (نسخة + SHA) */
declare const __APP_VERSION__: string
