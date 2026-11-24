/**
 * الجولة ① — الشفتات الديناميكية في التقرير المعتمد (تركيب فعلي للصفحة).
 *
 * يثبت السلوك لا الشكل فقط:
 *   ① فلتر الشفت يعرض **كل** شفتات `hr_shifts` — بما فيها المرنان.
 *   ② عند تصفية شفت مرن يُمرَّر رمزه إلى الخادم كما هو (لا يُسقَط).
 *   ③ عمود الشفت في الجدول يعرض **اسم** الشفت من HR لا رمزه الخام.
 *
 * خلفية العطل: الحالة على الإنتاج تحمل `shift_08f99593` («مرن صباحي» 05:00→16:00)
 * لمركبة `DB-118`، وكانت الصفحة تعرف ثلاثة رموز ثابتة فقط.
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShiftOption } from '@sdk/hr-shifts.sdk'
import { registerShiftOptions, resetShiftRegistry } from '@sdk/hr-shifts.sdk'

const h = vi.hoisted(() => ({
  grouped: vi.fn(),
  zones: vi.fn(),
  vehicles: vi.fn(),
  drivers: vi.fn(),
  archive: vi.fn(),
}))

vi.mock('@features/map-planning/hooks/useMapPlanning', () => ({
  useMapZones: () => ({ data: h.zones() }),
  // التوقيع الحقيقي: (zoneId, from, to, filters) — الفلاتر هي الوسيط الرابع
  useVehicleVisitsGrouped: (
    _zoneId: string,
    _from: string,
    _to: string,
    f: { shift?: string | null } = {},
  ) => ({
    data: h.grouped(f),
    isLoading: false,
  }),
  useVehiclesDay: () => ({ data: h.vehicles() }),
  useGroupedDrivers: () => ({ data: h.drivers() }),
}))
vi.mock('@features/map-planning/report-archive', () => ({
  archiveReport: (...a: unknown[]) => h.archive(...a),
  bytesText: () => '1 ك.ب',
}))

import OpsMapGroupedReportPage from '@portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage'

/** شفتات الإنتاج الخمسة — منقولة حرفياً من `public.hr_shifts` (2026-11-24) */
const LIVE_SHIFTS: ShiftOption[] = [
  {
    code: 'morning',
    name: 'صباحي',
    start_time: '08:00:00',
    end_time: '16:00:00',
    grace_minutes: 10,
    is_active: true,
    sort_order: 1,
  },
  {
    code: 'evening',
    name: 'مسائي',
    start_time: '16:00:00',
    end_time: '22:00:00',
    grace_minutes: 10,
    is_active: true,
    sort_order: 2,
  },
  {
    code: 'night',
    name: 'ليلي',
    start_time: '22:00:00',
    end_time: '05:00:00',
    grace_minutes: 10,
    is_active: true,
    sort_order: 3,
  },
  {
    code: 'shift_08f99593',
    name: 'مرن صباحي',
    start_time: '05:00:00',
    end_time: '16:00:00',
    grace_minutes: 10,
    is_active: true,
    sort_order: 100,
  },
  {
    code: 'shift_7d5e62a0',
    name: 'مرن مسائي',
    start_time: '17:00:00',
    end_time: '04:00:00',
    grace_minutes: 10,
    is_active: true,
    sort_order: 100,
  },
]

const groupedRow = (shift: string | null) => ({
  vehicle_id: 'v1',
  db_number: 'DB-118',
  vehicle_name: 'كابسة',
  driver_name: 'علي',
  shift,
  shift_source: 'vehicle',
  zone_id: 'z1',
  zone_name: 'أرخيته',
  mahalla_code: 'M1',
  mahalla_number: '1',
  mahalla_name: 'محلة',
  mahalla_source: 'place',
  alleys_count: 2,
  streets_count: 1,
  visits_count: 3,
  total_dwell_seconds: 600,
  confirmed_count: 3,
  uncertain_count: 0,
  notes: null,
  placeday: '2026-11-23',
  first_entered_at: '2026-11-23T06:00:00Z',
  last_exited_at: '2026-11-23T07:00:00Z',
})

const wrap = (ui: ReactNode) =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {ui}
      </QueryClientProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  resetShiftRegistry()
  registerShiftOptions(LIVE_SHIFTS)
  h.zones.mockReturnValue([{ id: 'z1', name: 'أرخيته' }])
  h.vehicles.mockReturnValue([{ vehicle_id: 'v1', db_number: 'DB-118', driver_name: 'علي' }])
  h.drivers.mockReturnValue([])
  h.grouped.mockReset()
  // الخادم يفلتر بالشفت — نُحاكي ذلك كي نُثبت أن الرمز المرن يصل إليه
  h.grouped.mockImplementation((f: { shift?: string | null }) =>
    [groupedRow('shift_08f99593')].filter((r) => !f?.shift || r.shift === f.shift),
  )
})

describe('① فلتر الشفت يعرض شفتات المنصة كلها', () => {
  it('يعرض الخمسة بما فيها «مرن صباحي» و«مرن مسائي»', async () => {
    wrap(<OpsMapGroupedReportPage />)
    const select = (await screen.findByTestId('grouped-shift-filter')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(6)) // «كل الشفتات» + 5
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toContain('كل الشفتات')
    expect(labels).toContain('صباحي')
    expect(labels).toContain('مسائي')
    expect(labels).toContain('ليلي')
    // ★ الجديد: الشفتان المرنان كانا غائبين تماماً
    expect(labels).toContain('مرن صباحي')
    expect(labels).toContain('مرن مسائي')
  })

  it('قيمة كل خيار هي رمز الشفت الحقيقي (لا الاسم)', async () => {
    wrap(<OpsMapGroupedReportPage />)
    const select = (await screen.findByTestId('grouped-shift-filter')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(6))
    const codes = [...select.options].map((o) => o.value)
    expect(codes).toContain('shift_08f99593')
    expect(codes).toContain('shift_7d5e62a0')
  })
})

describe('② اختيار شفت مرن يُمرَّر للخادم ولا يُسقَط', () => {
  it('الفلتر يمرّر الرمز shift_08f99593 إلى الاستعلام', async () => {
    wrap(<OpsMapGroupedReportPage />)
    const select = (await screen.findByTestId('grouped-shift-filter')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(6))
    fireEvent.change(select, { target: { value: 'shift_08f99593' } })
    await waitFor(() =>
      expect(h.grouped).toHaveBeenCalledWith(expect.objectContaining({ shift: 'shift_08f99593' })),
    )
  })
})

describe('③ عمود الشفت يعرض الاسم لا الرمز', () => {
  it('«مرن صباحي» يظهر في الجدول وshift_08f99593 لا يظهر كنص خام', async () => {
    wrap(<OpsMapGroupedReportPage />)
    await waitFor(() => expect(h.grouped).toHaveBeenCalled())
    // الرمز الخام يجب ألا يظهر في أي نص مرئي
    await waitFor(() => expect(screen.queryAllByText('shift_08f99593')).toHaveLength(0))
    // والاسم العربي يظهر
    const rows = await screen.findAllByText('مرن صباحي')
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('④ لا يعود إلى القائمة الثابتة', () => {
  it('«مرن صباحي» يُعرَض لأن السجل الحيّ حُمِّل — لا لأنه مكتوب في الكود', async () => {
    // نسجّل قائمة مختلفة تماماً: الرمز نفسه باسم آخر ⇒ الاسم المعروض يتبعه
    resetShiftRegistry()
    registerShiftOptions(
      LIVE_SHIFTS.map((s) => (s.code === 'shift_08f99593' ? { ...s, name: 'شفت مرن مخصص' } : s)),
    )
    wrap(<OpsMapGroupedReportPage />)
    const select = (await screen.findByTestId('grouped-shift-filter')) as HTMLSelectElement
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(6))
    expect([...select.options].map((o) => o.textContent)).toContain('شفت مرن مخصص')
  })
})
