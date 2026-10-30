/** 00389-أ — وثائق الموظفين: شارة الانتهاء وتواريخ الوثيقة في لوحة المستمسكات + صفحة «وثائق الموظفين» (فلاتر/عدّادات/تصدير/فحص الآن) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  docs: [] as unknown[], rows: [] as unknown[], summary: { expired: 1, soon: 2, d60: 3, d90: 4, alert_days: 30 },
  setDates: vi.fn(async () => undefined), runNow: vi.fn(async () => 3), expArgs: [] as unknown[],
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'dep1', name: 'قسم النظافة' }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useEmployeeDocuments: () => ({ data: h.docs, isLoading: false }), useUploadDocument: () => mut(async () => undefined), useDeleteDocument: () => mut(async () => undefined),
  useSetDocumentDates: () => mut(h.setDates),
  useExpiringDocuments: (...a: unknown[]) => { h.expArgs = a; return { data: h.rows, isLoading: false } },
  useDocumentsExpirySummary: () => ({ data: h.summary }), useDocumentsExpiryRunNow: () => mut(h.runNow),
}))
vi.mock('@sdk/hr.sdk', () => ({ hr: { signedUrl: async () => null } }))
vi.mock('@features/hr/lib/hrExcel', () => ({ exportToExcel: vi.fn(async () => undefined) }))
import { DocumentsPanel, expiryBadge } from '@portals/hr/components/DocumentsPanel'
import EmployeeDocumentsPage, { daysLeftLabel, expiringDocsSpec } from '@portals/hr/pages/Employees/EmployeeDocumentsPage'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import { DOC_TYPE_LABELS } from '@features/hr/types'

const iso = (offsetDays: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10) }
const doc = (type: string, expires: string | null, id = type) => ({ id, employee_id: 'e1', doc_type: type, title: null, storage_path: `e1/${type}.jpg`, mime_type: 'image/jpeg', size_bytes: 1, created_at: '2026-01-01', issued_on: null, expires_on: expires })

describe('00389-أ · لوحة المستمسكات', () => {
  beforeEach(() => { h.docs = []; h.setDates.mockClear() })
  it('الأنواع الجديدة موجودة في القائمة الثابتة بعناوين عربية', () => {
    render(<DocumentsPanel employeeId="e1" />)
    for (const t of ['driving_license', 'contract', 'health_cert', 'passport']) expect(screen.getByTestId(`doc-slot-${t}`).textContent).toContain(DOC_TYPE_LABELS[t as keyof typeof DOC_TYPE_LABELS])
  })
  it('شارة الانتهاء: منتهية / خلال n يوم / سارية؛ بلا تاريخ ⇒ لا شارة', () => {
    const today = new Date(2026, 9, 30)
    expect(expiryBadge(null)).toBeNull()
    expect(expiryBadge('2026-10-20', today)).toMatchObject({ tone: 'red', label: 'منتهية منذ 10 يوم' })
    expect(expiryBadge('2026-10-30', today)).toMatchObject({ tone: 'red', label: 'تنتهي اليوم' })
    expect(expiryBadge('2026-11-14', today)).toMatchObject({ tone: 'amber', label: 'تنتهي خلال 15 يوم' })
    expect(expiryBadge('2027-03-01', today)).toMatchObject({ tone: 'emerald' })
  })
  it('تعديل التواريخ: زر الحفظ يُفعَّل عند التغيير ويُمنع إن كان الانتهاء قبل الإصدار، ويستدعي الحفظ بالقيم', () => {
    h.docs = [doc('driving_license', iso(5))]
    render(<DocumentsPanel employeeId="e1" />)
    expect(screen.getByTestId('doc-badge-driving_license').textContent).toContain('تنتهي خلال 5 يوم')
    const save = screen.getByTestId('doc-dates-save-driving_license') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('doc-issued-driving_license'), { target: { value: '2027-01-01' } })
    expect(save.disabled).toBe(true)   // الانتهاء (بعد 5 أيام) قبل الإصدار 2027
    expect(screen.getByTestId('doc-dates-driving_license').textContent).toContain('الانتهاء قبل الإصدار')
    fireEvent.change(screen.getByTestId('doc-issued-driving_license'), { target: { value: '2025-01-01' } })
    fireEvent.change(screen.getByTestId('doc-expires-driving_license'), { target: { value: '2028-01-01' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(h.setDates).toHaveBeenCalledWith(expect.objectContaining({ issuedOn: '2025-01-01', expiresOn: '2028-01-01', doc: expect.objectContaining({ id: 'driving_license' }) }))
  })
  it('للقراءة فقط: لا حقول تعديل، تُعرض التواريخ نصًا', () => {
    h.docs = [{ ...doc('passport', '2027-05-01'), issued_on: '2019-05-01' }]
    render(<DocumentsPanel employeeId="e1" readOnly />)
    expect(screen.queryByTestId('doc-expires-passport')).toBeNull()
    expect(screen.getByTestId('doc-dates-passport').textContent).toContain('إصدار 2019-05-01')
  })
})

describe('00389-أ · صفحة وثائق الموظفين', () => {
  beforeEach(() => {
    h.rows = [
      { id: 'r1', employee_id: 'e1', employee_number: 'A-1', full_name: 'أحمد', department_id: 'dep1', department_name: 'قسم النظافة', doc_type: 'passport', title: null, issued_on: null, expires_on: '2026-10-20', days_left: -10, status: 'expired' },
      { id: 'r2', employee_id: 'e2', employee_number: 'A-2', full_name: 'سارة', department_id: 'dep1', department_name: 'قسم النظافة', doc_type: 'driving_license', title: 'إجازة خاصة', issued_on: '2024-01-01', expires_on: '2026-11-10', days_left: 11, status: 'soon' },
    ]
    h.runNow.mockClear(); vi.mocked(exportToExcel).mockClear()
  })
  it('العدّادات من الملخص، الجدول بالصفوف والحالة، النافذة الافتراضية = نافذة التنبيه', () => {
    render(<MemoryRouter><EmployeeDocumentsPage /></MemoryRouter>)
    expect(screen.getByTestId('docs-stat-expired').textContent).toContain('1')
    expect(screen.getByTestId('docs-stat-soon').textContent).toContain('30')
    expect(screen.getAllByTestId(/^docs-row-/)).toHaveLength(2)
    expect(screen.getByTestId('docs-row-r1').textContent).toContain('منتهية')
    expect(screen.getByTestId('docs-row-r2').textContent).toContain('إجازة خاصة')
    expect(screen.getByTestId('docs-row-r2').textContent).toContain('بعد 11 يوم')
    expect(h.expArgs).toEqual([null, '', ''])
  })
  it('الفلاتر تمرَّر للاستعلام، «المنتهية فقط» يصفّي محليًا، التصدير يحمل الصفوف الظاهرة، وفحص الآن يعمل', () => {
    render(<MemoryRouter><EmployeeDocumentsPage /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('docs-window'), { target: { value: '90' } })
    fireEvent.change(screen.getByTestId('docs-department'), { target: { value: 'dep1' } })
    fireEvent.change(screen.getByTestId('docs-search'), { target: { value: 'أحمد' } })
    expect(h.expArgs).toEqual([90, 'dep1', 'أحمد'])
    fireEvent.click(screen.getByTestId('docs-only-expired'))
    expect(screen.getAllByTestId(/^docs-row-/)).toHaveLength(1)
    expect(screen.getByTestId('docs-count').textContent).toContain('1 وثيقة')
    fireEvent.click(screen.getByTestId('docs-export'))
    expect(vi.mocked(exportToExcel).mock.calls[0]?.[0]).toMatchObject({ rows: [expect.objectContaining({ id: 'r1' })] })
    fireEvent.click(screen.getByTestId('docs-run-now'))
    expect(h.runNow).toHaveBeenCalled()
  })
  it('مواصفة التصدير والعناوين', () => {
    const spec = expiringDocsSpec(h.rows as never, [['النافذة', '30']])
    expect(spec.columns.map((c) => c.header)).toEqual(['الرقم الوظيفي', 'الاسم', 'القسم', 'الوثيقة', 'الإصدار', 'الانتهاء', 'المتبقي (يوم)', 'الحالة'])
    expect(spec.columns[3]!.value(h.rows[0] as never)).toBe('جواز السفر')
    expect(daysLeftLabel(-3)).toBe('منذ 3 يوم'); expect(daysLeftLabel(0)).toBe('اليوم'); expect(daysLeftLabel(7)).toBe('بعد 7 يوم')
  })
})
