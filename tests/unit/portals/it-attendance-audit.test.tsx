/** صفحة «سجل تعديلات الحضور» في بوابة التطوير المركزية (00178 → 00283: فلاتر متعددة، لوحة موظف، تصدير Excel باختيار الأعمدة) */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { AttendanceAuditRow } from '@features/hr'
import type { BuildReportOptions } from '@lib/export/excel-report'

const rows: AttendanceAuditRow[] = [
  { id: 'a1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', work_date: '2026-10-02', action: 'edit', before: { status: 'absent', check_in: null, source: 'auto' }, after: { status: 'late', check_in: '2026-10-02T05:40:00+00:00', late_minutes: 25, source: 'manual' }, reason: 'بصمة الدخول لم تُسجَّل', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T07:30:00Z' },
  { id: 'a2', employee_id: 'e2', employee_number: 'E200', full_name: 'كرار يوسف', department_name: null, work_date: '2026-10-03', action: 'waive', before: { waived: false }, after: { waived: true }, reason: 'عذر مقبول', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T08:00:00Z' },
  { id: 'a3', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', work_date: '2026-10-01', action: 'deduction_add', before: null, after: { days: 1 }, reason: 'غياب بلا عذر', actor: 'u2', actor_name: 'مدقق ثانٍ', created_at: '2026-10-05T09:00:00Z' },
  { id: 'a4', employee_id: 'e2', employee_number: 'E200', full_name: 'كرار يوسف', department_name: null, work_date: '2026-10-17', action: 'auto_blocked', before: { check_in: null }, after: { check_in: '2026-10-17T12:53:00+00:00', source: 'auto' }, reason: 'تغيير تلقائي بعد اعتماد حضورية الشهر — مُعلَّق حتى إعادة الاعتماد', actor: null, actor_name: null, created_at: '2026-10-18T13:05:00Z' },
]
const h = vi.hoisted(() => ({ toast: vi.fn(), exportFn: vi.fn(async (_o: unknown) => ({})) }))
vi.mock('@features/hr', () => ({ useAttendanceAuditNamed: () => ({ data: rows, isLoading: false, refetch: vi.fn(), isFetching: false }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
vi.mock('@lib/export/excel-report', async (orig) => ({ ...(await orig<Record<string, unknown>>()), buildExcelReport: h.exportFn }))
import AttendanceAuditPage, { applyAuditFilters, EMPTY_FILTERS, presetRange } from '@portals/it/pages/Integrations/biometric/AttendanceAuditPage'
import { AUDIT_EXPORT_COLUMNS, DEFAULT_AUDIT_COLUMNS, buildAuditSheet, summarizeAudit, auditSource } from '@portals/it/pages/Integrations/biometric/attendance-audit.export'

beforeEach(() => { h.toast.mockReset(); h.exportFn.mockClear() })

describe('IT · سجل تعديلات الحضور', () => {
  it('يعرض العدادات والصفوف بأسماء الموظف والمدقّق والفرق المقروء بأرقام إنكليزية', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    expect(screen.getByTestId('audit-k-edits')).toHaveTextContent('1')
    expect(screen.getByTestId('audit-k-waives')).toHaveTextContent('1')
    expect(screen.getByTestId('audit-k-deductions')).toHaveTextContent('1')
    expect(screen.getByTestId('audit-k-blocked')).toHaveTextContent('1')
    const r1 = screen.getByTestId('audit-row-a1')
    expect(r1).toHaveTextContent('أحمد علي'); expect(r1).toHaveTextContent('مدقق العمليات'); expect(r1).toHaveTextContent('تعديل يوم حضور')
    expect(r1).toHaveTextContent('غائب'); expect(r1).toHaveTextContent('متأخر'); expect(r1).toHaveTextContent('08:40'); expect(r1).toHaveTextContent('يدوي')
    expect(screen.getByTestId('audit-row-a4')).toHaveTextContent('تلقائي')
    expect(screen.getByTestId('audit-table').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('00283: العدّاد فلتر سريع، رقائق الإجراءات متعددة، فلاتر الموظف/القسم/المدقّق/المصدر، والبحث في السبب، ومسح الفلاتر', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('audit-k-waives'))
    expect(screen.queryByTestId('audit-row-a1')).toBeNull(); expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument()
    expect(screen.getByTestId('audit-k-waives')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('audit-chip-edit'))   // إضافة إجراء ثانٍ
    expect(screen.getByTestId('audit-row-a1')).toBeInTheDocument(); expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument(); expect(screen.queryByTestId('audit-row-a3')).toBeNull()
    fireEvent.click(screen.getByTestId('audit-clear'))
    expect(screen.getByTestId('audit-row-a3')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('audit-department'), { target: { value: 'النقل' } })
    expect(screen.queryByTestId('audit-row-a2')).toBeNull(); expect(screen.getByTestId('audit-row-a1')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('audit-actor'), { target: { value: 'u2' } })
    expect(screen.queryByTestId('audit-row-a1')).toBeNull(); expect(screen.getByTestId('audit-row-a3')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('audit-clear'))
    fireEvent.change(screen.getByTestId('audit-source'), { target: { value: 'تلقائي' } })
    expect(screen.getByTestId('audit-row-a4')).toBeInTheDocument(); expect(screen.queryByTestId('audit-row-a1')).toBeNull()
    fireEvent.click(screen.getByTestId('audit-clear'))
    fireEvent.change(screen.getByTestId('audit-search'), { target: { value: 'عذر مقبول' } })
    expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument(); expect(screen.queryByTestId('audit-row-a1')).toBeNull()
  })
  it('00283: النقر على اسم الموظف يفتح لوحة «إجراءات الموظف» بملخصه ويصفّي الجدول؛ الإغلاق يعيد الكل', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('audit-emp-a1'))
    const focus = screen.getByTestId('audit-focus')
    expect(focus).toHaveTextContent('أحمد علي'); expect(focus).toHaveTextContent('2 إجراء على 2 يوم حضور'); expect(focus).toHaveTextContent('مدقق ثانٍ، مدقق العمليات')
    expect(screen.getByTestId('audit-focus-edit')).toHaveTextContent('1'); expect(screen.getByTestId('audit-focus-deduction_add')).toHaveTextContent('1')
    expect(screen.queryByTestId('audit-row-a2')).toBeNull()
    expect((screen.getByTestId('audit-employee') as HTMLSelectElement).value).toBe('e1')
    fireEvent.click(screen.getByTestId('audit-focus-close'))
    expect(screen.queryByTestId('audit-focus')).toBeNull(); expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument()
  })
  it('00283: الفترات الجاهزة تضبط من/إلى؛ الترتيب حسب الموظف', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('audit-preset-today'))
    const today = (screen.getByTestId('audit-to') as HTMLInputElement).value
    expect((screen.getByTestId('audit-from') as HTMLInputElement).value).toBe(today)
    fireEvent.change(screen.getByTestId('audit-sort'), { target: { value: 'employee' } })
    const ids = within(screen.getByTestId('audit-table')).getAllByTestId(/audit-row-/).map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['audit-row-a3', 'audit-row-a1', 'audit-row-a4', 'audit-row-a2'])
  })
  it('00283: حوار التصدير — الأعمدة الافتراضية، تبديل عمود، الكل/لا شيء يعطّل الزر، ثم التصدير يمرّر الصفوف المصفّاة والأعمدة المختارة والملخصات', async () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('audit-department'), { target: { value: 'النقل' } })
    expect(screen.getByTestId('audit-export-open')).toHaveTextContent('(2)')
    fireEvent.click(screen.getByTestId('audit-export-open'))
    const dlg = screen.getByTestId('audit-export-dialog')
    expect(dlg).toHaveTextContent('2 إجراء')
    expect(screen.getByTestId('audit-col-diff')).toBeChecked(); expect(screen.getByTestId('audit-col-id')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('audit-cols-none'))
    expect(screen.getByTestId('audit-export-run')).toBeDisabled()
    fireEvent.click(screen.getByTestId('audit-cols-default'))
    fireEvent.click(screen.getByTestId('audit-col-id'))          // إضافة عمود تقني
    fireEvent.click(screen.getByTestId('audit-col-reason'))      // إزالة السبب
    fireEvent.change(screen.getByTestId('audit-diff-mode'), { target: { value: 'detailed' } })
    fireEvent.click(screen.getByTestId('audit-export-run'))
    await waitFor(() => expect(h.exportFn).toHaveBeenCalledTimes(1))
    const call = h.exportFn.mock.calls[0]![0] as unknown as BuildReportOptions
    expect(call.rows).toHaveLength(2)
    const keys = call.columns.map((c) => c.key)
    expect(keys).toContain('id'); expect(keys).not.toContain('reason'); expect(keys).not.toContain('diff')
    expect(keys).toContain('before_check_in'); expect(keys).toContain('after_status')
    expect(call.extraSheets?.map((s) => s.sheetName)).toEqual(['حسب الإجراء', 'حسب الموظف', 'حسب المدقّق'])
    expect(call.charts?.[0]?.kind).toBe('bar')
    expect(call.meta).toContain('القسم: النقل')
    expect(call.fileName).toMatch(/^attendance-audit-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/)
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })))
    expect(screen.queryByTestId('audit-export-dialog')).toBeNull()
  })
})

describe('الدوال النقية (00283)', () => {
  it('applyAuditFilters: تركيب الفلاتر والترتيب', () => {
    expect(applyAuditFilters(rows, EMPTY_FILTERS).map((r) => r.id)).toEqual(['a4', 'a3', 'a2', 'a1'])
    expect(applyAuditFilters(rows, { ...EMPTY_FILTERS, sort: 'oldest' })[0]!.id).toBe('a1')
    expect(applyAuditFilters(rows, { ...EMPTY_FILTERS, sort: 'work_date' })[0]!.id).toBe('a4')
    expect(applyAuditFilters(rows, { ...EMPTY_FILTERS, actions: ['edit', 'waive'], employee: 'e2' }).map((r) => r.id)).toEqual(['a2'])
    expect(applyAuditFilters(rows, { ...EMPTY_FILTERS, search: '2026-10-17' }).map((r) => r.id)).toEqual(['a4'])
    expect(applyAuditFilters(rows, { ...EMPTY_FILTERS, actor: '—' }).map((r) => r.id)).toEqual(['a4'])
  })
  it('presetRange: اليوم، ٧ أيام، الشهر، الشهر الماضي، ٣ أشهر', () => {
    const now = new Date(2026, 9, 18)
    expect(presetRange('today', now)).toEqual({ from: '2026-10-18', to: '2026-10-18' })
    expect(presetRange('week', now)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-18' })
    expect(presetRange('prev_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('quarter', now)).toEqual({ from: '2026-08-01', to: '2026-10-18' })
  })
  it('auditSource: يدوي/تلقائي/—', () => {
    expect(auditSource({ ...rows[0]!, action: 'leave_sync' })).toBe('تلقائي'); expect(auditSource(rows[0]!)).toBe('يدوي'); expect(auditSource(rows[3]!)).toBe('تلقائي'); expect(auditSource(rows[1]!)).toBe('—')
  })
  it('buildAuditSheet: الأعمدة بالترتيب المختار، الفرق نصاً متعدد الأسطر أو مفصّلاً قبل/بعد (الحقول غير المتغيرة فارغة)، أرقام إنكليزية وتوقيت بغداد', () => {
    const t = buildAuditSheet(rows, { columns: ['seq', 'created_at', 'full_name', 'diff'], diffMode: 'text' })
    expect(t.columns.map((c) => c.key)).toEqual(['seq', 'created_at', 'full_name', 'diff'])
    expect(t.rows[0]).toMatchObject({ seq: 1, created_at: '05/10/2026, 10:30', full_name: 'أحمد علي' })
    expect(String(t.rows[0]!.diff)).toContain('الحالة: غائب ← متأخر'); expect(String(t.rows[0]!.diff)).toContain('الدخول: — ← 08:40')
    expect(t.rows[2]!.diff).toBe('—')
    const d = buildAuditSheet(rows, { columns: [...DEFAULT_AUDIT_COLUMNS], diffMode: 'detailed' })
    expect(d.columns.map((c) => c.key)).not.toContain('diff')
    expect(d.rows[0]).toMatchObject({ before_status: 'غائب', after_status: 'متأخر', after_check_in: '08:40', before_check_out: '', after_late_minutes: '25' })
    expect(JSON.stringify(t.rows) + JSON.stringify(d.rows)).not.toMatch(/[\u0660-\u0669]/)
    expect(AUDIT_EXPORT_COLUMNS.map((c) => c.id)).toEqual(expect.arrayContaining([...DEFAULT_AUDIT_COLUMNS]))
  })
  it('summarizeAudit: حسب الإجراء/الموظف/المدقّق مرتّبة تنازلياً مع عدد الموظفين وآخر إجراء', () => {
    const s = summarizeAudit(rows)
    expect(s.byEmployee[0]).toMatchObject({ label: 'أحمد علي (E100)', count: 2 })
    expect(s.byActor.find((a) => a.label === 'مدقق العمليات')).toMatchObject({ count: 2 }); expect(s.byActor.find((a) => a.label === 'مدقق العمليات')!.employees.size).toBe(2)
    expect(s.byAction).toHaveLength(4); expect(s.byAction[0]!.last).toBeTruthy()
  })
})
