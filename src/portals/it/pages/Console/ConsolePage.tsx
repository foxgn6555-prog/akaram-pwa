/**
 * Console — وحدة رصد الأخطاء الحي (التطوير المركزية).
 * أي خطأ أو تنبيه في أي بوابة (إعلام، شكاوى، غرفة العمليات…) يصل هنا لحظياً مع:
 * نوعه، البوابة، الشاشة، المستخدم، عدد التكرار، شرح السبب، وخطوات الحل.
 *
 * التبويبات: مباشر (الكل) | التنبيهات (console.warn فقط) | الأخطاء (مع الشرح) | الدليل (كل الأنواع).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useConsoleFeed, useConsoleLive, useConsoleResolve, useConsoleStats, type AppErrorRow } from '@features/console'
import {
  KIND_CATALOG,
  OWNER_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  portalLabel,
  type ConsoleKind,
  type ConsoleSeverity,
  type ConsoleSource,
} from '@lib/console/classify'
import { PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'
import { formatRelative } from '@lib/utils/date.utils'
import { truncate } from '@lib/utils/string.utils'

type Tab = 'live' | 'warnings' | 'errors' | 'guide'
type Range = '1h' | '24h' | '7d' | 'all'

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: 'activity' | 'alert-triangle' | 'x' | 'file-text' }> = [
  { id: 'live', label: 'مباشر', icon: 'activity' },
  { id: 'warnings', label: 'التنبيهات', icon: 'alert-triangle' },
  { id: 'errors', label: 'الأخطاء', icon: 'x' },
  { id: 'guide', label: 'الدليل', icon: 'file-text' },
]

const RANGE_LABEL: Record<Range, string> = { '1h': 'آخر ساعة', '24h': 'آخر 24 ساعة', '7d': 'آخر 7 أيام', all: 'الكل' }

const SEVERITY_STYLE: Record<ConsoleSeverity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-50 text-red-700 border border-red-200',
  medium: 'bg-amber-50 text-amber-800 border border-amber-200',
  low: 'bg-slate-100 text-slate-700 border border-slate-200',
}

export function sinceOf(range: Range, now: Date = new Date()): string | null {
  if (range === 'all') return null
  const ms = range === '1h' ? 3_600_000 : range === '24h' ? 86_400_000 : 7 * 86_400_000
  return new Date(now.getTime() - ms).toISOString()
}

export function kindOf(row: Pick<AppErrorRow, 'kind'>): ConsoleKind {
  return (row.kind in KIND_CATALOG ? row.kind : 'unknown') as ConsoleKind
}

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>('live')
  const [range, setRange] = useState<Range>('24h')
  const [portal, setPortal] = useState<string>('')
  const [kind, setKind] = useState<string>('')
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const since = useMemo(() => sinceOf(range), [range])
  const filters = useMemo(
    () => ({
      level: tab === 'warnings' ? ('warn' as const) : tab === 'errors' ? ('error' as const) : null,
      portal: portal || null,
      kind: kind || null,
      resolved: status === 'all' ? null : status === 'resolved',
      since,
      q: q.trim() || null,
      limit: 300,
    }),
    [tab, portal, kind, status, since, q],
  )

  useConsoleLive(tab !== 'guide')
  const feed = useConsoleFeed(filters, tab !== 'guide')
  const stats = useConsoleStats(since)
  const resolve = useConsoleResolve()

  const rows = feed.data ?? []
  const s = stats.data

  return (
    <div className="space-y-4 p-4" dir="rtl" data-testid="console-page">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Icon name="activity" className="h-6 w-6 text-red-600" />
            Console — رصد الأخطاء الحي
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              مباشر
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            كل خطأ أو تنبيه في أي بوابة يصل هنا لحظياً مع نوعه وشرحه وخطوات حلّه. لا يُحذف شيء — الحل وسم مع ملاحظة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void feed.refetch()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Icon name="refresh" className={clsx('h-4 w-4', feed.isFetching && 'animate-spin')} />
          تحديث
        </button>
      </header>

      {/* الإحصاءات */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="console-stats">
        <StatCard label="أخطاء مفتوحة" value={s?.open_errors ?? 0} tone="red" />
        <StatCard label="تنبيهات مفتوحة" value={s?.open_warnings ?? 0} tone="amber" />
        <StatCard label="مستخدمون متأثرون" value={s?.affected_users ?? 0} tone="slate" />
        <StatCard label="محلولة" value={s?.resolved ?? 0} tone="emerald" />
      </section>

      {s && Object.keys(s.by_portal).length > 0 ? (
        <section className="flex flex-wrap gap-2" data-testid="console-by-portal">
          {Object.entries(s.by_portal)
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPortal((cur) => (cur === p ? '' : p))}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs',
                  portal === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {portalLabel(p)} <span className="font-bold">{n}</span>
              </button>
            ))}
        </section>
      ) : null}

      {/* التبويبات */}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              tab === t.id ? 'border-red-600 font-semibold text-red-700' : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'guide' ? (
        <Guide />
      ) : (
        <>
          {/* الفلاتر */}
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="console-filters">
            <label className="col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 md:col-span-2">
              <Icon name="search" className="h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث في الرسالة أو الرابط…"
                className="w-full bg-transparent py-1.5 text-sm outline-none"
                aria-label="بحث"
              />
            </label>
            <select value={portal} onChange={(e) => setPortal(e.target.value)} aria-label="البوابة" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="">كل البوابات</option>
              <option value="public">{portalLabel('public')}</option>
              {PORTAL_DEFINITIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {portalLabel(p.id)}
                </option>
              ))}
              <option value="unknown">غير محدد</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="نوع الخطأ" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
              <option value="">كل الأنواع</option>
              {Object.values(KIND_CATALOG).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.title}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="الحالة" className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                <option value="open">مفتوحة</option>
                <option value="resolved">محلولة</option>
                <option value="all">الكل</option>
              </select>
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="المدة" className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                  <option key={r} value={r}>
                    {RANGE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {feed.isLoading ? (
            <LoadingSpinner />
          ) : feed.isError ? (
            <EmptyState title="تعذر تحميل الخلاصة" hint="تأكد من تطبيق آخر ترحيل (console_feed) ومن صلاحية IT." />
          ) : rows.length === 0 ? (
            <EmptyState
              title={tab === 'warnings' ? 'لا تنبيهات' : 'لا أخطاء'}
              hint={status === 'open' ? 'المنصة نظيفة ضمن المدة المختارة.' : 'لا سجلات مطابقة للفلاتر.'}
            />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="console-list">
              {rows.map((row) => (
                <EventRow
                  key={row.id}
                  row={row}
                  expanded={expanded === row.id}
                  onToggle={() => setExpanded((cur) => (cur === row.id ? null : row.id))}
                  onResolve={(resolved, note) => resolve.mutate({ id: row.id, resolved, note })}
                  busy={resolve.isPending}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'slate' | 'emerald' }) {
  const toneCls = {
    red: 'text-red-700 bg-red-50',
    amber: 'text-amber-800 bg-amber-50',
    slate: 'text-slate-800 bg-slate-100',
    emerald: 'text-emerald-700 bg-emerald-50',
  }[tone]
  return (
    <div className={clsx('rounded-xl p-3', toneCls)}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function EventRow({
  row,
  expanded,
  onToggle,
  onResolve,
  busy,
}: {
  row: AppErrorRow
  expanded: boolean
  onToggle: () => void
  onResolve: (resolved: boolean, note: string | null) => void
  busy: boolean
}) {
  const info = KIND_CATALOG[kindOf(row)]
  const [note, setNote] = useState('')
  const isWarn = row.level === 'warn'
  const ctx = (row.context ?? {}) as Record<string, unknown>
  const code = typeof ctx.code === 'string' ? ctx.code : typeof ctx.contract_code === 'string' ? ctx.contract_code : null

  return (
    <li className={clsx(row.resolved && 'opacity-60')} data-testid="console-row" data-kind={row.kind}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-3 py-2.5 text-start hover:bg-slate-50" aria-expanded={expanded}>
        <span className={clsx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', isWarn ? 'bg-amber-400' : 'bg-red-500')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', SEVERITY_STYLE[info.severity])}>{info.title}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{portalLabel(row.portal)}</span>
            {code ? <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-700">{code}</span> : null}
            {row.occurrences > 1 ? <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold text-white">×{row.occurrences}</span> : null}
            {row.resolved ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">محلول</span> : null}
          </span>
          <span className="mt-1 block truncate font-mono text-[13px] text-slate-800" dir="ltr">
            {truncate(row.message, 140)}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            {SOURCE_LABEL[(row.source as ConsoleSource) in SOURCE_LABEL ? (row.source as ConsoleSource) : 'logger']} · آخر ظهور {formatRelative(row.last_seen_at ?? row.created_at)}
            {row.url ? <span dir="ltr" className="ms-1"> · {truncate(pathOnly(row.url), 60)}</span> : null}
          </span>
        </span>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm" data-testid="console-row-details">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h4 className="mb-1 flex items-center gap-1 font-semibold text-slate-900">
                <Icon name="alert-triangle" className="h-4 w-4 text-amber-600" />
                لماذا يحدث؟
              </h4>
              <p className="text-slate-700">{info.explanation}</p>
              <p className="mt-2 text-xs text-slate-500">
                الخطورة: <b>{SEVERITY_LABEL[info.severity]}</b> · المعني: <b>{OWNER_LABEL[info.owner]}</b>
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h4 className="mb-1 flex items-center gap-1 font-semibold text-slate-900">
                <Icon name="check" className="h-4 w-4 text-emerald-600" />
                خطوات الحل
              </h4>
              <ol className="list-decimal space-y-1 ps-5 text-slate-700">
                {info.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs md:grid-cols-2">
            <Meta k="الرسالة الكاملة" v={row.message} mono />
            <Meta k="الرابط" v={row.url ?? '—'} mono />
            <Meta k="المستخدم" v={row.user_id ?? 'غير مسجّل'} mono />
            <Meta k="المتصفح" v={row.user_agent ?? '—'} />
            <Meta k="أول ظهور" v={new Date(row.created_at).toLocaleString('ar-IQ')} />
            <Meta k="آخر ظهور" v={new Date(row.last_seen_at ?? row.created_at).toLocaleString('ar-IQ')} />
            <Meta k="التكرار" v={String(row.occurrences)} />
            <Meta k="البصمة" v={row.fingerprint ?? '—'} mono />
          </dl>

          {row.stack ? (
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Stack trace</summary>
              <pre dir="ltr" className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-slate-800">
                {row.stack}
              </pre>
            </details>
          ) : null}

          {Object.keys(ctx).length > 0 ? (
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">السياق</summary>
              <pre dir="ltr" className="max-h-48 overflow-auto px-3 pb-3 font-mono text-[11px] text-slate-800">
                {JSON.stringify(ctx, null, 2)}
              </pre>
            </details>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {row.resolved ? (
              <>
                {row.resolution_note ? <span className="text-xs text-emerald-700">ملاحظة الحل: {row.resolution_note}</span> : null}
                <button type="button" disabled={busy} onClick={() => onResolve(false, null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">
                  إعادة فتح
                </button>
              </>
            ) : (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة الحل (اختياري)"
                  aria-label="ملاحظة الحل"
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve(true, note.trim() || null)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  وسم كمحلول
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void copyText(describeRow(row, info.title))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              نسخ التفاصيل
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{k}:</dt>
      <dd className={clsx('break-all text-slate-800', mono && 'font-mono')} dir={mono ? 'ltr' : undefined}>
        {v}
      </dd>
    </div>
  )
}

function Guide() {
  return (
    <section className="grid gap-3 md:grid-cols-2" data-testid="console-guide">
      {Object.values(KIND_CATALOG).map((k) => (
        <article key={k.kind} className="rounded-xl border border-slate-200 bg-white p-4">
          <header className="mb-2 flex flex-wrap items-center gap-2">
            <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', SEVERITY_STYLE[k.severity])}>{SEVERITY_LABEL[k.severity]}</span>
            <h3 className="font-bold text-slate-900">{k.title}</h3>
            <code className="ms-auto text-[11px] text-slate-400">{k.kind}</code>
          </header>
          <p className="text-sm text-slate-700">{k.explanation}</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-slate-700">
            {k.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-500">المعني بالحل: {OWNER_LABEL[k.owner]}</p>
        </article>
      ))}
    </section>
  )
}

export function pathOnly(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

export function describeRow(row: AppErrorRow, title: string): string {
  return [
    `[${title}] (${row.kind}) — ${portalLabel(row.portal)}`,
    `الرسالة: ${row.message}`,
    `الرابط: ${row.url ?? '-'}`,
    `التكرار: ${row.occurrences} · آخر ظهور: ${row.last_seen_at ?? row.created_at}`,
    row.stack ? `Stack:\n${row.stack}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* المتصفح يمنع النسخ — لا شيء */
  }
}
