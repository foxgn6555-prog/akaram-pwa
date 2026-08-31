/**
 * وحدة الكشوفات:
 *  · زر إنشاء كشف → صفحة النموذج
 *  · قائمة الكشوفات مع حالتها (مسودة / مرفوعة للمعاون)
 *  · تصدير Excel · Word · طباعة
 *  · رفع لمعاون المدير المفوض
 *  · حذف/أرشفة (نحو IT) — هنا زر ينقل لصفحة الأرشيف مع فتح التأكيد
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import {
  useDisclosureList,
  useSubmitDisclosure,
  useArchiveDisclosure,
} from '@features/disclosures'
import { VIOLATION_LABELS, PENALTY_LABELS, type Disclosure } from '@features/disclosures/types'
import { toExcel, toWord, printDisclosure } from '@features/disclosures/lib/export'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

const VIOLATION_TONE: Record<string, string> = {
  delay: 'bg-amber-50 text-amber-700',
  absence: 'bg-red-50 text-red-700',
  collection: 'bg-purple-50 text-purple-700',
  evasion: 'bg-sky-50 text-sky-700',
  early_withdrawal: 'bg-orange-50 text-orange-700',
  load_deficiency: 'bg-teal-50 text-teal-700',
}

export default function StatementsPage() {
  const navigate = useNavigate()
  const list = useDisclosureList()
  const submit = useSubmitDisclosure()
  const archive = useArchiveDisclosure()

  const [target, setTarget] = useState<Disclosure | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const data = list.data ?? []

  const confirmArchive = (): void => {
    if (!target) return
    if (reason.trim().length < 5) {
      setError('اذكر سبب الحذف بوضوح (5 أحرف فأكثر)')
      return
    }
    archive.mutate(
      { id: target.id, reason: reason.trim() },
      { onSuccess: () => { setTarget(null); setReason(''); setError('') } },
    )
  }

  return (
    <div className="space-y-5" data-testid="statements-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">الكشوفات التأديبية</h1>
          <p className="text-sm text-slate-500">إنشاء الكشوفات ورفعها لمعاون المدير المفوض</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void toExcel(data)}
            data-testid="export-all-excel"
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Icon name="file-spreadsheet" size={16} /> Excel
          </button>
          <button
            onClick={() => navigate('/disclosures/statements/new')}
            data-testid="new-statement"
            className="flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
          >
            <Icon name="file-text" size={16} /> إنشاء كشف
          </button>
        </div>
      </div>

      {list.isLoading ? (
        <div className="p-8"><LoadingSpinner label="جارٍ جلب الكشوفات…" /></div>
      ) : data.length === 0 ? (
        <EmptyState title="لا توجد كشوفات بعد" hint="ابدأ بإنشاء كشف تأديبي جديد" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="statements-grid">
          {data.map((d) => (
            <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold',
                      VIOLATION_TONE[d.violation_type])}>
                      {VIOLATION_LABELS[d.violation_type]}
                    </span>
                    {d.penalty_type && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {PENALTY_LABELS[d.penalty_type]}
                      </span>
                    )}
                    {d.status === 'submitted_to_deputy' ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        مرفوع للمعاون
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        مسودة
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 font-bold text-slate-800">{d.driver_name}</p>
                  <p className="text-xs text-slate-500">
                    DB: <span dir="ltr">{d.db_number}</span> · {d.log_date}
                    {d.contractor_name ? ` · المتعهد: ${d.contractor_name}` : ''}
                  </p>
                </div>
              </div>

              <p className="mt-2 line-clamp-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                {d.details}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <ActionBtn icon="send" label="رفع للمعاون" testId={`submit-${d.id}`}
                  disabled={d.status === 'submitted_to_deputy' || submit.isPending}
                  tone="text-emerald-700 hover:bg-emerald-50"
                  onClick={() => submit.mutate(d.id)} />
                <ActionBtn icon="download" label="Word" testId={`word-${d.id}`}
                  tone="text-brand-700 hover:bg-brand-50"
                  onClick={() => toWord(d)} />
                <ActionBtn icon="printer" label="طباعة" testId={`print-${d.id}`}
                  tone="text-slate-700 hover:bg-slate-100"
                  onClick={() => printDisclosure(d)} />
                <ActionBtn icon="archive-box" label="حذف/أرشفة" testId={`del-${d.id}`}
                  tone="text-red-600 hover:bg-red-50"
                  onClick={() => { setTarget(d); setReason(''); setError('') }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ورقة تأكيد الأرشفة */}
      {target && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="archive-confirm"
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4"
          onClick={() => !archive.isPending && setTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl sm:rounded-2xl sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Icon name="alert-triangle" size={22} />
              </span>
              <div>
                <h3 className="font-bold text-slate-800">تأكيد حذف الكشف</h3>
                <p className="text-xs text-slate-500">{target.driver_name} · {target.db_number}</p>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              ⚠️ لن يُحذف الكشف نهائياً. سيُنقَل إلى <b>الأرشيف المركزي لبوابة التطوير المركزية (IT)</b>
              ويُنبَّه فريق التطوير، ويمكنهم <b>إعادته</b>.
            </div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              سبب الحذف <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError('') }}
              rows={3}
              autoFocus
              data-testid="archive-reason"
              placeholder="اكتب سبب الحذف/الأرشفة…"
              className={clsx('w-full rounded-xl border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-red-200',
                error ? 'border-red-400' : 'border-slate-300')}
            />
            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={confirmArchive}
                disabled={archive.isPending}
                data-testid="archive-confirm-btn"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {archive.isPending ? <LoadingSpinner label="" /> : <Icon name="archive-box" size={16} />}
                تأكيد الحذف والأرشفة
              </button>
              <button onClick={() => setTarget(null)}
                className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  icon, label, onClick, disabled, tone, testId,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  tone: string
  testId: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={clsx('flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40', tone)}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  )
}
