/**
 * خريطة حاويات GBS المشتركة (غرفة العمليات + مسؤول القسم).
 * نقاط ملونة أصغر حسب الحالة + زونات GPS التشغيلية (بنفس أسلوب خريطة GPS)
 * + ملء الشاشة عبر portal إلى body (يهرب من أي ancestor يكسر fixed).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GbsContainer, GbsZone } from './types'
import { GBS_STATUS_META } from './statusMeta'

const BAGHDAD: [number, number] = [33.3152, 44.3661]

function FlyTo({ container }: { container: GbsContainer | null }) {
  const map = useMap()
  useEffect(() => {
    if (container) map.flyTo([container.latitude, container.longitude], 16, { duration: 0.6 })
  }, [container, map])
  return null
}

/** وضع الالتقاط: نقرة على الخريطة تحدد إحداثيات الحاوية (حوار الإضافة/التعديل) */
function PickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) =>
      onPick(Number(event.latlng.lat.toFixed(7)), Number(event.latlng.lng.toFixed(7))),
  })
  return null
}

/**
 * نقطة الحاوية كـ Marker برموز DOM في markerPane (طبقة 600) — نفس عمارة خريطة GPS:
 * الآليات والمعالم هناك Markers فوق مضلعات الزونات (overlayPane 400) فلا تُغطى أبداً.
 * CircleMarker السابق كان SVG في طبقة المضلعات نفسها فتغطيه الزونات عند وصولها
 * المتأخر (التحميل غير المتزامن) — وهذا كان سبب «الزون يمنع الضغط على الحاوية».
 */
function containerIcon(container: GbsContainer, selected: boolean): L.DivIcon {
  const size = selected ? 16 : 12
  const color = GBS_STATUS_META[container.status].color
  return L.divIcon({
    className: '',
    html: `<div data-testid="gbs-marker-${container.id}" style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  })
}

export interface GbsMapProps {
  containers: GbsContainer[]
  zones?: GbsZone[]
  selectedId?: string | null
  onSelect?: (container: GbsContainer) => void
  renderPopupActions?: (container: GbsContainer) => ReactNode
  heightClass?: string
  /** وضع الالتقاط — عند وجوده يمكن اختيار الموقع بالنقر (خريطة حوار الإضافة/التعديل) */
  onPick?: (lat: number, lng: number) => void
  /** الإحداثيات الملتقطة حالياً — علامة مميزة + قراءة رقمية دقيقة */
  pickPoint?: { lat: number; lng: number } | null
  /** معرف اختباري خاص (خريطة الحوار تُعرف بـ gbs-pick-map) */
  testId?: string
  /** مركز ابتدائي مخصص (الافتراضي بغداد) — يُقرأ عند التركيب فقط */
  center?: [number, number]
  /** تكبير ابتدائي (الافتراضي 12) */
  zoom?: number
}

export default function GbsMap({
  containers,
  zones = [],
  selectedId,
  onSelect,
  renderPopupActions,
  heightClass = 'h-[520px]',
  onPick,
  pickPoint = null,
  testId = 'gbs-map',
  center,
  zoom,
}: GbsMapProps) {
  const [tileFailed, setTileFailed] = useState(false)
  const [full, setFull] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const selected = containers.find((c) => c.id === selectedId) ?? null

  const shell = (
    <div
      className={
        full
          ? 'fixed inset-0 z-[2200] bg-white'
          : `relative overflow-hidden rounded-3xl border bg-slate-900 ${heightClass}`
      }
      data-testid={testId}
    >
      <div className="absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border border-white/60 bg-white/95 p-2 shadow-xl backdrop-blur">
        <button
          type="button"
          aria-pressed={showZones}
          data-testid="gbs-toggle-zones"
          onClick={() => setShowZones((v) => !v)}
          className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${
            showZones ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-400'
          }`}
        >
          ▧ الزونات ({zones.length})
        </button>
        <button
          type="button"
          aria-pressed={full}
          data-testid="gbs-map-fullscreen"
          onClick={() => setFull((v) => !v)}
          className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-slate-800"
        >
          {full ? '✕ إنهاء ملء الشاشة' : '⛶ ملء الشاشة'}
        </button>
      </div>
      <div className="absolute left-3 top-3 z-[1000] flex flex-wrap gap-2 rounded-2xl bg-slate-950/85 px-3 py-2 text-[10px] font-black text-white">
        {Object.entries(GBS_STATUS_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-4 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية OpenStreetMap — النقاط ما زالت ظاهرة.
        </div>
      )}
      {containers.length === 0 && !onPick && (
        <div className="absolute inset-x-10 bottom-4 z-[1000] rounded-xl bg-white/95 p-3 text-center text-xs font-bold text-slate-600">
          لا توجد حاويات مطابقة — أضف حاوية أو غيّر البحث.
        </div>
      )}
      {onPick && (
        <div className="absolute inset-x-3 bottom-4 z-[1000] mx-auto w-fit max-w-[90%] rounded-2xl bg-slate-950/85 px-4 py-2 text-center text-[11px] font-black text-white">
          انقر على الخريطة لتحديد موقع الحاوية
          {pickPoint && (
            <span
              data-testid="gbs-pick-readout"
              className="mt-0.5 block text-[10px] font-bold text-cyan-300"
            >
              الموقع المحدد: {pickPoint.lat.toFixed(6)}, {pickPoint.lng.toFixed(6)}
            </span>
          )}
        </div>
      )}
      <MapContainer
        center={center ?? BAGHDAD}
        zoom={zoom ?? 12}
        className="h-full w-full"
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => setTileFailed(true),
            tileload: () => setTileFailed(false),
          }}
        />
        <FlyTo container={selected} />
        {onPick && <PickCapture onPick={onPick} />}
        {showZones &&
          zones.map((zone) => {
            const positions = zone.polygon.map((p) =>
              Array.isArray(p) ? p : ([p.lat, p.lng] as [number, number]),
            )
            return (
              <Polygon
                key={zone.id}
                positions={positions}
                interactive={!onPick}
                pathOptions={{ color: zone.color || '#7c3aed', fillOpacity: 0.08, weight: 2 }}
              >
                {!onPick && (
                  <Popup>
                    <b>{zone.name}</b>
                    <br />
                    {zone.source === 'lvn' ? 'منطقة مستوردة من LVN' : 'منطقة المنصة'}
                  </Popup>
                )}
              </Polygon>
            )
          })}
        {containers.map((container) => {
          const meta = GBS_STATUS_META[container.status]
          return (
            <Marker
              key={container.id}
              position={[container.latitude, container.longitude]}
              icon={containerIcon(container, container.id === selectedId)}
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
                  <p className="text-[10px] font-bold text-slate-500">
                    {container.parentSector === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'} ·{' '}
                    {container.areaName}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {container.latitude.toFixed(5)}, {container.longitude.toFixed(5)}
                  </p>
                  {container.notes && <p className="text-[10px] text-slate-600">{container.notes}</p>}
                  {renderPopupActions?.(container)}
                </div>
              </Popup>
            </Marker>
          )
        })}
        {onPick && pickPoint && (
          <CircleMarker
            center={[pickPoint.lat, pickPoint.lng]}
            radius={9}
            pathOptions={{
              color: '#ffffff',
              weight: 2.5,
              dashArray: '4 3',
              fillColor: '#0284c7',
              fillOpacity: 1,
            }}
          />
        )}
      </MapContainer>
    </div>
  )

  return full ? createPortal(shell, document.body) : shell
}
