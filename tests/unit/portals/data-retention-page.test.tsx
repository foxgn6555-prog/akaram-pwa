import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  save: vi.fn(), scan: vi.fn(), confirm: vi.fn(), cancel: vi.fn(),
  settings: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[],
}))
vi.mock('@features/data-retention/hooks', () => ({
  useRetentionSettings: () => ({ data: h.settings, isLoading: false, isError: false, refetch: vi.fn() }),
  useRetentionRequests: () => ({ data: h.requests, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetRetentionPolicy: () => ({ mutate: h.save, isPending: false }),
  useRetentionScanNow: () => ({ mutate: h.scan, isPending: false }),
  useConfirmRetention: () => ({ mutate: h.confirm, isPending: false }),
  useCancelRetention: () => ({ mutate: h.cancel, isPending: false }),
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
}
const policy = {
  data_key: 'biometric_raw_punches', label: 'البصمات الخام من الأجهزة', description: 'كل لمسة إصبع', safety_lock: 'لا تُحذف بصمات شهر لم تعتمده المالية',
  enabled: false, retention_months: 6, export_required: true, updated_at: null, updated_by_name: null, open_request: null,
}

describe('DataRetentionPage (00325)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.settings = [policy, { ...policy, data_key: 'gps_position_history', label: 'نقاط GPS', export_required: false, retention_months: 3 }]; h.requests = [] })

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
    fireEvent.click(screen.getByTestId('ret-cancel'))
    expect(h.cancel).toHaveBeenCalledWith('r1')
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
    expect(h.save).toHaveBeenCalledWith({ data_key: 'biometric_raw_punches', enabled: true, retention_months: 9, export_required: true })
  })
})
