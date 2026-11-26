/**
 * الجولة ③ — «عرض جميع الزونات» في محرّر الخريطة، على الصفحة الحقيقية.
 *
 * ## العطل الذي يمنعه الاختبار
 * الربط السهل هو: `const activeZoneId = showAllZones ? null : zoneId ?? zones[0].id`.
 * يبدو منطقياً («لا زون نشط حين نعرض الجميع») لكنه يُصفّر اختيار المستخدم في
 * كل تشغيل للطبقة: يفتح المحرّر على «الكراج»، يُطفئ الطبقة، فيجد نفسه على
 * أوّل زون في القائمة — فيضيع موضعه ويظنّ أن الحفظ فشل.
 *
 * ## ما يُثبَت هنا
 * ① التبديل يعمل ويتغيّر نصّه/حالته.
 * ② الزون المختار **يبقى** مختاراً بعد إطفاء الطبقة وتشغيلها (الاختبار الأهم).
 * ③ الطبقة تُبنى بألوان مختلفة للزونات (لا لون واحد).
 * ④ اختيار زون من الشريط يعمل والطبقة مطفأة أيضاً.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  polygons: [] as Array<{ color: string; weight: number; dash?: string }>,
  picked: [] as string[],
}))

// الصفحة تستورد { divIcon } تصديراً مسمّى (لا default.divIcon)
vi.mock('leaflet', () => ({
  divIcon: vi.fn(() => ({})),
  latLngBounds: vi.fn((p: unknown) => p),
  default: { divIcon: vi.fn(() => ({})), latLngBounds: vi.fn((p: unknown) => p) },
}))
vi.mock('react-leaflet', () => {
  const map = {
    fitBounds: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => null,
  }
  return {
    useMap: () => map,
    MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Polyline: ({ children }: { children?: ReactNode }) => <div data-testid="polyline">{children}</div>,
    Polygon: ({
      pathOptions,
      eventHandlers,
      children,
    }: {
      pathOptions?: { color?: string; weight?: number; dashArray?: string }
      eventHandlers?: { click?: () => void }
      children?: ReactNode
    }) => {
      const opts = pathOptions ?? {}
      // التسمية الدائمة = Polygon بلا سماكة؛ ليست حدّاً فلا تُحتسب
      if (!opts.weight) return null
      h.polygons.push({ color: opts.color ?? '', weight: opts.weight, dash: opts.dashArray })
      return (
        <button
          type="button"
          data-testid="zone-polygon"
          data-color={opts.color}
          onClick={() => eventHandlers?.click?.()}
        >
          {children}
        </button>
      )
    },
  }
})

const zones = [
  { id: 'z1', name: 'الكراج', code: 'Z1' },
  { id: 'z2', name: 'الجزيرة', code: 'Z2' },
  { id: 'z3', name: 'الحاويات', code: 'Z3' },
]

vi.mock('@features/map-planning/hooks/useMapPlanning', () => ({
  useMapZones: () => ({ data: zones, isLoading: false }),
  useMapStreets: () => ({ data: [], isLoading: false }),
  useMapAlleys: () => ({ data: [], isLoading: false }),
  useMapMahallas: () => ({ data: [], isLoading: false }),
  useMapReviews: () => ({ data: [], isLoading: false }),
  useMapSkips: () => ({ data: [], isLoading: false }),
  useZoneOutlines: (_ids: readonly string[], enabled: boolean) => ({
    data: enabled
      ? {
          z1: [
            [33.3, 44.4],
            [33.31, 44.41],
            [33.3, 44.42],
          ],
          z2: [
            [33.32, 44.4],
            [33.33, 44.41],
            [33.32, 44.42],
          ],
          z3: [], // بلا مضلّع — يجب ألا يُسقط الشاشة
        }
      : {},
    isLoading: false,
  }),
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

/**
 * الصفحة تقرأ `?zone`/`?focus` (الوصول من جدول الشوارع والأزقة) وتعرض روابط
 * تنقّل — كلاهما يحتاج سياق Router. الغلاف هنا لا يغيّر سلوك «عرض جميع
 * الزونات» الذي يفحصه هذا الملف؛ يوفّر السياق فقط.
 */
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/ops-room/map-planning']}>
      <MapPlanningEditorPage />
    </MemoryRouter>,
  )

const toggle = () => screen.getByTestId('toggle-all-zones')
const ZONE_NAMES = ['الكراج', 'الجزيرة', 'الحاويات']
/**
 * أزرار الزونات وحدها.
 * `getAllByRole('button', {pressed:true})` يلتقط أزرار الطبقات أيضاً، ثم إن
 * حدود الزونات تحمل اسم الزون في تلميحها فتصير مطابقة للاسم نفسه. المعرّف
 * `zone-chip` يفصل المدخل عن الرسم بلا لبس.
 */
const chip = (name: string) => screen.getAllByTestId('zone-chip').find((b) => b.textContent === name)!
const zonePressed = () =>
  ZONE_NAMES.map(chip).filter((b) => b.getAttribute('aria-pressed') === 'true')

describe('③ محرّر الخريطة — عرض جميع الزونات', () => {
  beforeEach(() => {
    h.polygons.length = 0
  })

  it('الافتراضي مُطفأ — يفتح المستخدم على زونه لا على خريطة الأزونات', () => {
    renderPage()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryAllByTestId('zone-polygon')).toHaveLength(0)
  })

  it('التشغيل يرسم حدود الزونات المخطَّطة فقط ويتجاهل بلا مضلّع', () => {
    renderPage()
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    // z3 بلا نقاط ⇒ لا يُرسم لها شيء
    const drawn = screen.getAllByTestId('zone-polygon')
    expect(drawn.length).toBe(2)
  })

  it('★ الاختيار يبقى عند إطفاء الطبقة وتشغيلها — لا يُصفَّر', () => {
    renderPage()
    // اختر «الجزيرة» من الشريط
    const z2 = chip('الجزيرة')
    fireEvent.click(z2)
    expect(z2).toHaveAttribute('aria-pressed', 'true')

    // شغّل الطبقة ثم أطفئها
    fireEvent.click(toggle())
    fireEvent.click(toggle())

    // ما زال «الجزيرة» مختاراً — هذا ما يحمي موضع المستخدم
    expect(chip('الجزيرة')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('الكراج')).toHaveAttribute('aria-pressed', 'false')
  })

  it('النقر على حدّ زون في الخريطة يختاره', () => {
    renderPage()
    fireEvent.click(toggle())
    const polys = screen.getAllByTestId('zone-polygon')
    // الثاني = z2 حسب ترتيب zones
    fireEvent.click(polys[1]!)
    expect(chip('الجزيرة')).toHaveAttribute('aria-pressed', 'true')
  })

  it('كل زون بلونه — لا لون واحد للجميع', () => {
    renderPage()
    fireEvent.click(toggle())
    const colors = screen.getAllByTestId('zone-polygon').map((el) => el.getAttribute('data-color'))
    expect(new Set(colors).size).toBe(colors.length)
    expect(colors.every((c) => !!c)).toBe(true)
  })

  it('ينبّه على الزونات بلا حدود بدل الصمت', () => {
    renderPage()
    fireEvent.click(toggle())
    expect(screen.getByTestId('outlines-missing')).toBeInTheDocument()
  })

  it('الطبقة مطفأة: أزرار الزونات كلها تعمل كما كانت (لا انحدار)', () => {
    renderPage()
    for (const name of ZONE_NAMES) {
      fireEvent.click(chip(name))
      expect(chip(name)).toHaveAttribute('aria-pressed', 'true')
    }
    expect(zonePressed().length).toBe(1)
  })
})
