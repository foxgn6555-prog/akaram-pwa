/**
 * 00387 — طبقة التوهّج الحراري (canvas) فوق خريطة Leaflet: كل بقعة هالة متدرّجة تذوب مع جاراتها،
 * الشدة تتراكم حيث تتجاور البقع ثم تُلوَّن أزرق ← أخضر ← أصفر ← أحمر. تُعاد الرسمة عند التحريك/التكبير.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { buildHeatPalette, colorizeHeat, heatRadiusMeters, heatWeight, metersToPixels, paintHeatPoints, type HeatPoint } from './heat'

let paletteCache: Uint8ClampedArray | null = null

export default function HeatLayer({ rows, intensity = 1 }: { rows: GpsHotspot[]; intensity?: number }) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide waste-heat-canvas') as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.pointerEvents = 'none'
    canvas.setAttribute('data-testid', 'waste-heat-canvas')
    map.getPanes().overlayPane.appendChild(canvas)
    canvasRef.current = canvas
    const offscreen = document.createElement('canvas')

    const draw = () => {
      const size = map.getSize()
      const topLeft = map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(canvas, topLeft)
      canvas.width = size.x; canvas.height = size.y
      canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`; canvas.style.maxWidth = 'none'
      offscreen.width = size.x; offscreen.height = size.y
      const ctx = offscreen.getContext('2d', { willReadFrequently: true })
      const out = canvas.getContext('2d')
      if (!ctx || !out) return                                   // jsdom أو متصفح بلا canvas
      const zoom = map.getZoom()
      const pts: HeatPoint[] = rowsRef.current.map((h) => {
        const p = map.latLngToContainerPoint([h.lat, h.lng])
        const r = Math.max(14, metersToPixels(heatRadiusMeters(h), h.lat, zoom))
        return { x: p.x, y: p.y, r, w: Math.min(1, heatWeight(h) * intensity) }
      })
      paintHeatPoints(ctx, pts, size.x, size.y)
      if (size.x === 0 || size.y === 0) return
      const img = ctx.getImageData(0, 0, size.x, size.y)
      colorizeHeat(img.data, (paletteCache ??= buildHeatPalette()))
      out.clearRect(0, 0, size.x, size.y)
      out.putImageData(img, 0, 0)
      canvas.setAttribute('data-points', String(pts.length))
    }
    const onZoomAnim = (e: L.ZoomAnimEvent) => {
      const m = map as unknown as { _getCenterOffset: (c: L.LatLng) => L.Point; _getMapPanePos: () => L.Point }
      const scale = map.getZoomScale(e.zoom), offset = m._getCenterOffset(e.center).multiplyBy(-scale).subtract(m._getMapPanePos())
      L.DomUtil.setTransform(canvas, offset, scale)
    }
    map.on('moveend zoomend resize viewreset', draw)
    if (L.Browser.any3d) map.on('zoomanim', onZoomAnim)
    draw()
    const mapRef = map as L.Map & { __wasteHeatDraw?: () => void }
    mapRef.__wasteHeatDraw = draw
    return () => {
      map.off('moveend zoomend resize viewreset', draw)
      map.off('zoomanim', onZoomAnim)
      canvas.remove()
      delete mapRef.__wasteHeatDraw
    }
  }, [map, intensity])

  // إعادة الرسم عند تغيّر البقع (الفلاتر) دون إعادة إنشاء اللوحة
  useEffect(() => { (map as L.Map & { __wasteHeatDraw?: () => void }).__wasteHeatDraw?.() }, [map, rows])
  return null
}
