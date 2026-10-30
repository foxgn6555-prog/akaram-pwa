/**
 * 00393 — صفحة «القطاعات والمناطق» في التطوير المركزية: الشجرة من القاعدة، إنشاء قطاع (تحقق الرمز)، إضافة منطقة،
 *   تعديل اسم، إيقاف/تفعيل — كلها عبر RPC واحدة لكل عملية وتُعيد الشجرة المحدّثة.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({
  tree: [] as unknown[],
  saveParent: vi.fn(async () => h.tree), setParentActive: vi.fn(async () => h.tree), saveArea: vi.fn(async () => h.tree),
}))
vi.mock('@sdk/sectors.sdk', () => ({ sectorsSdk: { tree: async () => h.tree, saveParent: h.saveParent, setParentActive: h.setParentActive, saveArea: h.saveArea } }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: () => void }) => unknown) => sel({ addToast: () => undefined }) }))

import SectorsPage from '@portals/it/pages/Sectors/SectorsPage'

const base = () => [
  { code: 'karrada', name: 'الكرادة', sort: 1, is_active: true, areas: [{ id: 1, code: 'S1', name: 'أرخيته', sort: 1, is_active: true }, { id: 2, code: 'S2', name: 'الرياض', sort: 2, is_active: false }] },
  { code: 'zaafaraniya', name: 'الزعفرانية', sort: 2, is_active: true, areas: [] },
]
// react-query تمرّر وسيطاً ثانياً (السياق) — نقارن الوسيط الأول فقط
const first = (fn: { mock: { calls: unknown[][] } }): unknown => fn.mock.calls.at(-1)?.[0]
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SectorsPage /></QueryClientProvider>)

beforeEach(() => { h.tree = base(); vi.clearAllMocks() })

describe('القطاعات والمناطق (00393)', () => {
  it('تعرض الشجرة من القاعدة مع الملخص والمناطق الموقوفة مشطوبة', async () => {
    renderPage()
    await screen.findByTestId('sec-parent-karrada')
    expect(screen.getByTestId('sectors-summary').textContent).toContain('2 قطاع فعّال · 1 منطقة فعّالة')
    expect(within(screen.getByTestId('sec-areas-karrada')).getByTestId('sec-area-2').textContent).toContain('الرياض')
    expect(screen.getByTestId('sec-area-toggle-2').textContent).toBe('موقوفة')
    expect(screen.getByTestId('sec-areas-zaafaraniya').textContent).toContain('لا مناطق بعد')
  })
  it('قطاع جديد: رمز غير صالح يُرفض محلياً؛ الصالح يُرسل code/name', async () => {
    renderPage()
    await screen.findByTestId('sec-parent-karrada')
    fireEvent.click(screen.getByTestId('sec-new-parent'))
    fireEvent.change(screen.getByTestId('sec-parent-name'), { target: { value: 'الدورة' } })
    fireEvent.change(screen.getByTestId('sec-parent-code'), { target: { value: 'Dora 1' } })
    fireEvent.click(screen.getByTestId('sec-parent-submit'))
    expect(screen.getByTestId('sec-parent-error')).toBeInTheDocument()
    expect(h.saveParent).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('sec-parent-code'), { target: { value: 'dora' } })
    fireEvent.click(screen.getByTestId('sec-parent-submit'))
    await waitFor(() => expect(first(h.saveParent)).toEqual({ code: 'dora', name: 'الدورة' }))
  })
  it('إضافة منطقة وتعديل اسم قطاع وإيقاف قطاع/منطقة ⇒ RPC الصحيحة بالمعاملات الصحيحة', async () => {
    renderPage()
    await screen.findByTestId('sec-parent-karrada')
    fireEvent.change(screen.getByTestId('sec-area-new-zaafaraniya'), { target: { value: 'حي الجهاد' } })
    fireEvent.click(screen.getByTestId('sec-area-add-zaafaraniya'))
    await waitFor(() => expect(first(h.saveArea)).toEqual({ parent_sector: 'zaafaraniya', name: 'حي الجهاد' }))
    fireEvent.click(screen.getByTestId('sec-edit-karrada'))
    fireEvent.change(screen.getByTestId('sec-rename-karrada'), { target: { value: 'قطاع الكرادة' } })
    fireEvent.click(screen.getByTestId('sec-rename-save-karrada'))
    await waitFor(() => expect(first(h.saveParent)).toEqual({ code: 'karrada', name: 'قطاع الكرادة' }))
    fireEvent.click(screen.getByTestId('sec-toggle-zaafaraniya'))
    await waitFor(() => expect(h.setParentActive).toHaveBeenCalledWith('zaafaraniya', false))
    fireEvent.click(screen.getByTestId('sec-area-toggle-1'))
    await waitFor(() => expect(first(h.saveArea)).toEqual({ id: 1, parent_sector: 'karrada', name: 'أرخيته', is_active: false }))
    fireEvent.click(screen.getByTestId('sec-area-edit-2'))
    fireEvent.change(screen.getByTestId('sec-area-rename-2'), { target: { value: 'الرياض الجديد' } })
    fireEvent.click(screen.getByTestId('sec-area-rename-save-2'))
    await waitFor(() => expect(first(h.saveArea)).toEqual({ id: 2, parent_sector: 'karrada', name: 'الرياض الجديد' }))
  })
})
