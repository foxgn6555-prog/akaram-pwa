/** 00337: تقرير أداء الموافقات — ملخص، جداول، إبراز المتأخرين، فترات جاهزة ومخصصة، فترة فارغة */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ args: [] as string[][], data: null as Record<string, unknown> | null, error: false }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalPerformance: (from: string, to: string) => { h.args.push([from, to]); return { data: h.data, isLoading: false, isError: h.error } },
}))
import { ApprovalPerformancePage } from '@components/approvals/ApprovalPerformancePage'

const report = {
  from: '2026-09-24', to: '2026-10-23',
  summary: { decided: 12, approved: 10, rejected: 2, avg_hours: 5.5, median_hours: 0.5, within_sla: 3, with_sla: 4, delegated: 1, escalated: 1, open_now: 2, overdue_now: 1, open_avg_hours: 30 },
  by_kind: [{ kind: 'leave', label: 'إجازة', decided: 10, avg_hours: 6, max_hours: 72, rejected: 2, open_now: 2 }, { kind: 'advance', label: 'سلفة', decided: 2, avg_hours: 0.25, max_hours: 0.5, rejected: 0, open_now: 0 }],
  by_step: [{ kind: 'leave', kind_label: 'إجازة', step_label: 'معاون المدير', decided: 5, avg_hours: 10, max_hours: 72, overdue: 2, open_now: 1 }, { kind: 'leave', kind_label: 'إجازة', step_label: 'مسؤول قاطعه', decided: 5, avg_hours: 1, max_hours: 3, overdue: 0, open_now: 1 }],
  by_approver: [{ user_id: 'u-dep', name: 'معاون المدير', decided: 5, avg_hours: 10, as_delegate: 0, pending_now: 1, overdue_now: 1 }, { user_id: 'u-ops', name: 'مسؤول القاطع', decided: 7, avg_hours: 1, as_delegate: 1, pending_now: 1, overdue_now: 0 }],
  open_tasks: [{ task_id: 't1', kind: 'leave', kind_label: 'إجازة', step_no: 2, step_label: 'معاون المدير', hours: 50, due_at: '2026-10-22T08:00:00Z', overdue: true, escalated: false, approvers: 'معاون المدير' }, { task_id: 't2', kind: 'leave', kind_label: 'إجازة', step_no: 1, step_label: 'مسؤول قاطعه', hours: 10, due_at: null, overdue: false, escalated: false, approvers: 'مسؤول القاطع' }],
  escalations: [{ task_id: 't3', kind_label: 'إجازة', step_label: 'مسؤول قاطعه', escalated_at: '2026-10-20T08:00:00Z', status: 'skipped', approvers: 'مسؤول القاطع' }],
}

describe('أداء الموافقات', () => {
  beforeEach(() => { h.args = []; h.data = report; h.error = false })
  it('يعرض الملخص والجداول بأرقام لاتينية ويبرز المتأخرين', () => {
    render(<ApprovalPerformancePage testId="perf" />)
    expect(screen.getByTestId('perf-decided')).toHaveTextContent('12')
    expect(screen.getByTestId('perf-avg')).toHaveTextContent('5.5 س')
    expect(screen.getByTestId('perf-overdue')).toHaveTextContent('1')
    expect(screen.getByTestId('perf-summary')).toHaveTextContent('75% (3/4)')
    expect(screen.getByTestId('perf-summary')).toHaveTextContent('30 د')           // الوسيط 0.5 ساعة ⇒ دقائق
    expect(screen.getByTestId('perf-kind-leave')).toHaveTextContent('3.0 يوم')      // الأقصى 72 ساعة ⇒ أيام
    expect(screen.getByTestId('perf-kind-advance')).toHaveTextContent('15 د')
    expect(screen.getByTestId('perf-step-0')).toHaveClass('bg-red-50')
    expect(screen.getByTestId('perf-step-1')).not.toHaveClass('bg-red-50')
    expect(screen.getByTestId('perf-approver-u-dep')).toHaveClass('bg-red-50')
    expect(screen.getByTestId('perf-approver-u-ops')).toHaveTextContent('مسؤول القاطع')
    expect(screen.getByTestId('perf-open-0')).toHaveTextContent('متأخرة'); expect(screen.getByTestId('perf-open-0')).toHaveClass('bg-red-50')
    expect(screen.getByTestId('perf-open-1')).toHaveTextContent('ضمن المهلة')
    expect(screen.getByTestId('perf-esc-0')).toHaveTextContent('انتقلت للخطوة التالية')
    expect(screen.getByTestId('perf').textContent).not.toMatch(/[٠-٩]/)
  })
  it('الفترات الجاهزة والمخصصة تُمرَّر للاستعلام', () => {
    render(<ApprovalPerformancePage testId="perf" />)
    const today = new Date().toISOString().slice(0, 10)
    const d = new Date(); d.setDate(d.getDate() - 29)
    expect(h.args.at(-1)).toEqual([d.toISOString().slice(0, 10), today])
    fireEvent.click(screen.getByTestId('perf-preset-7'))
    const d7 = new Date(); d7.setDate(d7.getDate() - 6)
    expect(h.args.at(-1)).toEqual([d7.toISOString().slice(0, 10), today])
    fireEvent.change(screen.getByTestId('perf-from'), { target: { value: '2026-01-01' } })
    expect(h.args.at(-1)?.[0]).toBe('2026-01-01')
  })
  it('فترة بلا بيانات ⇒ رسائل فارغة لا أخطاء؛ وخطأ الخادم يُعرض', () => {
    h.data = { ...report, summary: { ...report.summary, decided: 0, avg_hours: null, median_hours: null, with_sla: 0, within_sla: 0 }, by_kind: [], by_step: [], by_approver: [], open_tasks: [], escalations: [] }
    const { unmount } = render(<ApprovalPerformancePage testId="perf" />)
    expect(screen.getByTestId('perf-avg')).toHaveTextContent('—')
    expect(screen.getByTestId('perf-kinds-empty')).toBeInTheDocument(); expect(screen.getByTestId('perf-escalations-empty')).toBeInTheDocument()
    unmount()
    h.data = null; h.error = true
    render(<ApprovalPerformancePage testId="perf" />)
    expect(screen.getByTestId('perf-error')).toBeInTheDocument()
  })
})
