/** 00285 — SDK البث المباشر: أسماء الدوال والمعاملات، وقيم فارغة ⇒ مصفوفات فارغة */
import { describe, it, expect, vi, beforeEach } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { rpc: m.rpc },
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) { const { data, error } = await op; if (error) throw new SDKError(error.message, 'X', error); return data },
  }
})
import { liveTracking } from '@sdk/live-tracking.sdk'

describe('live-tracking.sdk', () => {
  beforeEach(() => m.rpc.mockReset())
  it('ping/status/stop تستدعي دوال المشارِك بالمعاملات الصحيحة', async () => {
    m.rpc.mockResolvedValue({ data: { session_id: 's1', in_zone: true, interval_minutes: 15 }, error: null })
    const r = await liveTracking.ping({ latitude: 33.3, longitude: 44.4, accuracy: 7 })
    expect(m.rpc).toHaveBeenCalledWith('live_share_ping', { p_lat: 33.3, p_lng: 44.4, p_accuracy: 7 })
    expect(r.session_id).toBe('s1')
    await liveTracking.ping({ latitude: 1, longitude: 2 })
    expect(m.rpc).toHaveBeenLastCalledWith('live_share_ping', { p_lat: 1, p_lng: 2, p_accuracy: null })
    m.rpc.mockResolvedValue({ data: { kind: 'manager', allowed: false, reason: 'LIVE_OUTSIDE_SHIFT' }, error: null })
    expect((await liveTracking.status()).reason).toBe('LIVE_OUTSIDE_SHIFT')
    m.rpc.mockResolvedValue({ data: true, error: null })
    expect(await liveTracking.stop()).toBe(true)
  })
  it('غرفة العمليات: الفلاتر تمرَّر كما هي؛ null ⇒ []', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect(await liveTracking.mapCurrent('contractor')).toEqual([])
    expect(m.rpc).toHaveBeenCalledWith('live_map_current', { p_kind: 'contractor' })
    expect(await liveTracking.sessions({ from: '2026-10-01', to: '2026-10-18', kind: 'manager', userId: 'u1' })).toEqual([])
    expect(m.rpc).toHaveBeenLastCalledWith('live_sessions_list', { p_from: '2026-10-01', p_to: '2026-10-18', p_kind: 'manager', p_user: 'u1' })
    await liveTracking.sessions({ from: 'a', to: 'b' })
    expect(m.rpc).toHaveBeenLastCalledWith('live_sessions_list', { p_from: 'a', p_to: 'b', p_kind: null, p_user: null })
    expect(await liveTracking.points('s1')).toEqual([])
  })
  it('الإعدادات: get/set', async () => {
    m.rpc.mockResolvedValue({ data: { ping_interval_minutes: 10, retention_days: 30 }, error: null })
    expect((await liveTracking.setSettings({ intervalMinutes: 10, retentionDays: 30 })).ping_interval_minutes).toBe(10)
    expect(m.rpc).toHaveBeenCalledWith('live_track_settings_set', { p_interval_minutes: 10, p_retention_days: 30 })
    await liveTracking.settings(); expect(m.rpc).toHaveBeenLastCalledWith('live_track_settings_get')
  })
})
