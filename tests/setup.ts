/** إعداد عام لكل اختبارات Vitest — env + i18n قبل أي استيراد */
import '@testing-library/jest-dom/vitest'
import '../src/i18n'  // تهيئة i18next قبل أي مكون يستخدم useTranslation (مسار نسبي: setup يُحمَّل مبكراً)
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

beforeAll(() => {
  // متغيرات بيئة آمنة للاختبار (config lazy getters تقرأها عند الاستخدام)
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-local-only-0000000000')
  vi.stubEnv('VITE_APP_ENV', 'development')

  // محاكاة crypto.randomUUID في jsdom عند غيابها
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...globalThis.crypto, randomUUID: () => 'test-uuid-' + Math.random().toString(16).slice(2) },
    })
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})
