/** 00388 — خطاف وضع الخريطة: قيمة محفوظة + مزامنة بين كل الخرائط المفتوحة */
import { useCallback, useEffect, useState } from 'react'
import { MAP_THEME_EVENT, type MapTheme, readMapTheme, writeMapTheme } from './map-theme'

export function useMapTheme(fallback: MapTheme = 'light'): [MapTheme, (t: MapTheme) => void, () => void] {
  const [theme, setThemeState] = useState<MapTheme>(() => readMapTheme(fallback))
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<MapTheme>).detail; if (d === 'dark' || d === 'light') setThemeState(d) }
    window.addEventListener(MAP_THEME_EVENT, on)
    return () => window.removeEventListener(MAP_THEME_EVENT, on)
  }, [])
  const setTheme = useCallback((t: MapTheme) => { setThemeState(t); writeMapTheme(t) }, [])
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme])
  return [theme, setTheme, toggle]
}
