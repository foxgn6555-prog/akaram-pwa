/**
 * ════════════════════════════════════════════════════════════════
 * LoginPage — صفحة تسجيل الدخول (جزيرة الأكارم)
 * مبنية على قالب Kyvzon (LoginBackground + LoginForm + useLoginSecurity)
 * مكيَّف: شعار الأكارم · ألوان العلامة · Supabase Auth الحقيقي · PKCE
 * ════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Headphones, ShieldCheck, Lock, Zap } from 'lucide-react'
import { useLogin } from '@features/auth/hooks/useAuth'
import { InstallAppButton } from '@features/pwa/InstallAppButton'
import { loginSchema } from '@features/auth'
import { lockStatus, recordSuccess, setServerLock } from '@features/auth/security/login-guard'
import { LoginGatewayError } from '@sdk/auth.sdk'
import { AuthError } from '@lib/errors/AuthError'
import { resolvePortal } from '@router/portal.router'
import { toUserMessage } from '@lib/errors/error.handler'
import LoginBackground from './kyvzon-style/LoginBackground'
import LoginForm from './kyvzon-style/LoginForm'
import './kyvzon-style/login.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()

  // V-25: عنوان التبويب يخصّ الصفحة (كان ثابتاً من index.html)
  useEffect(() => { document.title = 'جزيرة الأكارم — تسجيل الدخول' }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [remainingMs, setRemainingMs] = useState(0)
  // الجولة ٣: الحساب بلغ حد الأجهزة — نعرض الجهاز النشط وخيار الانتقال
  const [conflict, setConflict] = useState<{
    max?: number
    active?: number
    list: { ip?: string | null; user_agent?: string | null; created_at?: string | null }[]
  } | null>(null)
  const locked = remainingMs > 0

  // فحص القفل عند الافتتاح + عد تنازلي
  useEffect(() => {
    const refresh = () => setRemainingMs(lockStatus(email).remainingMs)
    refresh()
    const timer = window.setInterval(refresh, 1_000)
    return () => window.clearInterval(timer)
  }, [email])

  // مسح الخطأ تلقائياً بعد 6 ثوانٍ
  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(''), 6_000)
    return () => window.clearTimeout(timer)
  }, [error])

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value)
    setError('')
  }, [])

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value)
    setError('')
  }, [])

  const handleToggleShowPass = useCallback(() => setShowPass((v) => !v), [])

  const submit = async (values: { email: string; password: string }, switchDevice = false): Promise<void> => {
    setLoading(true)
    try {
      const session = await login.mutateAsync({ ...values, switchDevice })
      recordSuccess(values.email)
      setRemainingMs(0)
      setConflict(null)
      setSuccess('تم تسجيل الدخول بنجاح! جاري التحويل…')

      // توجيه حسب الدور
      const resolution = resolvePortal(session.roles)
      switch (resolution.type) {
        case 'single':
          window.setTimeout(() => navigate(resolution.path, { replace: true }), 600)
          break
        case 'denied':
          setError('لا توجد بوابات متاحة لحسابك — راجع الموارد البشرية')
      }
    } catch (err) {
      if (err instanceof LoginGatewayError && err.code === 'SESSION_LIMIT_REACHED') {
        setConflict({ max: err.maxSessions, active: err.activeSessions, list: err.activeList ?? [] })
      }
      if (err instanceof LoginGatewayError && err.code === 'SOURCE_LOCKED' && err.lockedUntil) {
        const status = setServerLock(err.lockedUntil, values.email)
        setRemainingMs(status.remainingMs)
      }
      setError(err instanceof AuthError ? err.message : toUserMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setConflict(null)

    // التحقق المحلي (Zod)
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة')
      return
    }

    // فحص القفل المحلي + الخادم
    const guard = lockStatus(email)
    if (guard.locked) {
      setError(`الحساب مقفل مؤقتاً — انتظر ${Math.ceil(guard.remainingMs / 1000)} ثانية`)
      return
    }

    await submit(parsed.data)
  }

  /** الانتقال: كلمة المرور تُطلب مرة أخرى في الطلب نفسه — وكل الجلسات السابقة تُنهى في الخادم */
  const handleSwitchDevice = async (): Promise<void> => {
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة')
      return
    }
    setError('')
    setSuccess('')
    await submit(parsed.data, true)
  }

  // قيم القفل (من useLoginSecurity للعرض)
  const lockoutMinutes = Math.floor(remainingMs / 60_000)
  const lockoutSeconds = Math.ceil((remainingMs % 60_000) / 1_000)

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden"
      dir="rtl"
      data-testid="login-page"
    >
      {/* الخلفية خارج منطقة التمرير: لا تتحرك مع النموذج ولا تُنشئ فجوة بيضاء. */}
      <LoginBackground />
      {/* غلاف قابل للتمرير: لوحة المفاتيح على الموبايل لا تقصّ البطاقة، والتصميم الزجاجي كما هو */}
      <div
        data-testid="login-scroll"
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain"
      >
      <div className="flex min-h-full items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] max-sm:items-start max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:pt-[calc(1.5rem+env(safe-area-inset-top))]">
      {/* البطاقة الزجاجية */}
      <div className="login-glass-card relative w-full max-w-md">
        <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* الرأس — شعار جزيرة الأكارم */}
          <div className="px-5 pt-8 pb-6 text-center sm:px-8 sm:pt-10 sm:pb-7">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-3 sm:w-24 sm:h-24 sm:mb-4">
              <img
                src="/icons/logo.png"
                alt="شعار جزيرة الأكارم"
                width={96}
                height={96}
                className="w-20 h-20 object-contain drop-shadow-[0_8px_20px_rgba(0,95,141,0.6)] sm:w-24 sm:h-24"
              />
            </div>
            <h1 className="text-xl font-black text-white mb-1 sm:text-2xl">جزيرة الأكارم</h1>
            <p className="text-[#7fc0df]/80 text-xs font-medium sm:text-sm">
              النظام الإلكتروني لإدارة شركة البلدية
            </p>
          </div>

          {/* جسم النموذج */}
          <div className="px-5 pb-7 sm:px-8 sm:pb-9">
            <p className="text-white/60 text-center text-sm mb-6">
              سجّل دخولك إلى بوابة الموظفين
            </p>

            <LoginForm
              email={email}
              password={password}
              showPass={showPass}
              loading={loading}
              isLocked={locked}
              error={error}
              success={success}
              lockoutMinutes={lockoutMinutes}
              lockoutSeconds={lockoutSeconds}
              onEmailChange={handleEmailChange}
              onPasswordChange={handlePasswordChange}
              onToggleShowPass={handleToggleShowPass}
              onSubmit={handleSubmit}
            />
            {conflict && (
              <div
                data-testid="session-conflict"
                role="alert"
                className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-start"
              >
                <p className="text-sm font-black text-amber-100">الحساب مفتوح على جهاز آخر</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-100/80">
                  الحد المسموح: {conflict.max ?? 1} جهاز · الجلسات النشطة: {conflict.active ?? 1}
                  {conflict.list[0]?.ip ? ` · آخر جهاز: ${conflict.list[0].ip}` : ''}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-amber-100/60">
                  «الانتقال» يُنهي الجلسة السابقة في الخادم فوراً ويفتح الحساب على هذا الجهاز.
                </p>
                <button
                  type="button"
                  data-testid="session-switch"
                  disabled={loading}
                  onClick={() => void handleSwitchDevice()}
                  className="mt-3 h-10 w-full rounded-xl bg-amber-500 px-4 text-sm font-black text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  إنهاء الجلسة السابقة والانتقال إلى هذا الجهاز
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              aria-label="مساعدة تسجيل الدخول والتواصل مع الدعم"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              <Headphones size={17} aria-hidden="true" />
              <span>مساعدة تسجيل الدخول والتواصل مع الدعم</span>
            </button>
          </div>
        </div>

        {/* شريط الثقة */}
        <div className="flex items-center justify-center gap-5 mt-6 text-white/50 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <Lock size={13} className="text-[#4db8e8]" />
            مشفّر
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5">
            <Zap size={13} className="text-[#4db8e8]" />
            سريع
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-[#4db8e8]" />
            موثوق
          </span>
        </div>

        {/* 00349 B: تثبيت التطبيق — يختفي حين يعمل مثبّتاً */}
        <div className="mt-4 flex justify-center">
          <InstallAppButton tone="light" />
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}
