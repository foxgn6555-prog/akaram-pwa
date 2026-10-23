import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(), create: vi.fn(), cancel: vi.fn(), request: vi.fn(), approve: vi.fn(), run: vi.fn(), pull: vi.fn(),
  packages: [] as Record<string, unknown>[], preview: null as Record<string, unknown> | null, settings: null as Record<string, unknown> | null,
  packagesError: false,
}))
vi.mock('@features/cold-archive/hooks', () => ({
  useColdSettings: () => ({ data: h.settings, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveColdSettings: () => ({ mutate: h.save, isPending: false }),
  useColdPreview: (_f: string, _t: string, enabled: boolean) => ({ data: enabled ? h.preview : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useColdPackages: () => ({ data: h.packages, isLoading: false, isError: h.packagesError, refetch: vi.fn() }),
  useColdPackage: (id: string | null) => ({ data: id ? h.packages.find((p) => p.id === id) : undefined }),
  useCreateColdPackage: () => ({ mutate: h.create, isPending: false }),
  useCancelColdPackage: () => ({ mutate: h.cancel, isPending: false }),
  useRequestColdPurge: () => ({ mutate: h.request, isPending: false }),
  useApproveColdPurge: () => ({ mutate: h.approve, isPending: false }),
  useRunColdPurge: () => ({ mutate: h.run, isPending: false }),
  useBrowserPull: () => ({ mutate: h.pull, isPending: false }),
}))
import ColdArchivePage from '@portals/it/pages/ColdArchive/ColdArchivePage'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'

const pkg = {
  id: 'p1', code: 'PKG-2026-07-01_2026-08-31-001', period_from: '2026-07-01', period_to: '2026-08-31', status: 'ready', note: null,
  file_count: 120, total_bytes: 350 * 1024 * 1024, downloaded_count: 60, verified_copies: 0, required_copies: 1, grace_days: 7,
  purge_available_at: null, purged_count: 0, created_by: 'u1', created_by_name: 'مدير التطوير', created_at: '2026-10-01T08:00:00Z',
  verified_at: null, purge_started_at: null, purged_at: null, cancelled_at: null, copies: [],
  by_source: [{ source_key: 'media_submission_photos', files: 100, bytes: 300 * 1024 * 1024 }, { source_key: 'contractor_checkins', files: 20, bytes: 50 * 1024 * 1024 }],
  can_purge: false, events: [{ action: 'created', details: null, actor_name: 'مدير التطوير', at: '2026-10-01T08:00:00Z' }],
  purge_approval_required: false, purge_requested_at: null, purge_requested_by_name: null, purge_requested_by_me: false, purge_approved_at: null, purge_approved_by_name: null, purge_chain_id: null, purge_chain: null,
}
const verified = { ...pkg, status: 'verified', downloaded_count: 120, verified_copies: 1, purge_available_at: '2026-10-10T08:00:00Z', copies: [{ disk_label: 'قرص-1', ok_count: 120, verified_at: '2026-10-03T08:00:00Z', verified_by_name: 'مدير التطوير' }] }
const settings = {
  required_copies: 1, grace_days: 7, purge_approval: false, updated_at: null,
  sources: {
    media_submission_photos: { label: 'صور الإعلام', bucket: 'media-photos', sensitive: false, description: 'صور التذاكر', enabled: true },
    employee_documents: { label: 'مستندات الموظفين', bucket: 'employee-documents', sensitive: true, description: 'هويات وعقود', enabled: false },
  },
  protections: { media_design_used: { label: 'الصور المستخدمة في تصميم إعلامي', on: true } },
}
const preview = {
  period_from: '2026-07-01', period_to: '2026-08-31',
  sources: [{ source_key: 'media_submission_photos', files: 100, bytes: 300 * 1024 * 1024, protected: 5, already_archived: 2, reasons: ['مستخدمة في تصميم'] }],
  totals: { files: 100, bytes: 300 * 1024 * 1024, protected: 5, already_archived: 2 },
}

describe('🧊 الأرشيف البارد — صفحة IT (00315)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.packages = []; h.preview = null; h.settings = null; h.packagesError = false })

  it('مسجّلة كمسار IT وكعنصر فرعي تحت وحدة الأرشيف (لا تغيّر عدد الوحدات 11)', () => {
    expect(customRoutes.some((r) => r.path === 'cold-archive')).toBe(true)
    const units = PORTAL_UNITS[PORTALS.IT]
    expect(units).toHaveLength(11)
    const archive = units.find((u) => u.path === '/it/archive')
    expect(archive?.children?.map((c) => c.path)).toContain('/it/cold-archive')
    expect(archive?.children?.find((c) => c.path === '/it/cold-archive')?.labelKey).toBe('nav.cold_archive')
  })

  it('يعرض الحزمة بحالتها ونسبة التنزيل والنسخ، ويطلب سبباً للإلغاء', () => {
    h.packages = [pkg]
    render(<ColdArchivePage />)
    const card = screen.getByTestId('cold-pkg-PKG-2026-07-01_2026-08-31-001')
    expect(card).toHaveTextContent('جاهزة للتنزيل')
    expect(card).toHaveTextContent('50%')
    expect(card).toHaveTextContent('0 / 1')
    fireEvent.click(screen.getByText('PKG-2026-07-01_2026-08-31-001'))
    expect(card).toHaveTextContent('صور الإعلام')
    expect(screen.getByTestId('cold-pull-panel')).toBeInTheDocument()
    const btn = screen.getByTestId('cold-cancel-btn')
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByTestId('cold-cancel-reason'), { target: { value: 'أُنشئت بالخطأ' } })
    fireEvent.click(btn)
    expect(h.cancel).toHaveBeenCalledWith({ id: 'p1', reason: 'أُنشئت بالخطأ' })
  })

  it('00320: زر «اختيار مجلد وبدء التنزيل» يعمل في المتصفحات الداعمة ويظهر تنبيه في غيرها', () => {
    h.packages = [pkg]
    const { unmount } = render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.getByTestId('cold-pull-unsupported')).toBeInTheDocument()
    expect(screen.getByTestId('cold-pull-btn')).toBeDisabled()
    unmount()
    ;(window as unknown as { showDirectoryPicker: () => void }).showDirectoryPicker = () => undefined
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.queryByTestId('cold-pull-unsupported')).toBeNull()
    const btn = screen.getByTestId('cold-pull-btn')
    expect(btn).toHaveTextContent('استكمال التنزيل')   // downloaded_count = 60
    fireEvent.click(btn)
    expect(h.pull).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), expect.any(Object))
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('الحزمة المحذوفة لا تعرض زر الإلغاء', () => {
    h.packages = [{ ...pkg, status: 'purged', downloaded_count: 120, verified_copies: 1, purged_count: 120 }]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.queryByTestId('cold-cancel-btn')).toBeNull()
    expect(screen.getByTestId(`cold-pkg-${pkg.code}`)).toHaveTextContent('حُذفت من المنصة')
  })

  it('حزمة جديدة: المعاينة أولاً ثم الإنشاء بالفترة والملاحظة', () => {
    h.preview = preview
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByTestId('cold-tab-new'))
    expect(screen.queryByTestId('cold-preview')).toBeNull()
    fireEvent.change(screen.getByTestId('cold-from'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByTestId('cold-to'), { target: { value: '2026-08-31' } })
    fireEvent.click(screen.getByTestId('cold-preview-btn'))
    const box = screen.getByTestId('cold-preview')
    expect(box).toHaveTextContent('300.0 MB')
    expect(box).toHaveTextContent('مستخدمة في تصميم')
    fireEvent.change(screen.getByTestId('cold-note'), { target: { value: 'الصيف' } })
    fireEvent.click(screen.getByTestId('cold-create-btn'))
    expect(h.create).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-08-31', note: 'الصيف' }, expect.any(Object))
  })

  it('حزمة جديدة: زر الإنشاء معطّل عندما لا توجد ملفات', () => {
    h.preview = { ...preview, sources: [], totals: { files: 0, bytes: 0, protected: 0, already_archived: 0 } }
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByTestId('cold-tab-new'))
    fireEvent.click(screen.getByTestId('cold-preview-btn'))
    expect(screen.getByTestId('cold-create-btn')).toBeDisabled()
  })

  it('الإعدادات: المصادر الحساسة معلَّمة، والحفظ معطّل حتى يتغير شيء ثم يرسل الشكل الصحيح', () => {
    h.settings = settings
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByTestId('cold-tab-settings'))
    expect(screen.getByTestId('cold-src-employee_documents')).not.toBeChecked()
    expect(screen.getAllByText('حساس').length).toBe(1)
    const save = screen.getByTestId('cold-save-settings')
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByTestId('cold-copies'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('cold-prot-media_design_used'))
    expect(save).not.toBeDisabled()
    fireEvent.click(save)
    expect(h.save).toHaveBeenCalledWith({
      required_copies: 2, grace_days: 7,
      sources: { media_submission_photos: { enabled: true }, employee_documents: { enabled: false } },
      protections: { media_design_used: false }, purge_approval: false,
    })
  })

  it('الحذف (00317): حزمة متحقَّق منها بعد المهلة — الزر معطّل حتى كتابة رمز الحزمة ثم ينفّذ', () => {
    h.packages = [verified]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    const panel = screen.getByTestId('cold-purge-panel')
    expect(panel).toHaveTextContent('انتهت مهلة الأمان')
    const run = screen.getByTestId('cold-purge-run')
    expect(run).toBeDisabled()
    fireEvent.change(screen.getByTestId('cold-purge-confirm'), { target: { value: 'PKG-WRONG' } })
    expect(run).toBeDisabled()
    fireEvent.change(screen.getByTestId('cold-purge-confirm'), { target: { value: pkg.code } })
    expect(run).not.toBeDisabled()
    fireEvent.click(run)
    expect(h.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('الحذف: مهلة الأمان لم تنتهِ → لا زر حذف', () => {
    h.packages = [{ ...verified, purge_available_at: '2099-01-01T00:00:00Z' }]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('مهلة الأمان حتى')
    expect(screen.queryByTestId('cold-purge-run')).toBeNull()
  })

  it('الموافقة الثنائية: طلب → (الطالب لا يوافق) → حساب آخر يوافق → يُفتح الزر', () => {
    h.packages = [{ ...verified, purge_approval_required: true }]
    const { unmount } = render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.queryByTestId('cold-purge-run')).toBeNull()
    fireEvent.click(screen.getByTestId('cold-purge-request'))
    expect(h.request).toHaveBeenCalledWith('p1')
    unmount()
    h.packages = [{ ...verified, purge_approval_required: true, purge_requested_at: '2026-10-11T08:00:00Z', purge_requested_by_name: 'أحمد', purge_requested_by_me: true }]
    const r2 = render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.queryByTestId('cold-purge-approve')).toBeNull()
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('أنت طالب الحذف')
    r2.unmount()
    h.packages = [{ ...verified, purge_approval_required: true, purge_requested_at: '2026-10-11T08:00:00Z', purge_requested_by_name: 'أحمد', purge_requested_by_me: false }]
    const r3 = render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    fireEvent.click(screen.getByTestId('cold-purge-approve'))
    expect(h.approve).toHaveBeenCalledWith('p1')
    r3.unmount()
    h.packages = [{ ...verified, purge_approval_required: true, purge_requested_at: '2026-10-11T08:00:00Z', purge_approved_at: '2026-10-11T09:00:00Z', purge_approved_by_name: 'سارة' }]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('وافق: سارة')
    expect(screen.getByTestId('cold-purge-run')).toBeInTheDocument()
  })

  it('00338: سلسلة موافقات من التطوير المركزية — لا زر موافقة مباشرة، تُعرض الخطوات وحالتها، وبعد الاعتماد يُفتح الحذف', () => {
    const chain = { chain_id: 'c1', current_step: 2, total_steps: 2, steps: [
      { step_no: 1, label: 'التطوير المركزية (حسب التسلسل)', status: 'approved', decided_by: 'سارة', decided_at: '2026-10-11T08:30:00Z', note: null, approvers: 'سارة' },
      { step_no: 2, label: 'معاون المدير المفوض (حسب التسلسل)', status: 'pending', decided_by: null, decided_at: null, note: null, approvers: 'المعاون' },
    ] }
    h.packages = [{ ...verified, purge_approval_required: true, purge_requested_at: '2026-10-11T08:00:00Z', purge_requested_by_name: 'أحمد', purge_requested_by_me: false, purge_chain_id: 'c1', purge_chain: chain }]
    const r1 = render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.queryByTestId('cold-purge-approve')).toBeNull()
    expect(screen.queryByTestId('cold-purge-run')).toBeNull()
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('بانتظار سلسلة الموافقات (خطوة 2 من 2)')
    expect(screen.getByTestId('cold-purge-chain-step-1')).toHaveTextContent('وافق سارة')
    expect(screen.getByTestId('cold-purge-chain-step-2')).toHaveTextContent('بانتظار: المعاون')
    expect(screen.getByTestId('cold-purge-chain-note')).toBeInTheDocument()
    r1.unmount()
    h.packages = [{ ...verified, purge_approval_required: true, purge_requested_at: '2026-10-11T08:00:00Z', purge_approved_at: '2026-10-11T10:00:00Z', purge_approved_by_name: 'المعاون', purge_chain_id: 'c1', purge_chain: { ...chain, current_step: null } }]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('وافق: المعاون')
    expect(screen.queryByTestId('cold-purge-chain')).toBeNull()
    expect(screen.getByTestId('cold-purge-run')).toBeInTheDocument()
  })

  it('حزمة متوقفة أثناء الحذف تعرض الاستئناف', () => {
    h.packages = [{ ...verified, status: 'purging', purged_count: 40 }]
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByText(pkg.code))
    expect(screen.getByTestId('cold-purge-run')).toHaveTextContent('استئناف الحذف')
    expect(screen.getByTestId('cold-purge-panel')).toHaveTextContent('40 / 120')
  })

  it('الإعدادات: مفتاح الموافقة الثنائية يُرسل', () => {
    h.settings = settings
    render(<ColdArchivePage />)
    fireEvent.click(screen.getByTestId('cold-tab-settings'))
    fireEvent.click(screen.getByTestId('cold-approval'))
    fireEvent.click(screen.getByTestId('cold-save-settings'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ purge_approval: true }))
  })

  it('يعرض فشل التحميل بوضوح', () => {
    h.packagesError = true
    render(<ColdArchivePage />)
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر التحميل')
  })
})
