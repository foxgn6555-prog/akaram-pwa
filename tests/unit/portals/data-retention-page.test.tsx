import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(), scan: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), exp: vi.fn(), run: vi.fn(), postpone: vi.fn(), runPending: false,
  settings: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[],
}))
vi.mock('@features/data-retention/hooks', () => ({
  useRetentionSettings: () => ({ data: h.settings, isLoading: false, isError: false, refetch: vi.fn() }),
  useRetentionRequests: () => ({ data: h.requests, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetRetentionPolicy: () => ({ mutate: h.save, isPending: false }),
  useRetentionScanNow: () => ({ mutate: h.scan, isPending: false }),
  useConfirmRetention: () => ({ mutate: h.confirm, isPending: false }),
  useCancelRetention: () => ({ mutate: h.cancel, isPending: false }),
  useBrowserExport: () => ({ mutate: h.exp, isPending: false }),
  useRunRetentionDelete: () => ({ mutate: h.run, isPending: h.runPending }),
  usePostponeRetention: () => ({ mutate: h.postpone, isPending: false }),
}))
import DataRetentionPage from '@portals/it/pages/DataRetention/DataRetentionPage'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'
import sidebar from '@/i18n/ar/sidebar.json'

const req = {
  id: 'r1', data_key: 'biometric_raw_punches', label: 'البصمات الخام من الأجهزة', cutoff: '2026-04-22T00:00:00Z', status: 'pending',
  rows_total: 9, rows_locked: 4, rows_deletable: 5, export_required: true, rows_exported: null, export_sha256: null, export_label: null,
  exported_by_name: null, exported_at: null, confirmed_by_name: null, confirmed_at: null, rows_deleted: 0, finished_at: null,
  created_at: '2026-10-22T01:00:00Z', updated_at: '2026-10-22T01:00:00Z', can_export: true, can_confirm: false,
  events: [{ action: 'request_created', details: null, actor_name: 'النظام', at: '2026-10-22T01:00:00Z' }],
  auto_delete_at: null, postponed_count: 0, auto_blocked_export: false, can_postpone: false,
}
const policy = {
  data_key: 'biometric_raw_punches', label: 'البصمات الخام من الأجهزة', description: 'كل لمسة إصبع', safety_lock: 'لا تُحذف بصمات شهر لم تعتمده المالية',
  portal_key: 'it', portal_label: 'بوابة التطوير المركزية (IT)', table_name: 'biometric_punches', time_column: 'punched_at', deletable: true,
  enabled: false, retention_months: 6, export_required: true, requires_confirm: true, grace_days: 7, updated_at: null, updated_by_name: null, open_request: null,
}
const lockedPolicy = {
  ...policy, data_key: 'employees', label: 'الموظفون', description: '', safety_lock: 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني',
  portal_key: 'hr', portal_label: 'الموارد البشرية', table_name: 'employees', time_column: null, deletable: false, export_required: false, retention_months: 12,
}
const gpsPolicy = { ...policy, data_key: 'gps_position_history', label: 'نقاط GPS', export_required: false, retention_months: 3, portal_key: 'gps', portal_label: 'تتبع GPS والمشاركة الحية', table_name: 'gps_device_position_history', time_column: 'fix_time' }

describe('DataRetentionPage (00325)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.runPending = false; h.settings = [policy, gpsPolicy, lockedPolicy]; h.requests = [] })

  it('مسجّلة كمسار IT وفي القائمة تحت وحدة الأرشيف مع ترجمة عربية (الوحدات تبقى 11)', () => {
    expect(customRoutes.some((r) => r.path === 'data-retention')).toBe(true)
    const units = PORTAL_UNITS[PORTALS.IT]
    expect(units).toHaveLength(11)
    const archive = units.find((u) => u.path === '/it/archive')
    expect(archive?.children?.find((c) => c.path === '/it/data-retention')?.labelKey).toBe('nav.data_retention')
    expect((sidebar as { nav: Record<string, string> }).nav.data_retention).toBe('الاحتفاظ بالبيانات')
  })

  it('لا طلبات: حالة فارغة + زر «فحص الآن» ينادي الفحص', () => {
    render(<DataRetentionPage />)
    expect(screen.getByText('لا توجد طلبات حذف')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ret-scan'))
    expect(h.scan).toHaveBeenCalledTimes(1)
  })

  it('طلب معلّق يتطلب تصديراً: الأعداد ظاهرة، لا زر تأكيد، تنبيه التصدير، والإلغاء يعمل', () => {
    h.requests = [req]
    render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-request-biometric_raw_punches-pending')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument(); expect(screen.getByText('4')).toBeInTheDocument(); expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByTestId('ret-export-needed')).toBeInTheDocument()
    expect(screen.queryByTestId('ret-confirm')).toBeNull()
    // 00326: زر التصدير — معطّل في متصفح غير داعم، ويعمل مع showDirectoryPicker
    expect((screen.getByTestId('ret-export-btn') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('ret-export-unsupported')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ret-cancel'))
    expect(h.cancel).toHaveBeenCalledWith('r1')
  })

  it('00326: زر التصدير ينادي التصدير بالمعرّف في متصفح داعم', () => {
    ;(window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn()
    try {
      h.requests = [req]
      render(<DataRetentionPage />)
      const btn = screen.getByTestId('ret-export-btn') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
      fireEvent.click(btn)
      expect(h.exp).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }))
    } finally { delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker }
  })

  it('طلب قابل للتأكيد: الزر معطّل حتى كتابة «حذف» ثم ينادي التأكيد بالمعرّف', () => {
    h.requests = [{ ...req, data_key: 'gps_position_history', export_required: false, can_confirm: true }]
    render(<DataRetentionPage />)
    const btn = screen.getByTestId('ret-confirm') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('ret-confirm-input'), { target: { value: 'حذف' } })
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(h.confirm).toHaveBeenCalledWith('r1')
  })

  it('00327: طلب مؤكَّد: شريط تقدم + «بدء الحذف» ينادي التشغيل بإشارة إيقاف؛ أثناء التشغيل يظهر زر الإيقاف', () => {
    h.requests = [{ ...req, status: 'confirmed', can_confirm: false, confirmed_by_name: 'مدير التطوير', confirmed_at: '2026-10-22T02:00:00Z', rows_deleted: 0 }]
    const { unmount } = render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-delete-progress').textContent).toContain('0 / 5 (0%)')
    fireEvent.click(screen.getByTestId('ret-delete-start'))
    expect(h.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', signal: expect.any(AbortSignal) }))
    expect(screen.queryByTestId('ret-confirm')).toBeNull()
    unmount()
    // قيد الحذف بعد توقف سابق: «استئناف الحذف» والنسبة من المحذوف فعلاً
    h.requests = [{ ...req, status: 'deleting', can_confirm: false, rows_deleted: 3, rows_deletable: 2, rows_total: 6 }]
    const u2 = render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-delete-start').textContent).toContain('استئناف الحذف')
    expect(screen.getByTestId('ret-delete-progress').textContent).toContain('3 / 5 (60%)')
    u2.unmount()
    h.runPending = true
    render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-delete-stop')).toBeInTheDocument()
    expect(screen.queryByTestId('ret-delete-start')).toBeNull()
  })

  it('الطلبات المنتهية تُطوى تحت تفاصيل', () => {
    h.requests = [{ ...req, status: 'done', rows_deleted: 5, finished_at: '2026-10-23T01:00:00Z', can_confirm: false }]
    render(<DataRetentionPage />)
    expect(screen.getByText(/الطلبات المنتهية \(1\)/)).toBeInTheDocument()
    expect(screen.getByTestId('ret-request-biometric_raw_punches-done')).toBeInTheDocument()
  })

  it('السياسات: الحفظ معطّل بلا تغيير، ويُرسل القيم الجديدة؛ مدة خارج 1..120 تمنع الحفظ', () => {
    render(<DataRetentionPage />)
    fireEvent.click(screen.getByTestId('ret-tab-policies'))
    const card = screen.getByTestId('ret-policy-biometric_raw_punches')
    const save = card.querySelector('[data-testid="ret-save"]') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(card.textContent).toContain('قفل سلامة ثابت')
    fireEvent.click(card.querySelector('[data-testid="ret-enabled"]') as HTMLInputElement)
    fireEvent.change(card.querySelector('[data-testid="ret-months"]') as HTMLInputElement, { target: { value: '0' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(card.querySelector('[data-testid="ret-months"]') as HTMLInputElement, { target: { value: '9' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(h.save).toHaveBeenCalledWith({ data_key: 'biometric_raw_punches', enabled: true, retention_months: 9, export_required: true, requires_confirm: true, grace_days: 7 })
  })

  it('00340: السياسات مجمّعة حسب البوابة؛ المقفل يظهر بشارة وسبب بلا مدخلات؛ الملخص يعدّ الكل/القابل/المقفل', () => {
    render(<DataRetentionPage />)
    fireEvent.click(screen.getByTestId('ret-tab-policies'))
    expect(screen.getByTestId('ret-portal-it')).toBeInTheDocument()
    expect(screen.getByTestId('ret-portal-gps')).toBeInTheDocument()
    expect(screen.getByTestId('ret-portal-hr').textContent).toContain('الموارد البشرية')
    const locked = screen.getByTestId('ret-policy-employees')
    expect(locked.querySelector('[data-testid="ret-locked-badge"]')).not.toBeNull()
    expect(locked.textContent).toContain('بيانات أساسية/مرجعية')
    expect(locked.querySelector('[data-testid="ret-enabled"]')).toBeNull()
    expect(locked.querySelector('[data-testid="ret-save"]')).toBeNull()
    const summary = screen.getByTestId('ret-policies-summary').textContent ?? ''
    expect(summary).toContain('كل الأنواع: 3'); expect(summary).toContain('قابلة للحذف الزمني: 2'); expect(summary).toContain('مقفلة: 1')
  })

  it('00340: البحث يصفّي بالاسم/الجدول، و«القابلة للحذف فقط» يخفي المقفل', () => {
    render(<DataRetentionPage />)
    fireEvent.click(screen.getByTestId('ret-tab-policies'))
    fireEvent.change(screen.getByTestId('ret-search'), { target: { value: 'gps_device' } })
    expect(screen.getByTestId('ret-policy-gps_position_history')).toBeInTheDocument()
    expect(screen.queryByTestId('ret-policy-employees')).toBeNull()
    expect(screen.queryByTestId('ret-policy-biometric_raw_punches')).toBeNull()
    fireEvent.change(screen.getByTestId('ret-search'), { target: { value: '' } })
    expect(screen.getByTestId('ret-policy-employees')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ret-only-deletable'))
    expect(screen.queryByTestId('ret-policy-employees')).toBeNull()
    expect(screen.queryByTestId('ret-portal-hr')).toBeNull()
    expect(screen.getByTestId('ret-policy-biometric_raw_punches')).toBeInTheDocument()
  })

  it('00341: إلغاء «يحتاج تأكيد IT» يُظهر مهلة الأمان؛ مهلة خارج 0..90 تمنع الحفظ؛ الحفظ يرسل requires_confirm=false و grace_days', () => {
    render(<DataRetentionPage />)
    fireEvent.click(screen.getByTestId('ret-tab-policies'))
    const card = screen.getByTestId('ret-policy-gps_position_history')
    expect(card.querySelector('[data-testid="ret-grace"]')).toBeNull()
    fireEvent.click(card.querySelector('[data-testid="ret-requires-confirm"]') as HTMLInputElement)
    const grace = card.querySelector('[data-testid="ret-grace"]') as HTMLInputElement
    expect(grace).not.toBeNull()
    const save = card.querySelector('[data-testid="ret-save"]') as HTMLButtonElement
    fireEvent.change(grace, { target: { value: '91' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(grace, { target: { value: '10' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(h.save).toHaveBeenCalledWith({ data_key: 'gps_position_history', enabled: false, retention_months: 3, export_required: false, requires_confirm: false, grace_days: 10 })
  })

  it('00341: طلب تلقائي يعرض موعد الحذف وزر التأجيل ينادي بالمعرّف؛ المحجوز بانتظار التصدير يعرض التحذير', () => {
    h.requests = [{ ...req, data_key: 'gps_position_history', export_required: false, can_confirm: true, auto_delete_at: '2026-10-30T01:00:00Z', can_postpone: true, postponed_count: 1 }]
    const { unmount } = render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-auto-banner').textContent).toContain('سيُحذف تلقائياً')
    expect(screen.getByTestId('ret-auto-banner').textContent).toContain('أُجِّل 1 مرة')
    fireEvent.click(screen.getByTestId('ret-postpone'))
    expect(h.postpone).toHaveBeenCalledWith({ id: 'r1', days: 7 })
    expect(screen.getByTestId('ret-confirm')).toBeInTheDocument()
    unmount()
    h.requests = [{ ...req, auto_delete_at: '2026-10-20T01:00:00Z', can_postpone: true, auto_blocked_export: true }]
    render(<DataRetentionPage />)
    expect(screen.getByTestId('ret-auto-banner').textContent).toContain('محجوز حتى يُسجَّل تصدير')
    expect(screen.getByTestId('ret-export-needed')).toBeInTheDocument()
  })

  it('00341: طلب يدوي (بلا موعد) لا يعرض لافتة الحذف التلقائي', () => {
    h.requests = [req]
    render(<DataRetentionPage />)
    expect(screen.queryByTestId('ret-auto-banner')).toBeNull()
    expect(screen.queryByTestId('ret-postpone')).toBeNull()
  })
})
