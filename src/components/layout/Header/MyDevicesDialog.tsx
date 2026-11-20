/**
 * الجولة ٣ — «أجهزتي»: قائمة الجلسات النشطة لهذا الحساب.
 * تُقرأ من auth.sessions عبر RPC محروسة، والإنهاء حذف فعلي في الخادم.
 * لا تُعرض هنا أي بيانات حساب آخر — الدالة تخصّ المستخدم الحالي وحده.
 */
import { useEffect } from 'react'
import { Laptop, MonitorSmartphone, ShieldAlert, X } from 'lucide-react'
import { formatRelative } from '@lib/utils/date.utils'
import { describeDevice } from '@lib/utils/device.utils'
import { useCreateDeviceCode, useEndOtherSessions, useEndSession, useMySessions } from '@features/auth/hooks/useMySessions'

export function MyDevicesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useMySessions(open)
  const endOne = useEndSession()
  const endOthers = useEndOtherSessions()
  const deviceCode = useCreateDeviceCode()
  const list = data ?? []

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="إغلاق"
        data-testid="devices-backdrop"
        className="fixed inset-0 z-50 cursor-default bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="أجهزتي وجلساتي"
        data-testid="devices-dialog"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:inset-y-0 sm:bottom-auto sm:top-1/2 sm:max-h-[80vh] sm:-translate-y-1/2 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
              <MonitorSmartphone size={18} className="text-brand-600" />
              أجهزتي وجلساتي
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              الأجهزة التي عليها جلسة مفتوحة الآن. إنهاء الجلسة يُبطلها في الخادم فوراً.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-xs text-slate-400">جارٍ التحميل…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">لا جلسات مسجّلة لهذا الجهاز بعد</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100" data-testid="devices-list">
            {list.map((s) => {
              const label = describeDevice(s.user_agent)
              return (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Laptop size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      {label.device} · {label.browser}
                      {s.is_current && (
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          هذا الجهاز
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {label.os} · {s.ip ?? 'IP غير متاح'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      دخل {formatRelative(s.created_at)}
                      {s.last_active ? ` · آخر نشاط ${formatRelative(s.last_active)}` : ''}
                    </p>
                  </div>
                  {!s.is_current && (
                    <button
                      type="button"
                      data-testid={`end-session-${s.id}`}
                      disabled={endOne.isPending}
                      onClick={() => endOne.mutate(s.id)}
                      className="h-8 shrink-0 rounded-lg bg-red-50 px-2.5 text-[11px] font-bold text-red-700 disabled:opacity-40"
                    >
                      إنهاء
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 p-3" data-testid="device-code-box">
          <p className="text-[11px] font-bold text-slate-700">الدخول من جهاز جديد (الحسابات الحساسة)</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            أنشئ رمز موافقة هنا وأدخله في الجهاز الجديد. صالح ١٠ دقائق ويُستخدم مرة واحدة.
          </p>
          {deviceCode.data ? (
            <p
              data-testid="device-code-value"
              dir="ltr"
              className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-center text-xl font-black tracking-[0.4em] text-white"
            >
              {deviceCode.data.code}
            </p>
          ) : (
            <button
              type="button"
              data-testid="create-device-code"
              disabled={deviceCode.isPending}
              onClick={() => deviceCode.mutate()}
              className="mt-2 h-9 w-full rounded-xl bg-slate-900 text-xs font-black text-white disabled:opacity-40"
            >
              إنشاء رمز الموافقة
            </button>
          )}
        </div>

        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-[11px] leading-5 text-amber-900">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              إن رأيت جهازاً لا تعرفه، أنهِ جلسته فوراً وأبلغ تقنية المعلومات. مشاركة الحساب بين أكثر من شخص
              تُعرّض صاحبه للمساءلة.
            </span>
          </p>
        </div>

        {list.length > 1 && (
          <button
            type="button"
            data-testid="end-other-sessions"
            disabled={endOthers.isPending}
            onClick={() => endOthers.mutate()}
            className="mt-3 h-11 w-full rounded-xl bg-slate-900 text-sm font-black text-white disabled:opacity-40"
          >
            إنهاء كل الأجهزة الأخرى
          </button>
        )}
      </div>
    </>
  )
}
