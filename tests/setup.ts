/** إعداد عام لكل اختبارات Vitest — env + i18n قبل أي استيراد */
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// متغيرات بيئة آمنة للاختبار — على المستوى الأعلى (وليس beforeAll) لأن بعض
// الوحدات (services/client.ts) تقرأ القيم وقت الاستيراد قبل تشغيل الخطافات.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-local-only-0000000000')
vi.stubEnv('VITE_APP_ENV', 'development')

import '../src/i18n'  // تهيئة i18next قبل أي مكون يستخدم useTranslation (مسار نسبي: setup يُحمَّل مبكراً)
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

beforeAll(() => {
  // (محجوز) متغيرات البيئة مضبوطة أعلى الملف لتسبق استيراد الوحدات

  // محاكاة crypto.randomUUID في jsdom عند غيابها
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...globalThis.crypto, randomUUID: () => 'test-uuid-' + Math.random().toString(16).slice(2) },
    })
  }

  // jsdom لا يدعم رسم canvas — نعيد null بهدوء بدل طباعة خطأ «Not implemented»
  // (منشئ الرسوم في src/lib/export يلتقط null ويتخطى الصورة في الاختبارات).
  try {
    const proto = (globalThis as { HTMLCanvasElement?: { prototype: object } }).HTMLCanvasElement?.prototype
    if (proto && !(proto as { getContext?: unknown }).getContext) {
      ;(proto as { getContext: () => null }).getContext = () => null
    } else if (proto) {
      ;(proto as { getContext: () => null }).getContext = () => null
    }
  } catch {
    /* تجاهل */
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})
