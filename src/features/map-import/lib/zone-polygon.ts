/**
 * تحويل نص مضلّع الزون من `app.map_zone_polygon` إلى نقاط.
 *
 * القاعدة تُرجع **نصاً** بصيغة Overpass: «lat lon lat lon …» (مسافات، لا فواصل).
 * هذا التحويل موجود في مكان واحد حتى لا يتفرّع في صفحتين (الاستيراد والمحرّر)
 * ويختلف سلوكه — وهو الدرس المتكرر في هذه الجولة.
 */
import type { LatLng } from './geometry'

/** يُحلّل نص Overpass. يُرجع مصفوفة فارغة لنص غير صالح. */
export function parseZonePolygonText(text: string | null | undefined): LatLng[] {
  if (!text) return []
  const nums = text
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const out: LatLng[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const lat = nums[i]
    const lng = nums[i + 1]
    if (lat !== undefined && lng !== undefined) out.push([lat, lng])
  }
  return out
}

/** يحوّل نقاط القاعدة `MapPoint[]` (مصفوفة أزواج) إلى `LatLng[]` — للتحقق من نفس النوع */
export function toLatLng(path: Array<[number, number]>): LatLng[] {
  return path.map((p) => [p[0], p[1]] as LatLng)
}
