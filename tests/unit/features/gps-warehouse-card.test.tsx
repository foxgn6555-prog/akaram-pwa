/** 00380 — بطاقة مستودع GPS: الحالات الثلاث، الأزرار وصلاحياتها، الرسائل، وشرح الأخطاء */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GpsWarehouseLink } from '@sdk/gps-warehouse.sdk'

const h = vi.hoisted(() => ({ link: null as GpsWarehouseLink | null, run: vi.fn(), toasts: [] as { type: string; message: string }[] }))
vi.mock('@sdk/gps-warehouse.sdk', () => ({ gpsWarehouse: { link: () => Promise.resolve(h.link), run: h.run } }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: { type: string; message: string }) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t) }) }))
import GpsWarehouseCard from '@features/gps-warehouse/GpsWarehouseCard'

const base: GpsWarehouseLink = { id: 1, warehouse_host: null, last_ping_at: null, last_ping_ok: null, schema_version: null, ping: null, last_registry_sync_at: null, registry_active: null, last_error_code: null, last_error_at: null, updated_at: '2026-10-29T10:00:00Z' }
const ping = { ok: true, schema_version: 1, vehicles: 195, jobs: { queued: 30, running: 1, done: 500, failed: 2 }, raw_points: 1234567, stops: 8900, archive_files: 40, db_bytes: 52428800, settings: { min_stop_minutes: 10, max_stop_minutes: 120, fault_stop_hours: 24, cluster_radius_m: 60, raw_retention_days: 3, archive_retention_months: 6 }, server_time: '2026-10-29T10:00:00Z' }
const ui = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GpsWarehouseCard /></QueryClientProvider>)
beforeEach(() => { h.run.mockReset(); h.toasts = []; h.link = { ...base } })

describe('GpsWarehouseCard (00380)', () => {
  it('قبل أول فحص: حالة «لم يُفحص بعد» + خطوات الربط، وزرا السجل/الجدولة معطّلان', async () => {
    ui()
    await waitFor(() => expect(screen.getByTestId('gps-warehouse-state').textContent).toBe('لم يُفحص بعد'))
    expect(screen.getByTestId('gps-warehouse-setup').textContent).toContain('GPS_WAREHOUSE_SERVICE_KEY')
    expect((screen.getByTestId('gps-warehouse-registry-btn') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('gps-warehouse-enqueue-btn') as HTMLButtonElement).disabled).toBe(true)
    h.run.mockResolvedValue({ ok: true, action: 'ping', ping })
    fireEvent.click(screen.getByTestId('gps-warehouse-ping-btn'))
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('ping', { month: undefined }))
    await waitFor(() => expect(h.toasts[0]?.message).toContain('195 آلية'))
  })
  it('متصل: الأعداد والحدود من آخر فحص، إرسال السجل، ثم الجدولة تتفعّل بعد السجل وترسل الشهر', async () => {
    h.link = { ...base, warehouse_host: 'ujfwtbzvpshtxzsjtcxz.supabase.co', last_ping_at: '2026-10-29T09:00:00Z', last_ping_ok: true, schema_version: 1, ping }
    ui()
    await waitFor(() => expect(screen.getByTestId('gps-warehouse-state').textContent).toBe('متصل'))
    const p = screen.getByTestId('gps-warehouse-ping').textContent ?? ''
    expect(p).toContain('195'); expect(p).toContain('30 بانتظار'); expect(p).toContain('1,234,567'); expect(p).toContain('50.0 م.ب'); expect(p).toContain('من 10 إلى 120 دقيقة'); expect(p).toContain('بعد 24 ساعة')
    expect((screen.getByTestId('gps-warehouse-registry-btn') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('gps-warehouse-enqueue-btn') as HTMLButtonElement).disabled).toBe(true)   // لا سجل بعد
    h.run.mockResolvedValue({ ok: true, action: 'sync_registry', sent: 195, result: { active: 195 } })
    fireEvent.click(screen.getByTestId('gps-warehouse-registry-btn'))
    await waitFor(() => expect(h.toasts[0]?.message).toContain('195 آلية'))
    h.link = { ...h.link, last_registry_sync_at: '2026-10-29T09:05:00Z', registry_active: 195 }
    ui()
    await waitFor(() => expect((screen.getAllByTestId('gps-warehouse-enqueue-btn')[1] as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(screen.getAllByTestId('gps-warehouse-month')[1]!, { target: { value: '2026-09' } })
    h.run.mockResolvedValue({ ok: true, action: 'enqueue_month', result: { queued: 5850, total: 5850 } })
    fireEvent.click(screen.getAllByTestId('gps-warehouse-enqueue-btn')[1]!)
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('enqueue_month', { month: '2026-09' }))
    await waitFor(() => expect(h.toasts.at(-1)?.message).toContain('5850'))
  })
  it('خطأ: الشارة حمراء وشرح عربي للرمز، وفشل الإجراء يُظهر رسالة مترجمة', async () => {
    h.link = { ...base, last_ping_at: '2026-10-29T09:00:00Z', last_ping_ok: false, last_error_code: 'GPS_WAREHOUSE_UNREACHABLE', last_error_at: '2026-10-29T09:00:00Z' }
    ui()
    await waitFor(() => expect(screen.getByTestId('gps-warehouse-state').textContent).toBe('خطأ'))
    expect(screen.getByTestId('gps-warehouse-error').textContent).toContain('Paused')
    h.run.mockRejectedValue(Object.assign(new Error('GPS_WAREHOUSE_NOT_CONFIGURED'), { code: 'GPS_WAREHOUSE_NOT_CONFIGURED' }))
    fireEvent.click(screen.getByTestId('gps-warehouse-ping-btn'))
    await waitFor(() => expect(h.toasts[0]?.type).toBe('error'))
    expect(h.toasts[0]?.message).toContain('غير مربوط')
  })
})
