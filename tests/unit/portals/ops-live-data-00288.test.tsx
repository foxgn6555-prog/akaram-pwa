/** 00288 · «بيانات وحدة البث المباشر» (غرفة العمليات) + إعدادات البث في التطوير المركزية */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import sidebar from '../../../src/i18n/ar/sidebar.json'
import type { LiveSessionRow } from '@sdk/live-tracking.sdk'

const sessions = vi.fn(); const points = vi.fn(); const settings = vi.fn(); const setSettings = vi.fn(); const download = vi.fn()
vi.mock('@sdk/live-tracking.sdk', () => ({ liveTracking: { sessions: (x: unknown) => sessions(x), points: (id: string) => points(id), settings: () => settings(), setSettings: (x: unknown) => setSettings(x) } }))
vi.mock('@features/gbs/gbs-excel', () => ({ downloadWorkbook: (wb: unknown, name: string) => download(wb, name) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: () => void }) => unknown) => sel({ addToast: vi.fn() }) }))

import OpsLiveDataPage from '@portals/ops-room/pages/LiveTracking/OpsLiveDataPage'
import LiveTrackingSettingsPage from '@portals/it/pages/Integrations/LiveTrackingSettingsPage'

const row = (p: Partial<LiveSessionRow>): LiveSessionRow => ({
  session_id: 's1', user_id: 'u1', kind: 'manager', full_name: 'سعد', sectors: [1], area_names: 'الكرادة', manager_name: null, shift_name: 'صباحي',
  shift_start: '2026-10-18T05:00:00Z', shift_end: '2026-10-18T13:00:00Z', started_at: '2026-10-18T05:10:00Z', last_seen_at: '2026-10-18T07:40:00Z', ended_at: null, end_reason: null,
  first_lat: 33.31, first_lng: 44.36, first_in_zone: true, last_lat: 33.32, last_lng: 44.37, last_in_zone: true, point_count: 11, out_of_zone_count: 0, duration_minutes: 150, ...p,
})
const wrap = (ui: ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></MemoryRouter>)

describe('00288 · بيانات وحدة البث المباشر', () => {
  beforeEach(() => {
    sessions.mockReset(); points.mockReset(); download.mockReset()
    sessions.mockImplementation(({ kind }: { kind: string | null }) => Promise.resolve([row({}), row({ session_id: 's2', user_id: 'u2', kind: 'contractor', full_name: 'كريم', manager_name: 'سعد', first_in_zone: false, out_of_zone_count: 2, ended_at: '2026-10-18T13:00:00Z', end_reason: 'shift_end' })].filter((r) => !kind || r.kind === kind)))
    points.mockResolvedValue([{ recorded_at: '2026-10-18T05:10:00Z', latitude: 33.31, longitude: 44.36, accuracy_m: 8, in_zone: true }])
  })
  it('الوحدة الفرعية مسجلة في شريط غرفة العمليات وصفحة الخريطة exact', () => {
    const units = PORTAL_UNITS[PORTALS.OPS_ROOM]
    expect(units.find((u) => u.path === '/ops-room/live-tracking/data')).toMatchObject({ labelKey: 'nav.ops_live_tracking_data' })
    expect(units.find((u) => u.path === '/ops-room/live-tracking')?.exact).toBe(true)
    expect(sidebar.nav.ops_live_tracking_data).toBe('بيانات البث المباشر')
    expect(PORTAL_UNITS[PORTALS.IT].flatMap((u) => u.children ?? []).find((u) => u.path === '/it/integrations/live-tracking')).toMatchObject({ labelKey: 'nav.it_live_tracking' })
    expect(sidebar.nav.it_live_tracking).toBe('البث المباشر — الإعدادات')
  })
  it('الجدول: اسم الحساب، القسم، أول موقع ووقته، داخل/خارج الزون؛ فلاتر الأيام والنوع تُمرَّر للاستعلام', async () => {
    wrap(<OpsLiveDataPage />)
    const r2 = await screen.findByTestId('live-data-row-s2')
    expect(within(r2).getByText('كريم')).toBeInTheDocument()
    expect(r2.textContent).toContain('خارج الزون'); expect(r2.textContent).toContain('08:10'); expect(r2.textContent).toContain('33.31000, 44.36000'); expect(r2.textContent).toContain('انتهى الشفت')
    expect(screen.getByTestId('live-data-row-s1').textContent).toContain('داخل الزون')
    const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(sessions).toHaveBeenLastCalledWith({ from: iso, to: iso, kind: null })
    fireEvent.click(screen.getByTestId('live-days-week'))
    await waitFor(() => expect(sessions).toHaveBeenLastCalledWith(expect.objectContaining({ to: iso, kind: null })))
    expect(sessions.mock.calls.at(-1)![0].from < iso).toBe(true)
    fireEvent.click(screen.getByTestId('live-data-filter-contractor'))
    await waitFor(() => expect(sessions).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'contractor' })))
    await waitFor(() => expect(screen.queryByTestId('live-data-row-s1')).toBeNull())
    expect(screen.getByTestId('live-data-row-s2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('live-days-custom'))
    fireEvent.change(screen.getByTestId('live-data-from'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByTestId('live-data-to'), { target: { value: '2026-10-05' } })
    await waitFor(() => expect(sessions).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-05', kind: 'contractor' }))
  })
  it('تفاصيل الجلسة تُظهر نقاطها؛ تصدير Excel يحمل اسم الملف بالمدة ويُصدّر الصفوف المفلترة', async () => {
    wrap(<OpsLiveDataPage />)
    fireEvent.click(await screen.findByTestId('live-data-row-s1'))
    await waitFor(() => expect(screen.getAllByTestId('live-point-row')).toHaveLength(1))
    expect(points).toHaveBeenCalledWith('s1')
    fireEvent.change(screen.getByTestId('live-data-search'), { target: { value: 'كريم' } })
    fireEvent.click(screen.getByTestId('live-data-export'))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    const [wb, name] = download.mock.calls[0]! as [{ worksheets: { name: string; rowCount: number }[] }, string]
    expect(name).toMatch(/^بيانات-البث-المباشر-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(wb.worksheets[0]!.rowCount).toBe(4)
  })
  it('بلا جلسات: رسالة واضحة', async () => {
    sessions.mockResolvedValue([])
    wrap(<OpsLiveDataPage />)
    expect(await screen.findByTestId('live-data-empty')).toBeInTheDocument()
  })
})

describe('00288 · إعدادات البث المباشر — التطوير المركزية', () => {
  beforeEach(() => { settings.mockReset(); setSettings.mockReset(); settings.mockResolvedValue({ ping_interval_minutes: 15, retention_days: 30, updated_at: '2026-10-18T05:00:00Z' }); setSettings.mockResolvedValue({ ping_interval_minutes: 10, retention_days: 60, updated_at: '2026-10-18T06:00:00Z' }) })
  it('تعرض القيم الحالية، ترفض القيم خارج النطاق، وتحفظ', async () => {
    wrap(<LiveTrackingSettingsPage />)
    const interval = await screen.findByTestId('live-interval')
    await waitFor(() => expect(interval).toHaveValue(15))
    expect(screen.getByTestId('live-retention')).toHaveValue(30)
    fireEvent.change(interval, { target: { value: '0' } })
    expect(screen.getByTestId('live-settings-invalid')).toBeInTheDocument(); expect(screen.getByTestId('live-settings-save')).toBeDisabled()
    fireEvent.change(interval, { target: { value: '10' } }); fireEvent.change(screen.getByTestId('live-retention'), { target: { value: '60' } })
    fireEvent.click(screen.getByTestId('live-settings-save'))
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ intervalMinutes: 10, retentionDays: 60 }))
  })
})
