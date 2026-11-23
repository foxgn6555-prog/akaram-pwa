import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  useMap: () => ({ getContainer: () => document.querySelector('[data-testid="map-container"]') }),
  TileLayer: ({
    url,
    eventHandlers,
  }: {
    url: string
    eventHandlers: Record<string, () => void>
  }) => (
    <div data-testid="tile-layer" data-url={url}>
      <button type="button" data-testid="tile-error" onClick={() => eventHandlers.tileerror?.()}>
        error
      </button>
      <button type="button" data-testid="tile-load" onClick={() => eventHandlers.tileload?.()}>
        load
      </button>
    </div>
  ),
}))

import MapTiles from '@features/map-theme/MapTiles'
import { MAP_THEME_CSS } from '@features/map-theme/map-theme'

describe('MapTiles dark provider fallback', () => {
  it('styles the primary dark basemap for readable roads', () => {
    expect(MAP_THEME_CSS).toContain('.akaram-map-dark[data-tiles="esri-dark"] .leaflet-tile-pane')
    expect(MAP_THEME_CSS).toContain('.akaram-tiles-filtered .leaflet-tile-pane')
    expect(MAP_THEME_CSS).toContain('brightness(1.1) contrast(.9)')
  })

  /*
   * ⚠ كان هذا الاختبار يثبّت **العيب** لا السلوك الصحيح: «uses Esri first».
   *
   * وEsri هنا = `World_Dark_Gray_Base`، وهي خدمة **خلفية** أسموتية بلا
   * طبقة طرق. فكان الوضع الليلي في كل الشاشات الافتراضية يعرض خطوطاً رمادية
   * صمّاء بلا أسماء — بينما النهاري يعرض شبكة كاملة. ورآها المشغّل فقال
   * «التخطيط يختلف».
   *
   * الصواب: OSM المفلتر أولاً (نفس هندسة النهاري وأسماءه)، وEsri **تراجع**
   * عند ٣ أخطاء بلاط. والاسم الآن يعكس ذلك.
   */
  it('uses CSS-filtered OSM first and falls back to Esri after repeated tile errors', () => {
    const onFailed = vi.fn()
    const onProvider = vi.fn()
    render(
      <div data-testid="map-container">
        <MapTiles theme="dark" onFailed={onFailed} onProvider={onProvider} />
      </div>,
    )

    const map = screen.getByTestId('map-container')
    expect(map.getAttribute('data-tiles')).toBe('osm-filtered')
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toContain(
      'tile.openstreetmap.org',
    )
    expect(map.classList.contains('akaram-tiles-filtered')).toBe(true)
    expect(onProvider).toHaveBeenLastCalledWith('osm-filtered')

    const tileError = () => fireEvent.click(screen.getByTestId('tile-error'))
    tileError()
    fireEvent.click(screen.getByTestId('tile-load'))
    tileError()
    fireEvent.click(screen.getByTestId('tile-load'))
    tileError()
    expect(map.getAttribute('data-tiles')).toBe('esri-dark')
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toContain(
      'World_Dark_Gray_Base',
    )
    expect(map.classList.contains('akaram-tiles-filtered')).toBe(false)
    expect(onProvider).toHaveBeenLastCalledWith('esri-dark')

    tileError()
    tileError()
    tileError()
    expect(onFailed).toHaveBeenLastCalledWith(true)
  })

  it('`preferOsmDark` لم يبقَ له أثر — OSM أولاً في كل الشاشات', () => {
    const onProvider = vi.fn()
    render(
      <div data-testid="map-container">
        <MapTiles theme="dark" preferOsmDark onProvider={onProvider} />
      </div>,
    )
    const map = screen.getByTestId('map-container')
    expect(map.getAttribute('data-tiles')).toBe('osm-filtered')
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toContain('tile.openstreetmap.org')
    expect(map.classList.contains('akaram-tiles-filtered')).toBe(true)
    fireEvent.click(screen.getByTestId('tile-error'))
    fireEvent.click(screen.getByTestId('tile-load'))
    fireEvent.click(screen.getByTestId('tile-error'))
    fireEvent.click(screen.getByTestId('tile-load'))
    fireEvent.click(screen.getByTestId('tile-error'))
    expect(map.getAttribute('data-tiles')).toBe('esri-dark')
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toContain('World_Dark_Gray_Base')
    expect(map.classList.contains('akaram-tiles-filtered')).toBe(false)
    expect(onProvider).toHaveBeenLastCalledWith('esri-dark')
    /*
     * الدليل على أن الترتيب لم يعد يعتمد على الخيار: الشاشتان (مع
     * preferOsmDark وبدونه) تبدأان بنفس المزوّد وتنتهيان بنفس البديل.
     */
  })
})
