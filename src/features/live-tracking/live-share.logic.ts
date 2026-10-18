/**
 * منطق مشاركة الموقع المباشر (00286) — نقي وقابل للاختبار:
 *   · لا تتبع خلفي: النبضة تُرسل والتطبيق مفتوح فقط، كل N دقيقة (من إعدادات IT)، وعند العودة إلى التطبيق إن مرّ الفاصل.
 *   · الخادم هو الحكم: أي رفض LIVE_OUTSIDE_SHIFT/LIVE_NO_SHIFT/LIVE_NOT_ELIGIBLE يوقف المشاركة محلياً.
 *   · علم «المشاركة مفعّلة» يُحفظ محلياً ليستأنف تلقائياً عند فتح التطبيق داخل الشفت نفسه.
 */
import type { LiveDenyReason, LiveShareStatus } from '@sdk/live-tracking.sdk'

export const LIVE_SHARE_FLAG = 'live-share:enabled'
export const DENY_REASONS: LiveDenyReason[] = ['LIVE_NOT_ELIGIBLE', 'LIVE_NO_SHIFT', 'LIVE_OUTSIDE_SHIFT']

export const DENY_TEXT: Record<LiveDenyReason, { title: string; hint: string }> = {
  LIVE_NOT_ELIGIBLE: { title: 'غير متاح لحسابك', hint: 'مشاركة الموقع المباشر لمسؤولي الأقسام والمتعهدين المُسنَدين فقط.' },
  LIVE_NO_SHIFT: { title: 'لا يوجد شفت مرتبط بحسابك', hint: 'لحماية خصوصيتك لا تعمل المشاركة إلا أثناء شفتك الرسمي — راجع الموارد البشرية لربط شفتك.' },
  LIVE_OUTSIDE_SHIFT: { title: 'خارج وقت الشفت', hint: 'تعمل المشاركة أثناء شفتك فقط وتتوقف تلقائياً عند انتهائه.' },
}

/** هل الرسالة/الخطأ رفضٌ من الخادم يوجب إيقاف المشاركة؟ */
export function denyReasonOf(err: unknown): LiveDenyReason | null {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return DENY_REASONS.find((r) => msg.includes(r)) ?? null
}

/** هل حان وقت نبضة جديدة؟ (لا نبضة سابقة ⇒ نعم) */
export function shouldPingNow(lastPingAt: number | null, intervalMinutes: number, now: number): boolean {
  if (lastPingAt == null) return true
  return now - lastPingAt >= Math.max(1, intervalMinutes) * 60_000
}

/** المهلة حتى النبضة التالية (ms) — لا تتجاوز نهاية الشفت */
export function nextPingDelayMs(lastPingAt: number | null, intervalMinutes: number, shiftEnd: string | null, now: number): number {
  const base = lastPingAt == null ? 0 : Math.max(0, lastPingAt + Math.max(1, intervalMinutes) * 60_000 - now)
  if (!shiftEnd) return base
  const untilEnd = Math.max(0, new Date(shiftEnd).getTime() - now)
  return Math.min(base, untilEnd)
}

/** هل الآن داخل نافذة الشفت المعلنة من الخادم؟ */
export function withinShift(status: Pick<LiveShareStatus, 'shift_start' | 'shift_end'> | null | undefined, now: number): boolean {
  if (!status?.shift_start || !status.shift_end) return false
  return now >= new Date(status.shift_start).getTime() && now < new Date(status.shift_end).getTime()
}

/** دقائق متبقية حتى نهاية الشفت (0 إن انتهى) */
export function minutesLeft(shiftEnd: string | null | undefined, now: number): number {
  if (!shiftEnd) return 0
  return Math.max(0, Math.ceil((new Date(shiftEnd).getTime() - now) / 60_000))
}

/** نص «منذ» مختصر بالعربية بأرقام إنكليزية */
export function agoText(iso: string | null | undefined, now: number): string {
  if (!iso) return '—'
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} د`
  const h = Math.floor(m / 60)
  return `منذ ${h} س ${m % 60} د`
}

export function readFlag(storage: Pick<Storage, 'getItem'> | null): boolean {
  try { return storage?.getItem(LIVE_SHARE_FLAG) === '1' } catch { return false }
}
export function writeFlag(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, on: boolean): void {
  try { if (on) storage?.setItem(LIVE_SHARE_FLAG, '1'); else storage?.removeItem(LIVE_SHARE_FLAG) } catch { /* تخزين معطّل */ }
}

export type GeoFix = { latitude: number; longitude: number; accuracy: number | null }
/** قراءة الموقع مرة واحدة كوعد (رسائل عربية) */
export function getFix(geo: Geolocation | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!geo) { reject(new Error('المتصفح لا يدعم تحديد الموقع')); return }
    geo.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? null }),
      (e) => reject(new Error(e.code === 1 ? 'رفضت إذن الموقع — فعّله من إعدادات المتصفح' : 'تعذّر تحديد الموقع، حاول مجدداً')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
