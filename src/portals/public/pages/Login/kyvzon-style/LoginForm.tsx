/**
 * LoginForm — الحقول + تنبيه القفل + رسائل الخطأ/النجاح
 * مُكيَّف من Kyvzon: نفس البنية البصرية بألوان الأكرام
 * لا يعرف شيئاً عن Supabase — يستقبل كل شيء عبر props
 */
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'

interface LoginFormProps {
  email: string
  password: string
  showPass: boolean
  loading: boolean
  isLocked: boolean
  error: string
  success: string
  lockoutMinutes: number
  lockoutSeconds: number
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onToggleShowPass: () => void
  onSubmit: (e: React.FormEvent) => void
}

export default function LoginForm({
  email, password, showPass, loading, isLocked,
  error, success, lockoutMinutes, lockoutSeconds,
  onEmailChange, onPasswordChange, onToggleShowPass, onSubmit,
}: LoginFormProps) {
  const lockoutLabel = `${lockoutMinutes > 0 ? `${lockoutMinutes}:` : ''}${String(lockoutSeconds).padStart(2, '0')}`

  const inputClasses = `w-full h-12 rounded-xl bg-white/5 border text-white placeholder-white/40 ps-11 pe-11 text-sm outline-none login-input ${
    isLocked ? 'border-orange-400/30 opacity-60' : 'border-white/15 focus:border-[#4db8e8]'
  }`

  return (
    <>
      {/* تنبيه القفل */}
      {isLocked && (
        <div className="mb-4 bg-orange-500/15 border border-orange-400/30 rounded-2xl px-4 py-3 flex items-start gap-3 backdrop-blur-sm">
          <AlertCircle size={18} className="text-orange-300 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-100">
            <p className="font-semibold">الحساب مؤمَّن مؤقتاً</p>
            <p className="mt-0.5">
              انتظر <span className="font-mono font-bold">{lockoutLabel}</span> ثانية قبل المحاولة مجدداً
            </p>
          </div>
        </div>
      )}

      {/* رسالة خطأ */}
      {error && !isLocked && (
        <div className="mb-4 bg-red-500/15 border border-red-400/30 rounded-2xl px-4 py-3 flex items-start gap-3 backdrop-blur-sm">
          <AlertCircle size={18} className="text-red-300 shrink-0 mt-0.5" />
          <p role="alert" data-testid="login-error" className="text-sm text-red-100">{error}</p>
        </div>
      )}

      {/* رسالة نجاح */}
      {success && (
        <div className="mb-4 bg-emerald-500/15 border border-emerald-400/30 rounded-2xl px-4 py-3 flex items-start gap-3 backdrop-blur-sm">
          <CheckCircle2 size={18} className="text-emerald-300 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-100">{success}</p>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* البريد الإلكتروني */}
        <div>
          <label htmlFor="kv-email" className="block text-xs font-semibold text-white/60 mb-1.5">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <input
              id="kv-email"
              data-testid="login-email"
              type="email"
              dir="ltr"
              autoComplete="username"
              disabled={isLocked}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="name@akram.iq"
              className={inputClasses}
            />
          </div>
        </div>

        {/* كلمة المرور */}
        <div>
          <label htmlFor="kv-pass" className="block text-xs font-semibold text-white/60 mb-1.5">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="kv-pass"
              data-testid="login-password"
              type={showPass ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              disabled={isLocked}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              className={inputClasses}
            />
            <button
              type="button"
              onClick={onToggleShowPass}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* زر الدخول */}
        <button
          type="submit"
          data-testid="login-submit"
          disabled={loading || isLocked}
          className="login-shimmer-btn relative w-full h-12 rounded-xl bg-gradient-to-r from-[#005f8d] to-[#0f7cb0] text-white font-bold text-sm
                     hover:from-[#006fa3] hover:to-[#118fd1] transition-all shadow-lg shadow-[#005f8d]/30
                     disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden
                     flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              جارٍ التحقق…
            </>
          ) : (
            <>
              تسجيل الدخول
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </>
  )
}
