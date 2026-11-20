/**
 * الجولة ٧ — اللوحة الأمنية الموحّدة.
 * شاشة واحدة تجمع ثلاث عائلات كانت متفرقة: أحداث الدخول والجلسات · تدقيق الصلاحيات وأسقف
 * الصفحات · طلبات منح/سحب الأدوار — بتصفية بالمدة والحساب والمصدر، وبطاقات عدّ سريعة.
 * الدمج في الخادم (it_security_timeline / it_security_overview) — الواجهة لا تجمع ولا تحكم.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Ban,
  KeyRound,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { users } from '@sdk/users.sdk'
import type { TimelineOutcome, TimelineRow, TimelineSource } from '@sdk/security.sdk'
import { useSecurityOverview, useSecurityTimeline } from '@features/security/hooks'
import { formatRelative } from '@lib/utils/date.utils'

const PERIODS = [
  { id: 1, label: '٢٤ ساعة' },
  { id: 7, label: '٧ أيام' },
  { id: 30, label: '٣٠ يوماً' },
] as const

const SOURCES: { id: TimelineSource | 'all'; label: string }[] = [
  { id: 'all', label: 'كل المصادر' },
  { id: 'session', label: 'الدخول والجلسات' },
  { id: 'permissions', label: 'الصلاحيات' },
  { id: 'roles', label: 'الأدوار' },
]

const SOURCE_STYLE: Record<TimelineSource, { label: string; cls: string }> = {
  session: { label: 'جلسة', cls: 'bg-sky-100 text-sky-900' },
  permissions: { label: 'صلاحية', cls: 'bg-violet-100 text-violet-900' },
  roles: { label: 'دور', cls: 'bg-amber-100 text-amber-900' },
}

const OUTCOME_STYLE: Record<TimelineOutcome, { label: string; cls: string }> = {
  info: { label: 'معلومة', cls: 'bg-slate-100 text-slate-600' },
  allowed: { label: 'مسموح', cls: 'bg-emerald-100 text-emerald-800' },
  blocked: { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800' },
  pending: { label: 'بانتظار الاعتماد', cls: 'bg-amber-100 text-amber-900' },
  approved: { label: 'معتمد', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800' },
  cancelled: { label: 'ملغى', cls: 'bg-slate-100 text-slate-600' },
}

export function UnifiedSecurityDashboard() {
  const [days, setDays] = useState<number>(7)
  const [source, setSource] = useState<TimelineSource | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(id)
  }, [query])

  const search = useQuery({
    queryKey: ['security', 'account-search', debounced],
    queryFn: () => users.list(debounced || undefined),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  const overview = useSecurityOverview(days)
  const timeline = useSecurityTimeline({
    user: userId,
    days,
    source: source === 'all' ? null : source,
  })

  const rows = timeline.data ?? []
  const o = overview.data
  const chosen = useMemo(
    () => (search.data ?? []).find((u) => u.id === userId) ?? null,
    [search.data, userId],
  )

  const cards = [
    {
      key: 'sessions',
      label: 'أحداث الدخول والجلسات',
      value: o?.session.total ?? 0,
      hint: `مرفوضة ${o?.session.blocked ?? 0} · دخول ناجح ${o?.session.logins ?? 0}`,
      icon: <Activity size={16} />,
      cls: 'text-sky-700 bg-sky-50',
    },
    {
      key: 'blocked',
      label: 'محاولات مرفوضة',
      value: o?.session.blocked ?? 0,
      hint: `فشل دخول ${o?.session.failed ?? 0}`,
      icon: <Ban size={16} />,
      cls: 'text-rose-700 bg-rose-50',
    },
    {
      key: 'permissions',
      label: 'تعديلات صلاحيات',
      value: o?.permissions.total ?? 0,
      hint: `أبرزها ضبط سقف صفحة ${o?.permissions.level_sets ?? 0}`,
      icon: <ShieldCheck size={16} />,
      cls: 'text-violet-700 bg-violet-50',
    },
    {
      key: 'roles',
      label: 'طلبات أدوار',
      value: o?.roles.total ?? 0,
      hint: `بانتظار الاعتماد ${o?.roles.pending ?? 0}`,
      icon: <KeyRound size={16} />,
      cls: 'text-amber-700 bg-amber-50',
    },
    {
      key: 'accounts',
      label: 'حسابات مضبوطة',
      value: (o?.accounts.with_policy ?? 0) + (o?.accounts.with_levels ?? 0),
      hint: `حد أجهزة مفروض ${o?.accounts.with_policy ?? 0} · سقوف صفحات ${o?.accounts.with_levels ?? 0}`,
      icon: <Users size={16} />,
      cls: 'text-emerald-700 bg-emerald-50',
    },
  ]

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="security-dashboard">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Layers size={17} />
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-800">اللوحة الأمنية الموحّدة</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              كل ما يخص الأمان في مكان واحد: دخول الأجهزة والجلسات · تعديلات الصلاحيات وأسقف الصفحات ·
              طلبات منح وسحب الأدوار. الدمج والعدّ من الخادم.
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="security-dashboard-refresh"
          onClick={() => {
            void overview.refetch()
            void timeline.refetch()
          }}
          disabled={timeline.isFetching}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={13} className={timeline.isFetching ? 'animate-spin' : ''} /> تحديث
        </button>
      </header>

      {/* بطاقات العدّ */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="security-cards">
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <span className={`flex size-6 items-center justify-center rounded-lg ${c.cls}`}>{c.icon}</span>
              {c.label}
            </p>
            <p className="mt-1.5 text-xl font-black text-slate-900">{c.value}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* المرشّحات */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setDays(p.id)}
            aria-pressed={days === p.id}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${days === p.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSource(s.id)}
            aria-pressed={source === s.id}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${source === s.id ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* تصفية بالحساب */}
      <div className="grid gap-2 sm:grid-cols-[minmax(220px,320px)_1fr]">
        <div>
          <label htmlFor="security-account-search" className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <Search size={13} /> حساب محدّد (بريد أو اسم)
          </label>
          <input
            id="security-account-search"
            data-testid="security-account-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اتركه فارغاً لعرض الكل"
            className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs"
          />
          {debounced.length >= 2 && (
            <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100" data-testid="security-account-results">
              {(search.data ?? []).slice(0, 10).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setUserId(u.id)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-start text-[11px] hover:bg-slate-50 ${u.id === userId ? 'bg-brand-50' : ''}`}
                  >
                    <span className="font-bold text-slate-800" dir="ltr">{u.email ?? u.id}</span>
                    <span className="text-slate-500">{u.employee_name ?? 'بلا سجل موظف'}</span>
                  </button>
                </li>
              ))}
              {(search.data ?? []).length === 0 && <li className="px-3 py-3 text-[11px] text-slate-400">لا نتائج</li>}
            </ul>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          {userId ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-700">
                <span className="font-bold">الحساب: </span>
                <span dir="ltr">{chosen?.email ?? userId}</span>
              </p>
              <button
                type="button"
                data-testid="security-clear-account"
                onClick={() => { setUserId(null); setQuery('') }}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm"
              >
                <X size={11} /> عرض كل الحسابات
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">عرض كل الحسابات — ابحث لتضييق السجل على حساب واحد.</p>
          )}
          <p className="mt-1 text-[10px] text-slate-400">
            آخر حدث: {o?.last_event_at ? formatRelative(o.last_event_at) : 'لا يوجد'}
          </p>
        </div>
      </div>

      {/* السجل */}
      {timeline.isLoading ? (
        <p className="py-6 text-center text-xs text-slate-400">جارٍ تحميل السجل…</p>
      ) : timeline.isError ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-800" role="alert">
          تعذّر تحميل السجل الأمني — تأكد من صلاحية تقنية المعلومات.
        </p>
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-8 text-center text-xs text-slate-500">
          <Sparkles size={14} /> لا أحداث في هذه المدة.
        </p>
      ) : (
        <>
          <p className="text-[10px] text-slate-400">{rows.length} حدثاً — الأحدث أولاً</p>
          <ul className="divide-y divide-slate-100" data-testid="security-timeline">
            {rows.map((row, i) => (
              <TimelineItem key={`${row.source}-${row.kind}-${row.occurred_at}-${i}`} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function TimelineItem({ row }: { row: TimelineRow }) {
  const src = SOURCE_STYLE[row.source]
  const out = OUTCOME_STYLE[row.outcome] ?? OUTCOME_STYLE.info
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-800">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${src.cls}`}>{src.label}</span>
          {row.summary}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          {row.target_label ?? '—'}
          {row.actor_label && row.actor_id !== row.target_id ? ` · بواسطة ${row.actor_label}` : ''}
          {' · '}
          {formatRelative(row.occurred_at)}
        </p>
      </div>
      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${out.cls}`}>{out.label}</span>
    </li>
  )
}
