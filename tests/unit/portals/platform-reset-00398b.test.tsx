/**
 * 00398-ب — وحدة «التصفير»:
 *   · شاشة القفل: لا دخول إلا بكلمة «تصفير».
 *   · الشبكة: كل الفئات مع الأعداد، «تحديد الكل»، ضم الاعتماديات تلقائياً، زر «تصفير» يطلب كلمة السر ثم يرسل الطلب ⇒ «تم إرسال طلب التصفير».
 *   · مهمة الموافقة: لا زر موافقة مباشر — فقط «إظهار تفاصيل التصفير»؛ صفحة التفاصيل تعرض كل الفئات والاعتماد بكلمة «اعتماد تصفير» فقط.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as SdkMod from '@sdk/platform-reset.sdk'

const h = vi.hoisted(() => ({ calls: {} as Record<string, unknown[]>, canApprove: true, detailOverride: null as Record<string, unknown> | null, countsOverride: null as SdkMod.PlatformResetCounts | null }))
const rec = (k: string, v: unknown) => { (h.calls[k] ??= []).push(v) }

const cat = (key: string, label: string, grp: string, sort: number, rows: number, extra: Partial<SdkMod.PlatformResetCategory> = {}): SdkMod.PlatformResetCategory =>
  ({ key, label, grp, sort, tables: [key + '_t'], buckets: [], rows, files: 0, protected_users: null, ...extra })
const counts: SdkMod.PlatformResetCounts = {
  categories: [
    cat('employees', 'الموظفون وملفاتهم ووثائقهم', 'الموارد البشرية', 10, 120, { buckets: ['employees'], files: 7 }),
    cat('letters', 'الكتب الرسمية والتعاميم', 'الطلبات', 60, 9),
    cat('warehouse', 'مخزن العمليات والمستلزمات', 'الميدان', 150, 3),
    cat('accounts', 'الحسابات والأدوار والصلاحيات', 'الحسابات', 250, 40, { protected_users: 2 }),
  ],
  pending: null, generated_at: '2026-10-31T06:00:00Z',
}
const detail: SdkMod.PlatformResetDetail = {
  id: 'q1', status: 'pending_approval', status_label: 'بانتظار الموافقات', total_rows: 129, total_files: 7, requested_by: 'u-it', requested_by_name: 'حساب التطوير',
  created_at: '2026-10-31T06:00:00Z', approved_at: null, executed_at: null, result: null, rejected_note: null, storage_buckets: ['employees'], storage_done_at: null, storage_deleted: 0,
  via_chain: true, timeline: [{ step_no: 1, label: 'المعاون', status: 'pending', decided_by: null, decided_at: null, note: null }], can_approve: true, includes_accounts: false,
  categories: [
    { key: 'employees', label: 'الموظفون وملفاتهم ووثائقهم', grp: 'الموارد البشرية', tables: ['employees', 'employee_documents'], buckets: ['employees'], rows: 120, files: 7, auto_added: false },
    { key: 'letters', label: 'الكتب الرسمية والتعاميم', grp: 'الطلبات', tables: ['official_letters', 'it_tickets'], buckets: [], rows: 9, files: 0, auto_added: true },
  ],
}

vi.mock('@sdk/platform-reset.sdk', async (orig) => {
  const m = await orig<typeof SdkMod>()
  return { ...m, platformReset: { ...m.platformReset,
    counts: () => Promise.resolve(h.countsOverride ?? counts),
    list: () => Promise.resolve([]),
    closure: (c: string[]) => { rec('closure', c); return Promise.resolve(c.includes('employees') && !c.includes('letters') ? { categories: [...c, 'letters'], added: ['letters'] } : { categories: c, added: c.includes('letters') && c.includes('employees') && c.length === 2 ? ['letters'] : [] }) },
    request: (c: string[], pw: string) => { rec('request', { c, pw }); return Promise.resolve({ id: 'q1', status: 'pending_approval', via_chain: true, categories: c, added: [] }) },
    detail: () => Promise.resolve({ ...detail, ...h.detailOverride, can_approve: h.canApprove }),
    wipeWarehouse: (id: string) => { rec('warehouse', id); return Promise.resolve({ ok: true, result: {} }) },
    approve: (id: string, pw: string) => { rec('approve', { id, pw }); return Promise.resolve({ id, status: 'done', final: true, result: { rows_deleted: 129 } }) },
    reject: (id: string, note: string) => { rec('reject', { id, note }); return Promise.resolve() },
  } }
})
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalTimeline: () => ({ data: [], isLoading: false }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 't1', request_kind: 'platform_reset', request_id: 'q1', step_no: 1, total_steps: 1, step_label: 'المعاون', requester_user_id: 'u-it', requester_name: 'حساب التطوير', requester_role: 'it_admin', requester_role_label: 'التطوير المركزية',
    area_name: null, parent_sector: null, type_name: 'تصفير المنصة', start_date: '2026-10-31', end_date: '2026-10-31', start_time: null, end_time: null, days: null, minutes: null, notes: null, attachment_path: null, created_at: '2026-10-31T06:00:00Z', previous_steps: [], items: null, ref_no: null,
    details: { categories: ['employees', 'letters'], categories_count: 2, includes_accounts: false, labels: ['الموظفون وملفاتهم ووثائقهم', 'الكتب الرسمية والتعاميم'], total_rows: 129, detail_only: true },
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: (x: unknown) => rec('decide', x), isPending: false }),
}))
vi.mock('@features/permissions/my-permissions', () => ({ useCanCall: () => ({ allowed: true, title: undefined }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => rec('toast', t) }) }))

import PlatformResetPage from '@portals/it/pages/PlatformReset/PlatformResetPage'
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
import { PlatformResetDetailView } from '@features/platform-reset/PlatformResetDetailView'
import { PORTAL_UNITS } from '@/config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></MemoryRouter>)
const toasts = () => (h.calls.toast ?? []) as Array<{ type: string; message: string }>

describe('00398-ب · وحدة «التصفير» في بوابة التطوير', () => {
  beforeEach(() => { for (const k of Object.keys(h.calls)) delete h.calls[k]; h.canApprove = true; h.detailOverride = null; h.countsOverride = null })

  it('مسجّلة كوحدة في الشريط وكمسار IT', () => {
    const u = PORTAL_UNITS[PORTALS.IT].find((x) => x.path === '/it/platform-reset')
    expect(u?.labelKey).toBe('nav.platform_reset')
    expect(customRoutes.some((r) => r.path === 'platform-reset')).toBe(true)
  })

  it('المستودع مستقل؛ يتعذّر طلبه عندما يكون عدده غير متاح', async () => {
    h.countsOverride = { ...counts, categories: [cat('gps_hotspots', 'بؤر التوقف المحلية', 'التتبع', 10, 5),
      cat('gps_warehouse', 'مستودع GPS المستقل', 'التتبع', 20, 0, { rows: null, files: null })] }
    wrap(<PlatformResetPage />)
    fireEvent.change(screen.getByTestId('pr-lock-pw'), { target: { value: 'تصفير' } })
    fireEvent.click(screen.getByTestId('pr-lock-enter'))
    await screen.findByTestId('pr-grid')
    fireEvent.click(screen.getByTestId('pr-cb-gps_hotspots'))
    expect(screen.getByTestId('pr-submit')).not.toBeDisabled()
    expect(screen.getByTestId('pr-cb-gps_warehouse')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('pr-cb-gps_warehouse'))
    expect(screen.getByTestId('pr-submit')).toBeDisabled()
    expect(screen.getByText(/عدد مستودع GPS غير متاح/)).toBeInTheDocument()
  })

  it('شاشة القفل: كلمة خاطئة ترفض، و«تصفير» تفتح الشبكة بكل الفئات وأعدادها', async () => {
    wrap(<PlatformResetPage />)
    expect(screen.getByTestId('pr-lock')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('pr-lock-pw'), { target: { value: 'خطأ' } })
    fireEvent.click(screen.getByTestId('pr-lock-enter'))
    expect(screen.getByTestId('pr-lock-err')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-grid')).toBeNull()
    fireEvent.change(screen.getByTestId('pr-lock-pw'), { target: { value: 'تصفير' } })
    fireEvent.click(screen.getByTestId('pr-lock-enter'))
    await screen.findByTestId('pr-grid')
    for (const k of ['employees', 'letters', 'warehouse', 'accounts']) expect(screen.getByTestId(`pr-cb-${k}`)).toBeInTheDocument()
    expect(screen.getByTestId('pr-rows-employees')).toHaveTextContent('120')
    expect(screen.getByTestId('pr-cat-accounts')).toHaveTextContent('يبقى 2 حساب')
    expect(screen.getByTestId('pr-submit')).toBeDisabled()
  })

  it('اختيار الموظفين يضم «الكتب» تلقائياً كاعتمادية، «تحديد الكل» يحدد الجميع، والإرسال يطلب كلمة السر ثم «تم إرسال طلب التصفير»', async () => {
    wrap(<PlatformResetPage />)
    fireEvent.change(screen.getByTestId('pr-lock-pw'), { target: { value: 'تصفير' } })
    fireEvent.click(screen.getByTestId('pr-lock-enter'))
    await screen.findByTestId('pr-grid')
    fireEvent.click(screen.getByTestId('pr-cb-employees'))
    await waitFor(() => expect(screen.getByTestId('pr-cb-letters')).toBeChecked())
    expect(screen.getByTestId('pr-cat-letters')).toHaveTextContent('اعتمادية')
    expect(screen.getByTestId('pr-summary')).toHaveTextContent('2 فئة')
    fireEvent.click(screen.getByTestId('pr-select-all'))
    await waitFor(() => expect(screen.getByTestId('pr-cb-accounts')).toBeChecked())
    expect(screen.getByTestId('pr-summary')).toHaveTextContent('4 فئة')
    expect(screen.getByTestId('pr-summary')).toHaveTextContent('يشمل الحسابات')
    fireEvent.click(screen.getByTestId('pr-submit'))
    const go = screen.getByTestId('pr-confirm-go')
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByTestId('pr-confirm-pw'), { target: { value: 'تصفير' } })
    expect(go).not.toBeDisabled()
    fireEvent.click(go)
    await waitFor(() => expect(h.calls.request).toHaveLength(1))
    expect((h.calls.request![0] as { c: string[]; pw: string }).pw).toBe('تصفير')
    expect((h.calls.request![0] as { c: string[] }).c.sort()).toEqual(['accounts', 'employees', 'letters', 'warehouse'])
    await waitFor(() => expect(toasts().some((t) => t.message === 'تم إرسال طلب التصفير')).toBe(true))
  })
})

describe('00398-ب · مهمة «تصفير المنصة» في الموافقات', () => {
  beforeEach(() => { for (const k of Object.keys(h.calls)) delete h.calls[k]; h.canApprove = true; h.detailOverride = null; h.countsOverride = null })

  it('لا زر موافقة مباشر — فقط «إظهار تفاصيل التصفير»؛ التفاصيل تعرض الفئات والاعتماد يتطلب «اعتماد تصفير»', async () => {
    wrap(<TeamRequestsPage />)
    expect(screen.getByTestId('task-reset-q1')).toHaveTextContent('2 فئة بيانات')
    expect(screen.getByTestId('task-reset-q1')).toHaveTextContent('129')
    expect(screen.queryByTestId('approve-q1')).toBeNull()
    expect(screen.queryByTestId('reject-q1')).toBeNull()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('تصفير المنصة')
    fireEvent.click(screen.getByTestId('reset-detail-q1'))
    await screen.findByTestId('pr-categories')
    expect(screen.getByTestId('pr-cat-employees')).toHaveTextContent('120')
    expect(screen.getByTestId('pr-cat-letters')).toHaveTextContent('أُضيفت تلقائياً')
    expect(screen.getByTestId('pr-rows')).toHaveTextContent('129')
    fireEvent.click(screen.getByTestId('pr-approve'))
    const confirm = screen.getByTestId('pr-approve-confirm')
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByTestId('pr-approve-pw'), { target: { value: 'تصفير' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByTestId('pr-approve-pw'), { target: { value: 'اعتماد تصفير' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(h.calls.approve).toEqual([{ id: 'q1', pw: 'اعتماد تصفير' }]))
    expect(h.calls.decide).toBeUndefined()
  })

  it('الرفض من التفاصيل بسبب إلزامي يمرّ بمحرك الموافقات؛ وغير المعتمِد لا يرى أزرار القرار', async () => {
    wrap(<TeamRequestsPage />)
    fireEvent.click(screen.getByTestId('reset-detail-q1'))
    await screen.findByTestId('pr-categories')
    fireEvent.click(screen.getByTestId('pr-reject'))
    fireEvent.change(screen.getByTestId('pr-reject-note'), { target: { value: 'ليس الآن' } })
    fireEvent.click(screen.getByTestId('pr-reject-confirm'))
    await waitFor(() => expect(h.calls.reject).toEqual([{ id: 'q1', note: 'ليس الآن' }]))
    fireEvent.click(screen.getByTestId('pr-detail-close'))
    h.canApprove = false
    wrap(<TeamRequestsPage />)
    fireEvent.click(screen.getAllByTestId('reset-detail-q1')[1]!)
    await waitFor(() => expect(screen.getAllByTestId('pr-categories').length).toBeGreaterThan(0))
    expect(screen.queryByTestId('pr-approve')).toBeNull()
  })
})


describe('00398-د · المستودع مستقل عن حاويات المشروع الأول', () => {
  beforeEach(() => { for (const k of Object.keys(h.calls)) delete h.calls[k]; h.canApprove = false; h.detailOverride = null; h.countsOverride = null })
  it('يُظهر زر المستودع حتى لو لا توجد ملفات محلية، ويرسل رقم الطلب', async () => {
    h.detailOverride = { status: 'done', status_label: 'نُفّذ', storage_buckets: [], warehouse_done_at: null,
      result: { rows_deleted: 0, tables: 0, users_deleted: 0, protected_users: 1, duration_ms: 1, warehouse_wipe: true },
      categories: [{ key: 'gps_warehouse', label: 'المستودع التحليلي', grp: 'التتبع', tables: [], buckets: [], rows: 12, files: 3, auto_added: false }] }
    wrap(<PlatformResetDetailView id="q1" onClose={() => undefined} canWipeStorage />)
    const button = await screen.findByTestId('pr-wipe-warehouse')
    expect(screen.queryByTestId('pr-wipe-storage')).toBeNull()
    fireEvent.click(button)
    await waitFor(() => expect(h.calls.warehouse).toEqual(['q1']))
  })
  it('لا يتيح حذف المستودع عند كون الطلب معلقاً', async () => {
    h.detailOverride = { categories: [{ key: 'gps_warehouse', label: 'المستودع التحليلي', grp: 'التتبع', tables: [], buckets: [], rows: 12, files: 3, auto_added: false }] }
    wrap(<PlatformResetDetailView id="q1" onClose={() => undefined} canWipeStorage />)
    await screen.findByTestId('pr-categories')
    expect(screen.queryByTestId('pr-wipe-warehouse')).toBeNull()
  })
})
