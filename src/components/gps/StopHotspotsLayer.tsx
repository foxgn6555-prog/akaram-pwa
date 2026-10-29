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
  HOTSPOT_CLASS_COLORS,
  HOTSPOT_CLASS_HINTS,
  HOTSPOT_CLASS_LABELS,
  HOTSPOT_CLASS_RGB,
  HOTSPOT_LEVEL_LABELS,
  formatAgo,
  SUPPORT_HINT,
  hotspotClass,
  isMultiType,
  recurrenceLabel,
  recurrenceStars,
  typesSummary,
  useShowLightSpots,
  visibleHotspots,
  formatPeakHour,
  formatShare,
  formatStopDuration,
  hotspotRadiusPx,
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
.akh-multi{position:absolute;inset:4%;border-radius:9999px;border:3px dotted #0891b2;box-shadow:0 0 0 2px rgba(255,255,255,.85) inset}
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
export const heatBlobHtml = (spot: Pick<GpsStopHotspot, 'score' | 'percentile' | 'active_now' | 'rank'> & Partial<Pick<GpsStopHotspot, 'class' | 'type_count'>>, selected: boolean, style: HeatStyle = normalizeHeatStyle(null)) => {
  // 00373: اللون بحسب الصنف (طويل/تلكؤ/خفيف) لا بحسب الترتيب النسبي؛ الحجم بحسب الوزن
  const rgb = HOTSPOT_CLASS_RGB[spot.class ?? 'loiter'].join(',')
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
      // 00374: حلقة منقّطة سماوية = أكثر من نوع آلية يتوقف هنا
      (isMultiType(spot) ? '<div class="akh-multi"></div>' : '') +
      (spot.active_now ? '<div class="akh-ring"></div>' : '') +
      `<div class="akh-core" style="background:rgb(${rgb})"></div></div>`,
  }
}
const heatIcon = (spot: GpsStopHotspot, selected: boolean, style: HeatStyle) => {
  const key = `${style.map_style}-${style.heat_intensity}-${style.heat_size}-${hotspotClass(spot)}-${spot.score}-${spot.active_now}-${spot.rank === 1}-${isMultiType(spot)}-${selected}`
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

/** 00374 — التكرار وتعدّد الأنواع و«تحتاج دعماً» */
export function RecurrenceAndTypes({ spot }: { spot: GpsStopHotspot }) {
  const tier = spot.recurrence_tier ?? 0
  const multi = isMultiType(spot)
  const types = typesSummary(spot)
  return (
    <div className="mt-1 border-t pt-1 text-[10px]" data-testid="hotspot-recurrence">
      <div className="flex flex-wrap items-center gap-1">
        {spot.support_rank ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 font-black text-white" title={SUPPORT_HINT}>تحتاج دعماً #{spot.support_rank}</span>
        ) : null}
        <span className={`rounded-full px-2 py-0.5 font-black ${tier ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`} title={recurrenceLabel(tier)}>
          {tier ? `${recurrenceStars(tier)} ` : ''}{recurrenceLabel(tier)}
        </span>
        {multi && <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-black text-cyan-900">{spot.type_count} أنواع آليات</span>}
      </div>
      {spot.top_recurring && tier > 0 && (
        <div className="mt-0.5 text-slate-700">
          الأكثر تكراراً: <b>{spot.top_recurring.db_number ? `DB ${spot.top_recurring.db_number}` : spot.top_recurring.vehicle_name ?? '—'}</b> — {spot.top_recurring.stops} توقف في {spot.top_recurring.days} {spot.top_recurring.days === 1 ? 'يوم' : 'أيام'}
        </div>
      )}
      {types && <div className="mt-0.5 text-slate-700">الأنواع: {types}</div>}
      {typeof spot.days_active === 'number' && <div className="text-slate-500">نشطة في {spot.days_active} {spot.days_active === 1 ? 'يوم' : 'أيام'} من النافذة</div>}
    </div>
  )
}

/** 00373 — توزيع المدد: كم توقفاً وكم من الزمن في كل صنف (مع «أكثر من 3 ساعات» تفصيلاً) */
export function DurationBuckets({ spot }: { spot: GpsStopHotspot }) {
  const b = spot.buckets
  if (!b) return null
  const rows: Array<{ key: keyof typeof b; label: string; color: string }> = [
    { key: 'light', label: '< 10 د', color: HOTSPOT_CLASS_COLORS.light },
    { key: 'loiter', label: '10–60 د', color: HOTSPOT_CLASS_COLORS.loiter },
    { key: 'long', label: '1–3 س', color: HOTSPOT_CLASS_COLORS.long },
    { key: 'over3h', label: '> 3 س', color: '#450a0a' },
  ]
  const total = Math.max(1, spot.total_seconds)
  return (
    <div className="mt-1 border-t pt-1" data-testid="hotspot-buckets">
      <div className="text-[9px] font-black text-slate-500">توزيع مدد التوقف</div>
      <div className="mt-0.5 flex h-2 overflow-hidden rounded-full bg-slate-100" dir="rtl" aria-hidden>
        {rows.map((r) => {
          // «1–3 س» = الطويل بدون ما فوق 3 ساعات كي لا يُحسب مرتين
          const sec = r.key === 'long' ? Math.max(0, b.long.seconds - b.over3h.seconds) : b[r.key].seconds
          return <span key={r.key} style={{ width: `${(sec / total) * 100}%`, background: r.color }} />
        })}
      </div>
      <div className="mt-0.5 grid grid-cols-4 gap-1 text-center text-[9px]">
        {rows.map((r) => {
          const stops = r.key === 'long' ? Math.max(0, b.long.stops - b.over3h.stops) : b[r.key].stops
          const sec = r.key === 'long' ? Math.max(0, b.long.seconds - b.over3h.seconds) : b[r.key].seconds
          return (
            <div key={r.key} className="rounded bg-slate-50 p-0.5">
              <div className="font-black" style={{ color: r.color }}>{r.label}</div>
              <div className="text-slate-700">{stops} توقف</div>
              <div className="text-slate-500">{formatStopDuration(sec)}</div>
            </div>
          )
        })}
      </div>
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
  const showLight = useShowLightSpots()
  const visible = visibleHotspots(spots, showLight)
  // 00364: البقع في طبقة تحت الآليات، أما النافذة المنبثقة والتلميح ففي طبقاتهما القياسية كي تظهر فوق كل شيء
  return (
    <Pane name="akaram-hotspots" style={{ zIndex: 390 }}>
      {visible.map((spot) => {
        const cls = hotspotClass(spot)
        const color = HOTSPOT_CLASS_COLORS[cls]
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
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: color }} title={HOTSPOT_CLASS_HINTS[cls]} data-testid="hotspot-class">
                    {HOTSPOT_CLASS_LABELS[cls]}
                    {spot.active_now ? ' · نشطة الآن' : ''}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-center">
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">إجمالي التوقف</div><div className="font-black">{formatStopDuration(spot.total_seconds)}</div></div>
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">توقفات</div><div className="font-black">{spot.stops}</div></div>
                  <div className="rounded-lg bg-slate-50 p-1"><div className="text-[9px] text-slate-500">آليات</div><div className="font-black">{spot.vehicles}</div></div>
                </div>
                <div className="mt-1 text-slate-700">
                  متوسط التوقف {formatStopDuration(spot.avg_seconds)} · الوسيط {formatStopDuration(spot.median_seconds ?? spot.avg_seconds)} · أطول توقف <b>{formatStopDuration(spot.max_seconds)}</b>
                  <br />
                  الكثافة النسبية: {HOTSPOT_LEVEL_LABELS[spot.level]} ·{' '}
                  ساعة الذروة {formatPeakHour(spot.peak_hour)} · آخر توقف {formatAgo(spot.last_at)}
                  <br />
                  تمثّل <b>{formatShare(spot.share)}</b> من كل زمن التوقف في النافذة
                </div>
                <RecurrenceAndTypes spot={spot} />
                <DurationBuckets spot={spot} />
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
