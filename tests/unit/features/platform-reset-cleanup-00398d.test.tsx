import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as Sdk from '@sdk/platform-reset.sdk'
const h = vi.hoisted(() => ({ request: vi.fn(), approve: vi.fn(), storage: vi.fn(), warehouse: vi.fn(), toast: vi.fn() }))
vi.mock('@sdk/platform-reset.sdk', async (orig) => {
  const m = await orig<typeof Sdk>()
  return { ...m, platformReset: { ...m.platformReset, request: h.request, approve: h.approve, wipeStorage: h.storage, wipeWarehouse: h.warehouse } }
})
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
import { usePlatformResetApprove, usePlatformResetRequest } from '@features/platform-reset/hooks'
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
const result = { buckets: ['employees'], warehouse_wipe: true, rows_deleted: 3 }

describe('إكمال التصفير تلقائياً بعد قاعدة البيانات', () => {
  it('الاعتماد النهائي يبدأ الملفات والمستودع، وفشل المستودع يظهر تحذيراً دون الادعاء أن القاعدة لم تُصفّر', async () => {
    h.approve.mockResolvedValueOnce({ id: 'q', final: true, result })
    h.storage.mockResolvedValueOnce({ deleted: 1, remaining: 0 })
    h.warehouse.mockResolvedValueOnce({ ok: false, error: 'GPS_WAREHOUSE_RESET_RETRY_REQUIRED' })
    const { result: hook } = renderHook(() => usePlatformResetApprove(), { wrapper })
    hook.current.mutate({ id: 'q', password: 'اعتماد تصفير' })
    await waitFor(() => expect(hook.current.isSuccess).toBe(true))
    expect(h.storage).toHaveBeenCalledWith('q'); expect(h.warehouse).toHaveBeenCalledWith('q')
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', message: expect.stringContaining('أعد المحاولة') }))
  })
  it('طلب بانتظار السلسلة لا يبدأ أي حذف', async () => {
    h.storage.mockClear(); h.warehouse.mockClear()
    h.request.mockResolvedValueOnce({ id: 'pending', via_chain: true, status: 'pending_approval', result })
    const { result: hook } = renderHook(() => usePlatformResetRequest(), { wrapper })
    hook.current.mutate({ categories: ['gps_warehouse'], password: 'تصفير' })
    await waitFor(() => expect(hook.current.isSuccess).toBe(true))
    expect(h.storage).not.toHaveBeenCalled(); expect(h.warehouse).not.toHaveBeenCalled()
  })
})
