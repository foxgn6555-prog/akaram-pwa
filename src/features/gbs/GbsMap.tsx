/** خريطة حاويات GBS المشتركة (غرفة العمليات + مسؤول القسم) — نقاط ملونة حسب الحالة */
import { useEffect, useState, type ReactNode } from 'react'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GbsContainer } from './types'
import { GBS_STATUS_META } from './statusMeta'

const BAGHDAD: [number, number] = [33.3152, 44.3661]

function FlyTo({ container }: { container: GbsContainer | null }) {
  const map = useMap()
  useEffect(() => {
    if (container) map.flyTo([container.latitude, container.longitude], 16, { duration: 0.6 })
  }, [container, map])
  return null
}

export interface GbsMapProps {
  containers: GbsContainer[]
  selectedId?: string | null
  onSelect?: (container: GbsContainer) => void
  renderPopupActions?: (container: GbsContainer) => ReactNode
  heightClass?: string
}

export default function GbsMap({
  containers,
  selectedId,
  onSelect,
  renderPopupActions,
  heightClass = 'h-[520px]',
}: GbsMapProps) {
  const [tileFailed, setTileFailed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const selected = containers.find((c) => c.id === selectedId) ?? null
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-slate-900 ${
        fullscreen ? 'fixed inset-0 z-[2000] rounded-none' : heightClass
      }`}
      data-testid="gbs-map"
    >
      <button
        type="button"
        data-testid="gbs-map-fullscreen"
        onClick={() => setFullscreen((v) => !v)}
        className="absolute left-3 top-3 z-[1000] rounded-xl bg-slate-950/85 px-3 py-2 text-[11px] font-black text-white"
      >
        {fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
      </button>
      <div className="absolute right-3 top-3 z-[1000] flex gap-2 rounded-2xl bg-slate-950/85 px-3 py-2 text-[10px] font-black text-white">
        {Object.entries(GBS_STATUS_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-4 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap — النقاط ما زالت ظاهرة.
        </div>
      )}
      {containers.length === 0 && (
        <div className="absolute inset-x-10 bottom-4 z-[1000] rounded-xl bg-white/95 p-3 text-center text-xs font-bold text-slate-600">
          لا توجد حاويات مطابقة — أضف حاوية أو غيّر البحث.
        </div>
      )}
      <MapContainer
        center={BAGHDAD}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileFailed(true) }}
        />
        <FlyTo container={selected} />
        {containers.map((container) => {
          const meta = GBS_STATUS_META[container.status]
          return (
            <CircleMarker
              key={container.id}
              center={[container.latitude, container.longitude]}
              radius={container.id === selectedId ? 12 : 9}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: meta.color,
                fillOpacity: 0.95,
              }}
              eventHandlers={{ click: () => onSelect?.(container) }}
            >
              <Popup>
                <div className="min-w-44 space-y-1 text-right" data-testid={`gbs-popup-${container.id}`}>
                  <p className="text-xs font-black">
                    {container.code} · {container.label}
                  </p>
                  <p className="text-[11px] font-bold" style={{ color: meta.color }}>
                    الحالة: {meta.label}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {container.latitude.toFixed(5)}, {container.longitude.toFixed(5)}
                  </p>
                  {container.notes && <p className="text-[10px] text-slate-600">{container.notes}</p>}
                  {renderPopupActions?.(container)}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
