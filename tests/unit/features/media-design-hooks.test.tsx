/**
 * hooks التصاميم (الإعلام): حذف المسودة لا يُعيد جلب تفاصيل التصميم المحذوف نفسه، وسياسة إعادة محاولة التفاصيل.
 * الخلفية: `useMediaAction` كان يُبطل كل مفاتيح ['media'] بعد الحذف، والمحرر ما زال مفتوحاً، فيُعاد جلب التصميم المحذوف
 * ويعود MEDIA_DESIGN_NOT_FOUND (طلب بلا فائدة + خطأ في السجل عن عملية سليمة + إشعار أصفر كاذب).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({ deleteDesign: vi.fn(), designDetail: vi.fn(), toast: vi.fn() }))
vi.mock('@sdk/media.sdk', () => ({ mediaService: { deleteDesign: h.deleteDesign, designDetail: h.designDetail } }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))

import { useDeleteDesign, useDesignDetail } from '@features/media/hooks'

const wrapperFor = (qc: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
const newClient = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 1, staleTime: 0 } } })

beforeEach(() => {
  h.deleteDesign.mockReset(); h.designDetail.mockReset(); h.toast.mockReset()
  h.deleteDesign.mockResolvedValue(undefined)
})

describe('useDeleteDesign', () => {
  it('بعد الحذف يُحدَّث كل ما تحت ["media"] عدا تفاصيل التصميم المحذوف نفسه', async () => {
    const qc = newClient()
    const list = vi.fn(async () => [])
    const gone = vi.fn(async () => 'd1')
    const other = vi.fn(async () => 'd2')
    const { result } = renderHook(
      () => ({
        l: useQuery({ queryKey: ['media', 'designs', null], queryFn: list }),
        a: useQuery({ queryKey: ['media', 'design-detail', 'd1'], queryFn: gone }),
        b: useQuery({ queryKey: ['media', 'design-detail', 'd2'], queryFn: other }),
        del: useDeleteDesign(),
      }),
      { wrapper: wrapperFor(qc) },
    )
    await waitFor(() => expect(result.current.l.isSuccess && result.current.a.isSuccess && result.current.b.isSuccess).toBe(true))
    expect([list, gone, other].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])

    await act(async () => { result.current.del.mutate(['d1']) })
    await waitFor(() => expect(result.current.del.isSuccess).toBe(true))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))       // القائمة تُحدَّث
    await waitFor(() => expect(other).toHaveBeenCalledTimes(2))      // تفاصيل تصميم آخر تُحدَّث
    expect(gone).toHaveBeenCalledTimes(1)                            // المحذوف لا يُعاد جلبه
    expect(h.deleteDesign).toHaveBeenCalledWith('d1')
    expect(h.toast).toHaveBeenCalledWith({ type: 'success', message: 'حُذف التصميم' })
  })

  it('فشل الحذف: إشعار خطأ بالرسالة العربية المعرّفة، بلا إبطال ولا إشعار نجاح', async () => {
    const qc = newClient()
    const gone = vi.fn(async () => 'd1')
    h.deleteDesign.mockRejectedValue(new Error('MEDIA_DESIGN_NOT_DELETABLE'))
    const { result } = renderHook(
      () => ({ a: useQuery({ queryKey: ['media', 'design-detail', 'd1'], queryFn: gone }), del: useDeleteDesign() }),
      { wrapper: wrapperFor(qc) },
    )
    await waitFor(() => expect(result.current.a.isSuccess).toBe(true))
    await act(async () => { result.current.del.mutate(['d1']) })
    await waitFor(() => expect(result.current.del.isError).toBe(true))
    expect(h.toast).toHaveBeenCalledTimes(1)
    expect(h.toast).toHaveBeenCalledWith({ type: 'error', message: 'لا يمكن حذف تصميم مكتمل' })
    expect(gone).toHaveBeenCalledTimes(1)
  })
})

describe('useDesignDetail — إعادة المحاولة الآلية', () => {
  const run = async (error: Error) => {
    h.designDetail.mockRejectedValue(error)
    const { result } = renderHook(() => useDesignDetail('d1'), { wrapper: wrapperFor(newClient()) })
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
    return result.current
  }
  it('«غير موجود» لا يُعاد (محاولة واحدة)', async () => {
    await run(new Error('MEDIA_DESIGN_NOT_FOUND'))
    expect(h.designDetail).toHaveBeenCalledTimes(1)
  })
  it('«بلا صلاحية» لا يُعاد (محاولة واحدة)', async () => {
    await run(new Error('MEDIA_FORBIDDEN'))
    expect(h.designDetail).toHaveBeenCalledTimes(1)
  })
  it('خطأ عابر (شبكة/خادم) يُعاد محاولتين ثم يظهر الخطأ للوحة «إعادة المحاولة»', async () => {
    const r = await run(Object.assign(new Error('تعذر الاتصال بالخادم'), { code: 'NETWORK' }))
    expect(h.designDetail).toHaveBeenCalledTimes(3)
    expect(r.error).toBeInstanceOf(Error)
  })
})
