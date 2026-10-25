/** 00209/00348: صفحة «الإجراءات» في بوابة الكراج — «طلب تعيين» (بلا رقم وظيفي ولا حقول حساسة؛ طلب فقط عبر الموافقات) + إنهاء خدمة عبر الموافقات + «طلباتي» بحالة الطلب + متابعة اكتمال الملف. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const hireOptions = vi.fn(); const hire = vi.fn(); const recentHires = vi.fn(); const mine = vi.fn(); const targets = vi.fn()
const myHireRequests = vi.fn(); const cancelHireRequest = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { hireOptions: () => hireOptions(), hire: (...a: unknown[]) => hire(...a), recentHires: () => recentHires(), myHireRequests: () => myHireRequests(), cancelHireRequest: (...a: unknown[]) => cancelHireRequest(...a) } }))
vi.mock('@sdk/sector-manager.sdk', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, procedures: { ...(m.procedures as object), mine: () => mine(), targets: () => targets(), create: vi.fn(), cancel: vi.fn() } }
})

import GarageProceduresPage from '@portals/central-garage/pages/GarageProceduresPage'

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('GarageProceduresPage (00209)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hireOptions.mockResolvedValue({ job_titles: [{ id: 't1', name: 'سائق شاحنة', department_id: 'd2', department: 'سوّاق الكراج', drives_vehicles: true }], shifts: [{ id: 's1', name: 'الصباحي', start_time: '08:00', end_time: '16:00' }], scoped: true, chain: { steps: 2, labels: ['معاون المدير المفوض', 'المدير المفوض'] } })
    recentHires.mockResolvedValue([{ id: 'e9', employee_number: 'G-0011', full_name: 'كريم سعد', job_title: 'سائق شاحنة', is_driver: true, hire_date: '2026-10-01', contract_type: 'monthly', employment_status: 'active', has_biometric: false, has_manager: true, salary_ready: false }])
    mine.mockResolvedValue([{ id: 'r1', target_kind: 'employee', target_name: 'سائق الكراج', target_label: 'سائق', termination_type: 'resignation', termination_type_label: 'استقالة', last_day: '2026-10-30', reason: 'استقالة', status: 'pending', current_step: 'الموارد البشرية', chain_id: null, created_at: '2026-10-12T08:00:00Z', decided_at: null, executed_at: null }])
    targets.mockResolvedValue([{ target_kind: 'employee', employee_id: 'e1', worker_id: null, user_id: 'u1', full_name: 'سائق الكراج', label: 'الكراج المركزي · سائق', scope: 'garage', employee_number: 'G-DRV' }])
    hire.mockResolvedValue({ id: 'q10', full_name: 'علي حسين', job_title: 'سائق شاحنة', department: 'سوّاق الكراج', hire_date: '2026-10-12', contract_type: 'monthly', status: 'pending', via_chain: true })
    cancelHireRequest.mockResolvedValue(undefined)
    myHireRequests.mockResolvedValue([
      { id: 'q1', full_name: 'علي حسين', phone: null, job_title: 'سائق شاحنة', department: 'سوّاق الكراج', hire_date: '2026-10-12', contract_type: 'monthly', shift_name: null, status: 'pending', current_step: 'معاون المدير المفوض', rejected_note: null, created_at: '2026-10-12T08:00:00Z', decided_at: null, completed_at: null, employee_number: null },
      { id: 'q2', full_name: 'سعد كاظم', phone: null, job_title: 'سائق شاحنة', department: 'سوّاق الكراج', hire_date: '2026-10-01', contract_type: 'daily', shift_name: null, status: 'rejected', current_step: null, rejected_note: 'لا شاغر حالياً', created_at: '2026-10-01T08:00:00Z', decided_at: '2026-10-02T08:00:00Z', completed_at: null, employee_number: null },
      { id: 'q3', full_name: 'حسن علي', phone: null, job_title: 'سائق شاحنة', department: 'سوّاق الكراج', hire_date: '2026-09-20', contract_type: 'monthly', shift_name: null, status: 'approved', current_step: null, rejected_note: null, created_at: '2026-09-20T08:00:00Z', decided_at: '2026-09-21T08:00:00Z', completed_at: null, employee_number: null },
    ])
  })

  it('الرأس الموحد + نموذج «طلب تعيين» بلا رقم وظيفي ويرسل طلباً فقط بلا حقول حساسة ويعرض مسار الموافقة', async () => {
    wrap(<GarageProceduresPage />)
    expect(await screen.findByTestId('exec-page-header')).toHaveTextContent('إجراءات الكراج')
    const form = await screen.findByTestId('gp-hire-form')
    expect(form.innerHTML).not.toMatch(/راتب<|بصمة<|الهوية|البطاقة/)   // لا حقول إدخال حساسة
    expect(screen.queryByTestId('gp-biometric')).toBeNull()
    expect(screen.queryByTestId('gp-number')).toBeNull()   // 00348: لا حقل رقم وظيفي
    expect(form.innerHTML).not.toMatch(/الرقم الوظيفي<input/)
    expect(screen.getByTestId('gp-hire-path')).toHaveTextContent('معاون المدير المفوض ← المدير المفوض')
    expect(screen.getByTestId('gp-hire-submit')).toHaveTextContent('إرسال طلب التعيين')
    expect(screen.getByTestId('gp-hire-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('gp-name'), { target: { value: 'علي حسين' } })
    fireEvent.change(screen.getByTestId('gp-title'), { target: { value: 't1' } })
    expect(screen.getByTestId('gp-hire-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('gp-hire-submit'))
    await waitFor(() => expect(hire).toHaveBeenCalledTimes(1))
    const sent = hire.mock.calls[0]?.[0] as Record<string, unknown>
    expect(sent).toMatchObject({ full_name: 'علي حسين', job_title_id: 't1', contract_type: 'monthly' })
    expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['employee_number', 'biometric_pin', 'base_salary', 'national_id_number']))
    expect(await screen.findByTestId('gp-hire-requests')).toBeInTheDocument()   // ينتقل إلى «طلباتي»
  })

  it('التعيينات الأخيرة تُظهر اكتمال الملف (بصمة HR / راتب المالية) بلا مبالغ', async () => {
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('التعيينات الأخيرة'))
    const row = await screen.findByTestId('gp-hire-G-0011')
    expect(row).toHaveTextContent('كريم سعد'); expect(row).toHaveTextContent('○ بصمة (HR)'); expect(row).toHaveTextContent('○ راتب (المالية)'); expect(row).toHaveTextContent('✓ مدير مباشر (HR)')
    expect(row.innerHTML).not.toMatch(/\d{3},\d{3}|IQD|د\.ع/)
  })

  it('«طلباتي» تعرض طلبات التعيين بحالتها: عند من، سبب الرفض، معتمد بانتظار HR، وإلغاء المعلّق', async () => {
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('طلباتي'))
    expect(await screen.findByTestId('gp-hire-req-status-q1')).toHaveTextContent('قيد الموافقة')
    expect(screen.getByTestId('gp-hire-req-step-q1')).toHaveTextContent('عند: معاون المدير المفوض')
    expect(screen.getByTestId('gp-hire-req-status-q2')).toHaveTextContent('مرفوض')
    expect(screen.getByTestId('gp-hire-req-reason-q2')).toHaveTextContent('لا شاغر حالياً')
    expect(screen.getByTestId('gp-hire-req-status-q3')).toHaveTextContent('معتمد — بانتظار الموارد البشرية')
    expect(screen.queryByTestId('gp-hire-req-cancel-q2')).toBeNull()
    fireEvent.click(screen.getByTestId('gp-hire-req-cancel-q1'))
    await waitFor(() => expect(cancelHireRequest).toHaveBeenCalledWith('q1'))
  })

  it('إنهاء الخدمة يستخدم وحدة الإجراءات (نطاق الخادم) و«طلباتي» تعرض الطلب المعلّق', async () => {
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('إنهاء خدمة'))
    expect(await screen.findByTestId('target-e1')).toHaveTextContent('سائق الكراج')
    fireEvent.click(screen.getByText('طلباتي'))
    expect(await screen.findByTestId('req-status-r1')).toHaveTextContent('قيد الموافقة')
  })

  it('خطأ الخادم (رقم وظيفي مرسَل) يظهر برسالة واضحة', async () => {
    hire.mockRejectedValue(new Error('HIRE_NUMBER_NOT_ALLOWED'))
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.change(screen.getByTestId('gp-name'), { target: { value: 'علي حسين' } })
    fireEvent.change(screen.getByTestId('gp-title'), { target: { value: 't1' } })
    fireEvent.click(screen.getByTestId('gp-hire-submit'))
    expect(await screen.findByTestId('gp-hire-error')).toHaveTextContent('تكتبه الموارد البشرية بعد اعتماد الطلب')
  })
})
