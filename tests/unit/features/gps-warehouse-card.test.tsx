/** 00380 — بطاقة مستودع GPS: الحالات الثلاث، الأزرار وصلاحياتها، الرسائل، وشرح الأخطاء */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GpsWarehouseLink } from '@sdk/gps-warehouse.sdk'

const h = vi.hoisted(() => ({ link: null as GpsWarehouseLink | null, run: vi.fn(), toasts: [] as { type: string; message: string }[], space: null as unknown }))
vi.mock('@sdk/gps-warehouse.sdk', () => ({ gpsWarehouse: { link: () => Promise.resolve(h.link), run: h.run } }))
vi.mock('@features/space/hooks', () => ({ useSpaceOverview: () => ({ data: h.space }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: { type: string; message: string }) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t) }) }))
import GpsWarehouseCard from '@features/gps-warehouse/GpsWarehouseCard'

const base: GpsWarehouseLink = { id: 1, warehouse_host: null, last_ping_at: null, last_ping_ok: null, schema_version: null, ping: null, last_registry_sync_at: null, registry_active: null, last_error_code: null, last_error_at: null, updated_at: '2026-10-29T10:00:00Z' }
const ping = { ok: true, schema_version: 1, vehicles: 195, jobs: { queued: 30, running: 1, done: 500, failed: 2 }, raw_points: 1234567, stops: 8900, archive_files: 40, db_bytes: 52428800, settings: { min_stop_minutes: 10, max_stop_minutes: 120, fault_stop_hours: 24, cluster_radius_m: 60, raw_retention_days: 3, archive_retention_months: 6 }, server_time: '2026-10-29T10:00:00Z' }
const ui = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GpsWarehouseCard /></QueryClientProvider>)
beforeEach(() => { h.run.mockReset(); h.toasts = []; h.link = { ...base }; h.space = null })

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
  it('00381: التقدّم الشهري والمجدول والإيقاف/الاستئناف وسحب دفعة', async () => {
    const progress = { months: [{ month: '2026-09', total: 5850, done: 2925, queued: 2900, running: 3, failed: 22, points: 9_000_000, stops: 61_000, devices: 195, first_started_at: '2026-10-29T00:00:00Z', last_finished_at: '2026-10-29T09:00:00Z', done_last_hour: 150 }], errors: [{ device_external_id: 'd-9', day: '2026-09-03', error_code: 'LVN_TIMEOUT', attempts: 6, at: '2026-10-29T08:00:00Z' }], paused: false, locked: false, stops_by_class: { valid: 50_000, long: 9_000, fault: 2_000 } }
    h.link = { ...base, warehouse_host: 'x.supabase.co', last_ping_at: '2026-10-29T09:00:00Z', last_ping_ok: true, schema_version: 2, last_registry_sync_at: '2026-10-29T08:00:00Z', registry_active: 195, ping: { ...ping, progress }, cron: { scheduled: true, last_run_at: '2026-10-29T09:00:30Z', last_status: 'succeeded' } }
    ui()
    await waitFor(() => expect(screen.getByTestId('gps-warehouse-progress')).toBeInTheDocument())
    const row = screen.getByTestId('gps-warehouse-month-2026-09').textContent ?? ''
    expect(row).toContain('50%'); expect(row).toContain('(2925/5850)'); expect(row).toContain('2903'); expect(row).toContain('22'); expect(row).toContain('9,000,000'); expect(row).toContain('150 يوم/ساعة'); expect(row).toContain('20 ساعة')
    expect(screen.getByTestId('gps-warehouse-cron').textContent).toContain('المجدول يعمل كل دقيقة')
    expect(screen.getByTestId('gps-warehouse-errors').textContent).toContain('LVN_TIMEOUT')
    expect(screen.getByTestId('gps-warehouse-progress').textContent).toContain('عطل مشتبه (≥ يوم، مستبعدة) 2000')
    h.run.mockResolvedValue({ ok: true, action: 'pull', jobs: 3, results: [{ job: 1 }, { job: 2, error: 'LVN_TIMEOUT' }, { job: 3, partial: true }] })
    fireEvent.click(screen.getByTestId('gps-warehouse-pull-btn'))
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('pull', { month: undefined, limit: 3 }))
    await waitFor(() => expect(h.toasts.at(-1)?.message).toContain('3 مهمة · 1 اكتملت · 1 فشلت'))
    h.run.mockResolvedValue({ ok: true, action: 'pause', result: { paused: true } })
    fireEvent.click(screen.getByTestId('gps-warehouse-pause-btn'))
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('pause', { month: undefined, limit: undefined }))
    // متوقف: شارة + زر الاستئناف + «سحب دفعة» معطّل
    h.link = { ...h.link, ping: { ...ping, progress: { ...progress, paused: true } }, cron: { scheduled: false, last_run_at: null, last_status: null } }
    ui()
    await waitFor(() => expect(screen.getAllByTestId('gps-warehouse-paused').length).toBeGreaterThan(0))
    expect(screen.getAllByTestId('gps-warehouse-resume-btn').length).toBe(1)
    expect((screen.getAllByTestId('gps-warehouse-pull-btn').at(-1) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByTestId('gps-warehouse-cron').at(-1)?.textContent).toContain('غير مفعّل')
  })
  it('00382-ب: النافذة المتجددة — المعروض/قيد التجميع، دور كل شهر، آخر مسح، والخام يُحذف فوراً بلا أرشيف', async () => {
    const progress = { window: { today: '2026-10-30', collecting_month: '2026-10-01', displayed_month: '2026-09-01', cutoff: '2026-09-01', keep_months: 1, auto_enqueue: true }, last_rollover_at: '2026-10-01T00:01:00Z', last_rollover: { cutoff: '2026-09-01', jobs: 6200, raw: 0, stops: 110000 },
      months: [{ month: '2026-10', role: 'collecting' as const, total: 6583, done: 6583, queued: 0, running: 0, failed: 0, points: 1, stops: 1, devices: 227, first_started_at: null, last_finished_at: null, done_last_hour: 0 },
               { month: '2026-09', role: 'displayed' as const, total: 6810, done: 6810, queued: 0, running: 0, failed: 0, points: 1, stops: 1, devices: 227, first_started_at: null, last_finished_at: null, done_last_hour: 0 }],
      errors: [], paused: false, locked: false, stops_by_class: {} }
    h.link = { ...base, warehouse_host: 'x', last_ping_ok: true, schema_version: 4, ping: { ...ping, settings: { ...ping.settings, raw_retention_days: 0, archive_enabled: false }, progress }, cron: { scheduled: true, last_run_at: null, last_status: null } }
    ui()
    const w = (await screen.findByTestId('gps-warehouse-window')).textContent!
    expect(w).toContain('المعروض 2026-09'); expect(w).toContain('قيد التجميع 2026-10'); expect(w).toContain('يُسحب تلقائياً'); expect(w).toContain('110,000 توقف')
    expect(screen.getByTestId('gps-warehouse-role-2026-09').textContent).toBe('المعروض')
    expect(screen.getByTestId('gps-warehouse-role-2026-10').textContent).toBe('قيد التجميع')
    expect(screen.getByTestId('gps-warehouse-card').textContent).toContain('الخام يُحذف فور حساب توقفات اليوم')
    expect(screen.getByTestId('gps-warehouse-card').textContent).toContain('بلا أرشيف مضغوط')
  })

  it('00383: البقع — العدد لكل شهر والحدود الخمسة وآخر نسخ والمجدول الليلي، وزر «نسخ البقع الآن» يرسل sync_hotspots', async () => {
    h.link = { ...base, warehouse_host: 'x', last_ping_at: '2026-10-29T10:00:00Z', last_ping_ok: true, schema_version: 5, last_registry_sync_at: '2026-10-29T09:00:00Z', last_hotspots_sync_at: '2026-10-29T20:30:00Z', hotspots_rows: 1234, hotspots_by_month: { '2026-10': 400, '2026-09': 834 },
      hotspots_cron: { scheduled: true, last_run_at: '2026-10-29T20:30:00Z', last_status: 'succeeded' },
      ping: { ...ping, hotspots: 1240, hotspots_by_month: { '2026-09': 834, '2026-10': 406 }, settings: { ...ping.settings, hotspot_radius_m: 80, class_light_max_min: 20, class_medium_max_min: 60, recur_mid_days: 3, recur_high_days: 10 } } }
    h.run.mockResolvedValue({ ok: true, action: 'sync_hotspots', rows: 1240, by_month: {}, pending: 0 })
    ui()
    const t = (await screen.findByTestId('gps-warehouse-hotspots')).textContent!
    expect(t).toContain('1,240 بقعة في المستودع'); expect(t).toContain('2026-10: 406 · 2026-09: 834')
    expect(t).toContain('نصف قطر البقعة 80 م'); expect(t).toContain('خفيف ≤ 20 د'); expect(t).toContain('متوسط ≤ 60 د'); expect(t).toContain('متكرر من 3 أيام'); expect(t).toContain('شبه يومي من 10 أيام')
    expect(t).toContain('(1,234 بقعة)'); expect(t).toContain('النسخ الليلي مجدول 23:30 بغداد')
    fireEvent.click(screen.getByTestId('gps-warehouse-hotspots-btn'))
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('sync_hotspots', { month: undefined, limit: undefined }))
  })
  it('00383: بلا حدود بقع في الفحص (مخطط قديم) لا تظهر فقرة البقع', async () => {
    h.link = { ...base, warehouse_host: 'x', last_ping_ok: true, schema_version: 4, ping }
    ui()
    await screen.findByTestId('gps-warehouse-ping')
    expect(screen.queryByTestId('gps-warehouse-hotspots')).toBeNull()
  })

  it('00386-ب: الأخطاء حسب السبب مع الشرح، الأجهزة الأكثر فشلاً، السرعة/التقدير العام، المساحتان، إعادة محاولة الفاشلة بعد تأكيد، ونسخ تقرير التشخيص', async () => {
    const progress = { window: { today: '2026-10-30', collecting_month: '2026-10-01', displayed_month: '2026-09-01', cutoff: '2026-09-01', keep_months: 1, auto_enqueue: true },
      months: [{ month: '2026-10', role: 'collecting' as const, total: 6583, done: 6000, queued: 500, running: 3, failed: 80, points: 20_000_000, stops: 90_000, devices: 227, first_started_at: null, last_finished_at: null, done_last_hour: 120 }],
      errors: [{ device_external_id: 'd-9', day: '2026-10-03', error_code: 'LVN_TIMEOUT', attempts: 6, at: '2026-10-29T08:00:00Z' }], paused: false, locked: false, stops_by_class: {},
      error_summary: [{ error_code: 'LVN_TIMEOUT', failed: 70, retrying: 12, devices: 15, last_at: '2026-10-30T08:00:00Z' }, { error_code: 'LVN_HTTP_500', failed: 10, retrying: 0, devices: 2, last_at: '2026-10-30T07:00:00Z' }],
      failed_devices: [{ device_external_id: 'd-9', failed_days: 20, last_error_code: 'LVN_TIMEOUT', last_at: '2026-10-30T08:00:00Z' }, { device_external_id: 'd-4', failed_days: 6, last_error_code: 'LVN_HTTP_500', last_at: null }],
      failed_total: 80, stale_running: 2, throughput: { done_last_hour: 120, points_last_hour: 400_000, remaining: 503, eta_minutes: 252 } }
    h.space = { db_bytes: 262144000, db_limit_bytes: 524288000, db_pct: 50, storage_bytes: 0, storage_limit_bytes: 1, storage_pct: 0, alerts: [{ level: 'warning', kind: 'warehouse_db', message: 'المستودع تجاوز 80%' }], warehouse: { configured: true, db_bytes: 440401920, db_limit_bytes: 524288000, db_pct: 84, storage_bytes: 0, storage_limit_bytes: 1, storage_pct: 0 } }
    h.link = { ...base, warehouse_host: 'x', last_ping_at: '2026-10-30T09:00:00Z', last_ping_ok: true, schema_version: 6, last_registry_sync_at: '2026-10-29T08:00:00Z', registry_active: 227, ping: { ...ping, progress }, cron: { scheduled: true, last_run_at: null, last_status: null } }
    ui()
    const sum = (await screen.findByTestId('gps-warehouse-error-summary')).textContent!
    expect(sum).toContain('فشل نهائي'); expect(sum).toContain('70'); expect(sum).toContain('بانتظار محاولة أخرى 12'); expect(sum).toContain('15 جهاز'); expect(sum).toContain('LVN_HTTP_500')
    expect(screen.getByTestId('gps-warehouse-error-code-LVN_TIMEOUT').textContent).not.toMatch(/^LVN_TIMEOUT/)   // عنوان عربي أولاً
    expect(screen.getByTestId('gps-warehouse-failed-devices').textContent).toContain('d-9 (20 يوم · LVN_TIMEOUT)')
    const th = screen.getByTestId('gps-warehouse-throughput').textContent!
    expect(th).toContain('120 يوم-جهاز/ساعة'); expect(th).toContain('400,000 نقطة'); expect(th).toContain('المتبقي 503'); expect(th).toContain('خلال 5 ساعة تقريباً'); expect(th).toContain('2 مهمة عالقة')
    const sp = screen.getByTestId('gps-warehouse-spaces').textContent!
    expect(sp).toContain('المشروع الأول 250.0 م.ب من 500.0 م.ب (50%)'); expect(sp).toContain('المستودع 420.0 م.ب من 500.0 م.ب (84%)'); expect(sp).toContain('تجاوز 80%')
    // إعادة المحاولة: إلغاء ⇒ لا نداء؛ تأكيد ⇒ retry_failed
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(screen.getByTestId('gps-warehouse-retry-btn'))
    expect(h.run).not.toHaveBeenCalled()
    confirm.mockReturnValueOnce(true)
    h.run.mockResolvedValue({ ok: true, action: 'retry_failed', result: { requeued: 80, month: null } })
    fireEvent.click(screen.getByTestId('gps-warehouse-retry-btn'))
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('retry_failed', { month: undefined, limit: undefined }))
    await waitFor(() => expect(h.toasts.at(-1)?.message).toContain('أُعيدت 80 مهمة'))
    // تقرير التشخيص إلى الحافظة: بلا أسرار، يضم الأخطاء والمساحتين
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    fireEvent.click(screen.getByTestId('gps-warehouse-diag-btn'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = writeText.mock.calls[0]![0] as string
    expect(text).toContain('# GPS warehouse diagnostics'); expect(text).toContain('error LVN_TIMEOUT: failed=70 retrying=12 devices=15'); expect(text).toContain('month 2026-10 [collecting]: 6000/6583'); expect(text).toContain('space p2: db 420.0 MB/500.0 MB (84%)'); expect(text).toContain('throughput: 120 jobs/h')
    expect(text).not.toMatch(/sb_secret|eyJ/)
    await waitFor(() => expect(h.toasts.at(-1)?.message).toContain('نُسخ تقرير التشخيص'))
    confirm.mockRestore()
  })
})
