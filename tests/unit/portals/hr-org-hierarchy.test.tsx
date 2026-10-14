/** 00254: الهيكل التنظيمي الهرمي — شجرة طي/فتح، موظفو العقدة، النقل (سحب وإفلات + «نقل إلى…») مع تأكيد، البحث، والمخطط الهرمي */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ depts: [] as unknown[], saveDept: vi.fn(async () => 'd') }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrDepartments: () => ({ data: h.depts, isLoading: false }),
  useHrEmployees: () => ({ data: [
    { id: 'e1', employee_number: 'E1', full_name: 'أحمد علي', job_title: 'سائق كابسة', job_title_id: 't1', department_id: 'ops1', employment_status: 'active' },
    { id: 'e2', employee_number: 'E2', full_name: 'سارة حسن', job_title: null, job_title_id: null, department_id: 'ops', employment_status: 'active' },
  ], isLoading: false }),
  useSaveDepartment: () => ({ mutateAsync: h.saveDept, isPending: false }),
}))
vi.mock('@features/hr/lib/hrExcel', () => ({ exportToExcel: vi.fn(async () => undefined) }))

import OrgStructure from '@portals/hr/pages/Org/OrgStructure'

const d = (o: Record<string, unknown>) => ({ parent_id: null, is_active: true, manager_id: null, manager_name: null, employees_active: 0, employees_total: 0, children: 0, created_at: '', is_job_title: false, drives_vehicles: false, maintenance_specialty: null, ...o })
const base = () => [
  d({ id: 'ops', name: 'العمليات', code: 'OPS', employees_active: 1, manager_name: 'سامر' }),
  d({ id: 'ops1', name: 'القاطع الأول', code: 'OPS-1', parent_id: 'ops', employees_active: 1 }),
  d({ id: 'ops11', name: 'الكرادة', code: 'OPS-1-K', parent_id: 'ops1', employees_active: 3 }),
  d({ id: 't1', name: 'سائق كابسة', code: 'T-DRV', parent_id: 'ops1', is_job_title: true, drives_vehicles: true, employees_active: 1 }),
  d({ id: 'fin', name: 'المالية', code: 'FIN' }),
]
const wrap = () => render(<MemoryRouter><OrgStructure /></MemoryRouter>)
const dt = () => { const store: Record<string, string> = {}; return { setData: (k: string, v: string) => { store[k] = v }, getData: (k: string) => store[k] ?? '', effectAllowed: 'move', dropEffect: 'move' } }

describe('الهيكل التنظيمي الهرمي (00254)', () => {
  beforeEach(() => { h.depts = base(); h.saveDept.mockClear(); localStorage.clear() })

  it('الشجرة: الجذور ومستواها الأول مفتوحة افتراضياً، الطي يخفي الفروع، «طي الكل/فتح الكل»، ومؤشر المستويات', () => {
    wrap()
    expect(screen.getByTestId('org-stat-depth')).toHaveTextContent('3')
    expect(screen.getByTestId('org-row-OPS')).toHaveAttribute('data-expanded', 'true')
    expect(screen.getByTestId('org-row-OPS-1-K')).toBeInTheDocument()
    expect(screen.getByTestId('org-subtree-OPS')).toHaveTextContent('6')
    fireEvent.click(screen.getByTestId('org-toggle-OPS'))
    expect(screen.queryByTestId('org-row-OPS-1')).toBeNull()
    fireEvent.click(screen.getByTestId('org-expand-all'))
    expect(screen.getByTestId('org-row-T-DRV')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('org-collapse-all'))
    expect(screen.queryByTestId('org-row-OPS-1')).toBeNull()
    expect(screen.getByTestId('org-row-FIN')).toBeInTheDocument()
  })

  it('فتح موظفي العقدة: القسم يعرض موظفيه المباشرين والمسمى يعرض حامليه، مع رابط الملف', () => {
    wrap()
    fireEvent.click(screen.getByTestId('org-emps-toggle-OPS'))
    const box = screen.getByTestId('org-emps-OPS')
    expect(within(box).getByTestId('org-emp-E2')).toHaveTextContent('سارة حسن')
    expect(within(box).getByTestId('org-emp-E2').closest('a')).toHaveAttribute('href', '/hr/employees/e2')
    expect(within(box).queryByTestId('org-emp-E1')).toBeNull()
    fireEvent.click(screen.getByTestId('org-emps-toggle-T-DRV'))
    expect(within(screen.getByTestId('org-emps-T-DRV')).getByTestId('org-emp-E1')).toHaveTextContent('أحمد علي')
  })

  it('«نقل إلى…» يعرض الأهداف الصالحة فقط (لا نفسه ولا فروعه ولا المسميات) ويطلب تأكيداً ثم يحفظ الأب الجديد', async () => {
    wrap()
    fireEvent.click(screen.getByTestId('org-move-OPS-1'))
    const sel = screen.getByTestId('org-move-select-OPS-1') as HTMLSelectElement
    const labels = Array.from(sel.options).map((o) => o.textContent)
    expect(labels.some((l) => l?.includes('المالية'))).toBe(true)
    expect(labels.some((l) => l?.includes('الكرادة'))).toBe(false)   // فرعه
    expect(labels.some((l) => l?.includes('سائق كابسة'))).toBe(false)   // مسمى
    expect(labels.some((l) => l?.includes('قسم رئيسي'))).toBe(true)
    fireEvent.change(sel, { target: { value: 'fin' } })
    const dlg = screen.getByTestId('org-move-confirm')
    expect(dlg).toHaveTextContent('القاطع الأول'); expect(dlg).toHaveTextContent('المالية'); expect(dlg).toHaveTextContent('2 فرع/مسمى')
    fireEvent.click(screen.getByTestId('org-move-cancel'))
    expect(h.saveDept).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('org-move-OPS-1'))
    fireEvent.change(screen.getByTestId('org-move-select-OPS-1'), { target: { value: 'fin' } })
    fireEvent.click(screen.getByTestId('org-move-ok'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith(expect.objectContaining({ id: 'ops1', parentId: 'fin', name: 'القاطع الأول', code: 'OPS-1' })))
  })

  it('السحب والإفلات: الإفلات على قسم صالح يفتح التأكيد؛ على فرعه لا يحدث شيء؛ المسمى لا يُفلت في الجذر', async () => {
    wrap()
    const data = dt()
    fireEvent.dragStart(screen.getByTestId('org-card-OPS-1'), { dataTransfer: data })
    // على فرعه (دورة) ⇒ لا تأكيد
    fireEvent.drop(screen.getByTestId('org-card-OPS-1-K'), { dataTransfer: data })
    expect(screen.queryByTestId('org-move-confirm')).toBeNull()
    fireEvent.dragStart(screen.getByTestId('org-card-OPS-1'), { dataTransfer: data })
    fireEvent.drop(screen.getByTestId('org-card-FIN'), { dataTransfer: data })
    expect(screen.getByTestId('org-move-confirm')).toHaveTextContent('المالية')
    fireEvent.click(screen.getByTestId('org-move-ok'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith(expect.objectContaining({ id: 'ops1', parentId: 'fin' })))
    // مسمى إلى الجذر: منطقة الإفلات تظهر أثناء السحب لكنها ترفض
    const data2 = dt()
    fireEvent.dragStart(screen.getByTestId('org-card-T-DRV'), { dataTransfer: data2 })
    expect(screen.getByTestId('org-drop-root')).toHaveTextContent('لا يكون قسماً رئيسياً')
    fireEvent.drop(screen.getByTestId('org-drop-root'), { dataTransfer: data2 })
    expect(screen.queryByTestId('org-move-confirm')).toBeNull()
    expect(h.saveDept).toHaveBeenCalledTimes(1)
  })

  it('البحث يُبقي الأسلاف ويُظهر عدد المطابقات؛ التعديل من النموذج لا يعرض فروع القسم كأب محتمل', () => {
    wrap()
    fireEvent.change(screen.getByTestId('org-search'), { target: { value: 'الكرادة' } })
    expect(screen.getByTestId('org-search-count')).toHaveTextContent('1 مطابقة')
    expect(screen.getByTestId('org-row-OPS')).toBeInTheDocument(); expect(screen.getByTestId('org-row-OPS-1-K')).toBeInTheDocument()
    expect(screen.queryByTestId('org-row-FIN')).toBeNull(); expect(screen.queryByTestId('org-row-T-DRV')).toBeNull()
    fireEvent.change(screen.getByTestId('org-search'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('org-edit-OPS'))
    const parent = screen.getByTestId('org-parent') as HTMLSelectElement
    const opts = Array.from(parent.options).map((o) => o.textContent ?? '')
    expect(opts.some((o) => o.includes('OPS-1'))).toBe(false); expect(opts.some((o) => o.includes('FIN'))).toBe(true)
  })

  it('المخطط الهرمي: جذر الشركة، صناديق الأقسام بخطوط، المسميات حبّات داخل قسمها، طيّ الفروع، التكبير، والنقر يفتح التعديل', () => {
    wrap()
    fireEvent.click(screen.getByTestId('org-view-chart'))
    expect(screen.getByTestId('org-chart-root')).toHaveTextContent('شركة جزيرة الأكارم')
    expect(screen.getByTestId('org-chart-node-OPS-1-K')).toHaveAttribute('data-depth', '2')
    expect(screen.queryByTestId('org-chart-node-T-DRV')).toBeNull()
    expect(screen.getByTestId('org-chart-titles-OPS-1')).toHaveTextContent('سائق كابسة')
    fireEvent.click(screen.getByTestId('org-chart-toggle-OPS-1'))
    expect(screen.queryByTestId('org-chart-node-OPS-1-K')).toBeNull()
    fireEvent.click(screen.getByTestId('org-chart-expand-all'))
    expect(screen.getByTestId('org-chart-node-OPS-1-K')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('org-zoom-out'))
    expect(screen.getByTestId('org-zoom')).toHaveTextContent('90%')
    fireEvent.click(screen.getByTestId('org-chart-box-OPS-1'))
    expect((screen.getByTestId('org-name') as HTMLInputElement).value).toBe('القاطع الأول')
    expect(localStorage.getItem('hr-org-view')).toBe('chart')
  })
})
