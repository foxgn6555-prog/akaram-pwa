/**
 * الجولة ٤ — مراقبة الدخول والجلسات (بوابة تكنولوجيا المعلومات):
 *  ① سجل الأحداث الأمنية: دخول · فشل · تجاوز حد · انتقال · إنهاء جلسة · تغيير سياسة — بالجهاز وIP والوقت.
 *  ② حد الأجهزة لكل حساب: عدد الجلسات المسموح وفرضه (لا يُمنع أحد ما لم يُفعَّل الفرض).
 * القراءة والكتابة عبر دوال محروسة بدور it_admin في الخادم.
 */
import { useState } from 'react'
import clsx from 'clsx'
import {
  useSecurityEvents,
  useSessionPolicies,
  useSetSessionPolicy,
} from '@features/security/hooks'
import type { SecurityEventKind } from '@sdk/security.sdk'
import { describeDevice } from '@lib/utils/device.utils'
import { formatRelative } from '@lib/utils/date.utils'

const EVENT_LABELS: Record<SecurityEventKind, string> = {
  login_success: 'دخول ناجح',
  login_failed: 'محاولة فاشلة',
  device_conflict: 'تعارض أجهزة',
  limit_exceeded: 'تجاوز حد الأجهزة',
  session_revoked: 'إنهاء جلسة',
  switch_approved: 'انتقال معتمد',
  switch_denied: 'انتقال مرفوض',
  policy_changed: 'تغيير سياسة',
}

const OUTCOME_LABELS = { info: 'معلومة', allowed: 'مسموح', blocked: 'مرفوض' } as const

export function SecurityMonitor() {
  const [event, setEvent] = useState<SecurityEventKind | null>(null)
  const [search, setSearch] = useState('')
  const events = useSecurityEvents(event)
  const policies = useSessionPolicies(search)

  return (
    <div className="space-y-4" data-testid="security-monitor">
      {/* ① سجل الأحداث */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black">سجل الأحداث الأمنية</h2>
            <p className="mt-1 text-xs text-slate-500">
              كل دخول ومحاولة وتجاوز وانتقال — بالجهاز وIP والوقت. آخر ٢٠٠ حدث.
            </p>
          </div>
          <select
            data-testid="security-event-filter"
            value={event ?? ''}
            onChange={(e) => setEvent((e.target.value || null) as SecurityEventKind | null)}
            className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
          >
            <option value="">كل الأنواع</option>
            {(Object.keys(EVENT_LABELS) as SecurityEventKind[]).map((k) => (
              <option key={k} value={k}>{EVENT_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {events.isLoading ? (
          <p className="py-4 text-center text-xs text-slate-400">جارٍ التحميل…</p>
        ) : (events.data ?? []).length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500" data-testid="security-events-empty">
            لا أحداث مسجّلة بعد.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100" data-testid="security-events-list">
            {(events.data ?? []).map((e) => {
              const device = describeDevice(e.user_agent)
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                  <span
                    className={clsx(
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                      e.outcome === 'blocked'
                        ? 'bg-red-100 text-red-800'
                        : e.outcome === 'allowed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {OUTCOME_LABELS[e.outcome] ?? e.outcome}
                  </span>
                  <span className="font-bold text-slate-800">{EVENT_LABELS[e.event] ?? e.event}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-500" dir="ltr">{e.email ?? '—'}</span>
                  <span className="text-[11px] text-slate-400">
                    {device.device} · {device.browser} · {e.ip ?? 'IP غير متاح'}
                  </span>
                  <span className="text-[11px] text-slate-400">{formatRelative(e.created_at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ② حد الأجهزة لكل حساب */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black">حد الأجهزة لكل حساب</h2>
        <p className="mt-1 text-xs text-slate-500">
          افتراضياً لا فرض على أي حساب. عند تفعيل «الفرض» يُمنع الدخول من جهاز جديد بعد بلوغ الحد،
          ويُطلب من الحساب الحسّاس رمز موافقة من جهازه الحالي.
        </p>
        <input
          data-testid="policy-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالبريد…"
          className="mt-3 h-9 w-full max-w-xs rounded-xl border border-slate-200 px-3 text-xs"
          dir="ltr"
        />
        {policies.isLoading ? (
          <p className="py-4 text-center text-xs text-slate-400">جارٍ التحميل…</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100" data-testid="policy-list">
            {(policies.data ?? []).slice(0, 50).map((p) => (
              <PolicyRow
                key={p.user_id}
                userId={p.user_id}
                email={p.email}
                max={p.max_sessions}
                enforce={p.enforce}
                active={p.active_sessions}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PolicyRow({
  userId,
  email,
  max,
  enforce,
  active,
}: {
  userId: string
  email: string | null
  max: number
  enforce: boolean
  active: number
}) {
  const [value, setValue] = useState(max)
  const [forced, setForced] = useState(enforce)
  const save = useSetSessionPolicy()
  const dirty = value !== max || forced !== enforce

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-xs" data-testid={`policy-row-${userId}`}>
      <span className="min-w-0 flex-1 truncate text-slate-700" dir="ltr">{email ?? userId}</span>
      <span
        className={clsx(
          'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
          active > 0 ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500',
        )}
      >
        {active} جلسة
      </span>
      <label className="flex items-center gap-1 text-[11px] text-slate-600">
        الحد
        <input
          type="number"
          min={1}
          max={10}
          value={value}
          data-testid={`policy-max-${userId}`}
          onChange={(e) => setValue(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          className="h-8 w-14 rounded-lg border border-slate-200 px-2 text-center text-xs"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
        <input
          type="checkbox"
          checked={forced}
          data-testid={`policy-enforce-${userId}`}
          onChange={(e) => setForced(e.target.checked)}
          className="size-4 accent-brand-600"
        />
        فرض
      </label>
      <button
        type="button"
        data-testid={`policy-save-${userId}`}
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate({ userId, max: value, enforce: forced })}
        className="h-8 rounded-lg bg-slate-900 px-3 text-[11px] font-bold text-white disabled:opacity-30"
      >
        حفظ
      </button>
    </li>
  )
}
