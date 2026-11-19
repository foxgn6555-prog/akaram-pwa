/** سياسة تأجيل التحديث — دوال نقية، تُختبر بلا متصفح ولا React */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  PWA_PENDING_KEY, UPDATE_IDLE_BEFORE_FORCE_MS, UPDATE_MAX_DISMISSALS, UPDATE_MAX_PENDING_MS,
  canApplyWhileHidden, clearPendingUpdate, readPendingUpdate, recordDismissal, startPendingUpdate, updateUrgency,
} from '@features/pwa/update-policy'

beforeEach(() => { localStorage.clear() })

describe('updateUrgency', () => {
  it('بلا تحديث معلّق ⇒ normal', () => {
    expect(updateUrgency(null)).toBe('normal')
  })
  it('حديث الظهور وعدد تأجيلات صغير ⇒ normal', () => {
    const now = 1_000_000
    expect(updateUrgency({ firstSeenAt: now - 60_000, dismissals: 0 }, now)).toBe('normal')
  })
  it('تجاوز 24 ساعة ⇒ forced ولو لم يُؤجَّل', () => {
    const now = 10 * UPDATE_MAX_PENDING_MS
    expect(updateUrgency({ firstSeenAt: now - UPDATE_MAX_PENDING_MS, dismissals: 0 }, now)).toBe('forced')
  })
  it('ثلاثة تأجيلات ⇒ forced ولو ظهر قبل دقيقة', () => {
    const now = 1_000_000
    expect(updateUrgency({ firstSeenAt: now - 60_000, dismissals: UPDATE_MAX_DISMISSALS }, now)).toBe('forced')
  })
  it('الحدود قابلة للتخصيص (لاختبار السياسة نفسها)', () => {
    const now = 1_000
    expect(updateUrgency({ firstSeenAt: now, dismissals: 1 }, now, { maxDismissals: 2 })).toBe('normal')
    expect(updateUrgency({ firstSeenAt: now, dismissals: 2 }, now, { maxDismissals: 2 })).toBe('forced')
    expect(updateUrgency({ firstSeenAt: now, dismissals: 0 }, now + 5, { maxPendingMs: 5 })).toBe('forced')
  })
  it('تاريخ ظهور تالف (NaN) لا يُعلّق التطبيق ولا يُجبر فوراً', () => {
    expect(updateUrgency({ firstSeenAt: Number.NaN, dismissals: 0 }, 1_000_000)).toBe('normal')
  })
})

describe('canApplyWhileHidden', () => {
  const forced = { firstSeenAt: 0, dismissals: UPDATE_MAX_DISMISSALS }
  it('الصفحة ظاهرة ⇒ لا تطبيق تلقائي (لا نفقد إدخالاً جارياً)', () => {
    expect(canApplyWhileHidden(forced, 10 * 60_000, 0, false)).toBe(false)
  })
  it('مخفية لكن المستخدم نشط الآن ⇒ لا تطبيق تلقائي', () => {
    expect(canApplyWhileHidden(forced, 10 * 60_000, 10 * 60_000 - 5_000, true)).toBe(false)
  })
  it('مخفية + خمول ≥60 ثانية + تحديث مطلوب ⇒ تطبيق تلقائي', () => {
    expect(canApplyWhileHidden(forced, 10 * 60_000, 10 * 60_000 - UPDATE_IDLE_BEFORE_FORCE_MS, true)).toBe(true)
  })
  it('مخفية + خمول لكن التحديث غير مطلوب ⇒ لا تطبيق', () => {
    expect(canApplyWhileHidden({ firstSeenAt: 10 * 60_000, dismissals: 0 }, 10 * 60_000, 0, true)).toBe(false)
  })
})

describe('تخزين حالة التحديث المعلّق', () => {
  it('startPendingUpdate يحفظ أول ظهور ولا يُصفّره في الاستدعاء التالي', () => {
    const first = startPendingUpdate(5_000)
    expect(first).toEqual({ firstSeenAt: 5_000, dismissals: 0 })
    expect(startPendingUpdate(9_999).firstSeenAt).toBe(5_000)
  })
  it('recordDismissal يزيد العدّاد ويحفظ تاريخ الظهور الأصلي', () => {
    startPendingUpdate(1_000)
    expect(recordDismissal(2_000).dismissals).toBe(1)
    const second = recordDismissal(3_000)
    expect(second).toEqual({ firstSeenAt: 1_000, dismissals: 2 })
  })
  it('clearPendingUpdate يمحو الحالة', () => {
    startPendingUpdate(1_000)
    clearPendingUpdate()
    expect(readPendingUpdate()).toBeNull()
  })
  it('محتوى تالف في التخزين ⇒ null بلا انفجار', () => {
    localStorage.setItem(PWA_PENDING_KEY, '{ليس JSON')
    expect(readPendingUpdate()).toBeNull()
    localStorage.setItem(PWA_PENDING_KEY, '{"firstSeenAt":"x"}')
    expect(readPendingUpdate()).toBeNull()
  })
})
