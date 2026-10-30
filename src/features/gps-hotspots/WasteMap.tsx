/**
 * 00384/00387 — خريطة النفايات (بقع التوقف) بمظهر المرجع: خلفية داكنة مضمونة (سلسلة مزوّدين ثم فلتر CSS)،
 * طبقة توهّج حراري متدرّجة (أزرق ← أخضر ← أصفر ← أحمر) تذوب هالاتها في بعضها، وعلامة دقيقة في مركز كل بقعة
 * (نقطة بيضاء بحلقة بلون الصنف، نبض للشبه يومي، أيقونة سلة للثقيلة). الإطار ثابت لكل شهر، ملء الشاشة عبر portal.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { CLASS_COLOR, CLASS_LABEL, RECURRENCE_LABEL, fmtMinutes, peakHours } from './hotspots.logic'
import { HEAT_GRADIENT_CSS, isLandmarkSpot } from './heat'
import HeatLayer from './HeatLayer'

const BAGHDAD: [number, number] = [33.3152, 44.3661]
/** سلسلة الخلفيات الداكنة: إن فشل مزوّد ننتقل للتالي؛ الأخير = OSM مع فلتر CSS داكن (لا يفشل ما دام OSM يعمل) */
export const DARK_TILES = [
  { id: 'carto-dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO', filter: false, maxZoom: 19 },
  { id: 'esri-dark', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap', filter: false, maxZoom: 16 },
  { id: 'osm-filtered', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', filter: true, maxZoom: 19 },
] as const
export const LIGHT_TILES = { id: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', filter: false, maxZoom: 19 } as const
const TILE_ERRORS_BEFORE_FALLBACK = 3

/** أنماط العلامات والفلتر الداكن — تُحقن مرة واحدة */
const STYLE_ID = 'waste-map-style'
const CSS = `
.waste-tiles-filtered .leaflet-tile-pane { filter: invert(1) hue-rotate(195deg) brightness(.72) contrast(1.15) saturate(.55); }
.waste-map-root .leaflet-container { background: #060b18; }
.waste-spot { position: relative; width: 22px; height: 22px; }
.waste-spot__ring { position: absolute; inset: 0; border-radius: 9999px; border: 2px solid var(--c); box-shadow: 0 0 10px 1px var(--c), inset 0 0 6px rgba(255,255,255,.35); opacity: .95; }
.waste-spot__dot { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 9999px; background: #fff; box-shadow: 0 0 6px 2px rgba(255,255,255,.85); }
.waste-spot__pulse { position: absolute; inset: -6px; border-radius: 9999px; border: 2px solid var(--c); opacity: 0; animation: waste-pulse 2.4s ease-out infinite; }
.waste-spot--landmark .waste-spot__dot { display: none; }
.waste-spot__bin { position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; color: #fff; filter: drop-shadow(0 0 3px rgba(0,0,0,.8)); }
.waste-spot--selected .waste-spot__ring { border-color: #22d3ee; box-shadow: 0 0 0 4px rgba(34,211,238,.35), 0 0 18px 4px #22d3ee; }
.waste-spot--selected .waste-spot__pulse { border-color: #22d3ee; opacity: 1; animation-duration: 1.4s; }
.waste-spot__label { position: absolute; top: 100%; left: 50%; transform: translate(-50%, 4px); white-space: nowrap; font: 900 10px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 0 4px #000, 0 0 2px #000; direction: rtl; }
@keyframes waste-pulse { 0% { transform: scale(.55); opacity: .9; } 100% { transform: scale(1.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .waste-spot__pulse { animation: none; opacity: .4; } }
`
function useInjectStyle() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style'); el.id = STYLE_ID; el.textContent = CSS; document.head.appendChild(el)
  }, [])
}

const BIN_SVG = '<svg class="waste-spot__bin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
const iconCache = new Map<string, L.DivIcon>()
export function spotIcon(h: GpsHotspot, selected: boolean, label?: string): L.DivIcon {
  const color = CLASS_COLOR[h.dominant_class]
  const landmark = isLandmarkSpot(h)
  const pulse = h.recurrence === 'frequent' || selected
  const key = `${color}|${landmark ? 1 : 0}|${pulse ? 1 : 0}|${selected ? 1 : 0}|${label ?? ''}`
  let icon = iconCache.get(key)
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="waste-spot${landmark ? ' waste-spot--landmark' : ''}${selected ? ' waste-spot--selected' : ''}" style="--c:${color}" data-class="${h.dominant_class}" data-recurrence="${h.recurrence}">${pulse ? '<span class="waste-spot__pulse"></span>' : ''}<span class="waste-spot__ring"></span><span class="waste-spot__dot"></span>${landmark ? BIN_SVG : ''}${label ? `<span class="waste-spot__label">${label}</span>` : ''}</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12],
    })
    iconCache.set(key, icon)
  }
  return icon
}

/** يضبط الإطار مرة واحدة لكل شهر (مفتاح) ثم يتركه ثابتاً */
function FitOnce({ fitKey, rows }: { fitKey: string; rows: GpsHotspot[] }) {
  const map = useMap()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (done.current === fitKey || rows.length === 0) return
    map.fitBounds(rows.map((h) => [h.lat, h.lng] as [number, number]), { padding: [40, 40], maxZoom: 14 })
    done.current = fitKey
  }, [map, fitKey, rows])
  return null
}
function FlyTo({ spot }: { spot: GpsHotspot | null }) {
  const map = useMap()
  useEffect(() => { if (spot) map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 15), { duration: 0.6 }) }, [spot, map])
  return null
}
function Resize({ dep }: { dep: boolean }) {
  const map = useMap()
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 60); return () => clearTimeout(t) }, [map, dep])
  return null
}
/** يضيف/يزيل صنف الفلتر الداكن على حاوية الخريطة */
function TileFilterClass({ on }: { on: boolean }) {
  const map = useMap()
  useEffect(() => { const el = map.getContainer(); el.classList.toggle('waste-tiles-filtered', on) }, [map, on])
  return null
}

export interface WasteMapProps {
  /** كل بقع الشهر (للإطار الثابت) */
  allRows: GpsHotspot[]
  /** البقع بعد الفلترة (المعروضة) */
  rows: GpsHotspot[]
  fitKey: string
  selectedId?: number | null
  onSelect?: (h: GpsHotspot | null) => void
  heightClass?: string
}

export default function WasteMap({ allRows, rows, fitKey, selectedId, onSelect, heightClass = 'h-[72vh] min-h-[420px]' }: WasteMapProps) {
  useInjectStyle()
  const [full, setFull] = useState(false)
  const [dark, setDark] = useState(true)
  const [darkIdx, setDarkIdx] = useState(0)
  const [showHeat, setShowHeat] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [tileFailed, setTileFailed] = useState(false)
  const errorsRef = useRef(0)
  const selected = rows.find((h) => h.id === selectedId) ?? null
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const tiles = dark ? DARK_TILES[Math.min(darkIdx, DARK_TILES.length - 1)]! : LIGHT_TILES
  const onTileError = () => {
    errorsRef.current += 1
    if (dark && darkIdx < DARK_TILES.length - 1 && errorsRef.current >= TILE_ERRORS_BEFORE_FALLBACK) { errorsRef.current = 0; setDarkIdx((i) => i + 1); return }
    if (errorsRef.current >= TILE_ERRORS_BEFORE_FALLBACK) setTileFailed(true)
  }
  const onTileLoad = () => { errorsRef.current = 0; setTileFailed(false) }
  const markers = useMemo(() => rows.map((h) => ({ h, icon: spotIcon(h, h.id === selectedId) })), [rows, selectedId])

  const shell = (
    <div className={`waste-map-root ${full ? 'fixed inset-0 z-[2200] bg-slate-950' : `relative isolate z-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 ${heightClass}`}`} data-testid="waste-map" data-fullscreen={full ? '1' : '0'} data-tiles={tiles.id} data-theme={dark ? 'dark' : 'light'}>
      <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-slate-900/85 p-2 shadow-2xl backdrop-blur-md">
        <span className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black text-white" data-testid="waste-map-counter">{rows.length.toLocaleString('en')} بقعة معروضة من {allRows.length.toLocaleString('en')}</span>
        <button type="button" aria-pressed={dark} data-testid="waste-map-theme" onClick={() => { setDark((v) => !v); errorsRef.current = 0; setTileFailed(false) }} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black text-white hover:bg-white/20">{dark ? '☀ خريطة عادية' : '☾ خريطة داكنة'}</button>
        <button type="button" aria-pressed={showHeat} data-testid="waste-map-heat" onClick={() => setShowHeat((v) => !v)} className={`rounded-xl px-3 py-2 text-[10px] font-black text-white ${showHeat ? 'bg-orange-500/80' : 'bg-white/10 hover:bg-white/20'}`}>التوهّج الحراري</button>
        <button type="button" aria-pressed={showMarkers} data-testid="waste-map-markers" onClick={() => setShowMarkers((v) => !v)} className={`rounded-xl px-3 py-2 text-[10px] font-black text-white ${showMarkers ? 'bg-sky-500/80' : 'bg-white/10 hover:bg-white/20'}`}>العلامات</button>
        <button type="button" aria-pressed={full} data-testid="waste-map-fullscreen" onClick={() => setFull((v) => !v)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white hover:bg-emerald-500">{full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}</button>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] grid gap-1.5 rounded-2xl border border-white/10 bg-slate-900/85 px-3 py-2 text-[10px] font-black text-white shadow-2xl backdrop-blur-md" data-testid="waste-map-legend">
        <div className="flex items-center gap-2"><span className="text-slate-300">كثافة التوقف</span><span className="h-2.5 w-28 rounded-full" style={{ background: HEAT_GRADIENT_CSS }} data-testid="waste-map-legend-gradient" /><span className="text-slate-300">منخفضة ← عالية جداً</span></div>
        <div className="flex flex-wrap gap-2">{(['heavy', 'medium', 'light'] as const).map((c) => <span key={c} className="flex items-center gap-1"><span className="size-3 rounded-full border-2" style={{ borderColor: CLASS_COLOR[c], boxShadow: `0 0 6px ${CLASS_COLOR[c]}` }} />{CLASS_LABEL[c]}</span>)}<span className="flex items-center gap-1 text-slate-300"><span className="size-3 rounded-full border-2 border-white/60" />{RECURRENCE_LABEL.frequent} = نبض</span><span className="text-slate-300">· سلة = بقعة ثقيلة</span></div>
      </div>
      {tileFailed && <div className="absolute inset-x-20 top-16 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900" data-testid="waste-map-tile-failed">تعذر تحميل خلفية الخريطة — البقع ما زالت ظاهرة.</div>}
      {allRows.length === 0 && <div data-testid="waste-map-empty" className="absolute inset-x-10 bottom-16 z-[1000] rounded-xl bg-white/95 p-3 text-center text-xs font-bold text-slate-700">لا بقع لهذا الشهر بعد — تُنسخ من المستودع كل ليلة 23:30.</div>}
      <MapContainer center={BAGHDAD} zoom={11} className="h-full w-full" scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer key={tiles.id} attribution={tiles.attribution} url={tiles.url} maxZoom={tiles.maxZoom} maxNativeZoom={tiles.maxZoom} eventHandlers={{ tileerror: onTileError, tileload: onTileLoad }} />
        <TileFilterClass on={dark && tiles.filter} />
        <FitOnce fitKey={fitKey} rows={allRows} />
        <FlyTo spot={selected} />
        <Resize dep={full} />
        {showHeat && <HeatLayer rows={rows} />}
        {showMarkers && markers.map(({ h, icon }) => (
          <Marker key={h.id} position={[h.lat, h.lng]} icon={icon} zIndexOffset={h.id === selectedId ? 1000 : isLandmarkSpot(h) ? 200 : 0} eventHandlers={{ click: () => onSelect?.(h) }}>
            <Popup>
              <div dir="rtl" className="min-w-[200px] text-right text-xs" data-testid={`waste-spot-popup-${h.id}`}>
                <b className="text-sm" style={{ color: CLASS_COLOR[h.dominant_class] }}>{CLASS_LABEL[h.dominant_class]} · {RECURRENCE_LABEL[h.recurrence]}</b>
                <div className="text-[11px] text-slate-600">{h.sector_names?.join('، ') || '—'}</div>
                <div className="mt-1">التوقفات: <b>{h.stops_count}</b> · الأيام: <b>{h.days_count}</b> · الآليات: <b>{h.vehicles_count}</b></div>
                <div>إجمالي التوقف: <b>{fmtMinutes(h.total_minutes)}</b> · المتوسط {h.avg_minutes} د · الأقصى {h.max_minutes} د</div>
                <div>ذروة الساعات: {peakHours(h.hours)}</div>
                <div className="text-[10px] text-slate-500">{h.lat.toFixed(5)}, {h.lng.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
  return full ? createPortal(shell, document.body) : shell
}
