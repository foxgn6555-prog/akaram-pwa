/**
 * 00407 — لافتة «إشعارات الهاتف غير مفعّلة على هذا الجهاز».
 *
 * كانت لافتة التفعيل مدفونة داخل «إعدادات الصوت وPush» ولا يعرفها أحد، ولذلك بقيت الاشتراكات صفرًا
 * (٠ اشتراك · ٠ إرسال) رغم أن الإرسال نفسه أصبح مجدولًا كل دقيقة. هذه اللافتة تظهر في أعلى مركز
 * الإشعارات بزر تفعيل مباشر، وتختفي وحدها متى صار الجهاز مشتركًا أو كان الإذن محظورًا.
 */
import { useEffect, useState } from 'react'
import { BellRing, ShieldAlert } from 'lucide-react'
import { useUiStore } from '@stores/ui.store'
import { currentDevicePushEnabled, enablePush, pushSupport } from '../push.client'

export function PushEnableBanner() {
  const toast = useUiStore((s) => s.addToast)
  const support = pushSupport()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  /** 00407-ب: هل يوجد عامل خدمة مسجَّل؟ في وضع التطوير لا يُسجَّل أصلًا (main.tsx يسجّله في الإنتاج فقط) */
  const [worker, setWorker] = useState<'checking' | 'ready' | 'none'>('checking')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      if (!alive) return
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => alive && setWorker(regs.length > 0 ? 'ready' : 'none'))
        .catch(() => alive && setWorker('none'))
    }, 4000)
    navigator.serviceWorker?.ready
      ?.then(() => {
        if (alive) {
          clearTimeout(timer)
          setWorker('ready')
        }
      })
      .catch(() => undefined)
    currentDevicePushEnabled()
      .then((v) => {
        if (alive) setEnabled(v)
      })
      .catch(() => {
        if (alive) setEnabled(false)
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  const activate = async () => {
    setBusy(true)
    try {
      if (support.isIos && !support.standalone) throw new Error('PUSH_IOS_INSTALL_REQUIRED')
      await enablePush()
      setEnabled(true)
      toast({ type: 'success', message: 'تم تفعيل إشعارات الهاتف على هذا الجهاز' })
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      toast({
        type: 'error',
        message:
          code === 'PUSH_IOS_INSTALL_REQUIRED'
            ? 'على iPhone: أضف التطبيق إلى الشاشة الرئيسية أولاً، ثم فعّل الإشعارات'
            : code === 'PUSH_PERMISSION_DENIED'
              ? 'لم يمنح المتصفح إذن الإشعارات — اسمح به من إعدادات الموقع'
              : code === 'PUSH_WORKER_NOT_READY'
                ? 'لم يكتمل تسجيل التطبيق للعمل دون اتصال بعد — أعد تحميل الصفحة ثم فعّل الإشعارات'
              : code === 'PUSH_PUBLIC_KEY_MISSING' || code === 'PUSH_SERVER_NOT_CONFIGURED'
                ? 'إشعارات الهاتف غير مهيّأة في هذه النسخة؛ راجع تقنية المعلومات'
                : 'تعذر تفعيل إشعارات الهاتف؛ تحقق من إعدادات الجهاز',
      })
    } finally {
      setBusy(false)
    }
  }
  // لا لافتة إن كان الجهاز مشتركًا، أو غير مدعوم، أو الإذن محظور (لا فائدة من زر)
  if (enabled !== false || !support.supported) return null
  // 00407-ب: بلا عامل خدمة (وضع التطوير) لا يصح عرض زر سيفشل حتمًا — نوضّح الحقيقة فقط
  if (worker === 'none')
    return (
      <p
        className="flex items-start gap-2 border-b bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600"
        data-testid="push-banner-no-worker"
      >
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        إشعارات الهاتف تعمل في النسخة المنشورة (HTTPS) فقط. في وضع التطوير لا يُسجَّل عامل الخدمة،
        لذا لا يمكن تفعيلها من هنا.
      </p>
    )
  if (worker === 'checking') return null
  if (support.permission === 'denied')
    return (
      <p
        className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900"
        data-testid="push-banner-denied"
      >
        <ShieldAlert size={14} className="shrink-0" />
        إشعارات الهاتف محظورة من إعدادات المتصفح لهذا الموقع. اسمح بها ثم أعد تحميل الصفحة.
      </p>
    )
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b bg-cyan-50 px-3 py-2 text-[11px] leading-5 text-cyan-950"
      data-testid="push-enable-banner"
    >
      <BellRing size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        إشعارات الهاتف <b>غير مفعّلة على هذا الجهاز</b> — لن يصلك تنبيه ما دام التطبيق مغلقًا.
      </span>
      <button
        type="button"
        onClick={activate}
        disabled={busy}
        className="rounded-lg bg-cyan-700 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50"
        data-testid="push-enable-now"
      >
        {busy ? 'جارٍ التفعيل…' : 'تفعيل الآن'}
      </button>
    </div>
  )
}
