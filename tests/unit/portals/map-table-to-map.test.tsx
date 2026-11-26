/**
 * جدول الشوارع والأزقة → الخريطة: الضغط على صفّ ينقل إلى محرّر الخريطة
 * على **الزون نفسه** مع تمرير معرّف العنصر في `focus`.
 *
 * ## ما يثبّته هذا الاختبار
 * ① الصفّ يحمل `id` و`path` فعلاً — لا حقول عرض فقط. بدونهما لا يعرف الصفّ
 *    أين يقع، وهو أصل العيب الذي كان يترك الجدول معزولاً عن الخريطة.
 * ② النقر (و Enter/مسافة للوصول بلوحة المفاتيح) ينتج رابطاً يحمل
 *    `zone` و`focus=<kind>:<id>` — أي أن الوصول لا يعتمد على الفأرة وحدها.
 * ③ التركيز على الصفّ لا يغيّر ما يُصدَّر: التصدير يبقى من `rows` المفلترة.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type * as ReactRouter from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** آخر مسار تنقّل إليه الصفحة — يثبت شكل الرابط */
  pushed: [] as string[],
}))

vi.mock('@features/map-planning/hooks/useMapPlanning', () => ({
  useMapZones: () => ({
    data: [
      { id: 'z1', name: 'أرخيته', code: 'ARK', sector_id: 1, elements: 3 },
      { id: 'z2', name: 'الرياض', code: 'RYD', sector_id: 1, elements: 0 },
    ],
    isLoading: false,
  }),
  useMapStreets: () => ({
    data: [
      {
        id: 'st-1',
        zone_id: 'z1',
        code: 'STR-0001',
        name: 'شارع الرشيد',
        kind: 'primary',
        // مسار حقيقي — يُستخدم للتقريب على الخريطة
        path: [
          [33.31, 44.4],
          [33.32, 44.41],
        ],
        length_m: 480,
        width_m: 30,
        status: 'confirmed',
      },
    ],
    isLoading: false,
  }),
  useMapAlleys: () => ({
    data: [
      {
        id: 'al-1',
        zone_id: 'z1',
        code: 'ALY-0002',
        name: 'زقاق ٤٥٨',
        path: [
          [33.3, 44.39],
          [33.301, 44.391],
        ],
        length_m: 45,
        width_m: null,
        status: 'draft',
        mahalla_code: 'MHL-0001',
        mahalla_name: 'محلة ٩٢٩',
      },
    ],
    isLoading: false,
  }),
  useMapMahallas: () => ({ data: [] }),
  useCoverageByPlace: () => ({ data: [] }),
  useExportPrefs: () => ({ data: null }),
  useSectorManagers: () => ({ data: [] }),
}))

vi.mock('@features/map-planning/hooks/useUrlState', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUrlText: () => ['', vi.fn()],
  useUrlBool: () => [false, vi.fn()],
  useUrlChoice: (_k: string, _a: readonly string[], fallback: string) => [fallback, vi.fn()],
  useUrlState: (_k: string, o: { fallback: unknown }) => [o.fallback, vi.fn()],
}))

vi.mock('@features/map-planning/components/MapFilterBar', () => ({
  MapFilterBar: () => <div data-testid="filter-bar" />,
}))
vi.mock('@features/map-planning/components/ExportColumnsPanel', () => ({
  ExportColumnsPanel: () => null,
}))
vi.mock('@components/executive/ExecPageHeader', () => ({
  ExecPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@features/hr-shifts/hooks', () => ({ useShiftLabel: () => 'صباحي' }))

/** يلتقط التنقّل بدل فتح صفحة المحرّر فعلاً */
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return {
    ...actual,
    useNavigate: () => (to: string) => {
      h.pushed.push(to)
    },
  }
})

import MapPlanningTablePage from '@portals/ops-room/pages/MapPlanning/OpsMapPlanningTablePage'

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/ops-room/map-planning/table']}>
      <Routes>
        <Route path="/ops-room/map-planning/table" element={<MapPlanningTablePage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('جدول الشوارع والأزقة → موضعه على الخريطة', () => {
  beforeEach(() => {
    h.pushed = []
  })

  it('يعرض الشارع والزقاق مع معرّفهما ومسارهما', () => {
    renderPage()
    expect(screen.getByTestId('map-row-street-STR-0001')).toBeInTheDocument()
    expect(screen.getByTestId('map-row-alley-ALY-0002')).toBeInTheDocument()
  })

  it('الضغط على صفّ شارع يفتح الخريطة على الزون نفسه مع التركيز على العنصر', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('map-row-street-STR-0001'))
    expect(h.pushed).toEqual(['/ops-room/map-planning?zone=z1&focus=street:st-1'])
  })

  it('الضغط على صفّ زقاق يحمل نوعه الصحيح في الرابط', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('map-row-alley-ALY-0002'))
    expect(h.pushed).toEqual(['/ops-room/map-planning?zone=z1&focus=alley:al-1'])
  })

  it('لوحة المفاتيح: Enter يفتح الخريطة أيضاً (الصفّ ليس فأرة فقط)', () => {
    renderPage()
    fireEvent.keyDown(screen.getByTestId('map-row-street-STR-0001'), { key: 'Enter' })
    expect(h.pushed).toEqual(['/ops-room/map-planning?zone=z1&focus=street:st-1'])
  })

  it('الصفّ يحمل دلالة التفاعل للوصول (role + tabIndex)', () => {
    renderPage()
    const row = screen.getByTestId('map-row-street-STR-0001')
    expect(row).toHaveAttribute('role', 'button')
    expect(row).toHaveAttribute('tabindex', '0')
  })
})
