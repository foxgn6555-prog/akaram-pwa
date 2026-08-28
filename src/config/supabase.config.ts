/** إعداد Supabase — يتحقق صارمًا من المتغيرات (لا قيم افتراضية خادعة في production) */
function required(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) {
    throw new Error(
      `متغير البيئة ${name} مفقود — انسخ .env.example إلى .env.local واملأه (scripts/check-env.ts)`,
    )
  }
  return value
}

function rejectSecretInClient(name: string, value: string): string {
  // درع أخير: لو وُضِع sb_secret_ متغيراً بـ VITE_ — أوقف الإقلاع فوراً
  if (value.startsWith('sb_secret_')) {
    throw new Error(
      `أمن: ${name} يحتوي مفتاحاً سرياً (sb_secret_) — المفاتيح السرية ممنوعة من الواجهة. ` +
      'ضع المفتاح السري في متغير بلا VITE_ (يقرؤه الخادم/الاختبارات فقط).',
    )
  }
  return value
}

export const supabaseConfig = {
  get url(): string {
    return required('VITE_SUPABASE_URL')
  },
  get anonKey(): string {
    return rejectSecretInClient(
      'VITE_SUPABASE_ANON_KEY',
      required('VITE_SUPABASE_ANON_KEY'),
    )
  },
}
