/**
 * 00362 — صفحة «بقع التوقف» المستقلة (النائب/المدير المفوض: قراءة فقط؛ تعمل أيضاً لغرفة العمليات).
 * خريطة + لوحة الترتيب؛ تتحدّث تلقائياً كل دقيقة.
 */
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsStopHotspot } from '@sdk/gps-lvn.sdk'
import { useGpsStopHotspotSettings, useGpsStopHotspots } from '@features/gps-lvn/hooks'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import StopHotspotsLayer, { FlyToSpot } from './StopHotspotsLayer'
import StopHotspotsPanel from './StopHotspotsPanel'
import StopHotspotSettingsDialog from './StopHotspotSettingsDialog'
import { clampHotspotWindow, formatStopDuration } from './stopHotspots'

const HOURS_KEY = 'stop-hotspots:hours'
export const readHotspotHours = () => {
  const v = Number(sessionStorage.getItem(HOURS_KEY))
  return [24, 72, 168].includes(v) ? v : 24
}

function FitOnce({ spots }: { spots: GpsStopHotspot[] }) {
  const map = useMap()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (done || !spots.length) return
    map.fitBounds(spots.map((s) => [s.lat, s.lng] as [number, number]), { padding: [40, 40], maxZoom: 15 })
    setDone(true)
  }, [map, spots, done])
  return null
}

export default function StopHotspotsPage({ testId = 'stop-hotspots-page' }: { testId?: string }) {
  const [hours, setHoursState] = useState(readHotspotHours)
  const setHours = (h: number) => {
    sessionStorage.setItem(HOURS_KEY, String(h))
    setHoursState(h)
  }
  const [selected, setSelected] = useState<GpsStopHotspot | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const q = useGpsStopHotspots(hours)
  const settings = useGpsStopHotspotSettings()
  const canEdit = settings.data?.can_edit ?? false
  useEffect(() => {
    if (q.data && hours !== clampHotspotWindow(hours, q.data.meta.max_days)) setHours(clampHotspotWindow(hours, q.data.meta.max_days))
  }, [q.data, hours])
  const top = q.data?.spots[0]
  const stats = useMemo(
    () => [
      { label: 'بقع', value: String(q.data?.spots.length ?? 0) },
      { label: 'توقفات', value: String(q.data?.totals.stops ?? 0) },
      { label: 'إجمالي التوقف', value: formatStopDuration(q.data?.totals.total_seconds ?? 0) },
      { label: 'أكبر بقعة', value: top ? formatStopDuration(top.total_seconds) : '—' },
    ],
    [q.data, top],
  )
  return (
    <div className="space-y-3" data-testid={testId} dir="rtl">
      <ExecPageHeader
        icon="map-pin"
        title="بقع التوقف"
        subtitle="أين تتوقف الآليات أكثر؟ تجميع تلقائي لتوقفات كل أجهزة GPS طوال اليوم، مرتّبة بإجمالي زمن التوقف — تتحدّث كل دقيقة"
        stats={stats}
      />
      <div className="relative overflow-hidden rounded-2xl border">
        <div className="absolute left-3 top-3 z-[1000]">
          <StopHotspotsPanel
            data={q.data}
            loading={q.isLoading}
            hours={hours}
            onHours={setHours}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            canEdit={canEdit}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        {q.isError && (
          <div className="absolute inset-x-16 bottom-3 z-[1000] rounded-xl bg-rose-50 p-2 text-center text-xs font-bold text-rose-900">تعذر تحميل بقع التوقف — أعد المحاولة.</div>
        )}
        <MapContainer center={[33.3152, 44.3661]} zoom={11} className="h-[72vh] min-h-[480px] w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <StopHotspotsLayer spots={q.data?.spots ?? []} hours={hours} selectedId={selected?.id ?? null} onSelect={setSelected} />
          <FitOnce spots={q.data?.spots ?? []} />
          <FlyToSpot spot={selected} />
        </MapContainer>
      </div>
      {settingsOpen && settings.data && <StopHotspotSettingsDialog settings={settings.data} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
