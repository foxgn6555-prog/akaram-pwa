/**
 * 00396 — طلب الإجازة لا يُرفض بـ«لا سلسلة/لا مدير»: معاينة المسار في غرفة العمليات تعرض «يُحال إلى الموارد البشرية» بحالة مقبولة،
 *   وقوائم الإجازات تعرض وسم «تقرّره الموارد البشرية» مع السبب.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChainPreview } from '@components/approvals/ChainPreview'
import { ViaBadge } from '@portals/hr/components/leaves/LeaveShared'
import type { LeaveRequestRow } from '@features/hr/types'

const diag = {
  employee: { id: 'e1', full_name: 'عامل بلا مدير', employee_number: 'E1', department_id: 'd1', department_name: 'النظافة', has_account: false, roles: [], manager_id: null, manager_name: null, manager_has_account: false },
  type: 'leave', subtype: null, chain: null, steps: [], active_steps: 0, department_path: [],
  checks: [{ key: 'manager', label: 'مدير مباشر مسجّل في HR', ok: false, detail: 'غير محدد' }],
  ok: true, fallback: 'hr_only', reason: 'لا سلسلة ولا مدير مباشر مسجّل — يُقبل الطلب ويُحال إلى الموارد البشرية لتقرّره',
  hints: ['لتفعيل الموافقة من المدير: حدّد المدير المباشر من ملف الموظف (الموارد البشرية ← الموظفون ← البيانات)'],
}
vi.mock('@features/sector-manager/hooks', () => ({ useApprovalDiagnose: () => ({ isLoading: false, isError: false, data: diag }) }))

describe('إحالة طلب الإجازة إلى الموارد البشرية (00396)', () => {
  it('معاينة المسار: بلا سلسلة وبلا مدير ⇒ حالة مقبولة (خضراء) ونص «يُحال إلى الموارد البشرية» لا «لا يُقبل/HR_NO_MANAGER»', () => {
    render(<ChainPreview employeeId="e1" type="leave" testId="ol-chain" />)
    expect(screen.getByTestId('ol-chain')).toHaveAttribute('data-ok', '1')
    expect(screen.getByTestId('ol-chain-fallback')).toHaveTextContent('يُحال إلى الموارد البشرية')
    expect(screen.getByTestId('ol-chain-scope')).toHaveTextContent('تقرّره الموارد البشرية')
    expect(screen.getByTestId('ol-chain').textContent).not.toContain('HR_NO_MANAGER')
    expect(screen.getByTestId('ol-chain').textContent).not.toContain('لا يُقبل')
    expect(screen.getByTestId('ol-chain-hints')).toHaveTextContent('لتفعيل الموافقة من المدير')
  })
  it('وسم القائمة: الطلب المحال يعرض «تقرّره الموارد البشرية» مع السبب إلى جانب جهة التقديم', () => {
    const row = { id: 'L1', requested_via: 'ops_room', requester_name: 'غرفة العمليات', hr_fallback: true, hr_fallback_reason: 'لا سلسلة موافقات ولا مدير مباشر مسجّل في ملف الموظف' } as unknown as LeaveRequestRow
    render(<ViaBadge row={row} />)
    expect(screen.getByTestId('via-L1')).toHaveTextContent('قُدِّم عبر غرفة العمليات')
    expect(screen.getByTestId('hr-fallback-L1')).toHaveTextContent('تقرّره الموارد البشرية — لا سلسلة موافقات ولا مدير مباشر مسجّل')
    const normal = { id: 'L2', requested_via: 'self', hr_fallback: false } as unknown as LeaveRequestRow
    render(<ViaBadge row={normal} />)
    expect(screen.queryByTestId('hr-fallback-L2')).toBeNull()
  })
})
