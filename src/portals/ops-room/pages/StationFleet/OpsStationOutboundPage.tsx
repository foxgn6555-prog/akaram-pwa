/**
 * غرفة العمليات — متابعة خروج آليات المحطة التحويلية (00331)
 * لوحة حية (تحديث كل 30 ث): من خرج الآن وإلى أين، من وصل ومتى وكم استغرق، ومن خرج بلا تتبع.
 * خريطة: زونات الوجهات + آخر موقع لكل آلية في الطريق (من GPS). رابط الإشعارات /ops-room/station-outbound.
 */
import { useMemo, useState } from 'react'
import { MapContainer, Marker, Polygon, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useGpsLiveMap, useGpsMapGeofences } from '@features/gps-lvn/hooks'
import { useStationDestinations, useStationOutbound } from '@features/station-fleet/hooks'
import type { StationOutboundRow, StationOutboundStatus } from '@sdk/station-fleet.sdk'
import type { GpsMapGeofence } from '@sdk/gps-lvn.sdk'

const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const timeAr = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }) : '—')
const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
const STATUS_AR: Record<StationOutboundStatus, string> = { en_route: 'في الطريق', arrived: 'وصلت', untracked: 'بلا تتبع', legacy: 'قديم' }
const STATUS_TONE: Record<StationOutboundStatus, string> = { en_route: 'bg-sky-50 text-sky-700', arrived: 'bg-emerald-50 text-emerald-700', untracked: 'bg-amber-50 text-amber-800', legacy: 'bg-slate-100 text-slate-500' }
const DRIVER_KIND_AR: Record<StationOutboundRow['driver_kind'], string> = { employee: 'موظف', external: 'متعهد', contracted: 'متعاقد', legacy: '—' }
const zonePoint = (pt: GpsMapGeofence['polygon'][number]): [number, number] => (Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lat, pt.lng])
const vehicleIcon = (label: string) => L.divIcon({ className: '', html: `<div style="background:#0ea5e9;color:#fff;border-radius:9999px;padding:2px 8px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">${label}</div>`, iconAnchor: [20, 10] })

export default function OpsStationOutboundPage() {
  const today = todayBaghdad()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<'all' | StationOutboundStatus>('all')
  const [q, setQ] = useState('')
  const live = from === today && to === today
  const list = useStationOutbound(from, to, false, live)
  const rows = useMemo(() => list.data ?? [], [list.data])
  const filtered = useMemo(() => rows.filter((r) => (status === 'all' || r.status === status) && (!q.trim() || `${r.db_number ?? ''} ${r.driver_name} ${r.destination_name ?? ''} ${r.category_label ?? ''}`.includes(q.trim()))), [rows, status, q])
  const count = (s: StationOutboundStatus) => rows.filter((r) => r.status === s).length
  const avg = useMemo(() => { const a = rows.filter((r) => r.minutes_to_arrival !== null).map((r) => r.minutes_to_arrival as number); return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null }, [rows])

  return (
    <section dir="rtl" className="space-y-4" data-testid="ops-station-outbound-page">
      <ExecPageHeader icon="map-pin" title="متابعة خروج آليات المحطة"
        subtitle="النسافات والسكسات وناقلات الحاويات الخارجة من المحطة التحويلية: الوجهة، وقت الخروج، الوصول الآلي من GPS، والمدة. التحديث تلقائي كل 30 ثانية ليوم اليوم."
        stats={[
          { label: 'في الطريق', value: count('en_route'), tone: 'plain', testId: 'so-st-enroute' },
          { label: 'وصلت', value: count('arrived'), tone: 'green', testId: 'so-st-arrived' },
          { label: 'بلا تتبع', value: count('untracked'), tone: 'red', testId: 'so-st-untracked' },
          { label: 'متوسط المدة (د)', value: avg ?? '—', tone: 'gold', testId: 'so-st-avg' },
        ]}
        actions={<Link to="/ops-room/station-fleet" className="rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black text-white">أسطول المحطة والوجهات</Link>} />

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <label className="text-[11px] font-bold text-slate-600">من<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} data-testid="so-from" className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="text-[11px] font-bold text-slate-600">إلى<input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} data-testid="so-to" className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
        <label className="text-[11px] font-bold text-slate-600">الحالة
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="so-status" className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">الكل</option>
            {(Object.keys(STATUS_AR) as StationOutboundStatus[]).map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
          </select></label>
        <label className="min-w-[200px] flex-1 text-[11px] font-bold text-slate-600">بحث (DB، السائق، الوجهة)<input value={q} onChange={(e) => setQ(e.target.value)} data-testid="so-search" className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
        {live && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700" data-testid="so-live">● مباشر</span>}
      </div>

      {live && <OutboundMap rows={rows} />}

      {list.isLoading ? <LoadingSpinner /> : filtered.length === 0 ? <EmptyState title="لا خروجات في هذه المدة" hint="تُسجَّل الخروجات من بوابة المحطة التحويلية (السكسات/النسافات والناقلات)." /> : (
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-xs" data-testid="so-table">
            <thead><tr className="bg-slate-50 text-[11px] text-slate-500">
              <th className="p-2 text-right">الخروج</th><th className="p-2 text-right">الآلية</th><th className="p-2 text-right">السائق</th><th className="p-2 text-right">الوجهة</th><th className="p-2 text-center">الوزن</th><th className="p-2 text-right">الشفت</th><th className="p-2 text-center">الحالة</th><th className="p-2 text-right">الوصول</th><th className="p-2 text-center">المدة (د)</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-t ${r.status === 'untracked' ? 'bg-amber-50/40' : ''}`} data-testid={`so-row-${r.id}`}>
                  <td className="p-2 tabular-nums" dir="ltr">{timeAr(r.exit_time)}<span className="block text-[10px] text-slate-400">{r.log_date}</span></td>
                  <td className="p-2"><b className="tabular-nums" dir="ltr">{r.db_number ? `DB ${r.db_number}` : '—'}</b><span className="block text-[10px] text-slate-500">{r.category_label ?? '—'}</span></td>
                  <td className="p-2">{r.driver_name}<span className="block text-[10px] text-slate-400">{DRIVER_KIND_AR[r.driver_kind]}</span></td>
                  <td className="p-2 font-bold">{r.destination_name ?? '—'}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.weight_tons ?? '—'}</td>
                  <td className="p-2">{r.shift_name ?? '—'}</td>
                  <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_TONE[r.status]}`}>{STATUS_AR[r.status]}</span></td>
                  <td className="p-2 tabular-nums" dir="ltr">{timeAr(r.arrived_at)}</td>
                  <td className="p-2 text-center tabular-nums" data-testid={`so-dur-${r.id}`}>{r.minutes_to_arrival ?? (r.status === 'en_route' ? `${minutesSince(r.exit_time)}…` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function OutboundMap({ rows }: { rows: StationOutboundRow[] }) {
  const zones = useGpsMapGeofences()
  const dests = useStationDestinations(false)
  const liveMap = useGpsLiveMap()
  const enRoute = useMemo(() => rows.filter((r) => r.status === 'en_route' && r.vehicle_id), [rows])
  const destZones = useMemo(() => {
    const ids = new Set((dests.data ?? []).map((d) => d.geofence_id).filter(Boolean))
    return (zones.data ?? []).filter((z) => ids.has(z.id))
  }, [zones.data, dests.data])
  const markers = useMemo(() => enRoute.flatMap((r) => {
    const dev = (liveMap.data ?? []).find((d) => d.garage_vehicle_id === r.vehicle_id)
    return dev && Number.isFinite(dev.latitude) && Number.isFinite(dev.longitude) ? [{ r, dev }] : []
  }), [enRoute, liveMap.data])
  if (enRoute.length === 0 && destZones.length === 0) return null
  const first = markers[0]?.dev ?? null
  const firstZone = destZones[0]?.polygon?.[0]
  const center: [number, number] = first ? [first.latitude, first.longitude] : firstZone ? zonePoint(firstZone) : [33.31, 44.37]
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" data-testid="so-map">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs font-bold text-slate-700">
        <span>الخريطة: {markers.length} آلية في الطريق لها موقع · {destZones.length} زون وجهة</span>
        {enRoute.length > markers.length && <span className="text-amber-700" data-testid="so-map-missing">{enRoute.length - markers.length} في الطريق بلا موقع حديث</span>}
      </div>
      <div className="h-[340px]">
        <MapContainer center={center} zoom={11} className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          {destZones.map((z) => <Polygon key={z.id} positions={(z.polygon ?? []).map(zonePoint)} pathOptions={{ color: z.color || '#06b6d4', weight: 2, fillOpacity: 0.12 }}><Popup>{z.name}</Popup></Polygon>)}
          {markers.map(({ r, dev }) => (
            <Marker key={r.id} position={[dev.latitude, dev.longitude]} icon={vehicleIcon(`DB ${r.db_number ?? ''}`)}>
              <Popup><b>{r.category_label} DB {r.db_number}</b><br />{r.driver_name} → {r.destination_name}<br />خرجت {timeAr(r.exit_time)} · آخر موقع {timeAr(dev.fix_time)}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
