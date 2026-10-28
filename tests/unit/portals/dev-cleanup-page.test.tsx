import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({ gps: vi.fn(), photos: vi.fn(), preview: null as Record<string, unknown> | null }))
vi.mock('@features/dev-cleanup/hooks', () => ({
  useDevCleanupPreview: () => ({ data: h.preview, isLoading: false, isError: false, refetch: vi.fn() }),
  useDevCleanupGps: () => ({ mutate: h.gps, isPending: false }),
  useDevCleanupPhotos: () => ({ mutate: h.photos, isPending: false, progress: null }),
}))
import DevCleanupPage from '@portals/it/pages/DevCleanup/DevCleanupPage'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes } from '@portals/it/routes'

const preview = {
  buckets: [{ bucket: 'media-photos', objects: 120, bytes: 50 * 1024 * 1024 }, { bucket: 'sector-photos', objects: 3, bytes: 1024 }],
  photo_rows: { media_submission_photos: 120, sector_photos: 3 },
  gps: { gps_stop_events: 4500, gps_stop_scan_state: 227, gps_sync_runs: 900, gps_sync_running: 1 },
  photos_run: null,
  history: [{ id: 'r1', kind: 'gps_stops', status: 'done', started_by_name: 'مدير التطوير', started_at: '2026-10-28T08:00:00Z', finished_at: '2026-10-28T08:00:01Z', removed_objects: 0, deleted_rows: { gps_stop_events: 10 } }],
}

describe('🧹 تنظيف البيانات التجريبية — بوابة التطوير المركزية (00368)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.preview = preview })
  it('مسجّلة كمسار IT وكعنصر تحت وحدة الأرشيف (لا تغيّر عدد الوحدات 11)', () => {
    expect(customRoutes.some((r) => r.path === 'dev-cleanup')).toBe(true)
    const units = PORTAL_UNITS[PORTALS.IT]
    expect(units).toHaveLength(11)
    expect(units.find((u) => u.path === '/it/archive')?.children?.map((c) => c.path)).toContain('/it/dev-cleanup')
    expect(JSON.parse(readFileSync('src/i18n/ar/sidebar.json', 'utf8')).nav.dev_cleanup).toBe('تنظيف البيانات التجريبية')
  })
  it('تعرض الحصر، وتطلب تأكيداً واحداً (نعم/لا) قبل كل حذف مباشر', () => {
    render(<DevCleanupPage />)
    expect(screen.getByTestId('dev-cleanup-photos').textContent).toContain('صور الإعلام')
    expect(screen.getByTestId('dev-cleanup-photos').textContent).toContain('123 ملف')
    expect(screen.getByTestId('dev-cleanup-gps').textContent).toContain('مزامنة عالقة: 1')
    expect(screen.getByTestId('dev-cleanup-gps').textContent).toContain('4,500')
    fireEvent.click(screen.getByTestId('dev-cleanup-gps-btn'))
    expect(screen.getByTestId('dev-cleanup-confirm').textContent).toContain('حذف كل نقاط توقف GPS')
    fireEvent.click(screen.getByText('لا'))
    expect(screen.queryByTestId('dev-cleanup-confirm')).toBeNull()
    expect(h.gps).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('dev-cleanup-gps-btn'))
    fireEvent.click(screen.getByTestId('dev-cleanup-confirm-yes'))
    expect(h.gps).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('dev-cleanup-photos-btn'))
    expect(screen.getByTestId('dev-cleanup-confirm').textContent).toContain('123 ملف')
    fireEvent.click(screen.getByTestId('dev-cleanup-confirm-yes'))
    expect(h.photos).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('dev-cleanup-history').textContent).toContain('أحداث التوقف 10')
  })
  it('العقد: IT فقط، سياسة تخزين مؤقتة أثناء التشغيل، الأغلفة ووثائق الموظفين خارج النطاق، والمجدول يحرّر المزامنة العالقة', () => {
    const mig = readFileSync('supabase/migrations/00312_dev_data_cleanup.sql', 'utf8')
    expect(mig).toContain("perform app.require_it()")
    expect(mig).toContain("app.dev_cleanup_photos_active()")
    expect(mig).not.toContain("'employee-documents'")
    expect(mig).toContain('media_covers c where c.storage_path = p_name')
    expect(mig).toContain("raise exception 'DEV_CLEANUP_OBJECTS_REMAIN:%'")
    expect(mig).toContain('delete from public.gps_sync_runs')
    // 00369: safeupdate على Supabase يرفض DELETE/UPDATE بلا WHERE داخل دوال المستخدمين — كل حذف شامل بشرط صريح
    const fix = readFileSync('supabase/migrations/00313_dev_cleanup_safeupdate.sql', 'utf8')
    expect(fix).toContain('create or replace function public.dev_cleanup_photos_finish(')
    expect(fix).toContain('create or replace function public.dev_cleanup_gps_stops(')
    expect(fix).not.toMatch(/delete from public\.[a-z_]+;/)
    expect(fix).not.toMatch(/update public\.[a-z_]+ set [^;]*;(?<! where [^;]*;)/)
    expect(fix.match(/delete from public\.[a-z_]+ where [a-z_]+ is not null;/g)?.length).toBe(10)
    const sdk = readFileSync('src/services/dev-cleanup.sdk.ts', 'utf8')
    expect(sdk).toContain('supabase.storage.from(bucket).remove(slice)')
    expect(sdk).toContain("throw new Error('DEV_CLEANUP_NO_PROGRESS')")
    const edge = readFileSync('supabase/functions/lvn-gps-sync/index.ts', 'utf8')
    expect(edge).toContain("error_code: 'LVN_SYNC_STALE_RUN'")
    expect(edge).toContain('STALE_RUN_MS = 3 * 60_000')
  })
})
