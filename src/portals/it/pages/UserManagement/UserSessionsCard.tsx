/**
 * الجولة ٣-ب — جلسات الحساب كما تراها تقنية المعلومات.
 * الحالة العملية: الحساب الحسّاس فَقَد جهازه فلا يستطيع إنشاء رمز موافقة ⇒ IT تُنهي الجلسة العالقة.
 * كل إنهاء يُسجَّل حدثاً أمنياً باسم من نفّذه.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessions } from '@sdk/sessions.sdk'
import { formatRelative } from '@lib/utils/date.utils'
import { describeDevice } from '@lib/utils/device.utils'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

const key = (userId: string) => ['admin-sessions', userId] as const

export function UserSessionsCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  const { data, isLoading } = useQuery({
    queryKey: key(userId),
    queryFn: () => sessions.adminList(userId),
    staleTime: 15_000,
  })
  const end = useMutation({
    mutationFn: (sessionId: string | null) => sessions.adminEnd(userId, sessionId),
    onSuccess: (n) => {
      addToast({ type: 'success', message: n > 0 ? `أُنهيت ${n} جلسة` : 'لا جلسات مفتوحة' })
      void queryClient.invalidateQueries({ queryKey: key(userId) })
    },
    onError: (error) => addToast({ type: 'error', message: handleAppError(error, { scope: 'adminSessionEnd' }).message }),
  })
  const list = data ?? []

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-label="جلسات الحساب"
      data-testid="user-sessions-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black">جلسات الحساب</h2>
          <p className="mt-1 text-xs text-slate-500">
            الأجهزة المفتوح عليها الحساب الآن. استخدمها عند فقدان جهاز صاحب الحساب أو الاشتباه باستخدام غير مصرّح به.
          </p>
        </div>
        {list.length > 0 && (
          <button
            type="button"
            data-testid="admin-end-all-sessions"
            disabled={end.isPending}
            onClick={() => end.mutate(null)}
            className="h-9 shrink-0 rounded-xl bg-red-600 px-3 text-xs font-black text-white disabled:opacity-40"
          >
            إنهاء الكل
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-xs text-slate-400">جارٍ التحميل…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500" data-testid="admin-sessions-empty">
          لا جلسات مفتوحة لهذا الحساب.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100" data-testid="admin-sessions-list">
          {list.map((s) => {
            const label = describeDevice(s.user_agent)
            return (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-800">
                    {label.device} · {label.browser} · {label.os}
                  </span>
                  <span className="block truncate text-[10px] text-slate-400" dir="ltr">
                    {s.ip ?? 'IP غير متاح'} · {formatRelative(s.created_at)}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid={`admin-end-session-${s.id}`}
                  disabled={end.isPending}
                  onClick={() => end.mutate(s.id)}
                  className="h-8 shrink-0 rounded-lg bg-red-50 px-2.5 text-[11px] font-bold text-red-700 disabled:opacity-40"
                >
                  إنهاء
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
