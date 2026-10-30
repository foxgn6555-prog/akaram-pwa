/**
 * خريطة البث المباشر (00287) — غرفة العمليات.
 * 00388-ب: كل شخص = نقطة متوهّجة بلون قسمه (نبض حي، حلقة حمراء خارج الزون، باهتة عند الانقطاع، حرف النوع م/ت)
 * + وضع نهاري/ليلي موحّد (map-theme). زونات Polygon في overlayPane + علامات DivIcon في markerPane + ملء الشاشة عبر portal.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Polygon, Popup, useMap } from 'react-leaflet'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import MapTiles, { MapThemeToggle, useInjectMapThemeStyle } from '@features/map-theme/MapTiles'
import { MAP_UI } from '@features/map-theme/map-theme'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LiveMapRow, LiveZoneRow } from '@sdk/live-tracking.sdk'
import { LIVE_KIND_LABEL, liveMarkerStyle, minutesAgoLabel, sectorColor, timeHM, zoneOf, zoneStatusLabel } from './live-map.logic'

const BAGHDAD: [number, number] = [33.3152, 44.3661]

function FlyTo({ row }: { row: LiveMapRow | null }) {
  const map = useMap()
  useEffect(() => { if (row) map.flyTo([row.latitude, row.longitude], 16, { duration: 0.6 }) }, [row, map])
  return null
}

const LIVE_CSS_ID = 'live-map-style'
const LIVE_CSS = `
.live-dot { position: relative; width: 100%; height: 100%; }
.live-dot__pulse { position: absolute; inset: -7px; border-radius: 9999px; border: 2px solid var(--c); opacity: 0; animation: live-pulse 2s ease-out infinite; }
.live-dot__core { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 9999px; background: var(--c); border: 2.5px solid var(--ring); color: #fff; font: 900 var(--fs) / 1 system-ui, sans-serif; box-shadow: 0 1px 5px rgba(0,0,0,.5); }
.live-dot--stale { opacity: .45; } .live-dot--stale .live-dot__pulse { animation: none; }
.live-dot--selected .live-dot__core { outline: 3px solid #22d3ee; outline-offset: 1px; }
.akaram-map-dark .live-dot__core { box-shadow: 0 0 10px 2px var(--c), 0 0 2px rgba(0,0,0,.8); }
.akaram-map-dark .live-dot--out .live-dot__core { box-shadow: 0 0 10px 2px var(--c), 0 0 0 4px rgba(220,38,38,.35); }
@keyframes live-pulse { 0% { transform: scale(.6); opacity: .9; } 100% { transform: scale(1.7); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .live-dot__pulse { animation: none; opacity: .35; } }
`
function useInjectLiveStyle() {
  useEffect(() => {
    if (document.getElementById(LIVE_CSS_ID)) return
    const el = document.createElement('style'); el.id = LIVE_CSS_ID; el.textContent = LIVE_CSS; document.head.appendChild(el)
  }, [])
}
export function personIcon(row: LiveMapRow, selected: boolean): L.DivIcon {
  const st = liveMarkerStyle(row)
  const size = selected ? 24 : 18
  const glyph = row.kind === 'manager' ? 'م' : 'ت'
  const out = row.in_zone === false
  return L.divIcon({
    className: '',
    html: `<div data-testid="live-marker-${row.user_id}" data-kind="${row.kind}" data-sector="${row.sectors?.[0] ?? ''}" class="live-dot${row.stale ? ' live-dot--stale' : ''}${out ? ' live-dot--out' : ''}${selected ? ' live-dot--selected' : ''}" style="--c:${st.fill};--ring:${st.ring};--fs:${Math.round(size * 0.5)}px;width:${size}px;height:${size}px"><span class="live-dot__pulse"></span><span class="live-dot__core">${glyph}</span></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 2],
  })
}

export interface LiveMapProps {
  rows: LiveMapRow[]
  zones: LiveZoneRow[]
  selectedId?: string | null
  onSelect?: (row: LiveMapRow) => void
  heightClass?: string
}

export default function LiveMap({ rows, zones, selectedId, onSelect, heightClass = 'h-full' }: LiveMapProps) {
  useInjectMapThemeStyle(); useInjectLiveStyle()
  const [theme, , toggleTheme] = useMapTheme('light')
  const ui = MAP_UI[theme]
  const [tileFailed, setTileFailed] = useState(false)
  const [full, setFull] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const selected = rows.find((r) => r.user_id === selectedId) ?? null
  // وسيلة الإيضاح: الأقسام الظاهرة الآن بألوانها
  const sectorLegend = useMemo(() => {
    const m = new Map<number, string>()
    for (const z of zones) if (z.sector_id != null && z.area_name) m.set(z.sector_id, z.area_name)
    for (const r of rows) for (const sid of r.sectors ?? []) if (!m.has(sid)) m.set(sid, r.area_names || `قسم ${sid}`)
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [rows, zones])

  const shell = (
    <div className={full ? `fixed inset-0 z-[2200] ${ui.container}` : `relative isolate z-0 overflow-hidden rounded-3xl border ${ui.container} ${heightClass}`} data-testid="live-map" data-map-theme={theme}>
      <div className={`absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border p-2 shadow-xl ${ui.panel}`}>
        <MapThemeToggle theme={theme} onToggle={toggleTheme} testId="live-map-theme" />
        <button type="button" aria-pressed={showZones} data-testid="live-toggle-zones" onClick={() => setShowZones((v) => !v)}
          className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${showZones ? 'bg-violet-700 text-white' : ui.chip}`}>
          ▧ الزونات ({zones.length})
        </button>
        <button type="button" aria-pressed={full} data-testid="live-map-fullscreen" onClick={() => setFull((v) => !v)}
          className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-slate-800">
          {full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}
        </button>
      </div>
      <div className={`absolute left-3 top-3 z-[1000] grid gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black ${ui.legend}`} data-testid="live-map-legend">
        <div className="flex flex-wrap gap-2">
          {sectorLegend.map(([sid, name]) => <span key={sid} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: sectorColor(sid) ?? '#64748b', boxShadow: theme === 'dark' ? `0 0 6px ${sectorColor(sid)}` : undefined }} />{name}</span>)}
          {sectorLegend.length === 0 && <span className="opacity-70">اللون = القسم</span>}
        </div>
        <div className="flex flex-wrap gap-2 opacity-80">
          <span className="flex items-center gap-1"><span className="grid size-3 place-items-center rounded-full bg-slate-500 text-[7px] text-white">م</span>مسؤول قسم</span>
          <span className="flex items-center gap-1"><span className="grid size-3 place-items-center rounded-full bg-slate-500 text-[7px] text-white">ت</span>متعهد</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-red-600 bg-slate-400" />خارج الزون</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400 opacity-50" />منقطع</span>
        </div>
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-4 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية الخريطة — المواقع ما زالت ظاهرة.
        </div>
      )}
      {rows.length === 0 && (
        <div data-testid="live-map-empty" className={`absolute inset-x-10 bottom-4 z-[1000] rounded-xl border p-3 text-center text-xs font-bold ${ui.legend}`}>
          لا يوجد بث مباشر الآن — تظهر المواقع عندما يفتح مسؤول القسم أو المتعهد التطبيق أثناء شفته.
        </div>
      )}
      <MapContainer center={BAGHDAD} zoom={11} className="h-full w-full" scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <MapTiles theme={theme} onFailed={setTileFailed} />
        <FlyTo row={selected} />
        {showZones && zones.map((zone) => (
          <Polygon key={zone.id} positions={zone.polygon.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: zone.color || '#7c3aed', fillOpacity: 0.08, weight: 2 }}>
            <Popup>
              <b>{zone.name}</b>{zone.area_name ? ` — ${zone.area_name}` : ''}
              <br />مسؤول القسم: {zone.manager_names || '—'}
              <br />المتعهد: {zone.contractor_name || '—'}
            </Popup>
          </Polygon>
        ))}
        {rows.map((row) => {
          const st = liveMarkerStyle(row)
          const zone = zoneOf(zones, row)
          return (
            <Marker key={row.user_id} position={[row.latitude, row.longitude]} icon={personIcon(row, row.user_id === selectedId)}
              zIndexOffset={row.user_id === selectedId ? 1000 : 0} eventHandlers={{ click: () => onSelect?.(row) }}>
              <Popup>
                <div dir="rtl" className="min-w-[180px] text-right text-xs">
                  <b className="text-sm">{row.full_name}</b>
                  <div className="text-[11px] text-slate-600">{LIVE_KIND_LABEL[row.kind]} · {row.area_names || '—'}</div>
                  <div className="mt-1 font-black" style={{ color: row.in_zone === false ? '#dc2626' : row.in_zone ? '#047857' : '#64748b' }}>{zoneStatusLabel(row.in_zone)}{zone ? ` (${zone.name})` : ''}</div>
                  <div>آخر تحديث: {timeHM(row.last_seen_at)} · {minutesAgoLabel(row.last_seen_at)}{row.stale ? ' · منقطع' : ''}</div>
                  <div>الشفت: {row.shift_name || '—'} {timeHM(row.shift_start)}–{timeHM(row.shift_end)}</div>
                  <div>بدأ البث: {timeHM(row.started_at)} · النقاط: {row.point_count} · خارج الزون: {row.out_of_zone_count}</div>
                  {row.accuracy_m != null && <div>الدقة: ±{Math.round(row.accuracy_m)} م</div>}
                  <span className="sr-only">{st.label}</span>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
  return full ? createPortal(shell, document.body) : shell
}
