/**
 * 00362/00363 — طبقة «بقع التوقف» على خريطة Leaflet: بقعة حرارية متوهّجة لكل موقع بلون كثافتها وحجم وزنها (بلا أرقام)،
 * ونافذة منبثقة بالتفاصيل (المدة الإجمالية، التوقفات، الآليات الأكثر توقفاً، ساعة الذروة، آخر التوقفات).
 */
import { useEffect } from 'react'
import { Marker, Pane, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { GpsStopHotspot } from '@sdk/gps-lvn.sdk'
import { useGpsStopHotspotEvents } from '@features/gps-lvn/hooks'
import {
  HOTSPOT_LEVEL_LABELS,
  formatAgo,
  formatPeakHour,
  formatShare,
  formatStopDuration,
  hotspotColor,
  hotspotRadiusPx,
  hotspotRgb,
  normalizeHeatStyle,
  type HeatStyle,
} from './stopHotspots'

/** 00363 — «بقعة حرارية»: توهّج متدرّج بلون الكثافة وحجم الوزن، نواة مركزية، نبض للبقع النشطة الآن، هالة ذهبية للأولى — بلا أرقام على الخريطة */
const HEAT_CSS = `
@keyframes akh-pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}}
@keyframes akh-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.akh-blob{position:relative;border-radius:9999px;animation:akh-breathe 3.2s ease-in-out infinite;will-change:transform}
.akh-core{position:absolute;inset:38%;border-radius:9999px;border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.08),0 2px 8px rgba(0,0,0,.35)}
.akh-ring{position:absolute;inset:18%;border-radius:9999px;border:3px solid currentColor;animation:akh-pulse 1.8s ease-out infinite}
.akh-crown{position:absolute;inset:8%;border-radius:9999px;border:2px dashed #f3d06a;box-shadow:0 0 12px rgba(243,208,106,.8)}
.akh-heat{animation:none;mix-blend-mode:multiply}
.akh-selected{outline:3px solid #0f172a;outline-offset:-3px}
.leaflet-tooltip.akh-tip{direction:rtl;font:800 11px system-ui;border-radius:12px;border:0;box-shadow:0 4px 14px rgba(0,0,0,.25);padding:6px 10px}
`
let cssInjected = false
const ensureHeatCss = () => {
  if (cssInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-akh', '1')
  el.textContent = HEAT_CSS
  document.head.appendChild(el)
  cssInjected = true
}
const heatIconCache = new Map<string, L.DivIcon>()
export const heatBlobHtml = (spot: Pick<GpsStopHotspot, 'score' | 'percentile' | 'active_now' | 'rank'>, selected: boolean, style: HeatStyle = normalizeHeatStyle(null)) => {
  const rgb = hotspotRgb(spot.percentile).join(',')
  const size = Math.round(hotspotRadiusPx(spot.score) * 2.6 * style.heat_size)
  if (style.map_style === 'heat') {
    // 00366: «حرارة فقط» — مناطق غامقة متدرّجة بلا نقطة مركزية ولا حلقات؛ الشدة تضبط عتامة المركز
    const a = style.heat_intensity
    return {
      size,
      html:
        `<div class="akh-blob akh-heat${selected ? ' akh-selected' : ''}" style="width:${size}px;height:${size}px;color:rgb(${rgb});` +
        `background:radial-gradient(circle, rgba(${rgb},${a.toFixed(2)}) 0%, rgba(${rgb},${(a * 0.6).toFixed(2)}) 35%, rgba(${rgb},${(a * 0.25).toFixed(2)}) 65%, rgba(${rgb},0) 80%)"></div>`,
    }
  }
  return {
    size,
    html:
      `<div class="akh-blob${selected ? ' akh-selected' : ''}" style="width:${size}px;height:${size}px;color:rgb(${rgb});` +
      `background:radial-gradient(circle, rgba(${rgb},.85) 0%, rgba(${rgb},.55) 28%, rgba(${rgb},.22) 58%, rgba(${rgb},0) 72%)">` +
      (spot.rank === 1 ? '<div class="akh-crown"></div>' : '') +
      (spot.active_now ? '<div class="akh-ring"></div>' : '') +
      `<div class="akh-core" style="background:rgb(${rgb})"></div></div>`,
  }
}
const heatIcon = (spot: GpsStopHotspot, selected: boolean, style: HeatStyle) => {
  const key = `${style.map_style}-${style.heat_intensity}-${style.heat_size}-${spot.percentile}-${spot.score}-${spot.active_now}-${spot.rank === 1}-${selected}`
  const cached = heatIconCache.get(key)
  if (cached) return cached
  const { size, html } = heatBlobHtml(spot, selected, style)
  const icon = L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 4], html })
  heatIconCache.set(key, icon)
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

/** 00365 — «متى تتوقف هنا؟»: 24 عموداً لساعات اليوم بوزن زمن التوقف، ساعة الذروة مظلّلة */
export function HourlyBars({ hourly, color, peak }: { hourly: number[]; color: string; peak: number | null }) {
  if (!hourly?.length) return null
  const max = Math.max(1, ...hourly)
  return (
    <div className="mt-1 border-t pt-1" data-testid="hotspot-hourly">
      <div className="flex items-center justify-between text-[9px] font-black text-slate-500">
        <span>متى تتوقف هنا؟ (ساعات اليوم)</span>
        <span>الذروة {formatPeakHour(peak)}</span>
      </div>
      <div className="mt-0.5 flex h-8 items-end gap-px" dir="ltr">
        {hourly.map((sec, h) => (
          <span
            key={h}
            title={`${String(h).padStart(2, '0')}:00 — ${formatStopDuration(sec)}`}
            className="flex-1 rounded-t-sm"
            style={{ height: `${Math.max(sec > 0 ? 8 : 2, Math.round((sec / max) * 100))}%`, background: h === peak ? color : `${color}66` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-slate-400" dir="ltr"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
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
  style,
}: {
  spots: GpsStopHotspot[]
  hours: number
  selectedId?: string | null
  onSelect?: (spot: GpsStopHotspot) => void
  /** 00366: نمط العرض من إعدادات قاعدة البيانات (meta) */
  style?: Partial<HeatStyle> | null
}) {
  useEffect(ensureHeatCss, [])
  const heat = normalizeHeatStyle(style)
  // 00364: البقع في طبقة تحت الآليات، أما النافذة المنبثقة والتلميح ففي طبقاتهما القياسية كي تظهر فوق كل شيء
  return (
    <Pane name="akaram-hotspots" style={{ zIndex: 390 }}>
      {spots.map((spot) => {
        const color = hotspotColor(spot.percentile)
        const selected = selectedId === spot.id
        return (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lng]}
            icon={heatIcon(spot, selected, heat)}
            zIndexOffset={selected ? 500 : Math.round(spot.score * 100)}
            eventHandlers={{ click: () => onSelect?.(spot) }}
          >
            <Tooltip direction="top" className="akh-tip" opacity={0.96} pane="tooltipPane">
              <span style={{ color }}>●</span> {spot.address ?? 'بقعة توقف'}
              {spot.active_now ? ' · نشطة الآن' : ''}
            </Tooltip>
            <Popup maxWidth={300} pane="popupPane">
              <div dir="rtl" className="min-w-[230px] text-[11px]" data-testid={`hotspot-popup-${spot.rank}`}>
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">{spot.address ?? 'بقعة توقف'}</b>
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
                  تمثّل <b>{formatShare(spot.share)}</b> من كل زمن التوقف في النافذة
                </div>
                <HourlyBars hourly={spot.hourly} color={color} peak={spot.peak_hour} />
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
          </Marker>
        )
      })}
    </Pane>
  )
}
