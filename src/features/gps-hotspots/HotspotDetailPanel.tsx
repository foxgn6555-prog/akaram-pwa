/**
 * 00385 — لوحة تفاصيل البقعة (يمين الخريطة على الشاشة الكبيرة، أسفلها على الهاتف):
 * الصنف/التكرار، الأرقام، الآليات مرتبة بالدقائق، الأيام، توزيع الساعات، أيام الأسبوع، أقرب عنوان (OSM)، خريطة مصغّرة، رابط Google Maps.
 */
import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer } from 'react-leaflet'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import MapTiles from '@features/map-theme/MapTiles'
import 'leaflet/dist/leaflet.css'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { reverseGeocode } from './geocode'
import { CLASS_COLOR, CLASS_LABEL, RECURRENCE_LABEL, daysByWeekday, fmtDay, fmtMinutes, googleMapsUrl, peakHours, spotPlace } from './hotspots.logic'

const n = (v: number) => v.toLocaleString('en-US')

export default function HotspotDetailPanel({ spot, onClose }: { spot: GpsHotspot; onClose: () => void }) {
  const [address, setAddress] = useState<string | null | 'loading'>('loading')
  const [theme] = useMapTheme('dark')   // 00388-د: الخريطة المصغّرة تتبع وضع خريطة النفايات
  useEffect(() => { let alive = true; setAddress('loading'); reverseGeocode(spot.lat, spot.lng).then((a) => { if (alive) setAddress(a) }); return () => { alive = false } }, [spot.lat, spot.lng])
  const hours = spot.hours?.length === 24 ? spot.hours : Array.from({ length: 24 }, () => 0)
  const maxH = Math.max(1, ...hours)
  const vehicles = [...(spot.vehicles ?? [])].sort((a, b) => b.minutes - a.minutes)
  const wd = daysByWeekday(spot.days)
  return (
    <aside className="max-h-[72vh] overflow-auto rounded-2xl border bg-white text-xs" data-testid="hotspot-panel" dir="rtl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-black text-slate-900"><span className="size-3 rounded-full" style={{ background: CLASS_COLOR[spot.dominant_class] }} />{CLASS_LABEL[spot.dominant_class]} · {RECURRENCE_LABEL[spot.recurrence]}</div>
          <div className="truncate text-[11px] text-slate-500">{spotPlace(spot)}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border px-2 py-1 text-[11px] font-black text-slate-600" data-testid="hotspot-panel-close">✕</button>
      </div>
      <div className="px-3 py-2 text-[11px] text-slate-700" data-testid="hotspot-panel-address">
        <span className="font-bold text-slate-500">أقرب عنوان: </span>{address === 'loading' ? 'يُحدَّد…' : address ?? 'غير متاح'}
        <span className="text-slate-400"> · {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}</span>
        <a href={googleMapsUrl(spot)} target="_blank" rel="noreferrer" className="mr-2 font-black text-blue-700 underline">فتح في خرائط Google</a>
      </div>
      <div className="mx-3 grid grid-cols-3 gap-1.5 text-center">
        {[['التوقفات', n(spot.stops_count)], ['الأيام', n(spot.days_count)], ['الآليات', n(spot.vehicles_count)], ['إجمالي التوقف', fmtMinutes(spot.total_minutes)], ['المتوسط', `${spot.avg_minutes} د`], ['الأقصى', `${spot.max_minutes} د`]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 p-2"><b className="block text-sm text-slate-900">{v}</b><span className="text-[10px] text-slate-500">{l}</span></div>
        ))}
      </div>
      <div className="mx-3 mt-2 flex gap-1 text-[10px] font-black text-white">
        {(['heavy', 'medium', 'light'] as const).map((c) => { const v = spot[`${c}_count`]; return <span key={c} className="rounded-lg px-2 py-1" style={{ background: CLASS_COLOR[c], opacity: v ? 1 : 0.35 }}>{CLASS_LABEL[c]} {n(v)}</span> })}
      </div>
      <div className="mx-3 mt-3 h-40 overflow-hidden rounded-xl border" data-testid="hotspot-mini-map">
        <MapContainer key={spot.id} center={[spot.lat, spot.lng]} zoom={17} className="h-full w-full" zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} attributionControl={false} style={{ height: '100%', width: '100%' }}>
          <MapTiles theme={theme} />
          <CircleMarker center={[spot.lat, spot.lng]} radius={22} pathOptions={{ stroke: false, fillColor: CLASS_COLOR[spot.dominant_class], fillOpacity: 0.25 }} />
          <CircleMarker center={[spot.lat, spot.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: CLASS_COLOR[spot.dominant_class], fillOpacity: 0.95 }} />
        </MapContainer>
      </div>
      <section className="px-3 pt-3">
        <h4 className="mb-1 font-black text-slate-800">توزيع الساعات <span className="font-normal text-slate-500">(ذروة {peakHours(hours)})</span></h4>
        <div className="flex h-16 items-end gap-px" data-testid="hotspot-hours">
          {hours.map((v, h) => <div key={h} title={`${String(h).padStart(2, '0')}:00 — ${v} توقف`} className="flex-1 rounded-t" style={{ height: `${Math.max(2, (v / maxH) * 100)}%`, background: v ? CLASS_COLOR[spot.dominant_class] : '#e2e8f0' }} />)}
        </div>
        <div className="flex justify-between text-[9px] text-slate-400"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
      </section>
      <section className="px-3 pt-3">
        <h4 className="mb-1 font-black text-slate-800">الآليات ({n(vehicles.length)})</h4>
        <ul className="divide-y rounded-xl border" data-testid="hotspot-vehicles">
          {vehicles.length === 0 && <li className="p-2 text-slate-500">—</li>}
          {vehicles.map((v) => (
            <li key={v.device} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0"><b className="block truncate text-slate-900">{v.name ?? v.device}{v.db_number ? ` · DB ${v.db_number}` : ''}</b><span className="text-[10px] text-slate-500">{v.sector ?? '—'} · {n(v.stops)} توقف</span></span>
              <b className="shrink-0 text-slate-900">{fmtMinutes(v.minutes)}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="px-3 pt-3">
        <h4 className="mb-1 font-black text-slate-800">أيام الأسبوع</h4>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px]" data-testid="hotspot-weekdays">
          {wd.map((d) => <div key={d.day} className="rounded-lg p-1" style={{ background: d.count ? `${CLASS_COLOR[spot.dominant_class]}22` : '#f8fafc' }}><b className="block text-slate-900">{n(d.count)}</b><span className="text-slate-500">{d.day.replace('ال', '')}</span></div>)}
        </div>
      </section>
      <section className="px-3 py-3">
        <h4 className="mb-1 font-black text-slate-800">الأيام ({n(spot.days?.length ?? 0)})</h4>
        <div className="flex flex-wrap gap-1" data-testid="hotspot-days">{(spot.days ?? []).map((d) => <span key={d} className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{fmtDay(d)}</span>)}</div>
        <p className="mt-2 text-[10px] text-slate-400">أول توقف: {spot.first_at ? new Date(spot.first_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false }) : '—'} · آخر توقف: {spot.last_at ? new Date(spot.last_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false }) : '—'}</p>
      </section>
    </aside>
  )
}
