import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ windows: vi.fn(), history: vi.fn() }))
vi.mock('@sdk/gps-lvn.sdk', () => ({
  gpsLvn: { tripHistoryWindows: h.windows, importDepartureHistory: h.history },
}))
vi.mock('@lib/errors/error.handler', () => ({
  handleAppError: (error: Error) => ({ message: error.message }),
}))
import { useGpsBatchHistoryAudit } from '@features/gps-lvn/hooks'
import { useUiStore } from '@stores/ui.store'

describe('التدقيق الجماعي لنوافذ الانطلاقيات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUiStore.setState({ toasts: [] })
    h.windows.mockImplementation(async (id: string) =>
      id === 't1'
        ? [
            { window_index: 0, status: 'success' },
            { window_index: 1, status: 'pending' },
          ]
        : [{ window_index: 0, status: 'pending' }],
    )
    h.history.mockImplementation(async (id: string, index: number) => {
      if (id === 't2') throw new Error('تعذر LVN')
      return { ok: true, action: 'history', windowIndex: index }
    })
  })
  it('يتجاوز النافذة الناجحة ويكمل بقية الانطلاقيات مع نتيجة مستقلة', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useGpsBatchHistoryAudit(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(['t1', 't2', 't1'])
    })
    expect(h.windows).toHaveBeenCalledTimes(2)
    expect(h.history).toHaveBeenCalledWith('t1', 1)
    expect(h.history).not.toHaveBeenCalledWith('t1', 0)
    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.results).toEqual([
      expect.objectContaining({ departureId: 't1', windows: 2, audited: 1, status: 'success' }),
      expect.objectContaining({ departureId: 't2', status: 'failed' }),
    ])
    expect(useUiStore.getState().toasts.at(-1)?.type).toBe('warning')
  })
})
