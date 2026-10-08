/** 00195 — بوابة التطوير المركزية: وحدة «الاستقطاعات التلقائية» (القواعد · النطاق · الاستثناءات · الموظفون · المحاكاة · السجل) + التنقّل والمسار */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  exemptions: [] as Array<Record<string, unknown>>,
  employees: [] as Array<Record<string, unknown>>,
  saveRule: vi.fn(), deleteRule: vi.fn(), setTargets: vi.fn(), addExempt: vi.fn(), removeExempt: vi.fn(), simulate: vi.fn(),
}))
const SETTINGS = () => ({
  grace_minutes_default: 15, absent_day_deduction_days: 1, incomplete_punch_as_absent: false,
  deduction_tiers: [{ from: 1, to: 15, minutes: 0 }, { from: 16, to: 30, minutes: 30 }, { from: 31, to: null, day_fraction: 0.5 }],
  auto_deduction_enabled: true, deduct_absence_enabled: true, deduct_shortfall_enabled: true, deduct_unpaid_leave_enabled: true,
  auto_deduction_amount_mode: 'salary', fixed_absent_day_amount: 0, fixed_shortfall_minute_amount: 0, max_auto_deduction_days_per_month: 0, auto_deduction_cap_ratio: 1,
})
const RULES = () => [
  { id: 'def', name: 'القاعدة الافتراضية', description: null, is_default: true, is_active: true, settings: SETTINGS(), updated_at: '2026-10-01T00:00:00Z', targets: [], employees_count: 40 },
  { id: 'strict', name: 'صارمة', description: 'للسائقين', is_default: false, is_active: true, settings: { ...SETTINGS(), auto_deduction_amount_mode: 'fixed', fixed_absent_day_amount: 5000, fixed_shortfall_minute_amount: 100, incomplete_punch_as_absent: true }, updated_at: '2026-10-01T00:00:00Z',
    targets: [{ id: 't1', target_type: 'department', target_id: 'd1', name: 'النقل' }], employees_count: 12 },
]
const mut = (fn: (...a: never[]) => unknown) => ({ mutate: (v: never, opts?: { onSuccess?: (r: unknown) => void }) => { const r = fn(v); opts?.onSuccess?.(r) }, mutateAsync: fn, isPending: false })

vi.mock('@features/branches/hooks/useBranches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'بغداد', code: 'BG', is_active: true }, { id: 'b2', name: 'البصرة', code: 'BS', is_active: true }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useDeductionRules: () => ({ data: h.rules, isLoading: false }),
  useSaveDeductionRule: () => mut(h.saveRule), useDeleteDeductionRule: () => mut(h.deleteRule), useSetDeductionTargets: () => mut(h.setTargets),
  useDeductionExemptions: () => ({ data: h.exemptions, isLoading: false }), useAddDeductionExemption: () => mut(h.addExempt), useRemoveDeductionExemption: () => mut(h.removeExempt),
  useDeductionEmployees: () => ({ data: h.employees, isLoading: false }),
  useSimulateDeductionV2: () => mut(h.simulate), useDeductionAudit: () => ({ data: [{ id: 1, action: 'rule_save', rule_id: 'strict', rule_name: 'صارمة', before: null, after: { name: 'صارمة' }, actor: 'u1', actor_name: 'مدير التطوير', created_at: '2026-10-01T10:00:00Z' }] }),
  useHrDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null, is_active: true, is_job_title: false }, { id: 'jt1', name: 'سائق', parent_id: 'd1', is_active: true, is_job_title: true }, { id: 'd2', name: 'الإدارة', parent_id: null, is_active: true, is_job_title: false }] }),
  useHrEmployees: () => ({ data: [{ id: 'e1', employee_number: 'E1', full_name: 'أحمد' }, { id: 'e2', employee_number: 'E2', full_name: 'سارة' }] }),
}))

import AutoDeductionsPage from '@portals/it/pages/Integrations/AutoDeductionsPage'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'
import sidebar from '@/i18n/ar/sidebar.json'

const EMP = (o: Record<string, unknown>) => ({
  employee_id: 'e1', employee_number: 'E1', full_name: 'أحمد', job_title: 'سائق', department_id: 'd1', department_name: 'النقل', branch_id: 'b1', branch_name: 'بغداد', contract_type: 'monthly',
  rule_id: 'strict', rule_name: 'صارمة', source: 'department', exempt: false, exempt_reason: null, exempt_until: null, enabled: true, amount_mode: 'fixed',
  month_minutes: 90, month_days: 1.5, month_absent: 1, month_shortfall: 140, month_waived: 1, ...o,
})
const open = () => render(<MemoryRouter><AutoDeductionsPage /></MemoryRouter>)

beforeEach(() => {
  h.rules = RULES(); h.exemptions = []; h.employees = [EMP({}), EMP({ employee_id: 'e2', employee_number: 'E2', full_name: 'سارة', job_title: null, department_id: 'd2', department_name: 'الإدارة', rule_id: null, rule_name: 'مستثنى', source: 'exempt', exempt: true, exempt_reason: 'ظرف صحي', exempt_until: '2026-12-31', enabled: false, amount_mode: 'salary' })]
  for (const f of [h.saveRule, h.deleteRule, h.setTargets, h.addExempt, h.removeExempt, h.simulate]) f.mockReset()
  h.simulate.mockReturnValue({ enabled: true, method: 'tiers', amount_mode: 'fixed', status: 'time_permit', missing_minutes: 60, covered_minutes: 60, shortfall_minutes: 0, grace_minutes: 5,
    minutes: 0, shortfall_days: 0, absent_days: 1, incomplete_days: 0, unpaid_leave_days: 0.5, paid_leave_days: 3, days: 1.5, day_rate: 20000, minute_rate: 41.6667,
    amount_shortfall: 0, amount_absence: 5000, amount_incomplete: 0, amount_unpaid_leave: 2500, amount: 7500, capped: false,
    steps: [{ key: 'rates', title: 'أساس المبلغ: مبالغ ثابتة', text: 'كل يوم 5000' }, { key: 'shortfall', title: 'نقص الدقائق في اليوم', text: 'الزمنية المدفوعة المعتمدة تغطي 60 د' }, { key: 'method', title: 'لا نقص', text: 'الزمنية المدفوعة غطّت كل الدقائق الناقصة ⇒ الحالة «حاضر (زمنية)» ولا استقطاع.' }, { key: 'days', title: 'الأيام', text: 'إجازة مدفوعة 3 يوم ⇒ لا استقطاع' }, { key: 'amount', title: 'المبلغ المقترح', text: '= 7500 د.ع' }],
    ladder: [{ shortfall: 5, minutes: 0, days: 0, amount: 0, within_grace: true }, { shortfall: 20, minutes: 30, days: 0, amount: 3000, within_grace: false }, { shortfall: 240, minutes: 0, days: 0.5, amount: 2500, within_grace: false }] })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('00195 — الاستقطاعات التلقائية في التطوير المركزية', () => {
  it('الوحدة في شريط التكاملات بعد سياسة الحضور، لها مسار وترجمة', () => {
    const integ = PORTAL_UNITS[PORTALS.IT].find((u) => u.labelKey === 'nav.integrations')!
    const idx = integ.children!.findIndex((c) => c.path === '/it/integrations/auto-deductions')
    expect(idx).toBeGreaterThan(integ.children!.findIndex((c) => c.path === '/it/integrations/hr-policy'))
    expect(integ.children![idx]!.labelKey).toBe('nav.it_auto_deductions')
    expect((sidebar as Record<string, Record<string, string>>).nav!.it_auto_deductions).toBe('الاستقطاعات التلقائية')
    expect(customRoutes.some((r) => r.path === 'integrations/auto-deductions')).toBe(true)
  })

  it('القواعد: الافتراضية مميزة بلا حذف/نطاق؛ القاعدة الإضافية تُلخَّص (ثابت 5,000/100، بصمة ناقصة = غياب) ونطاقها وعدد موظفيها؛ الحذف يستأذن', () => {
    open()
    const def = screen.getByTestId('rule-def')
    expect(def).toHaveTextContent('الافتراضية — للجميع'); expect(within(def).queryByTestId('rule-def-delete')).toBeNull(); expect(within(def).queryByTestId('rule-def-scope-btn')).toBeNull()
    expect(screen.getByTestId('rule-def-scope')).toHaveTextContent('يسري على 40 موظفاً')
    expect(screen.getByTestId('rule-strict-summary')).toHaveTextContent('ثابت: 5,000 د.ع/يوم · 100 د.ع/دقيقة'); expect(screen.getByTestId('rule-strict-summary')).toHaveTextContent('البصمة الناقصة = غياب')
    expect(screen.getByTestId('rule-strict-scope')).toHaveTextContent('قسم / مسمى النقل'); expect(screen.getByTestId('rule-strict-scope')).toHaveTextContent('12 موظفاً')
    fireEvent.click(screen.getByTestId('rule-strict-delete'))
    expect(window.confirm).toHaveBeenCalled(); expect(h.deleteRule).toHaveBeenCalledWith('strict')
  })

  it('محرر القاعدة: الاسم إلزامي، الشرائح تُتحقق حيّاً، المبالغ الثابتة تظهر عند اختيارها، والحفظ يرسل الإعدادات كاملة', async () => {
    open()
    fireEvent.click(screen.getByTestId('rule-new'))
    expect(screen.getByTestId('rule-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('rule-name'), { target: { value: 'قاعدة الورديات' } })
    expect(screen.getByTestId('rule-save')).toBeEnabled()
    expect(screen.queryByTestId('r-fixed-day')).toBeNull()
    fireEvent.change(screen.getByTestId('r-mode'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByTestId('r-fixed-day'), { target: { value: '7500' } })
    fireEvent.change(screen.getByTestId('r-fixed-minute'), { target: { value: '125' } })
    fireEvent.change(screen.getByTestId('r-incomplete'), { target: { value: 'true' } })
    fireEvent.change(screen.getByTestId('r-absent-days'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByTestId('r-max-days'), { target: { value: '10' } })
    fireEvent.change(screen.getByTestId('r-cap'), { target: { value: '40' } })
    // فجوة في الشرائح ⇒ خطأ + تعطيل الحفظ، ثم إصلاح
    fireEvent.change(screen.getByTestId('r-tier-1-from'), { target: { value: '17' } })
    expect(screen.getByTestId('r-tiers-error')).toHaveTextContent('الدقيقة 16'); expect(screen.getByTestId('rule-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('r-tier-1-from'), { target: { value: '16' } })
    fireEvent.click(screen.getByTestId('r-tier-add'))
    expect(screen.getByTestId('r-tiers-table').querySelectorAll('tbody tr')).toHaveLength(6)
    fireEvent.change(screen.getByTestId('r-sample'), { target: { value: '10' } }); expect(screen.getByTestId('r-preview')).toHaveTextContent('ضمن السماحية')
    fireEvent.change(screen.getByTestId('r-sample'), { target: { value: '20' } }); expect(screen.getByTestId('r-preview')).toHaveTextContent('30د')
    // 00196: المعادلة واضحة + معنى كل شريحة بمبلغ تقريبي + طرق أخرى
    expect(screen.getByTestId('r-formula')).toHaveTextContent('أجر اليوم = مبلغ ثابت 7,500 د.ع'); expect(screen.getByTestId('r-formula')).toHaveTextContent('الإجازة/الزمنية المدفوعة = صفر')
    expect(screen.getByTestId('r-tier-1-meaning')).toHaveTextContent('نقص 16–30 د ⇒ 30 دقيقة ≈ 3,750 د.ع')
    expect(screen.getByTestId('r-preview-amount')).toHaveTextContent('3,750')
    fireEvent.change(screen.getByTestId('r-method'), { target: { value: 'multiplier' } })
    fireEvent.change(screen.getByTestId('r-multiplier'), { target: { value: '2' } })
    expect(screen.queryByTestId('r-tiers-table')).toBeNull()
    fireEvent.change(screen.getByTestId('r-sample'), { target: { value: '40' } }); expect(screen.getByTestId('r-preview')).toHaveTextContent('1س 20د'); expect(screen.getByTestId('r-preview-amount')).toHaveTextContent('دقيقة بدقيقة × 2')
    fireEvent.change(screen.getByTestId('r-method'), { target: { value: 'blocks' } })
    fireEvent.change(screen.getByTestId('r-block'), { target: { value: '60' } }); fireEvent.change(screen.getByTestId('r-multiplier'), { target: { value: '1' } })
    expect(screen.getByTestId('r-preview')).toHaveTextContent('1س 0د'); expect(screen.getByTestId('r-formula')).toHaveTextContent('نقرّب النقص لأعلى إلى أقرب 60 دقيقة')
    fireEvent.change(screen.getByTestId('r-method'), { target: { value: 'tiers' } })
    expect(screen.getByTestId('r-tiers-table').querySelectorAll('tbody tr')).toHaveLength(6)
    fireEvent.click(screen.getByTestId('rule-save'))
    await waitFor(() => expect(h.saveRule).toHaveBeenCalledTimes(1))
    const sent = h.saveRule.mock.calls[0]![0] as { id: string | null; name: string; is_active: boolean; settings: Record<string, unknown> }
    expect(sent.id).toBeNull(); expect(sent.name).toBe('قاعدة الورديات'); expect(sent.is_active).toBe(true)
    expect(sent.settings.auto_deduction_amount_mode).toBe('fixed'); expect(sent.settings.fixed_absent_day_amount).toBe(7500); expect(sent.settings.fixed_shortfall_minute_amount).toBe(125)
    expect(sent.settings.incomplete_punch_as_absent).toBe(true); expect(sent.settings.absent_day_deduction_days).toBe(1.5); expect(sent.settings.max_auto_deduction_days_per_month).toBe(10); expect(sent.settings.auto_deduction_cap_ratio).toBe(0.4)
    expect((sent.settings.deduction_tiers as unknown[]).length).toBe(6)
    // تعديل الافتراضية: لا خيار تعطيل
    fireEvent.click(screen.getByTestId('rule-def-edit'))
    expect(screen.queryByTestId('rule-active')).toBeNull(); expect(screen.getByTestId('rule-name')).toHaveValue('القاعدة الافتراضية')
  })

  it('إيقاف الاستقطاع التلقائي في قاعدة يعطّل بقية المفاتيح', () => {
    open(); fireEvent.click(screen.getByTestId('rule-strict-edit'))
    fireEvent.change(screen.getByTestId('r-auto'), { target: { value: 'false' } })
    expect(screen.getByTestId('r-ded-absence')).toBeDisabled(); expect(screen.getByTestId('r-mode')).toBeDisabled(); expect(screen.getByTestId('r-grace')).toBeDisabled()
  })

  it('النطاق: شجرة الأقسام تُظهر المسمى تحت قسمه؛ اختيار فرع + موظف ثم الحفظ يرسل الأهداف كاملة؛ يُنبّه إذا كان العنصر على قاعدة أخرى', async () => {
    h.rules = [...RULES(), { id: 'soft', name: 'متساهلة', description: null, is_default: false, is_active: true, settings: SETTINGS(), updated_at: '', targets: [{ id: 't9', target_type: 'branch', target_id: 'b2', name: 'البصرة' }], employees_count: 3 }]
    open(); fireEvent.click(screen.getByTestId('ad-tab-scope'))
    expect(screen.getByTestId('scope-rule')).toHaveValue('strict')
    expect(screen.getByTestId('scope-dept-d1')).toBeChecked(); expect(screen.getByTestId('scope-dept-jt1')).not.toBeChecked()
    expect(screen.getByTestId('scope-count')).toHaveTextContent('1 عنصر')
    expect(screen.getByTestId('scope-save')).toBeDisabled()
    expect(screen.getByTestId('scope-branch-b2').parentElement).toHaveTextContent('حالياً على «متساهلة»')
    fireEvent.click(screen.getByTestId('scope-branch-b1'))
    fireEvent.click(screen.getByTestId('scope-emp-e2'))
    expect(screen.getByTestId('scope-count')).toHaveTextContent('3 عنصر')
    fireEvent.click(screen.getByTestId('scope-save'))
    await waitFor(() => expect(h.setTargets).toHaveBeenCalledTimes(1))
    const [ruleId, targets] = h.setTargets.mock.calls[0]![0] as [string, Array<{ target_type: string; target_id: string }>]
    expect(ruleId).toBe('strict')
    expect(targets).toEqual([{ target_type: 'department', target_id: 'd1' }, { target_type: 'branch', target_id: 'b1' }, { target_type: 'employee', target_id: 'e2' }])
  })

  it('النطاق بلا قواعد إضافية ⇒ رسالة إرشادية', () => {
    h.rules = [RULES()[0]!]
    open(); fireEvent.click(screen.getByTestId('ad-tab-scope'))
    expect(screen.getByTestId('scope-empty')).toBeInTheDocument()
  })

  it('الاستثناءات: السبب إلزامي؛ الإضافة ترسل النوع والهدف والمدة؛ الجدول يعرض الحالة والإلغاء يستأذن', async () => {
    h.exemptions = [{ id: 'x1', target_type: 'employee', target_id: 'e2', name: 'سارة (E2)', reason: 'ظرف صحي', from_date: '2026-10-01', to_date: '2026-12-31', created_at: '', active: true }, { id: 'x2', target_type: 'branch', target_id: 'b2', name: 'البصرة', reason: 'افتتاح', from_date: '2026-01-01', to_date: '2026-02-01', created_at: '', active: false }]
    open(); fireEvent.click(screen.getByTestId('ad-tab-exemptions'))
    expect(screen.getByTestId('exempt-row-x1')).toHaveTextContent('ساري'); expect(screen.getByTestId('exempt-row-x2')).toHaveTextContent('غير ساري')
    fireEvent.change(screen.getByTestId('exempt-type'), { target: { value: 'department' } })
    fireEvent.change(screen.getByTestId('exempt-target'), { target: { value: 'jt1' } })
    expect(screen.getByTestId('exempt-add')).toBeDisabled()
    fireEvent.change(screen.getByTestId('exempt-reason'), { target: { value: 'فترة تدريب' } })
    fireEvent.change(screen.getByTestId('exempt-from'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByTestId('exempt-to'), { target: { value: '2026-09-01' } })
    expect(screen.getByTestId('exempt-add')).toBeDisabled()   // «إلى» قبل «من»
    fireEvent.change(screen.getByTestId('exempt-to'), { target: { value: '2026-10-31' } })
    fireEvent.click(screen.getByTestId('exempt-add'))
    await waitFor(() => expect(h.addExempt).toHaveBeenCalledWith({ target_type: 'department', target_id: 'jt1', reason: 'فترة تدريب', from_date: '2026-10-01', to_date: '2026-10-31' }))
    fireEvent.click(screen.getByTestId('exempt-remove-x1'))
    expect(h.removeExempt).toHaveBeenCalledWith('x1')
  })

  it('الموظفون: القاعدة الفعّالة ومصدرها والحالة (مفعّل·ثابت / مستثنى حتى)؛ «استثناء…» ينقل للتبويب بالموظف محدداً؛ التعيين المباشر يضيف الموظف إلى نطاق القاعدة', async () => {
    open(); fireEvent.click(screen.getByTestId('ad-tab-employees'))
    expect(screen.getByTestId('emp-e1-rule')).toHaveTextContent('صارمة'); expect(screen.getByTestId('emp-row-e1')).toHaveTextContent('عبر القسم/المسمى')
    expect(screen.getByTestId('emp-e1-status')).toHaveTextContent('مفعّل · ثابت')
    expect(screen.getByTestId('emp-e2-status')).toHaveTextContent('مستثنى حتى 2026-12-31'); expect(screen.queryByTestId('emp-e2-exempt')).toBeNull()
    expect(screen.getByTestId('emp-row-e1')).toHaveTextContent('2س 20د')   // نقص الشهر 140 دقيقة
    fireEvent.change(screen.getByTestId('emp-e1-assign'), { target: { value: 'strict' } })
    await waitFor(() => expect(h.setTargets).toHaveBeenCalledTimes(1))
    expect(h.setTargets.mock.calls[0]![0]).toEqual(['strict', [{ target_type: 'department', target_id: 'd1' }, { target_type: 'employee', target_id: 'e1' }]])
    fireEvent.click(screen.getByTestId('emp-e1-exempt'))
    expect(screen.getByTestId('ad-exemptions')).toBeInTheDocument()
    expect(screen.getByTestId('exempt-prefill')).toHaveTextContent('أحمد (E1)')
    fireEvent.change(screen.getByTestId('exempt-reason'), { target: { value: 'مهمة خارجية' } })
    fireEvent.click(screen.getByTestId('exempt-add'))
    await waitFor(() => expect(h.addExempt).toHaveBeenCalled())
    expect((h.addExempt.mock.calls[0]![0] as { target_id: string }).target_id).toBe('e1')
  })

  it('إرجاع موظف معيَّن مباشرة إلى «حسب النطاق» يزيله من نطاق قاعدته', async () => {
    h.rules = RULES(); h.rules[1]!.targets = [{ id: 't1', target_type: 'department', target_id: 'd1', name: 'النقل' }, { id: 't2', target_type: 'employee', target_id: 'e1', name: 'أحمد (E1)' }]
    open(); fireEvent.click(screen.getByTestId('ad-tab-employees'))
    expect(screen.getByTestId('emp-e1-assign')).toHaveValue('strict')
    fireEvent.change(screen.getByTestId('emp-e1-assign'), { target: { value: '' } })
    await waitFor(() => expect(h.setTargets).toHaveBeenCalledTimes(1))
    expect(h.setTargets.mock.calls[0]![0]).toEqual(['strict', [{ target_type: 'department', target_id: 'd1' }]])
  })

  it('00196: المحاكاة التفصيلية — حالة جاهزة (زمنية مدفوعة) تُرسل كاملة، وتعرض الحالة «حاضر (زمنية)» والخطوات والسلّم والمبلغ بالأرقام اللاتينية', async () => {
    open(); fireEvent.click(screen.getByTestId('ad-tab-simulate'))
    fireEvent.change(screen.getByTestId('sim-rule'), { target: { value: 'strict' } })
    fireEvent.click(screen.getByTestId('sim-preset-paid-permit'))
    expect(screen.getByTestId('sim-early')).toHaveValue(240); expect(screen.getByTestId('sim-paid-permit')).toHaveValue(240); expect(screen.getByTestId('sim-absent')).toHaveValue(0)
    fireEvent.change(screen.getByTestId('sim-salary'), { target: { value: '600000' } })
    fireEvent.change(screen.getByTestId('sim-paid-leave'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('sim-pay-type'), { target: { value: 'daily' } })
    fireEvent.click(screen.getByTestId('sim-run'))
    await waitFor(() => expect(h.simulate).toHaveBeenCalledTimes(1))
    const sent = h.simulate.mock.calls[0]![0] as { settings: Record<string, unknown>; scenario: Record<string, unknown> }
    expect(sent.settings.fixed_absent_day_amount).toBe(5000)
    expect(sent.scenario).toMatchObject({ early_minutes: 240, paid_permit_minutes: 240, unpaid_permit_minutes: 0, base_salary: 600000, paid_leave_days: 3, pay_type: 'daily', shift_minutes: 480 })
    expect(screen.getByTestId('sim-status')).toHaveTextContent('حاضر (زمنية)')
    expect(screen.getByTestId('sim-amount')).toHaveTextContent('7,500 د.ع')
    expect(screen.getByTestId('sim-steps').querySelectorAll('li')).toHaveLength(5)
    expect(screen.getByTestId('sim-step-method')).toHaveTextContent('غطّت كل الدقائق الناقصة')
    expect(screen.getByTestId('sim-ladder-5')).toHaveTextContent('ضمن السماحية'); expect(screen.getByTestId('sim-ladder-20')).toHaveTextContent('30 دقيقة'); expect(screen.getByTestId('sim-ladder-240')).toHaveTextContent('0.5 يوم')
    expect(screen.getByTestId('sim-result').textContent).not.toMatch(/[\u0660-\u0669]/)
  })

  it('السجل يعرض الإجراء بالعربية والقاعدة والفاعل', () => {
    open(); fireEvent.click(screen.getByTestId('ad-tab-audit'))
    expect(screen.getByTestId('audit-row-1')).toHaveTextContent('حفظ قاعدة'); expect(screen.getByTestId('audit-row-1')).toHaveTextContent('صارمة'); expect(screen.getByTestId('audit-row-1')).toHaveTextContent('مدير التطوير')
  })
})
