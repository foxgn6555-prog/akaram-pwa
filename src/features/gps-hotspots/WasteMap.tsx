/**
 * 00384 — خريطة النفايات (بقع التوقف): خلفية داكنة، كل بقعة = هالة + قرص لونه بحسب الصنف الغالب وحلقته بحسب التكرار،
 * حجمه بحسب إجمالي دقائق التوقف. الإطار ثابت: يُضبط مرة واحدة على بقع الشهر ثم لا يتحرك مع تبديل الفلاتر. ملء الشاشة عبر portal.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { CLASS_COLOR, CLASS_LABEL, RECURRENCE_LABEL, RECURRENCE_RING, fmtMinutes, hotspotStyle, peakHours } from './hotspots.logic'

const BAGHDAD: [number, number] = [33.3152, 44.3661]
const TILES = {
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap &copy; CARTO' },
  light: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
} as const

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
  const [full, setFull] = useState(false)
  const [dark, setDark] = useState(true)
  const [tileFailed, setTileFailed] = useState(false)
  const selected = rows.find((h) => h.id === selectedId) ?? null
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const tiles = dark ? TILES.dark : TILES.light

  const shell = (
    <div className={full ? 'fixed inset-0 z-[2200] bg-slate-950' : `relative isolate z-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 ${heightClass}`} data-testid="waste-map" data-fullscreen={full ? '1' : '0'}>
      <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-slate-900/90 p-2 shadow-xl backdrop-blur">
        <span className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black text-white" data-testid="waste-map-counter">{rows.length.toLocaleString('en')} بقعة معروضة من {allRows.length.toLocaleString('en')}</span>
        <button type="button" aria-pressed={dark} data-testid="waste-map-theme" onClick={() => setDark((v) => !v)} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black text-white hover:bg-white/20">{dark ? '☀ خلفية فاتحة' : '☾ خلفية داكنة'}</button>
        <button type="button" aria-pressed={full} data-testid="waste-map-fullscreen" onClick={() => setFull((v) => !v)} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white hover:bg-emerald-500">{full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}</button>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] grid gap-1 rounded-2xl bg-slate-900/90 px-3 py-2 text-[10px] font-black text-white" data-testid="waste-map-legend">
        <div className="flex flex-wrap gap-2">{(['heavy', 'medium', 'light'] as const).map((c) => <span key={c} className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ background: CLASS_COLOR[c] }} />{CLASS_LABEL[c]}</span>)}</div>
        <div className="flex flex-wrap gap-2 text-slate-300">{(['frequent', 'recurring', 'once'] as const).map((r) => <span key={r} className="flex items-center gap-1"><span className="size-3 rounded-full bg-slate-700" style={{ boxShadow: `0 0 0 ${RECURRENCE_RING[r].weight}px ${RECURRENCE_RING[r].color}` }} />{RECURRENCE_LABEL[r]}</span>)}<span className="text-slate-400">· الحجم = إجمالي دقائق التوقف</span></div>
      </div>
      {tileFailed && <div className="absolute inset-x-20 top-16 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">تعذر تحميل خلفية الخريطة — البقع ما زالت ظاهرة.</div>}
      {allRows.length === 0 && <div data-testid="waste-map-empty" className="absolute inset-x-10 bottom-16 z-[1000] rounded-xl bg-white/95 p-3 text-center text-xs font-bold text-slate-700">لا بقع لهذا الشهر بعد — تُنسخ من المستودع كل ليلة 23:30.</div>}
      <MapContainer center={BAGHDAD} zoom={11} className="h-full w-full" scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer key={dark ? 'dark' : 'light'} attribution={tiles.attribution} url={tiles.url} eventHandlers={{ tileerror: () => setTileFailed(true), tileload: () => setTileFailed(false) }} />
        <FitOnce fitKey={fitKey} rows={allRows} />
        <FlyTo spot={selected} />
        <Resize dep={full} />
        {rows.map((h) => {
          const st = hotspotStyle(h, h.id === selectedId)
          return [
            <CircleMarker key={`g${h.id}`} center={[h.lat, h.lng]} radius={st.glow} pathOptions={{ stroke: false, fillColor: st.fill, fillOpacity: 0.18, interactive: false }} />,
            <CircleMarker key={`c${h.id}`} center={[h.lat, h.lng]} radius={st.radius} pathOptions={{ color: st.ring, weight: st.weight, fillColor: st.fill, fillOpacity: 0.85 }} eventHandlers={{ click: () => onSelect?.(h) }}>
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
            </CircleMarker>,
          ]
        })}
      </MapContainer>
    </div>
  )
  return full ? createPortal(shell, document.body) : shell
}
