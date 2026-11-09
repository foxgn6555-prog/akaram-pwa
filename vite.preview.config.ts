/**
 * إعداد معاينة محلي فقط — غير مرفوع للمستودع (مستثنى في .git/info/exclude).
 * يضيف allowedHosts ليعمل التطبيق خلف نطاق المعاينة، بلا أي تعديل على vite.config.ts الأصلي.
 */
import { defineConfig, mergeConfig, type UserConfig } from 'vite'
import base from './vite.config'

export default defineConfig((env) => {
  const resolved = (typeof base === 'function' ? (base as (e: unknown) => UserConfig)(env) : base) as UserConfig
  return mergeConfig(resolved, {
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      hmr: { clientPort: 443 },
    },
  } satisfies UserConfig)
})
