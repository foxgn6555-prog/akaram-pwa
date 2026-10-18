/**
 * أذونات الجهاز (00289): الموقع والكاميرا — طبقة واحدة لكل البوابات.
 *   · تشخيص صحيح للسبب: اتصال غير آمن (http) / غير مدعوم / بانتظار الإذن / مرفوض / GPS معطّل / مهلة.
 *   · طلب الإذن صراحةً (الطلب نفسه هو ما يُظهر نافذة المتصفح) + متابعة تغيّر الحالة عبر Permissions API.
 *   · خطوات إعادة التفعيل حسب المنصة (Android Chrome / iPhone Safari / حاسوب).
 */
export type PermKind = 'geolocation' | 'camera'
export type PermState = 'granted' | 'prompt' | 'denied' | 'insecure' | 'unsupported' | 'unknown'
export type PermErrorCode = 'INSECURE' | 'UNSUPPORTED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'BUSY' | 'NOT_FOUND' | 'UNKNOWN'
export type Platform = 'android' | 'ios' | 'desktop'

export class DevicePermissionError extends Error {
  constructor(public readonly kind: PermKind, public readonly code: PermErrorCode, message: string) { super(message); this.name = 'DevicePermissionError' }
}

export const KIND_LABEL: Record<PermKind, string> = { geolocation: 'الموقع', camera: 'الكاميرا' }

export function isSecure(win: { isSecureContext?: boolean } | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return win?.isSecureContext !== false
}

export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function permMessage(kind: PermKind, code: PermErrorCode): string {
  const k = KIND_LABEL[kind]
  switch (code) {
    case 'INSECURE': return `المتصفح يمنع ${k} على رابط http غير آمن — افتح التطبيق من رابطه الرسمي (https)`
    case 'UNSUPPORTED': return `هذا المتصفح لا يدعم ${k} — استخدم Chrome أو Safari محدثاً`
    case 'DENIED': return `إذن ${k} مرفوض لهذا الموقع — فعّله بالخطوات أدناه ثم اضغط «تحقق مجدداً»`
    case 'UNAVAILABLE': return kind === 'geolocation' ? 'تعذّر تحديد الموقع — تأكد أن GPS/خدمات الموقع مفعّلة في الهاتف ثم أعد المحاولة' : 'تعذّر فتح الكاميرا — أعد المحاولة'
    case 'TIMEOUT': return 'انتهت مهلة تحديد الموقع — اخرج إلى مكان مكشوف أو فعّل الدقة العالية ثم أعد المحاولة'
    case 'BUSY': return 'الكاميرا مشغولة بتطبيق آخر — أغلقه ثم أعد المحاولة'
    case 'NOT_FOUND': return 'لم يُعثر على كاميرا في هذا الجهاز'
    default: return `تعذّر الوصول إلى ${k} — أعد المحاولة`
  }
}

/** خطوات إعادة تفعيل الإذن بعد رفضه — حسب المنصة */
export function permissionHelp(kind: PermKind, platform: Platform = detectPlatform()): string[] {
  const k = KIND_LABEL[kind]
  if (platform === 'ios') return [
    `افتح «الإعدادات» في iPhone ← Safari ← «${kind === 'geolocation' ? 'الموقع' : 'الكاميرا'}» ← اختر «اسمح».`,
    ...(kind === 'geolocation' ? ['ثم «الإعدادات» ← الخصوصية والأمان ← خدمات الموقع: مفعّلة، وSafari على «أثناء استخدام التطبيق».'] : []),
    'إن كان التطبيق مثبتاً على الشاشة الرئيسية: «الإعدادات» ← اسم التطبيق ← فعّل الإذن.',
    'ارجع إلى التطبيق واضغط «تحقق مجدداً».',
  ]
  if (platform === 'android') return [
    'اضغط رمز القفل 🔒 (أو ⓘ) بجانب عنوان الصفحة في أعلى المتصفح.',
    `اختر «الأذونات» ← «${k}» ← «السماح»، أو امسح الإعدادات ثم أعد التحميل ليُطلب الإذن مجدداً.`,
    ...(kind === 'geolocation' ? ['تأكد أن «الموقع» مفعّل من لوحة إشعارات الهاتف (GPS).'] : []),
    'إن كان التطبيق مثبتاً: إعدادات الهاتف ← التطبيقات ← اسم التطبيق ← الأذونات.',
    'ارجع إلى التطبيق واضغط «تحقق مجدداً».',
  ]
  return [
    'اضغط رمز القفل 🔒 بجانب عنوان الصفحة في شريط العنوان.',
    `اختر «${k}» ← «السماح» ثم أعد تحميل الصفحة.`,
    'ثم اضغط «تحقق مجدداً».',
  ]
}

/** حالة الإذن الحالية دون طلبه (Permissions API إن وُجدت) */
export async function queryPermissionState(kind: PermKind, nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<PermState> {
  if (!nav) return 'unsupported'
  if (!isSecure()) return 'insecure'
  if (kind === 'geolocation' && !nav.geolocation) return 'unsupported'
  if (kind === 'camera' && !nav.mediaDevices?.getUserMedia) return 'unsupported'
  try {
    const st = await nav.permissions?.query({ name: kind as PermissionName })
    return st?.state ?? 'unknown'
  } catch { return 'unknown' }
}

/** متابعة تغيّر الإذن (بعد تفعيله من إعدادات المتصفح) — تعيد دالة إلغاء */
export function watchPermission(kind: PermKind, cb: (s: PermState) => void): () => void {
  let status: PermissionStatus | null = null
  const handler = () => { if (status) cb(status.state) }
  if (typeof navigator !== 'undefined' && navigator.permissions?.query && isSecure()) {
    try {
      Promise.resolve(navigator.permissions.query({ name: kind as PermissionName })).then((st) => { if (st?.addEventListener) { status = st; st.addEventListener('change', handler) } }).catch(() => undefined)
    } catch { /* متصفح لا يدعم هذا النوع */ }
  }
  return () => { status?.removeEventListener('change', handler) }
}

export type GeoFix = { latitude: number; longitude: number; accuracy: number | null }
export function classifyGeoError(e: { code?: number; message?: string } | null | undefined): PermErrorCode {
  const msg = (e?.message ?? '').toLowerCase()
  if (msg.includes('secure origin') || msg.includes('insecure') || !isSecure()) return 'INSECURE'
  if (e?.code === 1) return 'DENIED'
  if (e?.code === 2) return 'UNAVAILABLE'
  if (e?.code === 3) return 'TIMEOUT'
  return 'UNKNOWN'
}

/** طلب الموقع مرة واحدة — هذا الطلب هو ما يُظهر نافذة إذن المتصفح. الأخطاء مصنّفة بالعربية. */
export function requestGeolocation(opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }, geo: Geolocation | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!isSecure()) { reject(new DevicePermissionError('geolocation', 'INSECURE', permMessage('geolocation', 'INSECURE'))); return }
    if (!geo) { reject(new DevicePermissionError('geolocation', 'UNSUPPORTED', permMessage('geolocation', 'UNSUPPORTED'))); return }
    geo.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? null }),
      (e) => { const code = classifyGeoError(e); reject(new DevicePermissionError('geolocation', code, permMessage('geolocation', code))) },
      opts,
    )
  })
}

export function classifyCameraError(name: string | undefined): PermErrorCode {
  if (!isSecure()) return 'INSECURE'
  switch (name) {
    case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError': return 'DENIED'
    case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError': return 'NOT_FOUND'
    case 'NotReadableError': case 'TrackStartError': case 'AbortError': return 'BUSY'
    default: return 'UNKNOWN'
  }
}

/** طلب إذن الكاميرا صراحةً (يفتح نافذة المتصفح) ثم يغلق المسار فوراً — يُستخدم من زر «السماح بالكاميرا» */
export async function requestCameraPermission(facing: 'user' | 'environment' = 'environment'): Promise<void> {
  if (!isSecure()) throw new DevicePermissionError('camera', 'INSECURE', permMessage('camera', 'INSECURE'))
  if (!navigator.mediaDevices?.getUserMedia) throw new DevicePermissionError('camera', 'UNSUPPORTED', permMessage('camera', 'UNSUPPORTED'))
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
    s.getTracks().forEach((t) => t.stop())
  } catch (e) {
    const code = classifyCameraError((e as DOMException)?.name)
    throw new DevicePermissionError('camera', code, permMessage('camera', code))
  }
}

export const permErrorCode = (e: unknown): PermErrorCode | null => (e instanceof DevicePermissionError ? e.code : null)
