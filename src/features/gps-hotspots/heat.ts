/**
 * 00387 — محرّك التوهّج الحراري لخريطة النفايات (حسابات صافية بلا DOM كي تُختبر):
 * وزن كل بقعة (0..1) من إجمالي دقائق التوقف وعدد الأيام والتكرار، نصف قطر الهالة بالأمتار، لوحة الألوان
 * (أزرق ← أخضر ← أصفر ← برتقالي ← أحمر) وتلوين خريطة الشدة الرمادية.
 */
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'

/** محطات اللوحة الحرارية: الشدة ⇒ اللون. الأطراف الشفافة تذوب في الخلفية الداكنة */
export const HEAT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#1d4ed8'],   // أزرق عميق
  [0.3, '#22c55e'],   // أخضر
  [0.55, '#facc15'],  // أصفر
  [0.78, '#f97316'],  // برتقالي
  [1.0, '#dc2626'],   // أحمر
]
export const HEAT_GRADIENT_CSS = `linear-gradient(90deg, ${HEAT_STOPS.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
/** لوحة 256 لوناً (RGBA) بالاستيفاء الخطي بين المحطات — بلا canvas */
export function buildHeatPalette(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let a = HEAT_STOPS[0]!, b = HEAT_STOPS[HEAT_STOPS.length - 1]!
    for (let k = 0; k < HEAT_STOPS.length - 1; k++) if (t >= HEAT_STOPS[k]![0] && t <= HEAT_STOPS[k + 1]![0]) { a = HEAT_STOPS[k]!; b = HEAT_STOPS[k + 1]!; break }
    const span = b[0] - a[0] || 1, f = (t - a[0]) / span
    const ca = hex(a[1]), cb = hex(b[1])
    out[i * 4] = Math.round(ca[0] + (cb[0] - ca[0]) * f)
    out[i * 4 + 1] = Math.round(ca[1] + (cb[1] - ca[1]) * f)
    out[i * 4 + 2] = Math.round(ca[2] + (cb[2] - ca[2]) * f)
    out[i * 4 + 3] = 255
  }
  return out
}

/**
 * وزن البقعة 0.15..1: لوغاريتم الدقائق الكلية (ساعة ≈ 0.45، 10 ساعات ≈ 0.8) + علاوة أيام/تكرار. الثقيل الشبه يومي يصل إلى 1.
 */
export function heatWeight(h: GpsHotspot): number {
  const minutes = Math.max(0, h.total_minutes)
  const base = Math.log10(1 + minutes) / Math.log10(1 + 3000)        // 3000 دقيقة/شهر ≈ سقف
  const days = Math.min(1, Math.max(0, h.days_count) / 20) * 0.25
  const recur = h.recurrence === 'frequent' ? 0.15 : h.recurrence === 'recurring' ? 0.07 : 0
  const cls = h.dominant_class === 'heavy' ? 0.1 : h.dominant_class === 'medium' ? 0.04 : 0
  return Math.max(0.15, Math.min(1, Math.round((base * 0.7 + days + recur + cls) * 1000) / 1000))
}

/** نصف قطر الهالة بالأمتار: 140 م للبقعة الصغيرة حتى ~420 م للأثقل (المرجع: توهّج يغطي الحيّ لا الشارع فقط) */
export function heatRadiusMeters(h: GpsHotspot): number {
  return Math.round(140 + 280 * Math.pow(heatWeight(h), 1.4))
}

/** تحويل أمتار إلى بكسل عند مستوى تكبير ودرجة عرض (Web Mercator) */
export function metersToPixels(meters: number, lat: number, zoom: number): number {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
  return meters / metersPerPixel
}

/** تلوين خريطة الشدة: قناة ألفا الرمادية ⇒ لون من اللوحة، والشفافية تتبع الشدة بمنحنى ناعم (الأطراف تذوب) */
export function colorizeHeat(pixels: Uint8ClampedArray, palette: Uint8ClampedArray, maxAlpha = 0.82): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]!
    if (a === 0) continue
    // منحنى إظهار: الشدة المتراكمة تُمدَّد كي لا تتحول المناطق الكثيفة إلى بقعة حمراء مسطّحة
    const t = Math.pow(Math.min(1, a / 255 / HEAT_SATURATION), HEAT_GAMMA)
    const pi = Math.round(t * 255) * 4
    pixels[i] = palette[pi]!
    pixels[i + 1] = palette[pi + 1]!
    pixels[i + 2] = palette[pi + 2]!
    pixels[i + 3] = Math.round(255 * maxAlpha * Math.min(1, 0.3 + t * 0.9))
  }
}

/** الشدة التي تُعدّ «أقصى» (≈ ثلاث بقع ثقيلة متراكبة أو كثافة حي كامل) ومنحنى الإظهار */
export const HEAT_SATURATION = 0.6
export const HEAT_GAMMA = 0.85
export interface HeatPoint { x: number; y: number; r: number; w: number }
/** شدة مركز البقعة: الوزن 1 ⇒ 0.53 (بقعة ثقيلة وحدها = أحمر)، الوزن 0.15 ⇒ 0.15 (أزرق/أخضر) */
export const heatCoreAlpha = (w: number): number => Math.round((0.08 + Math.max(0, Math.min(1, w)) * 0.45) * 1000) / 1000
/** يرسم نقاط الشدة الرمادية على سياق canvas (تجميعي: المتجاورة تتراكم) */
export function paintHeatPoints(ctx: CanvasRenderingContext2D, pts: HeatPoint[], width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'
  for (const p of pts) {
    if (p.x + p.r < 0 || p.y + p.r < 0 || p.x - p.r > width || p.y - p.r > height) continue
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    const core = heatCoreAlpha(p.w)
    g.addColorStop(0, `rgba(0,0,0,${core})`)
    g.addColorStop(0.3, `rgba(0,0,0,${core * 0.5})`)
    g.addColorStop(0.65, `rgba(0,0,0,${core * 0.14})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** هل تستحق البقعة أيقونة السلة (ثقيلة أو شبه يومية بآليات متعددة)؟ */
export const isLandmarkSpot = (h: GpsHotspot): boolean => h.dominant_class === 'heavy' || (h.recurrence === 'frequent' && h.vehicles_count >= 2)
