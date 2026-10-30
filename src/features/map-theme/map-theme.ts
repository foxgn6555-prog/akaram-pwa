/**
 * 00388 — وضع الخريطة الموحّد (نهاري/ليلي) لكل خرائط المنصة: الاختيار محفوظ في المتصفح ويُطبَّق على كل الخرائط.
 * الخلفية الداكنة مضمونة: سلسلة مزوّدين ثم OSM بفلتر CSS داكن (لا يفشل ما دام OSM يعمل).
 */
export type MapTheme = 'light' | 'dark'
export const MAP_THEME_KEY = 'akaram.map-theme'
export const MAP_THEME_EVENT = 'akaram:map-theme'

export interface TileProvider { id: string; url: string; attribution: string; filter: boolean; maxZoom: number }
export const DARK_TILES: readonly TileProvider[] = [
  { id: 'carto-dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', filter: false, maxZoom: 19 },
  { id: 'esri-dark', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap', filter: false, maxZoom: 16 },
  { id: 'osm-filtered', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', filter: true, maxZoom: 19 },
]
export const LIGHT_TILES: TileProvider = { id: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', filter: false, maxZoom: 19 }
export const TILE_ERRORS_BEFORE_FALLBACK = 3

export function readMapTheme(fallback: MapTheme = 'light'): MapTheme {
  try { const v = localStorage.getItem(MAP_THEME_KEY); return v === 'dark' || v === 'light' ? v : fallback } catch { return fallback }
}
export function writeMapTheme(t: MapTheme): void {
  try { localStorage.setItem(MAP_THEME_KEY, t) } catch { /* خاص/ممتلئ */ }
  try { window.dispatchEvent(new CustomEvent(MAP_THEME_EVENT, { detail: t })) } catch { /* بيئة بلا window */ }
}

/** لوحة ألوان واجهة الخريطة (الأزرار/وسيلة الإيضاح) بحسب الوضع */
export const MAP_UI = {
  light: { panel: 'border-white/60 bg-white/95 text-slate-900', chip: 'bg-slate-100 text-slate-700', chipOn: 'bg-slate-950 text-white', legend: 'bg-white/95 text-slate-800 border-slate-200', container: 'bg-slate-100' },
  dark: { panel: 'border-white/10 bg-slate-900/85 text-white backdrop-blur-md', chip: 'bg-white/10 text-white hover:bg-white/20', chipOn: 'bg-emerald-600 text-white', legend: 'bg-slate-900/85 text-white border-white/10 backdrop-blur-md', container: 'bg-slate-950' },
} as const

/** CSS مشترك: الفلتر الداكن وخلفية الحاوية */
export const MAP_THEME_CSS = `
.akaram-tiles-filtered .leaflet-tile-pane { filter: invert(1) hue-rotate(195deg) brightness(.72) contrast(1.15) saturate(.55); }
.akaram-map-dark .leaflet-container { background: #060b18; }
.akaram-map-light .leaflet-container { background: #e5e7eb; }
.akaram-map-dark .leaflet-control-zoom a { background: #0f172a; color: #fff; border-color: rgba(255,255,255,.15); }
.akaram-map-dark .leaflet-control-attribution { background: rgba(15,23,42,.8); color: #94a3b8; }
.akaram-map-dark .leaflet-control-attribution a { color: #7dd3fc; }
`
