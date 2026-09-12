import { useEffect, useState } from 'react'
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Laptop,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useUiStore } from '@stores/ui.store'
import {
  useDisablePushDevice,
  useNotificationPreferences,
  usePushDevices,
  useUpdateNotificationPreferences,
} from '../hooks/useNotifications'
import {
  currentDevicePushEnabled,
  disablePush,
  enablePush,
  pushReadiness,
  pushSupport,
} from '../push.client'
export function NotificationSettingsPanel({ onClose }: { onClose: () => void }) {
  const q = useNotificationPreferences(),
    devices = usePushDevices(),
    disableDevice = useDisablePushDevice(),
    save = useUpdateNotificationPreferences(),
    toast = useUiStore((s) => s.addToast),
    [sound, setSound] = useState(true),
    [critical, setCritical] = useState(false),
    [push, setPush] = useState(false),
    [quiet, setQuiet] = useState(false),
    [from, setFrom] = useState('22:00'),
    [to, setTo] = useState('06:00'),
    [busy, setBusy] = useState(false),
    support = pushSupport(),
    readiness = pushReadiness()
  useEffect(() => {
    if (q.data) {
      setSound(q.data.sound_enabled)
      setCritical(q.data.critical_only)
      void currentDevicePushEnabled().then(setPush)
      setQuiet(Boolean(q.data.quiet_from))
      setFrom(q.data.quiet_from?.slice(0, 5) ?? '22:00')
      setTo(q.data.quiet_to?.slice(0, 5) ?? '06:00')
    }
  }, [q.data])
  const togglePush = async () => {
    setBusy(true)
    try {
      if (push) {
        await disablePush()
        setPush(false)
      } else {
        if (support.isIos && !support.standalone) throw new Error('PUSH_IOS_INSTALL_REQUIRED')
        await enablePush()
        setPush(true)
      }
      await devices.refetch()
      toast({
        type: 'success',
        message: push ? 'تم إيقاف إشعارات هذا الجهاز' : 'تم تفعيل إشعارات هذا الجهاز',
      })
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      toast({
        type: 'error',
        message:
          code === 'PUSH_IOS_INSTALL_REQUIRED'
            ? 'على iPhone: أضف التطبيق إلى الشاشة الرئيسية أولاً'
            : code === 'PUSH_PERMISSION_DENIED'
              ? 'لم يمنح المتصفح إذن الإشعارات'
              : 'تعذر تفعيل Push؛ تحقق من إعدادات الجهاز',
      })
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    save.mutate(
      {
        in_app_enabled: true,
        sound_enabled: sound,
        push_enabled: push,
        critical_only: critical,
        quiet_from: quiet ? from : null,
        quiet_to: quiet ? to : null,
      },
      {
        onSuccess: () => {
          toast({ type: 'success', message: 'حُفظت إعدادات الإشعارات' })
          onClose()
        },
      },
    )
  }
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-white" dir="rtl">
      <header className="sticky top-0 flex items-center gap-3 bg-slate-950 p-4 text-white">
        <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/20">
          <BellRing />
        </span>
        <div>
          <h2 className="font-black">إعدادات الإشعارات</h2>
          <p className="text-[11px] text-slate-300">تحكم بهذا الحساب وهذا الجهاز</p>
        </div>
        <button
          onClick={onClose}
          aria-label="إغلاق الإعدادات"
          className="mr-auto rounded-lg p-2 hover:bg-white/10"
        >
          <X />
        </button>
      </header>
      <form onSubmit={submit} className="space-y-4 p-4">
        <section className="rounded-2xl border p-4" aria-label="فحص جاهزية الإشعارات">
          <div className="flex items-center justify-between">
            <b className="text-sm">فحص جاهزية هذا الجهاز</b>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold ${readiness.every((item) => item.ready) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
            >
              {readiness.filter((item) => item.ready).length} من {readiness.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {readiness.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs">
                {item.ready ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600" />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        <Setting
          icon={sound ? <Volume2 /> : <VolumeX />}
          title="صوت التنبيه"
          text="يصدر صوتاً قصيراً عند وصول إشعار أثناء فتح التطبيق"
        >
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => setSound(e.target.checked)}
            className="size-5 accent-cyan-700"
          />
        </Setting>
        <Setting
          icon={<ShieldCheck />}
          title="الحرجة فقط"
          text="يمنع Push الاعتيادي ويُبقي الحالات الحرجة"
        >
          <input
            type="checkbox"
            checked={critical}
            onChange={(e) => setCritical(e.target.checked)}
            className="size-5 accent-cyan-700"
          />
        </Setting>
        <Setting
          icon={support.isIos ? <Smartphone /> : <Laptop />}
          title="إشعارات هذا الجهاز"
          text={
            !support.supported
              ? 'المتصفح لا يدعم Web Push'
              : support.permission === 'denied'
                ? 'الإذن محظور من إعدادات المتصفح'
                : push
                  ? 'هذا الجهاز مسجل لاستقبال Push'
                  : 'فعّل الإشعارات حتى عند إغلاق التطبيق'
          }
        >
          <button
            type="button"
            disabled={busy || !support.supported || support.permission === 'denied'}
            onClick={togglePush}
            className={`rounded-xl px-3 py-2 text-xs font-black ${push ? 'bg-rose-50 text-rose-700' : 'bg-cyan-700 text-white'} disabled:opacity-40`}
          >
            {busy ? 'جارٍ التنفيذ…' : push ? 'إيقاف' : 'تفعيل'}
          </button>
        </Setting>
        {support.isIos && !support.standalone && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            على iPhone وiPad يجب فتح زر المشاركة ثم اختيار «إضافة إلى الشاشة الرئيسية» قبل تفعيل
            Push.
          </p>
        )}
        {(devices.data?.length ?? 0) > 0 && (
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <div>
                <b className="text-sm">الأجهزة المسجلة</b>
                <p className="mt-1 text-[11px] text-slate-500">حالة التسليم والتفاعل لكل جهاز</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold">
                {devices.data?.filter((device) => device.is_active).length ?? 0} فعال
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {devices.data?.map((device) => (
                <article key={device.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b>{device.device_name ?? device.platform}</b>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {device.health === 'healthy'
                          ? 'سليم'
                          : device.health === 'degraded'
                            ? 'يواجه فشل تسليم متكرر'
                            : device.health === 'disabled'
                              ? 'متوقف'
                              : 'جهاز جديد'}
                        {' · '}
                        أُرسل {device.sent_count} · فشل {device.failed_count} · قيد الانتظار{' '}
                        {device.pending_count}
                      </p>
                    </div>
                    {device.is_active && (
                      <button
                        type="button"
                        disabled={disableDevice.isPending}
                        onClick={() => disableDevice.mutate(device.id)}
                        className="rounded-lg bg-rose-50 px-2 py-1 font-bold text-rose-700 disabled:opacity-50"
                      >
                        إيقاف
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-2xl border p-4">
          <label className="flex items-center justify-between text-sm font-black">
            فترة الهدوء
            <input
              type="checkbox"
              checked={quiet}
              onChange={(e) => setQuiet(e.target.checked)}
              className="size-5 accent-cyan-700"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            تؤجل الإشعارات الاعتيادية، بينما تمر التنبيهات الحرجة فوراً.
          </p>
          {quiet && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs">
                من
                <input
                  aria-label="بداية فترة الهدوء"
                  type="time"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-2"
                />
              </label>
              <label className="text-xs">
                إلى
                <input
                  aria-label="نهاية فترة الهدوء"
                  type="time"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border px-2"
                />
              </label>
            </div>
          )}
        </div>
        <button
          disabled={save.isPending}
          className="h-11 w-full rounded-xl bg-slate-950 font-black text-white disabled:opacity-50"
        >
          {save.isPending ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
        </button>
      </form>
    </div>
  )
}
function Setting({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 [&>svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <b className="text-sm">{title}</b>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{text}</p>
      </div>
      {children}
    </div>
  )
}
