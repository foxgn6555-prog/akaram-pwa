import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(), create: vi.fn(), cancel: vi.fn(),
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
}
const settings = {
  required_copies: 1, grace_days: 7, updated_at: null,
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
    expect(card).toHaveTextContent('archive.bat pull PKG-2026-07-01_2026-08-31-001')
    const btn = screen.getByTestId('cold-cancel-btn')
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByTestId('cold-cancel-reason'), { target: { value: 'أُنشئت بالخطأ' } })
    fireEvent.click(btn)
    expect(h.cancel).toHaveBeenCalledWith({ id: 'p1', reason: 'أُنشئت بالخطأ' })
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
      protections: { media_design_used: false },
    })
  })

  it('يعرض فشل التحميل بوضوح', () => {
    h.packagesError = true
    render(<ColdArchivePage />)
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر التحميل')
  })
})
