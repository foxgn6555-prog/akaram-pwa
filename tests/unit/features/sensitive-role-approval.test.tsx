/**
 * V-36 — الأدوار الحساسة لا تُنفَّذ مباشرة:
 *  · setUserRole يعيد { pending: true } بعد أن يُنشئ الخادم طلب موافقة
 *  · الخطاف لا يُحدّث الأدوار تفاؤلياً للأدوار الحساسة (لا «ممنوح» قبل الموافقة)
 *  · الأدوار العادية تبقى فورية كما كانت
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/services/client', () => ({
  supabase: { rpc: h.rpc },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => {
    const r = await p
    if (r.error) throw r.error
    return r.data
  },
  sdkVoid: async (p: Promise<{ error: unknown }>) => {
    const r = await p
    if (r.error) throw r.error
  },
  sdkMaybe: async (p: Promise<{ data: unknown }>) => (await p).data,
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
vi.mock('@lib/errors/error.handler', () => ({ handleAppError: (e: Error) => ({ message: e.message }) }))

import { SENSITIVE_ROLES, users } from '@sdk/users.sdk'
import { useSetUserRole } from '@features/user-management'

const wrap = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children)

beforeEach(() => {
  h.rpc.mockReset()
  h.toast.mockReset()
})

describe('V-36 · الأدوار الحساسة', () => {
  it('قائمة الأدوار الحساسة مطابقة لحارس القاعدة (أربعة)', () => {
    expect([...SENSITIVE_ROLES]).toEqual(['it_admin', 'super_admin', 'finance_officer', 'deputy_director'])
  })

  it('منح دور حسّاس ⇒ pending=true ولا يُضاف الدور محلياً', async () => {
    h.rpc.mockImplementation((fn: string) => {
      if (fn === 'set_user_role') return Promise.resolve({ data: null, error: null })
      if (fn === 'role_grant_requests_list')
        return Promise.resolve({ data: [{ role: 'finance_officer', is_grant: true, status: 'pending' }], error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const res = await users.setUserRole('u1', 'finance_officer', true)
    expect(res).toEqual({ pending: true })
  })

  it('دور عادي ⇒ pending=false بلا سؤال إضافي', async () => {
    h.rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }))
    const res = await users.setUserRole('u1', 'media_officer', true)
    expect(res).toEqual({ pending: false })
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })

  it('الخطاف: رسالة «قيد موافقة المدير المفوض» بدل «تم منح الدور»', async () => {
    h.rpc.mockImplementation((fn: string) => {
      if (fn === 'set_user_role') return Promise.resolve({ data: null, error: null })
      if (fn === 'role_grant_requests_list')
        return Promise.resolve({ data: [{ role: 'super_admin', is_grant: true, status: 'pending' }], error: null })
      return Promise.resolve({ data: null, error: null })
    })
    const { result } = renderHook(() => useSetUserRole(), { wrapper: wrap })
    result.current.mutate({ userId: 'u1', role: 'super_admin', grant: true })
    await waitFor(() => expect(h.toast).toHaveBeenCalled())
    expect(h.toast.mock.calls[0][0].message).toContain('المدير المفوض')
    expect(h.toast.mock.calls[0][0].message).not.toContain('تم منح الدور')
  })
})
