import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({ setPlan: vi.fn(), reclaim: vi.fn(), data: null as Record<string, unknown> | null }))
vi.mock('@features/space/hooks', () => ({
  useSpaceOverview: () => ({ data: h.data, isLoading: false }),
  useSetSpacePlan: () => ({ mutate: h.setPlan, isPending: false }),
  useSpaceReclaimNow: () => ({ mutate: h.reclaim, isPending: false }),
}))
import SpacePanel from '@components/it/SpacePanel'

const MB = 1024 * 1024
const overview = {
  plan: 'free', db_limit_bytes: 500 * MB, storage_limit_bytes: 1024 * MB, bloat_threshold_pct: 20, settings_updated_at: '2026-10-28T08:00:00Z',
  db_bytes: 364 * MB, db_free_bytes: 136 * MB, db_pct: 72.8, db_reclaimable_bytes: 120 * MB,
  storage_bytes: 950 * MB, storage_free_bytes: 74 * MB, storage_pct: 92.8,
  buckets: [{ bucket: 'media-photos', objects: 1200, bytes: 900 * MB }],
  tables: [{ table: 'gps_device_position_history', bytes: 200 * MB, rows: 1_000_000, dead_rows: 300_000, reclaimable_pct: 35, reclaimable_bytes: 70 * MB }],
  alerts: [{ level: 'danger', kind: 'storage', message: 'التخزين تجاوز 90% من حدّ الخطة' }],
  reclaim: { cron_available: true, queued: 0, scheduled: 0, nightly_at: '03:00 بغداد', log: [
    { id: 1, table: 'gps_stop_events', reason: 'bloat', status: 'done', requested_at: '2026-10-28T00:00:00Z', scheduled_for: '2026-10-28T00:05:00Z', before_bytes: 50 * MB, after_bytes: 5 * MB, finished_at: '2026-10-28T02:00:00Z', note: null },
    { id: 2, table: 'audit_logs', reason: 'bloat', status: 'skipped', requested_at: '2026-10-28T00:00:00Z', scheduled_for: null, before_bytes: null, after_bytes: null, finished_at: '2026-10-28T00:00:01Z', note: 'INSUFFICIENT_HEADROOM' },
  ] },
  generated_at: '2026-10-28T08:00:00Z',
}

describe('📦 لوحة المساحة — رئيسية التطوير المركزية (00370)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.data = overview })
  it('تعرض القاعدة والتخزين بالمستخدم/الحد/المتبقي، القابل للاسترداد، التنبيه، الحاويات والجداول والسجل', () => {
    render(<SpacePanel />)
    const db = screen.getByTestId('space-db').textContent!
    expect(db).toContain('364 م.ب'); expect(db).toContain('500 م.ب'); expect(db).toContain('136 م.ب'); expect(db).toContain('قابل للاسترداد بالضغط: 120 م.ب')
    const st = screen.getByTestId('space-storage').textContent!
    expect(st).toContain('950 م.ب'); expect(st).toContain('1 ج.ب'); expect(st).toContain('92.8%')
    expect(screen.getByTestId('space-alert').textContent).toContain('90%')
    expect(screen.getByTestId('space-buckets').textContent).toContain('صور الإعلام')
    expect(screen.getByTestId('space-tables').textContent).toContain('gps_device_position_history')
    const log = screen.getByTestId('space-reclaim-log').textContent!
    expect(log).toContain('50 م.ب ← 5 م.ب (وفّر 45 م.ب)')
    expect(log).toContain('لا مساحة مؤقتة كافية')
  })
  it('خطة Pro بزر واحد، حدود مخصصة بالجيجابايت، و«ضغط الآن» بتأكيد', () => {
    render(<SpacePanel />)
    fireEvent.click(screen.getByText('تعديل'))
    fireEvent.click(screen.getByTestId('space-plan-pro'))
    expect(h.setPlan).toHaveBeenCalledWith({ plan: 'pro' }, expect.anything())
    fireEvent.change(screen.getByTestId('space-custom-db'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('space-custom-storage'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('space-custom-save'))
    expect(h.setPlan).toHaveBeenLastCalledWith({ plan: 'custom', dbLimit: 2 * 1024 * MB, storageLimit: 10 * 1024 * MB }, expect.anything())
    fireEvent.click(screen.getByTestId('space-reclaim-now'))
    expect(h.reclaim).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('space-reclaim-yes'))
    expect(h.reclaim).toHaveBeenCalledTimes(1)
  })
  it('العقد: الضغط عبر pg_cron فقط (لا VACUUM داخل الدوال)، شرط المساحة المؤقتة، الجدولة الليلية 00:00 UTC، ورئيسية IT تضم اللوحة', () => {
    const mig = readFileSync('supabase/migrations/00314_space_dashboard_reclaim.sql', 'utf8')
    expect(mig).toContain("format('VACUUM (FULL, ANALYZE) public.%I', r.table_name)")
    expect(mig).not.toMatch(/^\s*vacuum /im)
    expect(mig).toContain('if v_db + m.total_bytes > s.db_limit_bytes * 0.95 then')
    expect(mig).toContain("cron.schedule('space_reclaim_plan_nightly', '0 0 * * *'")
    expect(mig).toContain("when 'pro' then 8::bigint * 1024 * 1024 * 1024")
    expect(readFileSync('src/portals/it/pages/Dashboard/ITDashboard.tsx', 'utf8')).toContain('<SpacePanel />')
  })
})
