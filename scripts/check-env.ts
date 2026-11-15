/**
 * فحص متغيرات البيئة قبل البناء — يمنع build ناقص الإعدادات.
 * يقرأ ملفات .env التي يقرأها Vite (.env / .env.local / .env.[mode]) ثم متغيرات العملية،
 * حتى لا ينجح البناء بمفتاح إشعارات موجود في الملف بينما الفحص لا يراه.
 * تشغيل: npm run env:check
 */
import { loadEnv } from 'vite'
import { z } from 'zod'

const mode = process.env.VITE_APP_ENV ?? 'development'
const fileEnv = loadEnv(mode, process.cwd(), 'VITE_')
const env = { ...fileEnv, ...process.env }

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL يجب أن يكون رابطاً صالحاً'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY قصير جداً')
    .refine((v) => !v.startsWith('sb_secret_'), 'مفتاح سري في متغير الواجهة — ممنوع'),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  // المفتاح العام فقط لـ Web Push. في الإنتاج/التجربة لا نقبل نسخة بلا مفتاح (كانت تفشل بصمت عند التفعيل).
  VITE_VAPID_PUBLIC_KEY: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^[A-Za-z0-9_-]{86,88}$/.test(v), 'VITE_VAPID_PUBLIC_KEY يجب أن يكون مفتاح P-256 عامّاً بصيغة base64url'),
})

// درع: منع المفتاح السري من متغير VITE_ (يُضمَّن في المتصفح)
const secretInClient = Object.entries(env).find(
  ([k, v]) => k.startsWith('VITE_') && v && String(v).startsWith('sb_secret_'),
)
if (secretInClient) {
  console.error(`❌ أمن: ${secretInClient[0]} يحتوي sb_secret_ — المفاتيح السرية ممنوعة من الواجهة`)
  process.exit(1)
}

const parsed = envSchema.safeParse({
  VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
  VITE_APP_ENV: env.VITE_APP_ENV,
  VITE_SENTRY_DSN: env.VITE_SENTRY_DSN,
  VITE_VAPID_PUBLIC_KEY: env.VITE_VAPID_PUBLIC_KEY,
})

if (!parsed.success) {
  console.error('❌ فحص البيئة فشل:')
  for (const issue of parsed.error.issues) {
    console.error(`   · ${issue.path.join('.')}: ${issue.message}`)
  }
  console.error('\nانسخ .env.example إلى .env.local واملأ القيم.')
  process.exit(1)
}

if ((parsed.data.VITE_APP_ENV === 'production' || parsed.data.VITE_APP_ENV === 'staging') && !parsed.data.VITE_VAPID_PUBLIC_KEY) {
  console.error('❌ فحص البيئة فشل: VITE_VAPID_PUBLIC_KEY مطلوب في الإنتاج/التجربة لتفعيل إشعارات Web Push.')
  console.error('   أضف المفتاح العام فقط إلى أسرار بيئة GitHub/البناء. المفتاح الخاص يبقى في Supabase Edge Function Secrets.')
  process.exit(1)
}

console.log('✅ فحص البيئة نجح:', parsed.data.VITE_APP_ENV)
