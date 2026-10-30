/**
 * خريطة حاويات GBS المشتركة (غرفة العمليات + مسؤول القسم).
 * 00388-أ: أكثر من ألف حاوية ⇒ تجميع شبكي عند التصغير (دائرة بعدّاد ونِسب الحالات)، وسلة صغيرة بلون الحالة يكبر حجمها
 * مع التقريب، ووضع نهاري/ليلي موحّد (متوهّجة في الليلي). الزونات كما هي + ملء الشاشة عبر portal.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GbsContainer, GbsZone } from './types'
import { GBS_STATUS_META, GBS_STATUS_ORDER } from './statusMeta'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import MapTiles, { MapThemeToggle, useInjectMapThemeStyle } from '@features/map-theme/MapTiles'
import { MAP_UI } from '@features/map-theme/map-theme'
import { clusterPoints, clusterSizePx, conicByShare } from '@features/map-theme/cluster'
import { parentSectorTitle } from '@sdk/sectors.sdk'

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

const GBS_CSS_ID = 'gbs-map-style'
const GBS_CSS = `
.gbs-bin { position: relative; display: grid; place-items: center; border-radius: 9999px; background: var(--c); border: 1.5px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); color: #fff; }
.gbs-bin svg { width: 62%; height: 62%; }
.gbs-bin--dot svg { display: none; }
.gbs-bin--selected { outline: 3px solid #22d3ee; outline-offset: 1px; }
.akaram-map-dark .gbs-bin { border-color: rgba(255,255,255,.85); box-shadow: 0 0 8px 2px var(--c), 0 0 2px rgba(0,0,0,.8); }
.akaram-map-dark .gbs-bin--selected { box-shadow: 0 0 0 4px rgba(34,211,238,.35), 0 0 16px 4px #22d3ee; }
.gbs-cluster { position: relative; display: grid; place-items: center; border-radius: 9999px; background: var(--g); box-shadow: 0 2px 10px rgba(0,0,0,.4); cursor: pointer; }
.gbs-cluster__inner { display: grid; place-items: center; width: 70%; height: 70%; border-radius: 9999px; background: #fff; color: #0f172a; font: 900 11px/1 system-ui, sans-serif; }
.akaram-map-dark .gbs-cluster { box-shadow: 0 0 14px 3px rgba(255,255,255,.18), 0 2px 10px rgba(0,0,0,.6); }
.akaram-map-dark .gbs-cluster__inner { background: #0f172a; color: #fff; }
`
function useInjectGbsStyle() {
  useEffect(() => {
    if (document.getElementById(GBS_CSS_ID)) return
    const el = document.createElement('style'); el.id = GBS_CSS_ID; el.textContent = GBS_CSS; document.head.appendChild(el)
  }, [])
}
const BIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>'

/** حجم علامة الحاوية بالبكسل بحسب التكبير: نقطة صغيرة عند التصغير، سلة واضحة عند التقريب */
export function containerSizePx(zoom: number): number {
  return zoom <= 12 ? 7 : zoom <= 13 ? 9 : zoom <= 14 ? 12 : zoom <= 15 ? 16 : zoom <= 16 ? 20 : 24
}
const iconCache = new Map<string, L.DivIcon>()
/**
 * علامة الحاوية كـ Marker (markerPane 600) فوق مضلعات الزونات (overlayPane 400) فلا تُغطى أبداً.
 * 00388-أ: سلة بلون الحالة يتغيّر حجمها مع التكبير (≤ 13: نقطة بلا رمز).
 */
export function containerIcon(container: GbsContainer, selected: boolean, zoom: number): L.DivIcon {
  const base = containerSizePx(zoom), size = selected ? Math.max(base, 18) : base
  const color = GBS_STATUS_META[container.status].color
  const dot = size < 12
  const key = `${container.id}|${color}|${size}|${selected ? 1 : 0}`
  let icon = iconCache.get(key)
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div data-testid="gbs-marker-${container.id}" class="gbs-bin${dot ? ' gbs-bin--dot' : ''}${selected ? ' gbs-bin--selected' : ''}" style="--c:${color};width:${size}px;height:${size}px" data-status="${container.status}" data-size="${size}">${BIN_SVG}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 2],
    })
    if (iconCache.size > 4000) iconCache.clear()
    iconCache.set(key, icon)
  }
  return icon
}
export function clusterIcon(count: number, shares: Array<{ color: string; count: number }>, key: string): L.DivIcon {
  const size = clusterSizePx(count)
  return L.divIcon({
    className: '',
    html: `<div data-testid="gbs-cluster-${key}" class="gbs-cluster" style="--g:${conicByShare(shares)};width:${size}px;height:${size}px" data-count="${count}"><span class="gbs-cluster__inner">${count.toLocaleString('en')}</span></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}
/** يتابع مستوى التكبير لإعادة التجميع وتحجيم العلامات */
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  useEffect(() => { if (typeof map?.getZoom === 'function') onZoom(map.getZoom()) }, [map, onZoom])
  return null
}
function ClusterMarker({ lat, lng, count, shares, bounds, k }: { lat: number; lng: number; count: number; shares: Array<{ color: string; count: number }>; bounds: [[number, number], [number, number]]; k: string }) {
  const map = useMap()
  const icon = useMemo(() => clusterIcon(count, shares, k), [count, shares, k])
  return <Marker position={[lat, lng]} icon={icon} zIndexOffset={500} eventHandlers={{ click: () => map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 17, duration: 0.5 }) }} />
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
  useInjectMapThemeStyle(); useInjectGbsStyle()
  const [theme, , toggleTheme] = useMapTheme('light')
  const ui = MAP_UI[theme]
  const [tileFailed, setTileFailed] = useState(false)
  const [full, setFull] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(zoom ?? 12)
  const selected = containers.find((c) => c.id === selectedId) ?? null
  // 00388-أ: تجميع شبكي عند التصغير (لا تجميع في وضع الالتقاط كي تبقى كل حاوية قابلة للمقارنة)
  const grouped = useMemo(() => clusterPoints(containers.map((c) => ({ id: c.id, lat: c.latitude, lng: c.longitude, item: c })), zoomLevel, onPick ? { minTotal: Number.POSITIVE_INFINITY } : {}), [containers, zoomLevel, onPick])
  const clusterShares = (items: GbsContainer[]) => GBS_STATUS_ORDER.map((st) => ({ color: GBS_STATUS_META[st].color, count: items.filter((c) => c.status === st).length }))

  const shell = (
    <div
      className={
        full
          ? `fixed inset-0 z-[2200] ${ui.container}`
          : `relative isolate z-0 overflow-hidden rounded-3xl border ${ui.container} ${heightClass}`
      }
      data-testid={testId}
      data-map-theme={theme}
      data-clusters={grouped.clusters.length}
    >
      <div className={`absolute right-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-2xl border p-2 shadow-xl ${ui.panel}`}>
        <MapThemeToggle theme={theme} onToggle={toggleTheme} testId="gbs-map-theme" />
        <span className={`rounded-xl px-3 py-2 text-[10px] font-black ${ui.chip}`} data-testid="gbs-map-counter">{containers.length.toLocaleString('en')} حاوية{grouped.clusters.length ? ` · ${grouped.clusters.length} مجموعة` : ''}</span>
        <button
          type="button"
          aria-pressed={showZones}
          data-testid="gbs-toggle-zones"
          onClick={() => setShowZones((v) => !v)}
          className={`rounded-xl px-3 py-2 text-[10px] font-black transition ${
            showZones ? 'bg-violet-700 text-white' : ui.chip
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
      <div className={`absolute left-3 top-3 z-[1000] flex flex-wrap gap-2 rounded-2xl border px-3 py-2 text-[10px] font-black ${ui.legend}`} data-testid="gbs-map-legend">
        {Object.entries(GBS_STATUS_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: meta.color, boxShadow: theme === 'dark' ? `0 0 6px ${meta.color}` : undefined }} />
            {meta.label}
          </span>
        ))}
        <span className="opacity-70">· الدائرة بعدد = مجموعة حاويات، اضغطها للتقريب</span>
      </div>
      {tileFailed && (
        <div className="absolute inset-x-20 bottom-4 z-[1000] rounded-xl bg-amber-50 p-2 text-center text-xs font-bold text-amber-900">
          تعذر تحميل خلفية الخريطة — الحاويات ما زالت ظاهرة.
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
        <MapTiles theme={theme} onFailed={setTileFailed} />
        <ZoomTracker onZoom={setZoomLevel} />
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
        {grouped.clusters.map((cl) => (
          <ClusterMarker key={cl.key} k={cl.key} lat={cl.lat} lng={cl.lng} count={cl.count} shares={clusterShares(cl.items)} bounds={cl.bounds} />
        ))}
        {grouped.singles.map(({ item: container }) => {
          const meta = GBS_STATUS_META[container.status]
          return (
            <Marker
              key={container.id}
              position={[container.latitude, container.longitude]}
              icon={containerIcon(container, container.id === selectedId, zoomLevel)}
              zIndexOffset={container.id === selectedId ? 1000 : 0}
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
                    {parentSectorTitle(container.parentSector)} ·{' '}
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
