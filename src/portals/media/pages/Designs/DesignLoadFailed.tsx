/**
 * لوحة فشل تحميل التصميم — تُعرض بدل «غير موجود» الكاذب حين يكون السبب شبكة/خادم/صلاحية.
 * ملء الشاشة فوق الشريط الجانبي (مثل المحرر)، وأزرار بارتفاع 44px للمس على الهاتف.
 */
import { createPortal } from 'react-dom'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'

export function DesignLoadFailed({
  message,
  busy,
  onRetry,
  onClose,
}: {
  message: string
  busy: boolean
  onRetry: () => void
  onClose: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-100 p-4" dir="rtl" role="alert" data-testid="design-load-failed">
      <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={34} />
        <h2 className="text-base font-black text-slate-800">تعذّر فتح التصميم</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white disabled:opacity-40"
            data-testid="design-load-retry"
          >
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-black text-slate-700 hover:bg-slate-100"
            data-testid="design-load-close"
          >
            <X size={15} />
            إغلاق
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
