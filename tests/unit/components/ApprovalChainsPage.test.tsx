/** سلاسل الموافقات (التطوير المركزية، 00160): بناء سلسلة من خطوات «حسب التسلسل» و«حساب محدد»، ترتيب، حفظ، تحميل/تعديل/حذف */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ save: vi.fn(), del: vi.fn(), sim: vi.fn(), simData: null as Record<string, unknown> | null, versions: [] as Record<string, unknown>[], chains: [] as Record<string, unknown>[] }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalChains: () => ({ data: h.chains, isLoading: false }),
  useSaveApprovalChain: () => ({ mutate: h.save, isPending: false }),
  useDeleteApprovalChain: () => ({ mutate: h.del, isPending: false }),
  useApprovalChainVersions: () => ({ data: h.versions, isLoading: false }),
  useApprovalSimulate: () => ({ mutate: h.sim, isPending: false, data: h.simData }),
  useApprovalDelegations: () => ({ data: [], isLoading: false }),
  useSetApprovalDelegation: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelApprovalDelegation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@features/hr', () => ({ useLeaveTypes: () => ({ data: [
  { id: 'lt1', code: 'annual', name: 'إجازة اعتيادية', kind: 'leave' }, { id: 'lt2', code: 'sick', name: 'إجازة مرضية', kind: 'leave' }, { id: 'lt3', code: 'permit_paid', name: 'زمنية مدفوعة', kind: 'time_permit' },
] }) }))
vi.mock('@features/user-management', () => ({
  useUsers: () => ({ data: [
    { id: 'u-dep', email: 'dep@x.iq', employee_name: 'معاون المدير', roles: ['deputy_director'] },
    { id: 'u-boss', email: 'boss@x.iq', employee_name: 'المدير المفوض', roles: ['super_admin'] },
  ] }),
}))
import Page from '@portals/it/pages/ApprovalChains/ApprovalChainsPage'

describe('سلاسل الموافقات', () => {
  beforeEach(() => { vi.clearAllMocks(); h.chains = []; h.versions = []; h.simData = null })
  it('يبني سلسلة متعهد/إجازة: مسؤول قسمه → مسؤول قاطعه → معاون (حساب) ويحفظها بالترتيب', () => {
    render(<Page />)
    expect(screen.getByTestId('chain-none')).toBeInTheDocument()
    expect(screen.getByTestId('chain-save')).toBeDisabled()
    fireEvent.click(screen.getByTestId('add-hier-department_manager'))
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-dep' } })
    fireEvent.click(screen.getByTestId('add-account'))
    expect(screen.getByTestId('chain-step-1')).toHaveTextContent('مسؤول قسمه (حسب التسلسل)')
    expect(screen.getByTestId('chain-step-3')).toHaveTextContent('معاون المدير'); expect(screen.getByTestId('chain-step-3')).toHaveTextContent('حساب محدد')
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith({ requesterRole: 'employee', requestType: 'leave', steps: [{ kind: 'hierarchy', role: 'department_manager' }, { kind: 'hierarchy', role: 'admin_ops' }, { kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }], active: true, subtype: null }, expect.any(Object))
  })
  it('سلسلة مباشرة: معاون ثم مدير مفوض (حسابان) لدور مسؤول قسم/زمنية، مع حذف خطوة', () => {
    render(<Page />)
    fireEvent.change(screen.getByTestId('chain-role'), { target: { value: 'department_manager' } })
    fireEvent.change(screen.getByTestId('chain-type'), { target: { value: 'time_permit' } })
    fireEvent.click(screen.getByTestId('add-hier-field_ops'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-dep' } }); fireEvent.click(screen.getByTestId('add-account'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-boss' } }); fireEvent.click(screen.getByTestId('add-account'))
    fireEvent.click(screen.getByTestId('chain-step-remove-1'))
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ requesterRole: 'department_manager', requestType: 'time_permit', steps: [{ kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }, { kind: 'account', user_id: 'u-boss', label: 'المدير المفوض' }] }), expect.any(Object))
  })
  it('يعرض السلاسل المضبوطة ويحمّلها للتعديل ويحذفها بتأكيد', () => {
    h.chains = [{ id: 'c1', requester_role: 'employee', requester_label: 'متعهد', request_type: 'leave', steps: [{ kind: 'hierarchy', role: 'department_manager', label: 'مسؤول قسم (حسب التسلسل)' }, { kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    window.confirm = () => true
    render(<Page />)
    expect(screen.getByTestId('chain-employee-leave')).toHaveTextContent('1. مسؤول قسم (حسب التسلسل)')
    fireEvent.click(screen.getByTestId('chain-edit-employee-leave'))
    expect(screen.getByTestId('chain-step-2')).toHaveTextContent('معاون المدير')
    fireEvent.click(screen.getByTestId('chain-delete-employee-leave'))
    expect(h.del).toHaveBeenCalledWith('c1')
  })
  it('00333: أدوار حقيقية فقط (لا media/complaints/disclosures) + علامة ✓ للأدوار التي لها سلسلة', () => {
    h.chains = [{ id: 'c1', requester_role: 'media_officer', requester_label: 'مسؤول الإعلام', request_type: 'leave', steps: [{ kind: 'hierarchy', role: 'deputy_director', label: 'معاون' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    render(<Page />)
    const values = Array.from((screen.getByTestId('chain-role') as HTMLSelectElement).options).map((o) => o.value)
    expect(values).not.toContain('media'); expect(values).not.toContain('complaints'); expect(values).not.toContain('disclosures')
    expect(values).toContain('media_officer'); expect(values).toContain('complaints_officer'); expect(values).toContain('follow_up')
    expect(screen.getByRole('option', { name: 'مسؤول الإعلام ✓' })).toBeInTheDocument()
    expect(screen.getByTestId('chain-media_officer-leave')).toHaveTextContent('مسؤول الإعلام')
  })
  it('00333: السلسلة القائمة تُحمَّل تلقائياً عند اختيار الدور/النوع ولا تُستبدل بصمت', () => {
    h.chains = [{ id: 'c1', requester_role: 'department_manager', requester_label: 'مسؤول قسم', request_type: 'leave', steps: [{ kind: 'hierarchy', role: 'admin_ops', label: 'مسؤول قاطع (حسب التسلسل)' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    render(<Page />)
    expect(screen.getByTestId('chain-none')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('chain-role'), { target: { value: 'department_manager' } })
    expect(screen.getByTestId('chain-loaded')).toHaveTextContent('1 خطوات · إصدار 1')
    expect(screen.getByTestId('chain-step-1')).toHaveTextContent('مسؤول قاطعه')
    fireEvent.click(screen.getByTestId('add-hier-deputy_director'))
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ requesterRole: 'department_manager', steps: [{ kind: 'hierarchy', role: 'admin_ops', label: 'مسؤول قاطع (حسب التسلسل)' }, { kind: 'hierarchy', role: 'deputy_director' }] }), expect.any(Object))
  })
  it('00333: يمنع تكرار الخطوة نفسها مباشرة', () => {
    render(<Page />)
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    expect(screen.getByTestId('chain-dup')).toBeInTheDocument()
    expect(screen.queryByTestId('chain-step-2')).toBeNull()
    fireEvent.click(screen.getByTestId('add-hier-deputy_director'))
    expect(screen.queryByTestId('chain-dup')).toBeNull()
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    expect(screen.getByTestId('chain-step-3')).toHaveTextContent('مسؤول قاطعه')
  })
  it('00335: نوع فرعي للإجازة + خصائص الخطوة (الجميع/شرط/مهلة وتصعيد) تُحفظ', () => {
    render(<Page />)
    fireEvent.change(screen.getByTestId('chain-subtype'), { target: { value: 'sick' } })
    expect(screen.getByTestId('chain-none')).toHaveTextContent('النوع الفرعي')
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    fireEvent.click(screen.getByTestId('add-hier-deputy_director'))
    fireEvent.click(screen.getByTestId('chain-step-options-2'))
    fireEvent.change(screen.getByTestId('step-mode-2'), { target: { value: 'all' } })
    fireEvent.change(screen.getByTestId('step-cond-field-2'), { target: { value: 'days' } })
    fireEvent.change(screen.getByTestId('step-cond-value-2'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('step-sla-2'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('step-escalate-2'), { target: { value: 'next' } })
    expect(screen.getAllByTestId('chain-step-opt-2').map((b) => b.textContent)).toEqual(['الجميع', 'إذا الأيام ≥ 3', 'مهلة 2 يوم ثم تصعيد'])
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith({ requesterRole: 'employee', requestType: 'leave', subtype: 'sick', active: true,
      steps: [{ kind: 'hierarchy', role: 'admin_ops' }, { kind: 'hierarchy', role: 'deputy_director', mode: 'all', condition: { field: 'days', op: 'gte', value: 3 }, sla_days: 2, escalate: 'next' }] }, expect.any(Object))
  })
  it('00335: النوع الفرعي معطّل لغير الإجازات، وحقول الشرط حسب النوع', () => {
    render(<Page />)
    fireEvent.change(screen.getByTestId('chain-type'), { target: { value: 'advance' } })
    expect(screen.getByTestId('chain-subtype')).toBeDisabled()
    fireEvent.click(screen.getByTestId('add-hier-super_admin'))
    fireEvent.click(screen.getByTestId('chain-step-options-1'))
    expect(Array.from((screen.getByTestId('step-cond-field-1') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['', 'amount'])
  })
  it('00335: نسخ السلسلة إلى دور/نوع آخر مع تحذير الاستبدال', () => {
    h.chains = [{ id: 'c9', requester_role: 'maintenance', requester_label: 'الصيانة', request_type: 'leave', subtype: null, steps: [{ kind: 'hierarchy', role: 'deputy_director' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    render(<Page />)
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    fireEvent.click(screen.getByTestId('chain-copy'))
    fireEvent.change(screen.getByTestId('copy-role'), { target: { value: 'maintenance' } })
    expect(screen.getByTestId('copy-overwrite')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('copy-type'), { target: { value: 'time_permit' } })
    expect(screen.queryByTestId('copy-overwrite')).toBeNull()
    fireEvent.change(screen.getByTestId('copy-subtype'), { target: { value: 'permit_paid' } })
    fireEvent.click(screen.getByTestId('copy-confirm'))
    expect(h.save).toHaveBeenCalledWith({ requesterRole: 'maintenance', requestType: 'time_permit', steps: [{ kind: 'hierarchy', role: 'admin_ops' }], active: true, subtype: 'permit_paid' }, expect.any(Object))
  })
  it('00335: سجل الإصدارات والمحاكاة', () => {
    h.chains = [{ id: 'c1', requester_role: 'employee', requester_label: 'متعهد', request_type: 'leave', subtype: 'sick', subtype_label: 'إجازة مرضية', version_no: 3, steps: [{ kind: 'hierarchy', role: 'admin_ops', label: 'مسؤول قاطع (حسب التسلسل)' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    h.versions = [{ id: 'v3', version_no: 3, action: 'updated', steps: [{ kind: 'hierarchy', role: 'admin_ops', label: 'مسؤول قاطع (حسب التسلسل)', sla_days: 2 }], is_active: true, changed_by_name: 'مدير النظام', changed_at: '2026-10-01T08:00:00Z' }, { id: 'v1', version_no: 1, action: 'created', steps: [], is_active: true, changed_by_name: 'IT', changed_at: '2026-09-01T08:00:00Z' }]
    h.simData = { chain_id: 'c1', requester_label: 'متعهد', subtype: 'sick', steps: [
      { step_no: 1, label: 'مسؤول قاطع (حسب التسلسل)', mode: 'any', sla_days: null, escalate: 'none', condition: null, status: 'active', approvers: [{ user_id: 'u-sm', name: 'مسؤول الكرادة' }], delegates: [{ to_name: 'بديل', from_name: 'مسؤول الكرادة' }] },
      { step_no: 2, label: 'معاون المدير', mode: 'any', sla_days: 2, escalate: 'next', condition: 'إذا الأيام ≥ 3', status: 'skipped_condition', approvers: [], delegates: [] },
    ] }
    render(<Page />)
    expect(screen.getByTestId('chain-employee-leave-sick')).toHaveTextContent('إجازة — إجازة مرضية')
    expect(screen.getByTestId('chain-employee-leave-sick')).toHaveTextContent('إصدار 3')
    fireEvent.click(screen.getByTestId('chain-history-employee-leave-sick'))
    expect(screen.getByTestId('chain-version-3')).toHaveTextContent('تعديل · مدير النظام')
    expect(screen.getByTestId('chain-version-3')).toHaveTextContent('مهلة 2 يوم')
    fireEvent.change(screen.getByTestId('sim-user'), { target: { value: 'u-dep' } })
    fireEvent.change(screen.getByTestId('sim-days'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('sim-run'))
    expect(h.sim).toHaveBeenCalledWith({ userId: 'u-dep', type: 'leave', subtype: null, context: { days: 2 } })
    expect(screen.getByTestId('sim-step-1')).toHaveTextContent('مسؤول الكرادة')
    expect(screen.getByTestId('sim-step-1')).toHaveTextContent('بالتفويض: بديل عن مسؤول الكرادة')
    expect(screen.getByTestId('sim-step-2')).toHaveTextContent('تُخطّى — الشرط غير متحقق')
  })
})
