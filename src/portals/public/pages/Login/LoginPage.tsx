/**
 * ════════════════════════════════════════════════════════════════
 * LoginPage — صفحة تسجيل الدخول (جزيرة الأكرام)
 * مبنية على قالب Kyvzon (LoginBackground + LoginForm + useLoginSecurity)
 * مكيَّف: شعار الأكرام · ألوان العلامة · Supabase Auth الحقيقي · PKCE
 * ════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ShieldCheck, Lock, Zap } from 'lucide-react'
import { useLogin } from '@features/auth/hooks/useAuth'
import { loginSchema } from '@features/auth'
import { lockStatus, recordFailure, recordSuccess } from '@features/auth/security/login-guard'
import { resolvePortal } from '@router/portal.router'
import { toUserMessage } from '@lib/errors/error.handler'
import LoginBackground from './kyvzon-style/LoginBackground'
import LoginForm from './kyvzon-style/LoginForm'
import './kyvzon-style/login.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [remainingMs, setRemainingMs] = useState(0)
  const locked = remainingMs > 0

  // فحص القفل عند الافتتاح + عد تنازلي
  useEffect(() => {
    setRemainingMs(lockStatus().remainingMs)
    const timer = window.setInterval(() => setRemainingMs(lockStatus().remainingMs), 1_000)
    return () => window.clearInterval(timer)
  }, [])

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

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // التحقق المحلي (Zod)
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة')
      return
    }

    // فحص القفل المحلي + الخادم
    const guard = lockStatus()
    if (guard.locked) {
      setError(`الحساب مقفل مؤقتاً — انتظر ${Math.ceil(guard.remainingMs / 1000)} ثانية`)
      return
    }

    setLoading(true)

    try {
      const session = await login.mutateAsync(parsed.data)
      recordSuccess()
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
      recordFailure()
      const status = lockStatus()
      if (status.locked) {
        setRemainingMs(status.remainingMs)
        setError('تم قفل الدخول مؤقتاً بسبب محاولات فاشلة متكررة')
      } else {
        setError(toUserMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  // قيم القفل (من useLoginSecurity للعرض)
  const lockoutMinutes = Math.floor(remainingMs / 60_000)
  const lockoutSeconds = Math.ceil((remainingMs % 60_000) / 1_000)

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      dir="rtl"
    >
      <LoginBackground />

      {/* البطاقة الزجاجية */}
      <div className="login-glass-card relative w-full max-w-md z-10">
        <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* الرأس — شعار جزيرة الأكرام */}
          <div className="px-8 pt-10 pb-7 text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 mb-4">
              <img
                src="/icons/logo.png"
                alt="شعار جزيرة الأكرام"
                width={96}
                height={96}
                className="w-24 h-24 object-contain drop-shadow-[0_8px_20px_rgba(0,95,141,0.6)]"
              />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">جزيرة الأكرام</h1>
            <p className="text-[#7fc0df]/80 text-sm font-medium">
              النظام الإلكتروني لإدارة شركة البلدية
            </p>
          </div>

          {/* جسم النموذج */}
          <div className="px-8 pb-9">
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
      </div>
    </div>
  )
}
