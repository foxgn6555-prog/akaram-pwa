import { useMemo, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, Database, Download, FolderOpen, HardDrive, RefreshCw, Settings2, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react'
import { useCanCall } from '@features/permissions/my-permissions'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { formatDate, formatDateTime } from '@lib/utils/date.utils'
import { COLD_STATUS_LABEL, formatBytes, type ColdPackage, type ColdSettings } from '@sdk/cold-archive.sdk'
import { browserPullSupported, type PullProgress } from '@features/cold-archive/browser-pull'
import { useApproveColdPurge, useBrowserPull, useCancelColdPackage, useColdPackage, useColdPackages, useColdPreview, useColdSettings, useCreateColdPackage, useRequestColdPurge, useRunColdPurge, useSaveColdSettings } from '@features/cold-archive/hooks'

/**
 * 🧊 الأرشيف البارد (00315 · ٢/٤) — بوابة التطوير المركزية
 *  البيانات النصية تبقى في المنصة؛ الملفات القديمة تُسحب إلى قرص خارجي (الأداة — الجزء ٣)،
 *  تُتحقَّق بالبصمات، وبعد مهلة أمان تُحذف من السحابة (الجزء ٤). هذه الصفحة: الإعدادات · حزمة جديدة · الحزم.
 */
type Tab = 'packages' | 'new' | 'settings'

const monthAgo = (months: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10) }
const endOfPrevMonth = () => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10) }

export default function ColdArchivePage() {
  const [tab, setTab] = useState<Tab>('packages')
  return (
    <section className="space-y-5" dir="rtl" data-testid="cold-archive-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-cyan-950 to-sky-800 p-5 text-white shadow-xl sm:p-6">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-200"><ShieldCheck size={16} /> إجراء محمي · IT فقط</span>
        <h1 className="mt-2 text-2xl font-black">الأرشيف البارد</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-cyan-100">
          البيانات النصية تبقى في المنصة إلى الأبد. الصور والملفات القديمة تُسحب إلى قرص خارجي، تُتحقَّق بالبصمات، وبعد مهلة أمان تُحذف من السحابة فقط —
          ويبقى مكان كل ملف بطاقة تدل على الحزمة والقرص.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="تبويبات الأرشيف البارد">
        {([['packages', 'الحزم', Archive], ['new', 'حزمة جديدة', HardDrive], ['settings', 'الإعدادات', Settings2]] as const).map(([id, label, Ico]) => (
          <button key={id} type="button" onClick={() => setTab(id)} data-testid={`cold-tab-${id}`}
            className={clsx('inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition', tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50')}>
            <Ico size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {tab === 'packages' && <PackagesTab />}
      {tab === 'new' && <NewPackageTab onCreated={() => setTab('packages')} />}
      {tab === 'settings' && <SettingsTab />}
    </section>
  )
}

/* ─────────────── الحزم ─────────────── */
function PackagesTab() {
  const q = useColdPackages()
  const [open, setOpen] = useState<string | null>(null)
  if (q.isLoading) return <div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل الحزم…" /></div>
  if (q.isError) return <ErrorBox onRetry={() => void q.refetch()} />
  const rows = q.data ?? []
  if (rows.length === 0) return <EmptyState title="لا توجد حزم بعد" hint="أنشئ حزمة لفترة منتهية من تبويب «حزمة جديدة»." />
  return (
    <div className="space-y-3" data-testid="cold-packages">
      {rows.map((p) => <PackageCard key={p.id} p={p} expanded={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
    </div>
  )
}

const STATUS_CLASS: Record<ColdPackage['status'], string> = {
  ready: 'bg-amber-100 text-amber-800', verified: 'bg-emerald-100 text-emerald-800', purging: 'bg-sky-100 text-sky-800', purged: 'bg-slate-200 text-slate-700', cancelled: 'bg-red-100 text-red-700',
}

function PackageCard({ p, expanded, onToggle }: { p: ColdPackage; expanded: boolean; onToggle: () => void }) {
  const detail = useColdPackage(expanded ? p.id : null)
  const cancel = useCancelColdPackage()
  const [reason, setReason] = useState('')
  const pct = p.file_count ? Math.round((p.downloaded_count / p.file_count) * 100) : 0
  const d = detail.data ?? p
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`cold-pkg-${p.code}`}>
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 text-right">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-black text-slate-900" dir="ltr">{p.code}</span>
            <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_CLASS[p.status])}>{COLD_STATUS_LABEL[p.status]}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            الفترة {formatDate(p.period_from)} → {formatDate(p.period_to)} · أُنشئت {formatDateTime(p.created_at)} بواسطة {p.created_by_name ?? '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Stat label="الملفات" value={String(p.file_count)} />
          <Stat label="الحجم" value={formatBytes(p.total_bytes)} />
          <Stat label="نُزِّل" value={`${pct}%`} />
          <Stat label="النسخ" value={`${p.verified_copies} / ${p.required_copies}`} />
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <StepLine p={d} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <h4 className="mb-1 font-bold text-slate-800">محتوى الحزمة</h4>
              <ul className="space-y-0.5">
                {d.by_source.map((s) => <li key={s.source_key} className="flex justify-between"><span>{sourceLabel(s.source_key)}</span><span className="tabular-nums text-slate-600" dir="ltr">{s.files} · {formatBytes(s.bytes)}</span></li>)}
              </ul>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <h4 className="mb-1 font-bold text-slate-800">النسخ المتحقَّق منها</h4>
              {d.copies.length === 0 ? <p className="text-slate-500">لا نسخ بعد — استخدم زر «تنزيل الحزمة إلى مجلد» أدناه.</p> : (
                <ul className="space-y-0.5">{d.copies.map((c) => <li key={c.disk_label} className="flex justify-between"><span>القرص «{c.disk_label}»</span><span className="text-slate-600">{formatDateTime(c.verified_at)} · {c.verified_by_name ?? '—'}</span></li>)}</ul>
              )}
              {d.purge_available_at && <p className="mt-2 text-xs text-slate-600">الحذف متاح اعتباراً من {formatDateTime(d.purge_available_at)}</p>}
            </div>
          </div>
          {(d.status === 'ready' || d.status === 'verified') && <PullPanel p={d} />}
          {d.events && d.events.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer font-bold text-slate-700">سجل الأحداث ({d.events.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">{d.events.map((e, i) => <li key={i}>{formatDateTime(e.at)} · {eventLabel(e.action)} · {e.actor_name ?? '—'}</li>)}</ul>
            </details>
          )}
          {(d.status === 'verified' || d.status === 'purging') && <PurgePanel p={d} />}
          {(p.status === 'ready' || p.status === 'verified') && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الإلغاء (إلزامي)" className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm" data-testid="cold-cancel-reason" />
              <button type="button" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate({ id: p.id, reason: reason.trim() })}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-cancel-btn"><X size={16} />إلغاء الحزمة</button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

/** لوحة الحذف من المنصة — IT فقط: جاهزية → (موافقة ثنائية اختيارية) → تأكيد بكتابة الرمز → تنفيذ دفعات قابل للاستئناف */
function PurgePanel({ p }: { p: ColdPackage }) {
  const request = useRequestColdPurge(), approve = useApproveColdPurge(), run = useRunColdPurge()
  const canRequest = useCanCall('cold_archive_purge_request'), canApprove = useCanCall('cold_archive_purge_approve'), canConfirm = useCanCall('cold_archive_purge_confirm')
  const [confirm, setConfirm] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const graceOver = Boolean(p.purge_available_at && new Date(p.purge_available_at) <= new Date())
  const copiesOk = p.verified_copies >= p.required_copies
  const needApproval = p.purge_approval_required
  const approved = Boolean(p.purge_approved_at)
  const chain = p.purge_chain   // 00338: سلسلة من التطوير المركزية تحلّ محل موافقة IT الثانية
  const resuming = p.status === 'purging'
  const ready = resuming || (copiesOk && graceOver && (!needApproval || approved))
  const busy = run.isPending
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4" data-testid="cold-purge-panel">
      <h4 className="flex items-center gap-2 font-black text-red-900"><Trash2 size={16} />الحذف من المنصة</h4>
      <p className="mt-1 text-xs text-red-800">يحذف الملفات من سحابة المنصة فقط. السجلات النصية تبقى، ويظهر مكان كل صورة بطاقة تدل على الحزمة والقرص. لا رجوع إلا من نسخة القرص.</p>
      <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <Check ok={copiesOk} label={`النسخ المتحقَّق منها ${p.verified_copies} / ${p.required_copies}`} />
        <Check ok={graceOver} label={p.purge_available_at ? (graceOver ? 'انتهت مهلة الأمان' : `مهلة الأمان حتى ${formatDateTime(p.purge_available_at)}`) : 'مهلة الأمان لم تبدأ'} />
        {needApproval && <Check ok={Boolean(p.purge_requested_at)} label={p.purge_requested_at ? `طلب الحذف: ${p.purge_requested_by_name ?? '—'} · ${formatDateTime(p.purge_requested_at)}` : 'لم يُطلب الحذف بعد'} />}
        {needApproval && <Check ok={approved} label={approved ? `وافق: ${p.purge_approved_by_name ?? '—'} · ${formatDateTime(p.purge_approved_at as string)}` : chain ? `بانتظار سلسلة الموافقات (خطوة ${chain.current_step ?? '—'} من ${chain.total_steps})` : 'بانتظار موافقة حساب IT آخر'} />}
      </ul>
      {chain && !approved && (
        <ol className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-xs" data-testid="cold-purge-chain">
          {chain.steps.map((st) => (
            <li key={st.step_no} data-testid={`cold-purge-chain-step-${st.step_no}`} className={st.status === 'pending' ? 'font-black text-[#0b3d6b]' : st.status === 'approved' ? 'text-emerald-800' : st.status === 'rejected' ? 'text-red-800' : 'text-slate-500'}>
              {st.step_no}. {st.label} — {st.status === 'pending' ? `بانتظار: ${st.approvers ?? '—'}` : st.status === 'approved' ? `وافق ${st.decided_by ?? ''}` : st.status === 'rejected' ? `رفض ${st.decided_by ?? ''}` : st.status === 'skipped' ? 'تُخطّيت' : 'لاحقاً'}{st.note ? ` · ${st.note}` : ''}
            </li>
          ))}
        </ol>
      )}

      {needApproval && !resuming && !approved && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!p.purge_requested_at && (
            <button type="button" disabled={request.isPending || !copiesOk || !canRequest.allowed} title={canRequest.title} onClick={() => request.mutate(p.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-purge-request">
              <UserCheck size={14} />طلب الحذف
            </button>
          )}
          {p.purge_requested_at && (
            chain
              ? <span className="text-xs text-slate-600" data-testid="cold-purge-chain-note">القرار يُتَّخذ من صفحة «طلبات الموافقة» لدى الموافقين في السلسلة — ستصلك إشعارات بالنتيجة.</span>
              : p.purge_requested_by_me
              ? <span className="text-xs text-slate-600">أنت طالب الحذف — الموافقة يجب أن تأتي من حساب IT آخر.</span>
              : <button type="button" disabled={approve.isPending || !canApprove.allowed} title={canApprove.title} onClick={() => approve.mutate(p.id)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-purge-approve"><UserCheck size={14} />الموافقة على الحذف</button>
          )}
        </div>
      )}

      {ready && (
        <div className="mt-3 space-y-2">
          {progress && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-red-100" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total} data-testid="cold-purge-progress">
              <div className="h-full bg-red-600 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          )}
          {resuming && <p className="text-xs font-bold text-red-800">توقف الحذف سابقاً عند {p.purged_count} / {p.file_count} — يمكنك الاستئناف.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`اكتب رمز الحزمة للتأكيد: ${p.code}`} dir="ltr" className="h-10 flex-1 rounded-xl border border-red-300 bg-white px-3 font-mono text-sm" data-testid="cold-purge-confirm" disabled={busy} />
            <button type="button" disabled={confirm.trim() !== p.code || busy || !canConfirm.allowed} title={canConfirm.title}
              onClick={() => run.mutate({ id: p.id, onProgress: (done, total) => setProgress({ done, total }) })}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-700 px-5 text-sm font-black text-white disabled:opacity-50" data-testid="cold-purge-run">
              <Trash2 size={16} />{busy ? `جارٍ الحذف… ${progress ? `${progress.done}/${progress.total}` : ''}` : resuming ? 'استئناف الحذف' : `حذف ${p.file_count} ملف من المنصة`}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className={clsx('flex items-center gap-2', ok ? 'text-emerald-800' : 'text-slate-600')}>{ok ? <CheckCircle2 size={14} /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-400" />}{label}</li>
}

/** تنزيل الحزمة إلى مجلد من المتصفح مباشرة (00320): اختيار مجلد → تنزيل → بصمات → تحقق → تسجيل النسخة — زر واحد، قابل للاستئناف */
function PullPanel({ p }: { p: ColdPackage }) {
  const pull = useBrowserPull()
  const [prog, setProg] = useState<PullProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = pull.isPending
  const supported = browserPullSupported()
  const needMore = p.verified_copies < p.required_copies
  const pct = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0
  const phaseLabel: Record<PullProgress['phase'], string> = { listing: 'جارٍ قراءة قائمة الملفات…', downloading: 'جارٍ التنزيل', verifying: 'جارٍ التحقق من القرص', registering: 'جارٍ تسجيل النسخة…', done: 'اكتمل' }
  const start = () => {
    setError(null); setProg(null)
    pull.mutate({ id: p.id, onProgress: setProg }, {
      onSuccess: (r) => {
        if (!r || r.verified) return
        if (r.failed > 0) {
          const reasons = [...new Set(r.failures.map((f) => f.reason))].slice(0, 3)
          const sample = r.failures[0] ? ` — مثال: ${r.failures[0].bucket}/${r.failures[0].path}` : ''
          setError(`تعذر تنزيل ${r.failed} ملف بعد 3 محاولات. السبب: ${reasons.join(' | ')}${sample}. اضغط الزر مرة أخرى واختر نفس المجلد للاستكمال.`)
        }
        else setError(`${r.corrupt} ملف على القرص لا يطابق الأصل — اضغط الزر مرة أخرى واختر نفس المجلد لإعادة تنزيلها.`)
      },
    })
  }
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4" data-testid="cold-pull-panel">
      <h4 className="flex items-center gap-2 font-black text-sky-900"><Download size={16} />{p.status === 'ready' ? 'تنزيل الحزمة إلى مجلد' : needMore ? 'نسخة إضافية على قرص آخر' : 'نسخة إضافية (اختياري)'}</h4>
      <p className="mt-1 text-xs text-sky-900/80">اضغط الزر واختر مجلداً (قرص داخلي أو خارجي). المنصة تنسخ الملفات، تحسب بصماتها، تتحقق منها على القرص، وتسجّل النسخة — كل ذلك في خطوة واحدة. إن انقطع الاتصال اضغط مرة أخرى واختر نفس المجلد.</p>
      <p className="mt-1 text-xs text-sky-900/70">الترتيب على القرص: <span className="font-bold">الأرشيف البارد &lt;الفترة&gt;</span> ← المصدر (صور الإعلام، الشكاوى الرسمية…) ← الشهر ← اليوم ← <span dir="ltr" className="font-mono">2026-01-15_001.jpg</span>، مع ملف <span className="font-bold">الفهرس.csv</span> يربط كل ملف بسجله الأصلي.</p>
      {!supported && <p className="mt-2 rounded-xl bg-amber-100 p-2 text-xs font-bold text-amber-900" data-testid="cold-pull-unsupported">هذا المتصفح لا يدعم الكتابة إلى مجلد — افتح الصفحة في Chrome أو Edge على الحاسوب.</p>}
      {prog && running && (
        <div className="mt-3 space-y-1" data-testid="cold-pull-progress">
          <div className="flex justify-between text-xs font-bold text-sky-900"><span>{phaseLabel[prog.phase]}</span><span dir="ltr">{prog.done} / {prog.total} · {formatBytes(prog.bytes)}</span></div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100"><div className="h-full bg-sky-600 transition-all" style={{ width: `${pct}%` }} /></div>
          {(prog.missing > 0 || prog.failed > 0) && <p className="text-[11px] text-slate-600">مفقودة في التخزين: {prog.missing} · فشلت: {prog.failed}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-800">{error}</p>}
      <button type="button" onClick={start} disabled={!supported || running}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-5 text-sm font-black text-white disabled:opacity-50" data-testid="cold-pull-btn">
        <FolderOpen size={16} />{running ? 'جارٍ العمل…' : p.status === 'ready' && p.downloaded_count > 0 ? 'استكمال التنزيل — اختر نفس المجلد' : 'اختيار مجلد وبدء التنزيل'}
      </button>
    </section>
  )
}

function StepLine({ p }: { p: ColdPackage }) {
  const steps = [
    { k: 'created', label: 'أُنشئت', done: true },
    { k: 'downloaded', label: 'نُزِّلت', done: p.file_count > 0 && p.downloaded_count >= p.file_count },
    { k: 'verified', label: `تحقق ${p.verified_copies}/${p.required_copies}`, done: p.status === 'verified' || p.status === 'purging' || p.status === 'purged' },
    { k: 'grace', label: 'مهلة الأمان', done: Boolean(p.purge_available_at && new Date(p.purge_available_at) <= new Date()) },
    { k: 'purged', label: 'حُذفت من المنصة', done: p.status === 'purged' },
  ]
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="مراحل الحزمة">
      {steps.map((s, i) => (
        <li key={s.k} className="flex items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold', s.done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>
            {s.done ? <CheckCircle2 size={12} /> : <span className="inline-block h-3 w-3 rounded-full border border-slate-400" />}{s.label}
          </span>
          {i < steps.length - 1 && <span className="text-slate-300">◀</span>}
        </li>
      ))}
    </ol>
  )
}

/* ─────────────── حزمة جديدة ─────────────── */
function NewPackageTab({ onCreated }: { onCreated: () => void }) {
  const [from, setFrom] = useState(monthAgo(2))
  const [to, setTo] = useState(endOfPrevMonth())
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(false)
  const valid = Boolean(from && to && to >= from)
  const preview = useColdPreview(from, to, valid && armed)
  const create = useCreateColdPackage()
  const canCreate = useCanCall('cold_archive_package_create')
  const t = preview.data?.totals
  return (
    <div className="space-y-4" data-testid="cold-new">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-black text-slate-900">١ · اختر الفترة</h2>
        <p className="text-sm text-slate-500">فترة منتهية فقط (آخر يوم قبل اليوم). المعاينة لا تغيّر شيئاً.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm"><span className="mb-1 block font-bold">من</span><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setArmed(false) }} className="h-10 w-full rounded-xl border border-slate-300 px-3" data-testid="cold-from" /></label>
          <label className="text-sm"><span className="mb-1 block font-bold">إلى</span><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setArmed(false) }} className="h-10 w-full rounded-xl border border-slate-300 px-3" data-testid="cold-to" /></label>
          <div className="flex items-end"><button type="button" disabled={!valid} onClick={() => setArmed(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-preview-btn"><Database size={16} />معاينة</button></div>
        </div>
      </div>

      {armed && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="cold-preview">
          <h2 className="font-black text-slate-900">٢ · المعاينة</h2>
          {preview.isLoading ? <LoadingSpinner label="جارٍ حساب الفترة…" /> : preview.isError ? <ErrorBox onRetry={() => void preview.refetch()} /> : preview.data && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Big label="ملفات ستُسحب" value={String(t?.files ?? 0)} tone="sky" />
                <Big label="الحجم" value={formatBytes(t?.bytes)} tone="sky" />
                <Big label="محمية (تبقى)" value={String(t?.protected ?? 0)} tone="amber" />
                <Big label="مؤرشفة سابقاً" value={String(t?.already_archived ?? 0)} tone="slate" />
              </div>
              <table className="mt-4 w-full text-sm">
                <thead><tr className="text-right text-xs text-slate-500"><th className="py-1">المصدر</th><th>ملفات</th><th>الحجم</th><th>محمية</th><th>السبب</th></tr></thead>
                <tbody>
                  {preview.data.sources.map((s) => (
                    <tr key={s.source_key} className="border-t border-slate-100">
                      <td className="py-1.5 font-bold text-slate-800">{sourceLabel(s.source_key)}</td>
                      <td className="tabular-nums" dir="ltr">{s.files}</td><td className="tabular-nums" dir="ltr">{formatBytes(s.bytes)}</td>
                      <td className="tabular-nums" dir="ltr">{s.protected}</td><td className="text-xs text-slate-500">{s.reasons.join('، ')}</td>
                    </tr>
                  ))}
                  {preview.data.sources.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-slate-500">لا ملفات في هذه الفترة للمصادر المفعّلة.</td></tr>}
                </tbody>
              </table>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm" data-testid="cold-note" />
                <button type="button" disabled={(t?.files ?? 0) === 0 || create.isPending || !canCreate.allowed} title={canCreate.title}
                  onClick={() => create.mutate({ from, to, note: note.trim() || null }, { onSuccess: onCreated })}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-700 px-5 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-create-btn">
                  <Archive size={16} />إنشاء الحزمة ({t?.files ?? 0} ملف)
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">إنشاء الحزمة يثبّت قائمة الملفات فقط — لا يُحذف شيء. الحذف لا يُفتح إلا بعد التنزيل والتحقق وانتهاء المهلة.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────── الإعدادات ─────────────── */
function SettingsTab() {
  const q = useColdSettings()
  if (q.isLoading) return <div className="rounded-2xl bg-white p-12"><LoadingSpinner label="جارٍ تحميل الإعدادات…" /></div>
  if (q.isError || !q.data) return <ErrorBox onRetry={() => void q.refetch()} />
  return <SettingsForm initial={q.data} />
}

function SettingsForm({ initial }: { initial: ColdSettings }) {
  const save = useSaveColdSettings()
  const [copies, setCopies] = useState(initial.required_copies)
  const [grace, setGrace] = useState(initial.grace_days)
  const [approval, setApproval] = useState(initial.purge_approval)
  const [sources, setSources] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(initial.sources).map(([k, v]) => [k, v.enabled])))
  const [prot, setProt] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(initial.protections).map(([k, v]) => [k, v.on])))
  const dirty = useMemo(() => copies !== initial.required_copies || grace !== initial.grace_days || approval !== initial.purge_approval
    || Object.entries(sources).some(([k, v]) => v !== initial.sources[k]?.enabled) || Object.entries(prot).some(([k, v]) => v !== initial.protections[k]?.on), [copies, grace, approval, sources, prot, initial])
  return (
    <form className="space-y-4" data-testid="cold-settings" onSubmit={(e) => { e.preventDefault(); save.mutate({ required_copies: copies, grace_days: grace, sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { enabled: v }])), protections: prot, purge_approval: approval }) }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <span className="block font-black text-slate-900">النسخ المتحقَّق منها قبل فتح الحذف</span>
          <span className="block text-xs text-slate-500">قرص واحد افتراضياً؛ قرصان أأمن.</span>
          <input type="number" min={1} max={5} value={copies} onChange={(e) => setCopies(Number(e.target.value))} className="mt-2 h-10 w-28 rounded-xl border border-slate-300 px-3" data-testid="cold-copies" />
        </label>
        <label className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <span className="block font-black text-slate-900">مهلة الأمان بعد التحقق (أيام)</span>
          <span className="block text-xs text-slate-500">0 = الحذف متاح فور التحقق.</span>
          <input type="number" min={0} max={365} value={grace} onChange={(e) => setGrace(Number(e.target.value))} className="mt-2 h-10 w-28 rounded-xl border border-slate-300 px-3" data-testid="cold-grace" />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} className="mt-1 h-4 w-4" data-testid="cold-approval" />
        <span><span className="block font-black text-slate-900">موافقة ثنائية على الحذف (اختياري)</span>
          <span className="block text-xs text-slate-500">عند التفعيل: حساب IT يطلب الحذف، ويوافق حساب IT <b>آخر</b> قبل أن يُفتح زر الحذف. معطّل افتراضياً.</span></span>
      </label>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 font-black text-slate-900">المصادر — ما الذي يدخل الحزم ويُحذف بعد التحقق</legend>
        <p className="text-xs text-slate-500">المصادر الحساسة (مستندات الموظفين، صور الآليات، مرفقات الصيانة، الأغلفة) معطّلة افتراضياً وتبقى في المنصة.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(initial.sources).map(([k, s]) => (
            <li key={k} className={clsx('flex items-start gap-3 rounded-xl border p-3 text-sm', s.sensitive ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200')}>
              <input type="checkbox" checked={sources[k] ?? false} onChange={(e) => setSources({ ...sources, [k]: e.target.checked })} className="mt-1 h-4 w-4" data-testid={`cold-src-${k}`} />
              <span><span className="block font-bold text-slate-800">{s.label}{s.sensitive && <span className="mr-2 rounded bg-amber-200 px-1.5 text-[10px] font-black text-amber-900">حساس</span>}</span>
                <span className="block text-xs text-slate-500">{s.description} · <span dir="ltr" className="font-mono">{s.bucket}</span></span></span>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 font-black text-slate-900">الحمايات — سجلات تبقى ملفاتها حتى لو كانت ضمن الفترة</legend>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {Object.entries(initial.protections).map(([k, p]) => (
            <li key={k} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
              <input type="checkbox" checked={prot[k] ?? false} onChange={(e) => setProt({ ...prot, [k]: e.target.checked })} className="mt-1 h-4 w-4" data-testid={`cold-prot-${k}`} />
              <span className="font-bold text-slate-800">{p.label}</span>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!dirty || save.isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-50" data-testid="cold-save-settings"><ShieldCheck size={16} />حفظ الإعدادات</button>
        {initial.updated_at && <span className="text-xs text-slate-500">آخر تحديث {formatDateTime(initial.updated_at)}</span>}
      </div>
    </form>
  )
}

/* ─────────────── مشتركات ─────────────── */
function Stat({ label, value }: { label: string; value: string }) {
  return <span className="text-slate-600"><span className="text-xs text-slate-400">{label} </span><b className="tabular-nums text-slate-900" dir="ltr">{value}</b></span>
}
function Big({ label, value, tone }: { label: string; value: string; tone: 'sky' | 'amber' | 'slate' }) {
  const cls = { sky: 'bg-sky-50 text-sky-900', amber: 'bg-amber-50 text-amber-900', slate: 'bg-slate-100 text-slate-700' }[tone]
  return <div className={clsx('rounded-xl p-3', cls)}><div className="text-xs">{label}</div><div className="text-xl font-black tabular-nums" dir="ltr">{value}</div></div>
}
function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-red-800">
      <AlertTriangle className="mx-auto" aria-hidden="true" /><p className="mt-1 text-sm">تعذر التحميل. تحقق من الاتصال ثم أعد المحاولة.</p>
      <button type="button" onClick={onRetry} className="mx-auto mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold ring-1 ring-red-200"><RefreshCw size={14} />إعادة المحاولة</button>
    </div>
  )
}
export const SOURCE_LABELS: Record<string, string> = {
  media_submission_photos: 'صور الإعلام', contractor_checkins: 'صور المتعهدين', complaint_media: 'مرفقات الشكاوى', citizen_complaint_photos: 'صور شكاوى المواطنين',
  citizen_chat_attachments: 'مرفقات محادثات المواطنين', sector_photos: 'صور القواطع', gbs_container_updates: 'صور حاويات GBS', vehicle_maintenance_attachments: 'مرفقات الصيانة',
  garage_vehicles: 'صور الآليات', employee_documents: 'مستندات الموظفين', media_covers: 'أغلفة الإعلام',
}
const sourceLabel = (k: string) => SOURCE_LABELS[k] ?? k
const EVENT_LABELS: Record<string, string> = {
  created: 'إنشاء الحزمة', cancelled: 'إلغاء', item_missing: 'ملف غير موجود في التخزين', copy_verified: 'تحقق نسخة قرص', copy_verify_failed: 'فشل تحقق نسخة',
  purge_requested: 'طلب الحذف', purge_chain_opened: 'فتح سلسلة الموافقات', purge_rejected: 'رفض الحذف (السلسلة)', purge_approved: 'الموافقة على الحذف', purge_started: 'بدء الحذف', purge_batch: 'دفعة حذف', purge_completed: 'اكتمال الحذف', settings_updated: 'تحديث الإعدادات',
}
const eventLabel = (a: string) => EVENT_LABELS[a] ?? a
