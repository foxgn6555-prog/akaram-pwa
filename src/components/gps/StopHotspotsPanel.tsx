/**
 * 00362 — لوحة «بقع التوقف»: اختيار النافذة (24 س / 3 أيام / 7 أيام حسب الحد الأقصى)، الملخص،
 * قائمة البقع مرتّبة (قابلة للفرز)، وقت آخر تحديث، زر التحديث الآن والإعدادات (غرفة العمليات/IT فقط).
 */
import { useMemo, useState, useEffect } from 'react'
import type { GpsStopHotspot, GpsStopHotspotsResult } from '@sdk/gps-lvn.sdk'
import { useGpsStopPullStatus, useRefreshGpsStopHotspots } from '@features/gps-lvn/hooks'
import {
  HOTSPOT_COLORS,
  HOTSPOT_SORT_LABELS,
  formatShare,
  hotspotColor,
  type HotspotSort,
  formatAgo,
  formatPeakHour,
  formatStopDuration,
  hotspotWindows,
  sortHotspots,
} from './stopHotspots'

export default function StopHotspotsPanel({
  data,
  loading,
  hours,
  onHours,
  selectedId,
  onSelect,
  canEdit,
  onOpenSettings,
  compact = false,
  fetching = false,
}: {
  data: GpsStopHotspotsResult | undefined
  loading: boolean
  /** 00365: جلب نافذة جديدة أثناء عرض السابقة */
  fetching?: boolean
  hours: number
  onHours: (hours: number) => void
  selectedId: string | null
  onSelect: (spot: GpsStopHotspot) => void
  canEdit: boolean
  onOpenSettings?: () => void
  /** داخل الخريطة الحية: قائمة أقصر */
  compact?: boolean
}) {
  const [sort, setSort] = useState<HotspotSort>('total')
  const [expanded, setExpanded] = useState(!compact)
  const refresh = useRefreshGpsStopHotspots()
  // 00371: السحب من LVN على الخادم فقط (لا زر للموظفين) — حالة السحب للعرض
  const pullStatus = useGpsStopPullStatus()
  const maxDays = data?.meta.max_days ?? 3
  const windows = useMemo(() => hotspotWindows(maxDays), [maxDays])
  // النافذة تتبع الاحتفاظ تلقائياً (لا اختيار يدوي)
  useEffect(() => { if (data && hours !== windows[0]!.hours) onHours(windows[0]!.hours) }, [data, hours, windows, onHours])
  const spots = useMemo(() => sortHotspots(data?.spots ?? [], sort), [data, sort])
  const shown = expanded ? spots.slice(0, compact ? 10 : 50) : []
  return (
    <div dir="rtl" className="w-[290px] max-w-full rounded-2xl border border-white/60 bg-white/95 p-2 text-[11px] shadow-xl backdrop-blur" data-testid="stop-hotspots-panel">
      <div className="-m-2 mb-0 flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-l from-rose-700 via-rose-600 to-orange-500 px-3 py-2 text-white">
        <b className="text-xs">◉ بقع التوقف</b>
        {/* 00372: نافذة واحدة = مدة الاحتفاظ؛ أي بيانات أقدم تُحذف تلقائياً */}
        <span className="rounded-lg bg-white px-2 py-1 font-black text-rose-700 shadow" data-testid="hotspots-window" title="تعرض الخريطة دائماً آخر مدة الاحتفاظ كاملة">
          آخر {windows[0]!.label}
        </span>
      </div>
      {data && !data.meta.enabled && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 font-bold text-amber-900">المحرك متوقف من الإعدادات — لا تُجمع بيانات جديدة.</div>
      )}
      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        <Stat label="بقع" value={String(data?.spots.length ?? 0)} />
        <Stat label="توقفات" value={String(data?.totals.stops ?? 0)} />
        <Stat label="آليات" value={String(data?.totals.vehicles ?? 0)} />
        <Stat label="إجمالي" value={formatStopDuration(data?.totals.total_seconds ?? 0)} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[9px] text-slate-500">
        <span>
          <span style={{ color: HOTSPOT_COLORS.high }}>●</span> كثيفة <span style={{ color: HOTSPOT_COLORS.medium }}>●</span> متوسطة{' '}
          <span style={{ color: HOTSPOT_COLORS.low }}>●</span> خفيفة (ترتيب نسبي بين البقع) · نابضة = نشطة الآن · هالة ذهبية = الأولى
        </span>
        <span title={data?.meta.last_refresh_at ?? ''}>آخر حساب {formatAgo(data?.meta.last_refresh_at)}{data?.totals.excluded ? ` · مستبعد ${data.totals.excluded}` : ''}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <label className="flex items-center gap-1 text-[10px]">
          ترتيب
          <select value={sort} onChange={(e) => setSort(e.target.value as HotspotSort)} className="rounded-lg border px-1 py-0.5 text-[10px]" aria-label="ترتيب البقع">
            {(Object.keys(HOTSPOT_SORT_LABELS) as HotspotSort[]).map((k) => (
              <option key={k} value={k}>{HOTSPOT_SORT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-1">
          {compact && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded-lg bg-slate-100 px-2 py-1 font-black text-slate-700">
              {expanded ? 'إخفاء القائمة' : 'عرض القائمة'}
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
                className="rounded-lg bg-cyan-700 px-2 py-1 font-black text-white disabled:opacity-50"
                data-testid="hotspots-refresh-now"
              >
                {refresh.isPending ? '…' : '↻ الآن'}
              </button>
              {onOpenSettings && (
                <button type="button" onClick={onOpenSettings} className="rounded-lg bg-slate-900 px-2 py-1 font-black text-white" data-testid="hotspots-open-settings">
                  ⚙ الإعدادات
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[9px] text-slate-600" data-testid="hotspots-pull-status">
        <span>
          {pullStatus.data ? (
            <>
              LVN: {pullStatus.data.caught_up}/{pullStatus.data.devices} جهاز محدّث
              {pullStatus.data.full_depth !== undefined ? ` · مكتمل العمق ${pullStatus.data.full_depth}` : ''}
              {` · مُغطّى ${Math.min(pullStatus.data.covered_hours ?? 0, maxDays * 24).toLocaleString('en-US')}/${(maxDays * 24).toLocaleString('en-US')} س`}
              {pullStatus.data.pending_hours > 0 ? ` · متبقٍ ${pullStatus.data.pending_hours.toLocaleString('en-US')} س` : ''}
              {pullStatus.data.errors > 0 ? ` · أخطاء ${pullStatus.data.errors}` : ''}
              {pullStatus.data.last_pull_at ? ` · آخر سحب ${formatAgo(pullStatus.data.last_pull_at)}` : ' · لم يُسحب بعد'}
            </>
          ) : '—'}
        </span>
        <span className="font-bold text-slate-500" title="يسحب الخادم نقاط التوقف تلقائياً كل دقيقة">خادمي</span>
      </div>
      {loading && <div className="mt-2 text-center text-slate-500">… تحميل</div>}
      {!loading && fetching && <div className="mt-1 text-center text-[9px] font-bold text-cyan-800" data-testid="hotspots-fetching">⟳ جارٍ تحديث النافذة…</div>}
      {!loading && data && data.spots.length === 0 && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-center text-slate-500">لا توقفات ضمن النافذة المختارة (بعد استبعاد الزونات/المعالم المحددة).</div>
      )}
      {shown.length > 0 && (
        <ol className={`mt-2 space-y-1 overflow-auto ${compact ? 'max-h-[34vh]' : 'max-h-[60vh]'}`} data-testid="hotspots-list">
          {shown.map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                onClick={() => onSelect(spot)}
                aria-pressed={selectedId === spot.id}
                className={`flex w-full items-center gap-2 rounded-xl border p-1.5 text-right transition ${selectedId === spot.id ? 'border-slate-900 bg-slate-50' : 'border-transparent hover:bg-slate-50'}`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: hotspotColor(spot.percentile) }}>
                  {spot.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-1">
                    <b className="truncate">{spot.address ?? `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`}</b>
                    <b className="shrink-0">{formatStopDuration(spot.total_seconds)}</b>
                  </span>
                  <span className="flex justify-between gap-1 text-[9px] text-slate-500">
                    <span>{spot.stops} توقف · {spot.vehicles} آلية · {formatShare(spot.share)} · ذروة {formatPeakHour(spot.peak_hour)}</span>
                    <span>{spot.active_now ? 'نشطة الآن' : formatAgo(spot.last_at)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round(spot.percentile * 100))}%`, background: hotspotColor(spot.percentile) }} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-1">
      <div className="text-[9px] text-slate-500">{label}</div>
      <div className="font-black text-slate-900">{value}</div>
    </div>
  )
}
