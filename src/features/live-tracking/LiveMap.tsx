/**
 * خريطة البث المباشر (00287) — غرفة العمليات.
 * نفس عمارة خريطة GBS/GPS: زونات Polygon في overlayPane + علامات DivIcon في markerPane
 * + ملء الشاشة عبر portal إلى body + لافتة عند تعذّر خلفية OSM.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LiveMapRow, LiveZoneRow } from '@sdk/live-tracking.sdk'
import { LIVE_KIND_COLOR, LIVE_KIND_LABEL, liveMarkerStyle, minutesAgoLabel, timeHM, zoneOf, zoneStatusLabel } from './live-map.logic'

const BAGHDAD: [number, number] = [33.3152, 44.3661]

function FlyTo({ row }: { row: LiveMapRow | null }) {
  const map = useMap()
  useEffect(() => { if (row) map.flyTo([row.latitude, row.longitude], 16, { duration: 0.6 }) }, [row, map])
  return null
}

function personIcon(row: LiveMapRow, selected: boolean): L.DivIcon {
  const st = liveMarkerStyle(row)
  const size = selected ? 22 : 16
  const glyph = row.kind === 'manager' ? 'م' : 'ت'
  return L.divIcon({
    className: '',
    html: `<div data-testid="live-marker-${row.user_id}" data-kind="${row.kind}" style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${st.fill};opacity:${st.opacity};border:3px solid ${st.ring};border-radius:9999px;box-shadow:0 1px 5px rgba(0,0,0,.5);color:#fff;font:900 ${Math.round(size * 0.55)}px/1 sans-serif">${glyph}</div>`,
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
  const [tileFailed, setTileFailed] = useState(false)
  const [full, setFull] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const selected = rows.find((r) => r.user_id === selectedId) ?? null

  const shell = (
    <div className={full ? 'fixed inset-0 z-[2200] bg-white' : `relative isolate z-0 overflow-hidden rounded-3xl border bg-slate-900 ${heightClass}`} data-testid="live-map">
      <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-xl backdrop-blur">
        <button type="button" aria-pressed={showZones} data-testid="live-toggle-zones" onClick={() => setShowZones((v) => !v)}
          className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${showZones ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
          ▧ الزونات ({zones.length})
        </button>
        <button type="button" aria-pressed={full} data-testid="live-map-fullscreen" onClick={() => setFull((v) => !v)}
          className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-slate-800">
          {full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}
        </button>
      </div>
      <div className="absolute left-3 top-3 z-[1000] flex flex-wrap gap-2 rounded-2xl bg-slate-950/85 px-3 py-2 text-[10px] font-black text-white">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: LIVE_KIND_COLOR.manager }} />مسؤول قسم</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: LIVE_KIND_COLOR.contractor }} />متعهد</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-red-600 bg-slate-400" />خارج الزون</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400 opacity-50" />منقطع</span>
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-4 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap — المواقع ما زالت ظاهرة.
        </div>
      )}
      {rows.length === 0 && (
        <div data-testid="live-map-empty" className="absolute inset-x-10 bottom-4 z-[1000] rounded-xl bg-white/95 p-3 text-center text-xs font-bold text-slate-600">
          لا يوجد بث مباشر الآن — تظهر المواقع عندما يفتح مسؤول القسم أو المتعهد التطبيق أثناء شفته.
        </div>
      )}
      <MapContainer center={BAGHDAD} zoom={11} className="h-full w-full" scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileFailed(true), tileload: () => setTileFailed(false) }} />
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
