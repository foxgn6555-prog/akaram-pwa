/**
 * V-22 — رسالة خطأ الدخول: لا تُستبدل بـ«انتهت الجلسة».
 *
 * العيب الموثّق: خطأ كلمة المرور كان يظهر للمستخدم كـ«انتهت الجلسة — يرجى تسجيل الدخول
 * من جديد»، مع أن الجلسة لم تبدأ أصلاً. السبب: `toUserMessage` كانت تُرجع رسالة عامة
 * لكل `AuthError` بلا تمييز.
 */
import { describe, expect, it } from 'vitest'
import { toUserMessage } from '@lib/errors/error.handler'
import { AuthError } from '@lib/errors/AuthError'

const SESSION_EXPIRED = 'انتهت الجلسة — يرجى تسجيل الدخول من جديد'

describe('V-22 · toUserMessage', () => {
  it('بيانات دخول خاطئة ⇒ رسالة الخادم نفسها، لا «انتهت الجلسة»', () => {
    const message = toUserMessage(new AuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'INVALID_CREDENTIALS'))
    expect(message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة')
    expect(message).not.toBe(SESSION_EXPIRED)
  })

  it('قفل المصدر / تقييد المحاولات ⇒ رسالة الخادم', () => {
    expect(toUserMessage(new AuthError('أُوقف الدخول مؤقتاً من هذا الجهاز لمدة خمس دقائق. يمكنك التواصل مع الدعم.', 'SOURCE_LOCKED')))
      .toContain('أُوقف الدخول مؤقتاً')
    expect(toUserMessage(new AuthError('الخدمة قيّدت المحاولات مؤقتاً — انتظر قليلاً ثم أعد المحاولة', 'AUTH_THROTTLED')))
      .toContain('الخدمة قيّدت المحاولات')
  })

  it('انتهاء الجلسة الحقيقي يبقى كما هو', () => {
    expect(toUserMessage(new AuthError('الجلسة منتهية', 'SESSION_EXPIRED'))).toBe(SESSION_EXPIRED)
    expect(toUserMessage(new AuthError('فشل الدخول', 'AUTH_FAILED'))).toBe(SESSION_EXPIRED)
  })

  it('الأخطاء غير المصادقية لا تتأثر', () => {
    expect(toUserMessage(new Error('anything'))).toBe('حدث خطأ غير متوقع — حاول مرة أخرى')
  })
})
