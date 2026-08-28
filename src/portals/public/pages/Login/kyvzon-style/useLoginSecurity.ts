/**
 * ════════════════════════════════════════════════════════════════
 *  useLoginSecurity - حماية تسجيل الدخول من جهة العميل
 *  (Brute Force rate-limit + validation)
 * ════════════════════════════════════════════════════════════════
 *
 *  ملاحظة أمنية: هذه طبقة حماية إضافية على جهة العميل فقط.
 *  الحماية الحقيقية والملزمة تأتي من:
 *  1. Supabase Auth rate limiting (على مستوى الخادم)
 *  2. RLS policies المفعّلة عبر setSessionContext (AuthService)
 *  sessionStorage هنا يمكن مسحه من طرف المستخدم، ولا يُعتمد عليه
 *  كخط دفاع وحيد.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 دقائق
const ATTEMPT_KEY = 'login_attempts';
const LOCKOUT_KEY = 'login_lockout';

export interface UseLoginSecurityReturn {
  /** ثوانٍ متبقية على القفل. صفر يعني غير مقفل */
  remainingLockout: number;
  /** هل الحساب مقفل حالياً */
  isLocked: boolean;
  /** دقائق القفل المتبقية (لعرض mm:ss) */
  lockoutMinutes: number;
  /** ثواني القفل المتبقية بعد طرح الدقائق */
  lockoutSeconds: number;
  /** عدد المحاولات الفاشلة المسجّلة حالياً */
  attempts: number;
  /** عدد المحاولات المتبقية قبل القفل */
  attemptsLeft: number;
  /** يتحقق من القفل الحالي؛ يُستدعى قبل أي محاولة دخول */
  checkLockout: () => number;
  /** يسجّل محاولة فاشلة ويُفعّل القفل عند الوصول للحد الأقصى */
  recordFailedAttempt: () => void;
  /** يمسح كل المحاولات والقفل بعد نجاح الدخول */
  clearAttempts: () => void;
  /** تحقق أساسي من صحة المدخلات؛ يرجع رسالة الخطأ أو null إذا كانت صالحة */
  validate: (username: string, password: string) => string | null;
}

export function useLoginSecurity(): UseLoginSecurityReturn {
  const [remainingLockout, setRemainingLockout] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const getLockoutRemaining = useCallback((): number => {
    const lockoutTime = parseInt(sessionStorage.getItem(LOCKOUT_KEY) || '0', 10);
    if (!lockoutTime) return 0;
    const remaining = lockoutTime - Date.now();
    if (remaining <= 0) {
      sessionStorage.removeItem(LOCKOUT_KEY);
      sessionStorage.removeItem(ATTEMPT_KEY);
      return 0;
    }
    return Math.ceil(remaining / 1000);
  }, []);

  const checkLockout = useCallback((): number => {
    const remaining = getLockoutRemaining();
    setRemainingLockout(remaining);
    return remaining;
  }, [getLockoutRemaining]);

  // ─── فحص القفل عند التحميل + عدّاد تنازلي كل ثانية ───────────
  useEffect(() => {
    checkLockout();
    setAttempts(parseInt(sessionStorage.getItem(ATTEMPT_KEY) || '0', 10));

    const interval = setInterval(() => {
      const remaining = getLockoutRemaining();
      setRemainingLockout(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordFailedAttempt = useCallback(() => {
    const nextAttempts = parseInt(sessionStorage.getItem(ATTEMPT_KEY) || '0', 10) + 1;
    sessionStorage.setItem(ATTEMPT_KEY, nextAttempts.toString());
    setAttempts(nextAttempts);

    if (nextAttempts >= MAX_ATTEMPTS) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      sessionStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString());
      setRemainingLockout(LOCKOUT_DURATION_MS / 1000);
    }
  }, []);

  const clearAttempts = useCallback(() => {
    sessionStorage.removeItem(ATTEMPT_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);
    setRemainingLockout(0);
    setAttempts(0);
  }, []);

  const validate = useCallback((username: string, password: string): string | null => {
    if (!username.trim()) return 'يرجى إدخال اسم المستخدم';
    if (username.trim().length < 3) return 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
    if (!password) return 'يرجى إدخال كلمة المرور';
    if (password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    return null;
  }, []);

  const isLocked = remainingLockout > 0;
  const lockoutMinutes = Math.floor(remainingLockout / 60);
  const lockoutSeconds = remainingLockout % 60;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts);

  return {
    remainingLockout,
    isLocked,
    lockoutMinutes,
    lockoutSeconds,
    attempts,
    attemptsLeft,
    checkLockout,
    recordFailedAttempt,
    clearAttempts,
    validate,
  };
}
