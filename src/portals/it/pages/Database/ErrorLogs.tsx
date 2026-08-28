import { useState } from 'react'
import { Icon } from '@components/ui/Icon/Icon'
import { useErrorLogs, useResolveError } from '@features/system'
import type { AppErrorRow } from '@features/system'
import { formatRelative } from '@lib/utils/date.utils'
import { truncate } from '@lib/utils/string.utils'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'

/**
 * أخطاء التطبيق — كل logger.error في العميل يصل هنا (app_errors).
 * حلّ الخطأ = وسم resolved (لا حذف أبداً — التدقيق كامل).
 */
const TYPE_LABELS: Record<AppErrorRow['error_type'], string> = {
  runtime: 'تشغيلي',
  network: 'شبكة',
  validation: 'تحقق',
  auth: 'مصادقة',
}

const TYPE_STYLES: Record<AppErrorRow['error_type'], string> = {
  runtime: 'bg-red-50 text-red-700',
  network: 'bg-amber-50 text-amber-700',
  validation: 'bg-blue-50 text-blue-700',
  auth: 'bg-purple-50 text-purple-700',
}

export default function ErrorLogs() {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [resolvedFilter, setResolvedFilter] = useState<boolean | undefined>(false)
  const [typeFilter, setTypeFilter] = useState<AppErrorRow['error_type'] | ''>('')

  const { data: errors, isLoading } = useErrorLogs({
    resolved: resolvedFilter,
    errorType: typeFilter || undefined,
  })
  const resolve = useResolveError()

  const openCount = errors?.filter((e) => !e.resolved).length ?? 0

  return (
    <section aria-labelledby="errors-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="errors-title" className="text-lg font-bold">أخطاء التطبيق</h1>
          <p className="text-sm text-slate-500">
            {openCount > 0 ? `${openCount} خطأ غير محلول` : 'كل الأخطاء محلولة'}
          </p>
        </div>

        {/* مرشحات */}
        <div className="flex gap-2">
          <select
            value={resolvedFilter === undefined ? 'all' : resolvedFilter ? 'resolved' : 'open'}
            onChange={(e) =>
              setResolvedFilter(
                e.target.value === 'all' ? undefined : e.target.value === 'resolved',
              )
            }
            aria-label="مرشح الحالة"
            data-testid="filter-resolved"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="open">غير المحلولة</option>
            <option value="resolved">المحلولة</option>
            <option value="all">الكل</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AppErrorRow['error_type'] | '')}
            aria-label="مرشح النوع"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">كل الأنواع</option>
            <option value="runtime">تشغيلي</option>
            <option value="network">شبكة</option>
            <option value="validation">تحقق</option>
            <option value="auth">مصادقة</option>
          </select>
        </div>
      </div>

      {isLoading && <LoadingSpinner label="جارٍ جلب السجل…" />}

      {errors && errors.length === 0 && (
        <EmptyState
          title="لا أخطاء — ممتاز 🎉"
          hint="كل أخطاء التطبيق تظهر هنا تلقائياً عند حدوثها"
        />
      )}

      <ul className="space-y-2" data-testid="errors-list">
        {errors?.map((err) => (
          <li
            key={err.id}
            className={clsx(
              'rounded-2xl border bg-white shadow-sm transition-opacity',
              err.resolved ? 'border-slate-100 opacity-60' : 'border-slate-200',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => setExpanded((prev) => (prev === err.id ? null : err.id))}
                  data-testid={`expand-${err.id}`}
                  className="mb-1.5 flex w-full flex-wrap items-center gap-2 text-start"
                >
                  <Icon name={expanded === err.id ? 'chevron-right' : 'chevron-left'} size={13} className="shrink-0 text-slate-400" />
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-bold', TYPE_STYLES[err.error_type])}>
                    {TYPE_LABELS[err.error_type]}
                  </span>
                  {err.resolved && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      ✓ محلول
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{formatRelative(err.created_at)}</span>
                </button>
                <p className="break-words text-sm font-medium text-slate-800" dir="auto">
                  {truncate(err.message, 180)}
                </p>
                {err.url && (
                  <p className="mt-1 truncate text-xs text-slate-400" dir="ltr">{err.url}</p>
                )}
                {expanded === err.id && (
                  <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3" data-testid={`detail-${err.id}`}>
                    {err.stack && (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600" dir="ltr">{err.stack}</pre>
                    )}
                    <p className="text-[11px] text-slate-500" dir="ltr">UA: {err.user_agent ?? '—'}</p>
                    {Object.keys(err.context ?? {}).length > 0 && (
                      <pre className="overflow-auto text-[11px] text-slate-500" dir="ltr">{JSON.stringify(err.context, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => resolve.mutate({ id: err.id, resolved: !err.resolved })}
                disabled={resolve.isPending}
                data-testid={`resolve-${err.id}`}
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  err.resolved
                    ? 'text-slate-500 hover:bg-slate-100'
                    : 'text-emerald-700 hover:bg-emerald-50',
                )}
              >
                <Icon name="check-square" size={14} />
                {err.resolved ? 'إعادة فتح' : 'تعيين كمحلول'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
