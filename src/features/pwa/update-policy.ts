/**
 * سياسة تأجيل التحديث — تمنع أن يبقى مستخدم على نسخة قديمة إلى الأبد.
 *
 * المنطق: التحديث يظل **اختيارياً** في الوضع الطبيعي (كي لا يفقد المستخدم نموذجاً يملؤه)،
 * لكن التأجيل الدائم يترك ثغرات وإصلاحات مالية غير مطبَّقة. لذلك يصبح «مطلوباً» عند:
 *   · مرور 24 ساعة على ظهوره، أو
 *   · رفضه 3 مرات.
 * عندها: يبقى الشريط بلا زر إغلاق، ويُطبَّق تلقائياً في لحظة آمنة
 * (الصفحة مخفية والمستخدم غير نشط منذ ≥60 ثانية) فلا يُفقد إدخال جارٍ.
 *
 * دوال نقية + تخزين محلي؛ بلا اعتماد على React أو المتصفح مباشرة عند الاختبار.
 */
export interface PendingUpdateState {
  /** لحظة ظهور هذا الإصدار أول مرة (ms) */
  firstSeenAt: number
  /** عدد مرات اختيار «لاحقاً» */
  dismissals: number
}

export type UpdateUrgency = 'normal' | 'forced'

export const PWA_PENDING_KEY = 'akaram.pwa.pendingUpdate'
/** أقصى مدة يُسمح فيها بتأجيل تحديث قبل أن يصبح مطلوباً */
export const UPDATE_MAX_PENDING_MS = 24 * 60 * 60 * 1000
/** عدد مرات التأجيل قبل أن يصبح مطلوباً */
export const UPDATE_MAX_DISMISSALS = 3
/** لا نُطبّق تلقائياً إلا بعد خمول طويل — حماية لأي إدخال جارٍ */
export const UPDATE_IDLE_BEFORE_FORCE_MS = 60 * 1000

/** هل صار التحديث مطلوباً؟ (نقي — يُختبر بلا متصفح) */
export function updateUrgency(
  pending: PendingUpdateState | null,
  now: number = Date.now(),
  limits: { maxPendingMs?: number; maxDismissals?: number } = {},
): UpdateUrgency {
  if (!pending) return 'normal'
  const maxPendingMs = limits.maxPendingMs ?? UPDATE_MAX_PENDING_MS
  const maxDismissals = limits.maxDismissals ?? UPDATE_MAX_DISMISSALS
  if (pending.dismissals >= maxDismissals) return 'forced'
  if (Number.isFinite(pending.firstSeenAt) && now - pending.firstSeenAt >= maxPendingMs) return 'forced'
  return 'normal'
}

/** هل هذه لحظة آمنة للتطبيق التلقائي؟ (الصفحة مخفية والمستخدم خامل) */
export function canApplyWhileHidden(
  pending: PendingUpdateState | null,
  now: number,
  lastInteractionAt: number,
  hidden: boolean,
  limits: { maxPendingMs?: number; maxDismissals?: number; idleMs?: number } = {},
): boolean {
  if (!hidden) return false
  if (updateUrgency(pending, now, limits) !== 'forced') return false
  const idleMs = limits.idleMs ?? UPDATE_IDLE_BEFORE_FORCE_MS
  return now - lastInteractionAt >= idleMs
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // تخزين محجوب (وضع خاص/سياسة) — لا نُسقط التطبيق
  }
}

export function readPendingUpdate(): PendingUpdateState | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PWA_PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingUpdateState>
    if (typeof parsed.firstSeenAt !== 'number' || typeof parsed.dismissals !== 'number') return null
    return { firstSeenAt: parsed.firstSeenAt, dismissals: parsed.dismissals }
  } catch {
    return null
  }
}

function writePendingUpdate(value: PendingUpdateState): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PWA_PENDING_KEY, JSON.stringify(value))
  } catch {
    /* امتلاء/حجب — السياسة تبقى في الذاكرة فقط لهذه الجلسة */
  }
}

/** يُسجّل أول ظهور لتحديث (لا يُصفّر تاريخ الظهور إن كان مسجَّلاً) */
export function startPendingUpdate(now: number = Date.now()): PendingUpdateState {
  const current = readPendingUpdate()
  if (current) return current
  const fresh: PendingUpdateState = { firstSeenAt: now, dismissals: 0 }
  writePendingUpdate(fresh)
  return fresh
}

/** يزيد عدّاد التأجيل ويُعيد الحالة الجديدة */
export function recordDismissal(now: number = Date.now()): PendingUpdateState {
  const base = readPendingUpdate() ?? { firstSeenAt: now, dismissals: 0 }
  const next: PendingUpdateState = { firstSeenAt: base.firstSeenAt, dismissals: base.dismissals + 1 }
  writePendingUpdate(next)
  return next
}

/** يُصفّر بعد تطبيق التحديث (أو بعد إغلاق الشريط في وضع عادي) */
export function clearPendingUpdate(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(PWA_PENDING_KEY)
  } catch {
    /* لا شيء */
  }
}
