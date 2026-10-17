/** 00278 — لوحة الحالة الحية (التطوير المركزية → دليل التشغيل التقني) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { DevOpsDevice, DevOpsStatus } from '@sdk/devops.sdk'

const now = new Date('2026-10-17T10:00:00+03:00').getTime()
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()
const dev = (x: Partial<DevOpsDevice>): DevOpsDevice => ({ id: 'd', name: 'جهاز', serial: 'SN', mode: 'adms_push', is_active: true, last_seen_at: iso(5), bridge_last_error: null, last_punch_at: iso(7), punches_today: 12, last_pull: null, queued_commands: 0, ...x })
const h = vi.hoisted(() => ({ status: null as unknown, error: null as Error | null, edge: [] as unknown[], refetch: vi.fn() }))
vi.mock('@features/devops-status/hooks', () => ({
  useDevOpsStatus: () => ({ data: h.status, isError: Boolean(h.error), error: h.error, dataUpdatedAt: now, isFetching: false, refetch: h.refetch }),
  useEdgeHealth: () => ({ data: h.edge, isLoading: false, refetch: h.refetch }),
}))
import DevOpsStatusPage, { ago, deviceTone } from '@portals/it/pages/DevOps/DevOpsStatusPage'

const base: DevOpsStatus = {
  generated_at: iso(0),
  database: { now: iso(0), version: 'PostgreSQL 15.8', migrations_tracked: true, migrations_count: 244, last_migration: '00244', last_migration_at: iso(60), functions_count: 900, tables_count: 210, rls_disabled_tables: [] },
  biometric: { devices: [dev({ id: 'a', serial: 'A1', name: 'المركز' }), dev({ id: 'b', serial: 'B2', name: 'الزعفرانية', mode: 'lan_pull', last_seen_at: iso(3000), bridge_last_error: 'ECONNREFUSED', last_pull: { status: 'failed', started_at: iso(10), inserted: 0, received: 0, error: 'BIO_SOURCE_UNREACHABLE' } }), dev({ id: 'c', serial: 'C3', name: 'قديم', is_active: false })], punches_today: 40, unmatched_today: 2, last_punch_at: iso(7), failed_pulls_24h: 1 },
  gps: { last_fix_at: iso(1), vehicles_10m: 9 },
  auth: { users_total: 120, signins_24h: 30 },
}
beforeEach(() => { h.status = { status: base, latency_ms: 180 }; h.error = null; h.edge = [{ name: 'adms-receiver', what: 'x', state: 'up', http: 401, latency_ms: 90 }, { name: 'biometric-pull', what: 'y', state: 'down', http: 404, latency_ms: null }]; h.refetch.mockReset(); vi.spyOn(Date, 'now').mockReturnValue(now) })

describe('DevOpsStatusPage (00278)', () => {
  it('يعرض وصول القاعدة وآخر ترحيل، مؤشرات البصمة، صفاً لكل مصدر بلونه، وملخص الدوال الطرفية وGPS', () => {
    render(<DevOpsStatusPage />)
    expect(screen.getByTestId('db-reach')).toHaveTextContent('180 ms')
    expect(screen.getByTestId('db-migration')).toHaveTextContent('00244')
    expect(screen.getByTestId('db-migration')).toHaveTextContent('244 ترحيلاً')
    expect(screen.getByTestId('db-rls')).toHaveTextContent('كل الجداول محمية')
    expect(screen.getByTestId('bio-today')).toHaveTextContent('40')
    expect(screen.getByTestId('bio-unmatched')).toHaveTextContent('2')
    expect(screen.getByTestId('bio-failed')).toHaveTextContent('1')
    expect(screen.getByTestId('device-A1')).toHaveAttribute('data-tone', 'ok')
    expect(screen.getByTestId('device-B2')).toHaveAttribute('data-tone', 'bad')
    expect(screen.getByTestId('device-B2')).toHaveTextContent('BIO_SOURCE_UNREACHABLE')
    expect(screen.getByTestId('device-B2')).toHaveTextContent('شبكة داخلية')
    expect(screen.getByTestId('device-C3')).toHaveAttribute('data-tone', 'muted')
    expect(screen.getByTestId('device-C3')).toHaveTextContent('موقوف')
    expect(screen.getByTestId('edge-summary')).toHaveTextContent('1 غير منشورة')
    expect(screen.getByTestId('edge-biometric-pull')).toHaveTextContent('لا ردّ')
    expect(screen.getByTestId('edge-adms-receiver')).toHaveTextContent('90 ms')
    expect(screen.getByTestId('gps-live')).toHaveTextContent('9')
    fireEvent.click(screen.getByTestId('status-refresh'))
    expect(h.refetch).toHaveBeenCalledTimes(2)
  })
  it('فشل الوصول ⇒ رسالة واضحة وبطاقة حمراء؛ جداول بلا RLS تُسمّى', () => {
    h.error = new Error('Failed to fetch'); h.status = undefined
    const { unmount } = render(<DevOpsStatusPage />)
    expect(screen.getByTestId('status-error')).toHaveTextContent('Failed to fetch')
    expect(screen.getByTestId('db-reach')).toHaveTextContent('لا يستجيب')
    unmount()
    h.error = null; h.status = { status: { ...base, database: { ...base.database, rls_disabled_tables: ['tmp_table'] } }, latency_ms: 50 }
    render(<DevOpsStatusPage />)
    expect(screen.getByTestId('db-rls')).toHaveTextContent('tmp_table')
  })
  it('ago/deviceTone: عتبات ساعة/يوم، الخطأ أحمر، الموقوف رمادي', () => {
    expect(ago(null, now)).toBe('لم يحدث بعد')
    expect(ago(iso(0), now)).toBe('الآن')
    expect(ago(iso(5), now)).toBe('قبل 5 دقيقة')
    expect(ago(iso(180), now)).toBe('قبل 3 ساعة')
    expect(ago(iso(60 * 72), now)).toBe('قبل 3 يوماً')
    expect(deviceTone(dev({ last_seen_at: iso(30) }), now)).toBe('ok')
    expect(deviceTone(dev({ last_seen_at: iso(600) }), now)).toBe('warn')
    expect(deviceTone(dev({ last_seen_at: iso(3000) }), now)).toBe('bad')
    expect(deviceTone(dev({ last_seen_at: null }), now)).toBe('bad')
    expect(deviceTone(dev({ last_pull: { status: 'failed', started_at: iso(1), inserted: 0, received: 0, error: 'x' } }), now)).toBe('bad')
    expect(deviceTone(dev({ is_active: false }), now)).toBe('muted')
  })
})

describe('devops.sdk edgeHealth (00278)', () => {
  it('أي ردّ HTTP = up؛ 404 أو استثناء شبكة = down؛ يفحص كل الدوال المعرّفة', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
    const { devops, EDGE_FUNCTIONS } = await import('@sdk/devops.sdk')
    const f = vi.fn(async (url: string) => {
      if (url.endsWith('/biometric-pull')) return new Response(null, { status: 404 })
      if (url.endsWith('/lvn-gps-sync')) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 401 })
    }) as unknown as typeof fetch
    const r = await devops.edgeHealth(f)
    expect(r).toHaveLength(EDGE_FUNCTIONS.length)
    expect(r.find((x) => x.name === 'adms-receiver')).toMatchObject({ state: 'up', http: 401 })
    expect(r.find((x) => x.name === 'biometric-pull')).toMatchObject({ state: 'down', http: 404 })
    expect(r.find((x) => x.name === 'lvn-gps-sync')).toMatchObject({ state: 'down', http: null })
    const first = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(first[0]).toBe('https://x.supabase.co/functions/v1/adms-receiver')
    expect(first[1]).toMatchObject({ method: 'OPTIONS' })
  })
})
