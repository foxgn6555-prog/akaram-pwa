/** Mock للـ virtual:pwa-register — يمنع تسجيل SW في الاختبارات */
import { vi } from 'vitest'

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(),
}))
