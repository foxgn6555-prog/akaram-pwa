/**
 * وصول من جدول الشوارع والأزقة إلى الخريطة: `?zone=<uuid>&focus=<kind>:<id>`
 *
 * ## العطل الذي يمنعه هذا الاختبار
 * الربط السهل هو تجاهل العنوان: المحرّر يبدأ دائماً بـ `zones[0]`. فمن يستعرض
 * «الرياض» في الجدول يضغط صفّاً فيهبط على «أرخيته» — خريطة صحيحة لكن **زون
 * آخر**، فيظنّ أن الصفّ لا يعمل. وكذا `focus`: بلا اختيار فعلي للعنصر يفقد
 * المستخدم الفائدة كلها (يجد شارعاً بين مئات بلا تمييز).
 *
 * ## ما يُثبَت هنا
 * ① `zone` من الرابط يُفتح بدل الزون الأول — **قبل** تحميل أي شيء آخر.
 * ② `focus` يُترجَم إلى اختيار فعلي، فتُعرض بطاقة التفاصيل المطابقة.
 * ③ التقريب يحدث مرة واحدة لكل عنصر (لا يتكرّر مع تحديثات المزامنة).
 * ④ `focus` مشوّه/غير موجود لا يُسقط الصفحة.
 */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type * as ReactRouter from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  url: new URLSearchParams(),
}))

vi.mock('leaflet', () => ({
  divIcon: vi.fn(() => ({})),
  latLngBounds: vi.fn((p: unknown) => p),
  default: { divIcon: vi.fn(() => ({})), latLngBounds: vi.fn((p: unknown) => p) },
}))

vi.mock('react-leaflet', () => {
  const map = {
    flyTo: h.flyTo,
    fitBounds: h.fitBounds,
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => null,
  }
  return {
    useMap: () => map,
    MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    TileLayer: () => null,
    Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Polyline: ({ children, pathOptions }: { children?: ReactNode; pathOptions?: { weight?: number } }) => (
      <div data-testid="polyline" data-weight={pathOptions?.weight}>
        {children}
      </div>
    ),
    Polygon: () => null,
  }
})

/** العنوان يأتي من هذا الـmock — نتحكّم به من الاختبار */
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>()
  return { ...actual, useSearchParams: () => [h.url] }
})

const zones = [
  { id: 'z1', name: 'أرخيته', code: 'ARK' },
  { id: 'z2', name: 'الرياض', code: 'RYD' },
]

const street = (id: string, code: string) => ({
  id,
  zone_id: 'z2',
  code,
  name: `شارع ${code}`,
  kind: 'primary',
  path: [
    [33.3, 44.4],
    [33.31, 44.41],
  ],
  length_m: 300,
  width_m: 20,
  status: 'confirmed',
})

vi.mock('@features/map-planning/hooks/useMapPlanning', () => ({
  useMapZones: () => ({ data: zones, isLoading: false }),
  // العنصر المطلوب في **الزون الثاني** — لا الأول: هذا ما يميّز النجاح عن العمى
  useMapStreets: () => ({
    data: [street('st-target', 'STR-0500'), street('st-other', 'STR-0501')],
    isLoading: false,
  }),
  useMapAlleys: () => ({ data: [], isLoading: false }),
  useMapMahallas: () => ({ data: [], isLoading: false }),
  useMapReviews: () => ({ data: [] }),
  useMapSkips: () => ({ data: [] }),
  useZoneOutlines: () => ({ data: {}, isLoading: false }),
  useDecideReview: () => ({ mutate: vi.fn() }),
  useLinkAlleyMahalla: () => ({ mutate: vi.fn() }),
  useSaveStreet: () => ({ mutate: vi.fn() }),
  useSaveAlley: () => ({ mutate: vi.fn() }),
}))
vi.mock('@features/map-import/hooks/useMapEdit', () => ({
  useMapEdit: () => ({ draft: null, apply: vi.fn(), start: vi.fn(), cancel: vi.fn(), save: vi.fn() }),
}))
vi.mock('@sdk/map-import.sdk', () => ({
  mapImportSdk: { zonePolygonText: vi.fn(async () => '') },
}))
vi.mock('@features/map-theme/MapTiles', () => ({
  default: () => null,
  MapThemeToggle: () => <button type="button">الوضع</button>,
  useInjectMapThemeStyle: () => {},
}))

import MapPlanningEditorPage from '@portals/ops-room/pages/MapPlanning/OpsMapPlanningEditorPage'

/** الصفحة تحتوي روابط تنقّل (`ExecPageHeader links`) — تحتاج سياق Router */
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/ops-room/map-planning']}>
      <MapPlanningEditorPage />
    </MemoryRouter>,
  )

describe('الوصول إلى الخريطة من جدول الشوارع والأزقة', () => {
  beforeEach(() => {
    h.flyTo.mockClear()
    h.fitBounds.mockClear()
    h.url = new URLSearchParams()
  })

  it('يفتح الزون المطلوب من الرابط لا الزون الأول', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'street:st-target' })
    renderPage()
    const chip = (name: string) =>
      screen.getAllByTestId('zone-chip').find((b) => b.textContent === name)!
    expect(chip('الرياض')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('أرخيته')).toHaveAttribute('aria-pressed', 'false')
  })

  it('يختار العنصر المطلوب ويعرض بطاقة تفاصيله', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'street:st-target' })
    renderPage()
    // بطاقة التفاصيل تحمل كود العنصر المطلوب وحده
    expect(screen.getByText('STR-0500')).toBeInTheDocument()
    expect(screen.queryByText('STR-0501')).not.toBeInTheDocument()
  })

  it('يطير إلى العنصر مرة واحدة فقط — لا يتكرّر مع كل تصيير', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'street:st-target' })
    const { rerender } = renderPage()
    expect(h.flyTo).toHaveBeenCalledTimes(1)
    rerender(
      <MemoryRouter initialEntries={['/ops-room/map-planning']}>
        <MapPlanningEditorPage />
      </MemoryRouter>,
    )
    expect(h.flyTo).toHaveBeenCalledTimes(1)
  })

  it('يفضّل الطيران على الملاءمة العامة حين يوجد focus', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'street:st-target' })
    renderPage()
    expect(h.flyTo).toHaveBeenCalled()
    expect(h.fitBounds).not.toHaveBeenCalled()
  })

  it('بلا focus يعود للسلوك القديم: ملاءمة عامة بلا طيران', () => {
    renderPage()
    expect(h.flyTo).not.toHaveBeenCalled()
    expect(h.fitBounds).toHaveBeenCalled()
  })

  it('focus مشوّه أو لمعرّف غير موجود لا يُسقط الصفحة', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'garbage' })
    renderPage()
    expect(screen.getByText('شوارع وأزقة الزونات — التصنيف والطول والعرض من الاستيراد الحقيقي'))
      .toBeInTheDocument()
    expect(h.flyTo).not.toHaveBeenCalled()
  })

  it('معرّف غير موجود في القاعدة لا يُنتج بطاقة فارغة', () => {
    h.url = new URLSearchParams({ zone: 'z2', focus: 'street:does-not-exist' })
    renderPage()
    expect(screen.getByText('اختر شارعاً أو زقاقاً من الخريطة لعرض تفاصيله')).toBeInTheDocument()
  })
})
