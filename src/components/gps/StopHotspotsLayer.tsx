/**
 * 00362 — طبقة «بقع التوقف» على خريطة Leaflet: دائرة لكل بقعة بلون كثافتها وحجم وزنها، ورقم ترتيبها،
 * ونافذة منبثقة بالتفاصيل (المدة الإجمالية، التوقفات، الآليات الأكثر توقفاً، ساعة الذروة، آخر التوقفات).
 */
import { useEffect } from 'react'
import { CircleMarker, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { GpsStopHotspot } from '@sdk/gps-lvn.sdk'
import { useGpsStopHotspotEvents } from '@features/gps-lvn/hooks'
import {
  HOTSPOT_COLORS,
  HOTSPOT_LEVEL_LABELS,
  formatAgo,
  formatPeakHour,
  formatStopDuration,
  hotspotRadiusPx,
} from './stopHotspots'

const rankIconCache = new Map<string, L.DivIcon>()
const rankIcon = (rank: number, level: GpsStopHotspot['level']) => {
  const key = `${rank}-${level}`
  const cached = rankIconCache.get(key)
  if (cached) return cached
  const icon = L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${HOTSPOT_COLORS[level]};color:#fff;font:900 11px/22px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${rank}</div>`,
  })
  rankIconCache.set(key, icon)
  return icon
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function SpotEvents({ spot, hours }: { spot: GpsStopHotspot; hours: number }) {
  const q = useGpsStopHotspotEvents({ lat: spot.lat, lng: spot.lng }, hours)
  if (q.isLoading) return <div className="text-[10px] text-slate-500">… تحميل آخر التوقفات</div>
  const rows = (q.data ?? []).slice(0, 8)
  if (!rows.length) return null
  return (
    <div className="mt-1 max-h-32 overflow-auto border-t pt-1 text-[10px]" data-testid="hotspot-events">
      {rows.map((e) => (
        <div key={e.id} className="flex justify-between gap-2 py-0.5">
          <span className="font-bold">{e.db_number ? `DB ${e.db_number}` : e.vehicle_name ?? '—'}</span>
          <span className="text-slate-500">{time(e.started_at)}</span>
          <span className="font-black text-slate-800">{formatStopDuration(e.duration_seconds)}</span>
        </div>
      ))}
    </div>
  )
}

/** يطير إلى البقعة المختارة من القائمة الجانبية */
export function FlyToSpot({ spot }: { spot: GpsStopHotspot | null }) {
  const map = useMap()
  useEffect(() => {
    if (spot) map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
  }, [map, spot])
  return null
}

export default function StopHotspotsLayer({
  spots,
  hours,
  selectedId,
  onSelect,
}: {
  spots: GpsStopHotspot[]
  hours: number
  selectedId?: string | null
  onSelect?: (spot: GpsStopHotspot) => void
}) {
  return (
    <>
      {spots.map((spot) => {
        const color = HOTSPOT_COLORS[spot.level]
        const selected = selectedId === spot.id
        return (
          <CircleMarker
            key={spot.id}
            center={[spot.lat, spot.lng]}
            radius={hotspotRadiusPx(spot.score)}
            pathOptions={{
              color: selected ? '#0f172a' : color,
              weight: selected ? 3 : spot.active_now ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: 0.28 + 0.35 * spot.score,
              dashArray: spot.active_now ? '4 3' : undefined,
            }}
            eventHandlers={{ click: () => onSelect?.(spot) }}
          >
            <Popup maxWidth={300}>
              <div dir="rtl" className="min-w-[230px] text-[11px]" data-testid={`hotspot-popup-${spot.rank}`}>
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">بقعة #{spot.rank}</b>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: color }}>
                    {HOTSPOT_LEVEL_LABELS[spot.level]}
                    {spot.active_now ? ' · نشطة الآن' : ''}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-center">
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">إجمالي التوقف</div><div className="font-black">{formatStopDuration(spot.total_seconds)}</div></div>
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">توقفات</div><div className="font-black">{spot.stops}</div></div>
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">آليات</div><div className="font-black">{spot.vehicles}</div></div>
                </div>
                <div className="mt-1 text-slate-700">
                  متوسط التوقف {formatStopDuration(spot.avg_seconds)} · أطول توقف {formatStopDuration(spot.max_seconds)}
                  <br />
                  ساعة الذروة {formatPeakHour(spot.peak_hour)} · آخر توقف {formatAgo(spot.last_at)}
                  <br />
                  {spot.address ?? 'العنوان غير متوفر'}
                </div>
                {spot.top_vehicles.length > 0 && (
                  <div className="mt-1 border-t pt-1">
                    <div className="text-[9px] font-black text-slate-500">الأكثر توقفاً هنا</div>
                    {spot.top_vehicles.map((v, i) => (
                      <div key={`${v.vehicle_id ?? i}`} className="flex justify-between gap-2">
                        <span className="font-bold">{v.db_number ? `DB ${v.db_number}` : v.vehicle_name ?? '—'}</span>
                        <span>{v.stops} توقف · {formatStopDuration(v.total_seconds)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <SpotEvents spot={spot} hours={hours} />
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
      {spots.slice(0, 20).map((spot) => (
        <Marker
          key={`rank-${spot.id}`}
          position={[spot.lat, spot.lng]}
          icon={rankIcon(spot.rank, spot.level)}
          interactive={false}
          zIndexOffset={-100}
        />
      ))}
    </>
  )
}
