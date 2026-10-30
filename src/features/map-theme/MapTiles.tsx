/**
 * 00388 — طبقة البلاط الموحّدة: نهاري = OSM؛ ليلي = سلسلة مزوّدين داكنين ثم OSM بفلتر CSS.
 * تُبلّغ onFailed عند تعذّر كل المزوّدين (نادر). تحقن CSS المشترك مرة واحدة وتضبط صنف الوضع على حاوية Leaflet.
 */
import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'
import { DARK_TILES, LIGHT_TILES, MAP_THEME_CSS, TILE_ERRORS_BEFORE_FALLBACK, type MapTheme } from './map-theme'

const STYLE_ID = 'akaram-map-theme-style'
export function useInjectMapThemeStyle() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style'); el.id = STYLE_ID; el.textContent = MAP_THEME_CSS; document.head.appendChild(el)
  }, [])
}

export default function MapTiles({ theme, onFailed, onProvider }: { theme: MapTheme; onFailed?: (failed: boolean) => void; onProvider?: (id: string) => void }) {
  const map = useMap()
  const [darkIdx, setDarkIdx] = useState(0)
  const errors = useRef(0)
  const tiles = theme === 'dark' ? DARK_TILES[Math.min(darkIdx, DARK_TILES.length - 1)]! : LIGHT_TILES
  useEffect(() => { errors.current = 0; onFailed?.(false) }, [theme, onFailed])
  useEffect(() => { onProvider?.(tiles.id) }, [tiles.id, onProvider])
  useEffect(() => {
    const el = typeof map?.getContainer === 'function' ? map.getContainer() : null   // الاختبارات تحاكي الخريطة
    if (!el) return
    el.classList.toggle('akaram-tiles-filtered', theme === 'dark' && tiles.filter)
    el.classList.toggle('akaram-map-dark', theme === 'dark')
    el.classList.toggle('akaram-map-light', theme === 'light')
    el.setAttribute('data-map-theme', theme); el.setAttribute('data-tiles', tiles.id)
  }, [map, theme, tiles])
  const onTileError = () => {
    errors.current += 1
    if (errors.current < TILE_ERRORS_BEFORE_FALLBACK) return
    errors.current = 0
    if (theme === 'dark' && darkIdx < DARK_TILES.length - 1) setDarkIdx((i) => i + 1)
    else onFailed?.(true)
  }
  return <TileLayer key={tiles.id} attribution={tiles.attribution} url={tiles.url} maxZoom={tiles.maxZoom} maxNativeZoom={tiles.maxZoom} eventHandlers={{ tileerror: onTileError, tileload: () => { errors.current = 0; onFailed?.(false) } }} />
}

export function MapThemeToggle({ theme, onToggle, testId = 'map-theme-toggle' }: { theme: MapTheme; onToggle: () => void; testId?: string }) {
  const dark = theme === 'dark'
  return (
    <button type="button" aria-pressed={dark} data-testid={testId} onClick={onToggle} title={dark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
      className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${dark ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-slate-950 text-white hover:bg-slate-800'}`}>
      {dark ? '☀ نهاري' : '☾ ليلي'}
    </button>
  )
}
