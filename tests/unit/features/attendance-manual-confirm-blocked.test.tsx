/**
 * الحضور اليدوي — اعتماد حضورية الشهر المرفوض بسبب أيام بانتظار الكشف:
 * الخطأ القادم من الخادم (ATT_MANUAL_SHEETS_PENDING: n) يصير تنبيهاً عربياً بعدد الأيام عبر مسار الاعتماد الفعلي
 * (RPC ← hr.sdk ← useConfirmAttendanceMonth ← toast)، لا رمزاً خاماً.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
}))

import { useConfirmAttendanceMonth } from '@features/hr/hooks/useHr'
import { useUiStore } from '@stores/ui.store'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
)

beforeEach(() => { rpc.mockReset(); useUiStore.setState({ toasts: [] }) })

describe('اعتماد الشهر مع كشوف يدوية ناقصة', () => {
  it('الرفض يصل المستخدم بالعربية مع عدد الأيام المعلّقة', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ATT_MANUAL_SHEETS_PENDING: 7', code: 'P0001' } })
    const { result } = renderHook(() => useConfirmAttendanceMonth(), { wrapper })
    await act(async () => { await result.current.mutateAsync('2026-11-01').catch(() => undefined) })
    expect(rpc).toHaveBeenCalledWith('ops_attendance_confirm', { p_month: '2026-11-01' })
    await waitFor(() => expect(useUiStore.getState().toasts).toHaveLength(1))
    const t = useUiStore.getState().toasts[0]!
    expect(t.type).toBe('error')
    expect(t.message).toContain('لا يمكن اعتماد حضورية الشهر')
    expect(t.message).toContain('(عددها: 7)')
    expect(t.message).not.toMatch(/ATT_MANUAL|\{n\}/)
  })

  it('بعد اكتمال الكشوف يمرّ الاعتماد برسالة نجاح عادية (لا أثر للمنع)', async () => {
    rpc.mockResolvedValue({ data: { confirm_count: 1 }, error: null })
    const { result } = renderHook(() => useConfirmAttendanceMonth(), { wrapper })
    await act(async () => { await result.current.mutateAsync('2026-11-01') })
    await waitFor(() => expect(useUiStore.getState().toasts).toHaveLength(1))
    expect(useUiStore.getState().toasts[0]).toMatchObject({ type: 'success', message: expect.stringContaining('اعتُمدت حضورية الشهر') })
  })
})
