/**
 * Mock كامل لعميل Supabase — يُستخدم في اختبارات unit للـ SDK.
 * الاستيراد: vi.mock('@sdk/client', ...) مع this factory
 */
import { vi } from 'vitest'

export interface MockChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

export function createMockChain(finalData: unknown = [], finalError: unknown = null): MockChain {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: finalData, error: finalError })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: finalData, error: finalError })),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  }
  // الاستدعاء المباشر (بدون single) يعيد promise — لكن chain ليس thenable،
  // لذا كل دوال الـ SDK تستخدم single/maybeSingle في الاختبارات أو نعنيه هنا:
  // @ts-expect-error — thenable hack للاختبار فقط
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: finalData, error: finalError })
  return chain as unknown as MockChain
}

export const mockSupabaseClient = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(() => createMockChain()),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}
