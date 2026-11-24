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

/**
 * لوحة ألوان الأزونات — للتمييز البصري عند عرض الجميع معاً.
 *
 * الثمانية ألوان متباعدة في الدرجة كي تبقى الحدود المتجاورة متمايزة على
 * خلفية الخريطة، ومختارة لتُقرأ فوق البلاط الفاتح والمعتم معاً (تشبّع متوسط
 * لا فاتح). لا تُستخدم للطبقات (شوارع/أزقة) — لها ألوانها في الصفحة.
 */
export const ZONE_PALETTE = [
  '#1d4ed8', // أزرق داكن
  '#b45309', // كهرماني محروق
  '#0f766e', // أخضر مزرق
  '#9333ea', // بنفسجي
  '#be123c', // قرمزي
  '#0369a1', // أزرق سماوي داكن
  '#4d7c0f', // زيتوني
  '#a16207', // ذهبي غامق
] as const

/**
 * لون ثابت للزون: يعتمد على **ترتيبه في القائمة** لا على `id`.
 *
 * سبب عدم الاعتماد على `id`: لو اشتققنا اللون من تجزئة المعرّف لتغيّر لون كل
 * زون كلما ارتفعت هجرة أو أُعيد إنشاء صفّ. الترتيب مستقرّ بصرياً ويتغيّر فقط
 * عند إضافة/حذف زون — وهو حدث نادر ومقصود.
 */
export function zoneColorAt(index: number): string {
  const palette = ZONE_PALETTE
  const safe = ((index % palette.length) + palette.length) % palette.length
  return palette[safe]!
}
