/**
 * فحص متغيرات البيئة قبل البناء — يمنع build ناقص الإعدادات.
 * تشغيل: npm run env:check
 */
import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL يجب أن يكون رابطاً صالحاً'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY قصير جداً')
    .refine((v) => !v.startsWith('sb_secret_'), 'مفتاح سري في متغير الواجهة — ممنوع'),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
})

// درع: منع المفتاح السري من متغير VITE_ (يُضمَّن في المتصفح)
const secretInClient = Object.entries(process.env).find(
  ([k, v]) => k.startsWith('VITE_') && v && String(v).startsWith('sb_secret_'),
)
if (secretInClient) {
  console.error(`❌ أمن: ${secretInClient[0]} يحتوي sb_secret_ — المفاتيح السرية ممنوعة من الواجهة`)
  process.exit(1)
}

const parsed = envSchema.safeParse({
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  VITE_APP_ENV: process.env.VITE_APP_ENV,
  VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN,
})

if (!parsed.success) {
  console.error('❌ فحص البيئة فشل:')
  for (const issue of parsed.error.issues) {
    console.error(`   · ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\nانسخ .env.example إلى .env.local واملأ القيم.')
  process.exit(1)
}

console.log('✅ فحص البيئة نجح:', parsed.data.VITE_APP_ENV)
