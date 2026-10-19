/** 00251 — وحدة «ضريبة الآليات المؤجرة» (معاون المدير المفوض): النسبة العامة بسبب، الإعفاء/النسبة الخاصة، الإلغاء، المعاينة، السجل */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DeputyRentedTaxPage from '@portals/deputy/pages/RentedTax/DeputyRentedTaxPage'
import type { RentedTaxEmployee, RentedTaxOverview } from '@features/hr'

const h = vi.hoisted(() => ({ overview: null as unknown, audit: [] as unknown[], preview: [] as unknown[], setPct: vi.fn(async () => ({})), setOv: vi.fn(async () => ({})), clearOv: vi.fn(async () => undefined) }))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr', () => ({
  useRentedTaxOverview: () => ({ data: h.overview, isLoading: false }), useRentedTaxAudit: (on: boolean) => ({ data: on ? h.audit : undefined, isLoading: false }), useRentedTaxPreview: (m: string | null) => ({ data: m ? h.preview : undefined, isLoading: false }),
  useRentedTaxSetPct: () => mut(h.setPct), useRentedTaxOverrideSet: () => mut(h.setOv), useRentedTaxOverrideClear: () => mut(h.clearOv),
}))

const emp = (o: Partial<RentedTaxEmployee>): RentedTaxEmployee => ({ employee_id: 'e', employee_number: 'X', full_name: 'x', department_name: 'النقل', job_title: 'سائق', vehicles: 'DB-1 — كابسة', linked: true, pct: 3, source: 'auto', override: null, last_month: '2026-09-01', last_gross: 1350000, last_tax: 40500, last_pct: 3, has_salary: true, ...o })
const OV: RentedTaxOverview = {
  pct: 3, updated_at: '2026-10-01T08:00:00Z', updated_by: 'المعاون', last_export_month: '2026-09-01', rented_vehicles: 3, rented_vehicles_without_driver: 1,
  employees: [
    emp({ employee_id: 'e1', employee_number: 'D-1', full_name: 'كرار' }),
    emp({ employee_id: 'e2', employee_number: 'D-2', full_name: 'حيدر', pct: 2, source: 'custom', override: { mode: 'custom', pct: 2, reason: 'اتفاق خاص', valid_from: '2026-10-01', valid_to: null, created_at: '2026-10-01T08:00:00Z', by: 'المعاون' }, last_tax: 24000, last_gross: 1200000, last_pct: 2 }),
    emp({ employee_id: 'e3', employee_number: 'D-3', full_name: 'علي', pct: 0, source: 'exempt', override: { mode: 'exempt', pct: null, reason: 'انتقلت للملكية', valid_from: '2026-10-01', valid_to: '2026-12-31', created_at: '2026-10-01T08:00:00Z', by: 'المعاون' }, last_tax: 0, last_pct: 0 }),
  ],
}
beforeEach(() => { vi.clearAllMocks(); h.overview = OV; h.audit = []; h.preview = [{ employee_id: 'e1', employee_number: 'D-1', full_name: 'كرار', gross_amount: 1350000, stored_pct: 3, stored_tax: 40500, current_pct: 5, current_source: 'auto', current_tax: 67500, export_status: 'exported', version: 1 }] })
const open = () => render(<MemoryRouter><DeputyRentedTaxPage /></MemoryRouter>)

describe('00251 — ضريبة الآليات المؤجرة (المعاون)', () => {
  it('الرأس: النسبة 3٪، خاضعان، معفى 1 / خاصة 1، مجموع آخر كشف 64,500؛ المثال التوضيحي بالأرقام اللاتينية؛ الجدول يُظهر الحالة والنسبة والاستثناء', () => {
    open()
    expect(screen.getByTestId('rt-pct')).toHaveTextContent('3٪'); expect(screen.getByTestId('rt-subject')).toHaveTextContent('2'); expect(screen.getByTestId('rt-exceptions')).toHaveTextContent('1 / 1')
    expect(screen.getByTestId('rt-last-total')).toHaveTextContent('64,500'); expect(screen.getByTestId('rt-k-nodriver')).toHaveTextContent('1')
    expect(screen.getByTestId('rt-pct-box')).toHaveTextContent('1,350,000 (27 يوماً مدفوعاً من 30) × 3٪ = 40,500')
    expect(screen.getByTestId('rt-source-D-1')).toHaveTextContent('النسبة العامة'); expect(screen.getByTestId('rt-rate-D-1')).toHaveTextContent('3٪')
    expect(screen.getByTestId('rt-source-D-2')).toHaveTextContent('نسبة خاصة'); expect(screen.getByTestId('rt-rate-D-2')).toHaveTextContent('2٪'); expect(screen.getByTestId('rt-row-D-2')).toHaveTextContent('اتفاق خاص')
    expect(screen.getByTestId('rt-source-D-3')).toHaveTextContent('معفى'); expect(screen.getByTestId('rt-row-D-3')).toHaveTextContent('حتى 2026-12-31')
    expect(screen.getByTestId('rt-row-D-1')).toHaveTextContent('40,500'); expect(screen.getByTestId('rt-row-D-1')).toHaveTextContent('3٪ من 1,350,000')
    expect(screen.getByTestId('deputy-rented-tax').textContent).not.toMatch(/[\u0660-\u0669]/)
    fireEvent.click(screen.getByTestId('rt-filter-exempt'))
    expect(screen.getAllByTestId(/^rt-row-/)).toHaveLength(1)
  })
  it('النسبة العامة: الزر معطّل بلا تغيير؛ السبب إلزامي؛ ثم الحفظ يرسل 5٪ مع السبب', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    open()
    expect(screen.getByTestId('rt-pct-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('rt-pct-input'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('rt-pct-save'))
    expect(alert).toHaveBeenCalledWith('سبب التعديل إلزامي'); expect(h.setPct).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('rt-pct-reason'), { target: { value: 'قرار الإدارة' } })
    fireEvent.click(screen.getByTestId('rt-pct-save'))
    await waitFor(() => expect(h.setPct).toHaveBeenCalledWith({ pct: 5, reason: 'قرار الإدارة' }))
    alert.mockRestore()
  })
  it('إعفاء بسبب ومدة، ونسبة خاصة 1.5٪، وإلغاء الاستثناء بسبب', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('اكتمل التوثيق')
    open()
    fireEvent.click(screen.getByTestId('rt-edit-D-1'))
    const d = screen.getByTestId('rt-dialog')
    expect(within(d).getByTestId('rt-dialog-save')).toBeDisabled()
    fireEvent.change(within(d).getByTestId('rt-dialog-reason'), { target: { value: 'الآلية انتقلت لملكية الشركة' } })
    fireEvent.change(within(d).getByTestId('rt-dialog-valid-to'), { target: { value: '2026-12-31' } })
    fireEvent.click(within(d).getByTestId('rt-dialog-save'))
    await waitFor(() => expect(h.setOv).toHaveBeenCalledWith({ employeeId: 'e1', mode: 'exempt', pct: null, reason: 'الآلية انتقلت لملكية الشركة', validTo: '2026-12-31' }))
    fireEvent.click(screen.getByTestId('rt-edit-D-2'))
    const d2 = screen.getByTestId('rt-dialog')
    fireEvent.click(within(d2).getByTestId('rt-mode-custom'))
    fireEvent.change(within(d2).getByTestId('rt-dialog-pct'), { target: { value: '1.5' } })
    fireEvent.click(within(d2).getByTestId('rt-dialog-save'))
    await waitFor(() => expect(h.setOv).toHaveBeenLastCalledWith({ employeeId: 'e2', mode: 'custom', pct: 1.5, reason: 'اتفاق خاص', validTo: null }))
    fireEvent.click(screen.getByTestId('rt-clear-D-3'))
    await waitFor(() => expect(h.clearOv).toHaveBeenCalledWith({ employeeId: 'e3', reason: 'اكتمل التوثيق' }))
    expect(screen.queryByTestId('rt-clear-D-1')).toBeNull()
    prompt.mockRestore()
  })
  it('معاينة آخر كشف بالنِّسَب الحالية تُظهر المخزَّن مقابل الحالي والفرق؛ وسجل التعديلات', () => {
    h.audit = [{ id: 'a1', employee_id: null, employee_number: null, full_name: null, action: 'pct', before: { pct: 3 }, after: { pct: 5 }, reason: 'قرار', actor_name: 'المعاون', created_at: '2026-10-02T09:00:00Z' }]
    open()
    fireEvent.click(screen.getByTestId('rt-preview-toggle'))
    expect(screen.getByTestId('rt-preview-D-1')).toHaveTextContent('40,500'); expect(screen.getByTestId('rt-preview-D-1')).toHaveTextContent('67,500'); expect(screen.getByTestId('rt-preview-D-1')).toHaveTextContent('+27,000')
    fireEvent.click(screen.getByTestId('rt-audit-toggle'))
    expect(screen.getByTestId('rt-audit-row')).toHaveTextContent('تعديل النسبة العامة'); expect(screen.getByTestId('rt-audit-row')).toHaveTextContent('3٪ ← 5٪')
  })
  it('بلا سائقين ⇒ رسالة فارغة توضح أن الربط من غرفة العمليات', () => {
    h.overview = { ...OV, employees: [] }
    open()
    expect(screen.getByText('لا سائقين مرتبطين بآليات مؤجرة')).toBeInTheDocument()
  })
})
