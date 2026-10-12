/** 00209: صفحة «الإجراءات» في بوابة الكراج — تعيين أساسي (بلا حقول حساسة) + إنهاء خدمة عبر الموافقات + متابعة اكتمال الملف. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const hireOptions = vi.fn(); const hire = vi.fn(); const recentHires = vi.fn(); const mine = vi.fn(); const targets = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { hireOptions: () => hireOptions(), hire: (...a: unknown[]) => hire(...a), recentHires: () => recentHires() } }))
vi.mock('@sdk/sector-manager.sdk', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, procedures: { ...(m.procedures as object), mine: () => mine(), targets: () => targets(), create: vi.fn(), cancel: vi.fn() } }
})

import GarageProceduresPage from '@portals/central-garage/pages/GarageProceduresPage'

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('GarageProceduresPage (00209)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hireOptions.mockResolvedValue({ job_titles: [{ id: 't1', name: 'سائق شاحنة', department_id: 'd2', department: 'سوّاق الكراج', drives_vehicles: true }], shifts: [{ id: 's1', name: 'الصباحي', start_time: '08:00', end_time: '16:00' }], next_employee_number: 'G-0012', scoped: true })
    recentHires.mockResolvedValue([{ id: 'e9', employee_number: 'G-0011', full_name: 'كريم سعد', job_title: 'سائق شاحنة', is_driver: true, hire_date: '2026-10-01', contract_type: 'monthly', employment_status: 'active', has_biometric: false, has_manager: true, salary_ready: false }])
    mine.mockResolvedValue([{ id: 'r1', target_kind: 'employee', target_name: 'سائق الكراج', target_label: 'سائق', termination_type: 'resignation', termination_type_label: 'استقالة', last_day: '2026-10-30', reason: 'استقالة', status: 'pending', current_step: 'الموارد البشرية', chain_id: null, created_at: '2026-10-12T08:00:00Z', decided_at: null, executed_at: null }])
    targets.mockResolvedValue([{ target_kind: 'employee', employee_id: 'e1', worker_id: null, user_id: 'u1', full_name: 'سائق الكراج', label: 'الكراج المركزي · سائق', scope: 'garage', employee_number: 'G-DRV' }])
    hire.mockResolvedValue({ id: 'e10', employee_number: 'G-0012', full_name: 'علي حسين', job_title: 'سائق شاحنة', department_id: 'd2', is_driver: true, hire_date: '2026-10-12', contract_type: 'monthly' })
  })

  it('الرأس الموحد + نموذج التعيين بالحقول الأساسية فقط ويرسل بلا حقول حساسة', async () => {
    wrap(<GarageProceduresPage />)
    expect(await screen.findByTestId('exec-page-header')).toHaveTextContent('إجراءات الكراج')
    const form = await screen.findByTestId('gp-hire-form')
    expect(form.innerHTML).not.toMatch(/راتب<|بصمة<|الهوية|البطاقة/)   // لا حقول إدخال حساسة
    expect(screen.queryByTestId('gp-biometric')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('gp-number')).toHaveValue('G-0012'))
    expect(screen.getByTestId('gp-hire-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('gp-name'), { target: { value: 'علي حسين' } })
    fireEvent.change(screen.getByTestId('gp-title'), { target: { value: 't1' } })
    expect(screen.getByTestId('gp-hire-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('gp-hire-submit'))
    await waitFor(() => expect(hire).toHaveBeenCalledTimes(1))
    const sent = hire.mock.calls[0][0] as Record<string, unknown>
    expect(sent).toMatchObject({ full_name: 'علي حسين', employee_number: 'G-0012', job_title_id: 't1', contract_type: 'monthly' })
    expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['biometric_pin', 'base_salary', 'national_id_number']))
    expect(await screen.findByTestId('gp-hires-table')).toBeInTheDocument()   // ينتقل إلى التعيينات الأخيرة
  })

  it('التعيينات الأخيرة تُظهر اكتمال الملف (بصمة HR / راتب المالية) بلا مبالغ', async () => {
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('التعيينات الأخيرة'))
    const row = await screen.findByTestId('gp-hire-G-0011')
    expect(row).toHaveTextContent('كريم سعد'); expect(row).toHaveTextContent('○ بصمة (HR)'); expect(row).toHaveTextContent('○ راتب (المالية)'); expect(row).toHaveTextContent('✓ مدير مباشر (HR)')
    expect(row.innerHTML).not.toMatch(/\d{3},\d{3}|IQD|د\.ع/)
  })

  it('إنهاء الخدمة يستخدم وحدة الإجراءات (نطاق الخادم) و«طلباتي» تعرض الطلب المعلّق', async () => {
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.click(screen.getByText('إنهاء خدمة'))
    expect(await screen.findByTestId('target-e1')).toHaveTextContent('سائق الكراج')
    fireEvent.click(screen.getByText('طلباتي'))
    expect(await screen.findByTestId('req-status-r1')).toHaveTextContent('قيد الموافقة')
  })

  it('خطأ الخادم عند حقل حساس يظهر برسالة واضحة', async () => {
    hire.mockRejectedValue(new Error('GARAGE_SENSITIVE_FIELD_FORBIDDEN'))
    wrap(<GarageProceduresPage />)
    await screen.findByTestId('gp-hire-form')
    fireEvent.change(screen.getByTestId('gp-name'), { target: { value: 'علي حسين' } })
    fireEvent.change(screen.getByTestId('gp-title'), { target: { value: 't1' } })
    fireEvent.click(screen.getByTestId('gp-hire-submit'))
    expect(await screen.findByTestId('gp-hire-error')).toHaveTextContent('البيانات الأساسية فقط')
  })
})
