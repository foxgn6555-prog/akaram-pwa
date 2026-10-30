/**
 * 00388 — تجميع شبكي سريع للنقاط بلا مكتبات: إسقاط Web Mercator إلى بكسل العالم عند مستوى التكبير،
 * ثم تجميع ما يقع في الخلية نفسها (CELL_PX). يُلغى التجميع فوق NO_CLUSTER_ZOOM أو حين تقلّ النقاط عن MIN_TOTAL.
 */
export interface ClusterInput<T> { id: string; lat: number; lng: number; item: T }
export interface Cluster<T> { key: string; lat: number; lng: number; count: number; items: T[]; bounds: [[number, number], [number, number]] }
export type ClusterResult<T> = { clusters: Cluster<T>[]; singles: ClusterInput<T>[] }

export const CLUSTER_CELL_PX = 64
export const CLUSTER_NO_CLUSTER_ZOOM = 17
export const CLUSTER_MIN_TOTAL = 40

/** إحداثيات إلى بكسل العالم (256 × 2^zoom) */
export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom)
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale }
}

export function clusterPoints<T>(points: ClusterInput<T>[], zoom: number, opts: { cellPx?: number; minTotal?: number; noClusterZoom?: number } = {}): ClusterResult<T> {
  const cell = opts.cellPx ?? CLUSTER_CELL_PX, minTotal = opts.minTotal ?? CLUSTER_MIN_TOTAL, maxZ = opts.noClusterZoom ?? CLUSTER_NO_CLUSTER_ZOOM
  if (points.length < minTotal || zoom >= maxZ) return { clusters: [], singles: points }
  const cells = new Map<string, ClusterInput<T>[]>()
  for (const p of points) {
    const { x, y } = project(p.lat, p.lng, zoom)
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
    const arr = cells.get(key); if (arr) arr.push(p); else cells.set(key, [p])
  }
  const clusters: Cluster<T>[] = [], singles: ClusterInput<T>[] = []
  for (const [key, arr] of cells) {
    if (arr.length === 1) { singles.push(arr[0]!); continue }
    let lat = 0, lng = 0, minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
    for (const p of arr) { lat += p.lat; lng += p.lng; minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng) }
    clusters.push({ key, lat: lat / arr.length, lng: lng / arr.length, count: arr.length, items: arr.map((p) => p.item), bounds: [[minLat, minLng], [maxLat, maxLng]] })
  }
  return { clusters, singles }
}

/** حجم دائرة التجميع بالبكسل بحسب العدد (28..56) */
export const clusterSizePx = (count: number): number => Math.round(Math.min(56, 28 + Math.log2(Math.max(1, count)) * 4))

/** تدرّج دائري (conic-gradient) يوضّح نِسب الحالات داخل المجموعة */
export function conicByShare(shares: Array<{ color: string; count: number }>): string {
  const total = shares.reduce((a, s) => a + s.count, 0) || 1
  let acc = 0
  const parts = shares.filter((s) => s.count > 0).map((s) => { const from = (acc / total) * 360; acc += s.count; return `${s.color} ${from.toFixed(1)}deg ${((acc / total) * 360).toFixed(1)}deg` })
  return `conic-gradient(${parts.join(', ') || '#64748b 0deg 360deg'})`
}
