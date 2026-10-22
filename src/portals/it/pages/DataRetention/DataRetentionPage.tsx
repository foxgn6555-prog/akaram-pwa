import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Lock, RefreshCw, Settings2, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { formatDate, formatDateTime } from '@lib/utils/date.utils'
import { RETENTION_OPEN, RETENTION_STATUS_LABEL, type RetentionPolicy, type RetentionRequest } from '@sdk/data-retention.sdk'
import { useCancelRetention, useConfirmRetention, useRetentionRequests, useRetentionScanNow, useRetentionSettings, useSetRetentionPolicy } from '@features/data-retention/hooks'

/**
 * 🗂️ الاحتفاظ بالبيانات النصية (00325 · ٢/٤) — بوابة التطوير المركزية
 *  لكل نوع: مفعّل / المدة بالأشهر / يتطلب تصديراً. النظام ينشئ طلب حذف ويبلّغكم؛ الحذف فقط بعد تأكيدكم هنا.
 */
const num = (n: number) => n.toLocaleString('en-US')

export default function DataRetentionPage() {
  const [tab, setTab] = useState<'requests' | 'policies'>('requests')
  return (
    <section className="space-y-5" dir="rtl" data-testid="data-retention-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-emerald-950 to-teal-800 p-5 text-white shadow-xl sm:p-6">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-200"><ShieldCheck size={16} /> إجراء محمي · IT فقط</span>
        <h1 className="mt-2 text-2xl font-black">الاحتفاظ بالبيانات النصية</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-100">
          لكل نوع بيانات تقنية مدة احتفاظ. عند انقضائها ينشئ النظام <b>طلب حذف</b> ويبلّغكم — ولا يُحذف صف واحد إلا بعد (تصدير مُثبَت إن طُلب) وتأكيدكم هنا.
          أقفال السلامة ثابتة ولا تُعطَّل. البيانات المالية وسجلات التدقيق ليست ضمن القائمة أصلاً.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="تبويبات الاحتفاظ">
        {([['requests', 'طلبات الحذف', ClipboardList], ['policies', 'السياسات', Settings2]] as const).map(([id, label, Ico]) => (
          <button key={id} type="button" onClick={() => setTab(id)} data-testid={`ret-tab-${id}`}
            className={clsx('inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition', tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50')}>
            <Ico size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {tab === 'requests' ? <RequestsTab /> : <PoliciesTab />}
    </section>
  )
}

/* ─────────────── الطلبات ─────────────── */
function RequestsTab() {
  const q = useRetentionRequests()
  const scan = useRetentionScanNow()
  if (q.isLoading) return <div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل الطلبات…" /></div>
  if (q.isError) return <ErrorBox onRetry={() => void q.refetch()} />
  const rows = q.data ?? []
  const open = rows.filter((r) => RETENTION_OPEN.includes(r.status)), closed = rows.filter((r) => !RETENTION_OPEN.includes(r.status))
  return (
    <div className="space-y-4" data-testid="ret-requests">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">الفحص يعمل تلقائياً كل يوم (04:00). يمكنك تشغيله الآن للتأكد — الفحص ينشئ طلبات فقط ولا يحذف.</p>
        <button type="button" onClick={() => scan.mutate(undefined)} disabled={scan.isPending} data-testid="ret-scan"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-60">
          <RefreshCw size={16} className={clsx(scan.isPending && 'animate-spin')} /> فحص الآن
        </button>
      </div>
      {open.length === 0 && closed.length === 0 && <EmptyState title="لا توجد طلبات حذف" hint="فعّل سياسة من تبويب «السياسات»؛ عند انقضاء مدتها يظهر الطلب هنا ويصلكم إشعار." />}
      {open.map((r) => <RequestCard key={r.id} r={r} />)}
      {closed.length > 0 && (
        <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">الطلبات المنتهية ({num(closed.length)})</summary>
          <div className="mt-3 space-y-2">{closed.map((r) => <RequestCard key={r.id} r={r} compact />)}</div>
        </details>
      )}
    </div>
  )
}

function RequestCard({ r, compact = false }: { r: RetentionRequest; compact?: boolean }) {
  const confirm = useConfirmRetention(), cancel = useCancelRetention()
  const [typed, setTyped] = useState('')
  const isOpen = RETENTION_OPEN.includes(r.status)
  return (
    <article className={clsx('rounded-2xl bg-white p-4 ring-1', isOpen ? 'ring-amber-300' : 'ring-slate-200')} data-testid={`ret-request-${r.data_key}-${r.status}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-900">{r.label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">الصفوف الأقدم من <span dir="ltr" className="font-mono">{formatDate(r.cutoff)}</span> · أُنشئ {formatDateTime(r.created_at)}</p>
        </div>
        <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', STATUS_TONE[r.status])}>{RETENTION_STATUS_LABEL[r.status]}</span>
      </div>
      {!compact && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="أقدم من المهلة" value={num(r.rows_total)} />
          <Stat label="محمية بقفل السلامة" value={num(r.rows_locked)} icon={<Lock size={12} />} />
          <Stat label="قابلة للحذف" value={num(r.rows_deletable)} strong />
        </dl>
      )}
      {compact && <p className="mt-2 text-xs text-slate-600">قابلة {num(r.rows_deletable)} · حُذف {num(r.rows_deleted)}{r.finished_at ? ` · انتهى ${formatDateTime(r.finished_at)}` : ''}</p>}

      {isOpen && (
        <div className="mt-3 space-y-3">
          {r.export_required && r.status === 'pending' && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="ret-export-needed">
              هذا النوع يتطلب <b>تصديراً مُثبَتاً</b> قبل التأكيد. زر التصدير يُضاف في الجولة القادمة؛ حتى ذلك الحين يبقى الطلب بانتظاركم ولا يُحذف شيء.
            </p>
          )}
          {r.status === 'exported' && (
            <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
              صُدِّر {num(r.rows_exported ?? 0)} صفاً إلى «{r.export_label}» بواسطة {r.exported_by_name ?? '—'} في {r.exported_at ? formatDateTime(r.exported_at) : '—'} · بصمة <span dir="ltr" className="font-mono">{(r.export_sha256 ?? '').slice(0, 12)}…</span>
            </p>
          )}
          {r.status === 'confirmed' && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">أكّده {r.confirmed_by_name ?? '—'} في {r.confirmed_at ? formatDateTime(r.confirmed_at) : '—'}. تنفيذ الحذف بدفعات يُضاف في الجولة الرابعة.</p>}
          <div className="flex flex-wrap items-end gap-2">
            {r.can_confirm && (
              <div className="flex flex-1 flex-wrap items-end gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <label className="flex-1 text-xs font-bold text-rose-900">
                  للتأكيد اكتب <span dir="ltr" className="font-mono">حذف</span>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="ret-confirm-input" className="mt-1 h-10 w-full rounded-xl border border-rose-300 bg-white px-3 text-sm text-slate-900" />
                </label>
                <button type="button" disabled={typed.trim() !== 'حذف' || confirm.isPending} onClick={() => confirm.mutate(r.id)} data-testid="ret-confirm"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">
                  <CheckCircle2 size={16} /> تأكيد حذف {num(r.rows_deletable)} صفاً
                </button>
              </div>
            )}
            <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)} data-testid="ret-cancel"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 ring-1 ring-slate-300">
              <X size={16} /> إلغاء الطلب
            </button>
          </div>
        </div>
      )}
      {!compact && r.events.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-500">السجل ({num(r.events.length)})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {r.events.map((e, i) => <li key={i}><span dir="ltr" className="font-mono text-slate-400">{formatDateTime(e.at)}</span> · {EVENT_LABEL[e.action] ?? e.action} · {e.actor_name ?? 'النظام'}</li>)}
          </ul>
        </details>
      )}
    </article>
  )
}
const STATUS_TONE: Record<RetentionRequest['status'], string> = { pending: 'bg-amber-100 text-amber-900', exported: 'bg-sky-100 text-sky-900', confirmed: 'bg-sky-100 text-sky-900', deleting: 'bg-sky-100 text-sky-900', done: 'bg-emerald-100 text-emerald-900', cancelled: 'bg-slate-100 text-slate-600' }
const EVENT_LABEL: Record<string, string> = { request_created: 'أنشأ النظام الطلب', exported: 'تصدير مُثبَت', confirmed: 'تأكيد الحذف', batch: 'دفعة حذف', done: 'اكتمل الحذف', cancelled: 'إلغاء', policy_set: 'تعديل سياسة' }

function Stat({ label, value, strong = false, icon }: { label: string; value: string; strong?: boolean; icon?: ReactNode }) {
  return (
    <div className={clsx('rounded-xl p-2', strong ? 'bg-rose-50' : 'bg-slate-50')}>
      <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">{icon}{label}</dt>
      <dd className={clsx('mt-0.5 font-black tabular-nums', strong ? 'text-rose-800' : 'text-slate-800')} dir="ltr">{value}</dd>
    </div>
  )
}

/* ─────────────── السياسات ─────────────── */
function PoliciesTab() {
  const q = useRetentionSettings()
  if (q.isLoading) return <div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل السياسات…" /></div>
  if (q.isError || !q.data) return <ErrorBox onRetry={() => void q.refetch()} />
  return (
    <div className="space-y-3" data-testid="ret-policies">
      <p className="rounded-2xl bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200">
        التفعيل لا يحذف شيئاً بنفسه — يسمح للنظام بإنشاء طلب عند انقضاء المدة. إيقاف سياسة يلغي طلبها المعلّق.
      </p>
      {q.data.map((p) => <PolicyCard key={p.data_key} p={p} />)}
    </div>
  )
}

function PolicyCard({ p }: { p: RetentionPolicy }) {
  const save = useSetRetentionPolicy()
  const [enabled, setEnabled] = useState(p.enabled)
  const [months, setMonths] = useState(p.retention_months)
  const [exp, setExp] = useState(p.export_required)
  const dirty = enabled !== p.enabled || months !== p.retention_months || exp !== p.export_required
  const valid = Number.isInteger(months) && months >= 1 && months <= 120
  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" data-testid={`ret-policy-${p.data_key}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-900">{p.label}</h3>
          <p className="mt-0.5 text-xs text-slate-600">{p.description}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-800"><Lock size={12} /> قفل سلامة ثابت: {p.safety_lock}</p>
        </div>
        <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', p.enabled ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600')}>{p.enabled ? 'مفعّلة' : 'معطّلة'}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="ret-enabled" className="h-4 w-4" /> مفعّلة
        </label>
        <label className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700">مدة الاحتفاظ (أشهر)
          <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} data-testid="ret-months" dir="ltr" className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900" />
        </label>
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-800">
          <input type="checkbox" checked={exp} onChange={(e) => setExp(e.target.checked)} data-testid="ret-export" className="h-4 w-4" /> يتطلب تصديراً مُثبَتاً قبل الحذف
        </label>
      </div>
      {p.open_request && <p className="mt-2 text-xs text-amber-900">طلب مفتوح: {RETENTION_STATUS_LABEL[p.open_request.status]} · قابلة للحذف {num(p.open_request.rows_deletable)}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{p.updated_at ? `آخر تعديل ${formatDateTime(p.updated_at)} · ${p.updated_by_name ?? ''}` : 'لم تُعدَّل بعد (الافتراضي)'}</span>
        <button type="button" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate({ data_key: p.data_key, enabled, retention_months: months, export_required: exp })} data-testid="ret-save"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">حفظ</button>
      </div>
    </article>
  )
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900" role="alert">
      <p className="inline-flex items-center gap-2 font-bold"><AlertTriangle size={16} /> تعذّر التحميل.</p>
      <button type="button" onClick={onRetry} className="mt-2 inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-bold ring-1 ring-rose-300"><RefreshCw size={14} /> إعادة المحاولة</button>
    </div>
  )
}
