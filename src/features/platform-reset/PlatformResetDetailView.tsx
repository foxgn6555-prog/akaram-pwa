/**
 * 00398-ب — صفحة تفاصيل التصفير (تُفتح من مهمة الموافقة في أي بوابة، ومن سجل وحدة التصفير):
 * كل أنواع البيانات التي ستُحذف مع أعدادها، المسار، ثم «الموافقة على التصفير» بكلمة سر «اعتماد تصفير» (تنفيذ فوري) أو الرفض بسبب.
 * بعد التنفيذ: زر حذف ملفات التخزين (ومسح مستودع GPS) من المتصفح.
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, HardDrive, ShieldCheck, XCircle } from 'lucide-react'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { dateAr, timeAr } from '@features/sector-manager/format'
import { PLATFORM_RESET_APPROVE_PASSWORD, usePlatformResetApprove, usePlatformResetDetail, usePlatformResetReject, usePlatformResetWipeStorage } from './hooks'

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')
const STEP_AR: Record<string, string> = { approved: 'موافَق', rejected: 'مرفوض', pending: 'بانتظار القرار', waiting: 'لاحقاً', skipped: 'أُلغيت' }

export function PlatformResetDetailView({ id, onClose, canWipeStorage = false }: { id: string; onClose: () => void; canWipeStorage?: boolean }) {
  const d = usePlatformResetDetail(id)
  const approve = usePlatformResetApprove(), reject = usePlatformResetReject(), wipe = usePlatformResetWipeStorage()
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle'), [pw, setPw] = useState(''), [note, setNote] = useState(''), [progress, setProgress] = useState(0)
  const x = d.data
  const groups = x ? [...new Set(x.categories.map((c) => c.grp))] : []
  const storagePending = !!x && x.status === 'done' && x.storage_buckets.length > 0 && !x.storage_done_at
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/60 p-2 sm:p-6" dir="rtl" data-testid="pr-detail" role="dialog" aria-modal="true" aria-labelledby="pr-detail-title">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 rounded-t-3xl bg-gradient-to-l from-rose-700 to-rose-900 p-5 text-white">
          <div>
            <h2 id="pr-detail-title" className="text-lg font-black"><AlertTriangle size={18} className="inline" /> تفاصيل طلب تصفير المنصة</h2>
            <p className="mt-1 text-xs text-rose-100">كل ما يلي سيُحذف نهائياً ولا يمكن استرجاعه. راجع القائمة كاملة قبل القرار.</p>
          </div>
          <button type="button" data-testid="pr-detail-close" onClick={onClose} className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-bold">إغلاق</button>
        </div>
        {d.isLoading || !x ? <div className="p-8"><LoadingSpinner /></div> : (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <Stat label="الحالة" value={x.status_label} tone={x.status === 'done' ? 'red' : x.status === 'pending_approval' ? 'amber' : 'slate'} testId="pr-status" />
              <Stat label="فئات البيانات" value={String(x.categories.length)} testId="pr-cats" />
              <Stat label="سجلات ستُحذف" value={num(x.total_rows)} tone="red" testId="pr-rows" />
              <Stat label="ملفات ستُحذف" value={num(x.total_files)} tone="red" testId="pr-files" />
            </div>
            <div className="text-xs text-slate-600">طلبه <b>{x.requested_by_name ?? '—'}</b> · {dateAr(x.created_at)} {timeAr(x.created_at)}{x.via_chain ? ' · عبر سلسلة «تصفير المنصة»' : ' · بلا سلسلة (تنفيذ مباشر)'}</div>
            {x.includes_accounts && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-900" data-testid="pr-accounts-warn">
                <ShieldCheck size={14} className="inline" /> يشمل الحسابات: تُحذف كل حسابات الدخول ما عدا حساب من ينفّذ التصفير وحسابات المدير المفوض.
              </div>
            )}
            <div className="space-y-3" data-testid="pr-categories">
              {groups.map((g) => (
                <div key={g}>
                  <div className="mb-1 text-xs font-black text-slate-500">{g}</div>
                  <ul className="space-y-1">
                    {x.categories.filter((c) => c.grp === g).map((c) => (
                      <li key={c.key} className="rounded-xl border bg-slate-50 px-3 py-2 text-sm" data-testid={`pr-cat-${c.key}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">{c.label}{c.auto_added && <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">أُضيفت تلقائياً (اعتمادية)</span>}</span>
                          <span className="text-xs text-slate-700"><Database size={12} className="inline" /> <b className="tabular-nums">{num(c.rows)}</b> سجل{c.buckets.length > 0 && <> · <HardDrive size={12} className="inline" /> <b className="tabular-nums">{num(c.files)}</b> ملف</>}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500" dir="ltr">{c.tables.join(' · ')}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {x.timeline.length > 0 && (
              <ol className="space-y-1 rounded-xl border p-3 text-xs" data-testid="pr-timeline">
                {x.timeline.map((s) => (
                  <li key={s.step_no} className="flex flex-wrap items-center gap-1">
                    {s.status === 'approved' ? <CheckCircle2 size={12} className="text-emerald-600" /> : s.status === 'rejected' ? <XCircle size={12} className="text-rose-600" /> : <span className="inline-block size-3 rounded-full bg-slate-300" />}
                    <b>{s.step_no}.</b> {s.label} — {STEP_AR[s.status] ?? s.status}{s.decided_by ? ` — ${s.decided_by}` : ''}{s.note ? ` («${s.note}»)` : ''}
                  </li>
                ))}
              </ol>
            )}
            {x.rejected_note && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">سبب الرفض: «{x.rejected_note}»</div>}
            {x.result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" data-testid="pr-result">
                نُفِّذ {dateAr(x.executed_at)} {timeAr(x.executed_at)} · حُذف <b className="tabular-nums">{num(x.result.rows_deleted)}</b> سجل من <b>{x.result.tables}</b> جدول
                {x.result.users_deleted > 0 && <> · <b>{x.result.users_deleted}</b> حساب (بقي {x.result.protected_users})</>} · خلال {Math.round(x.result.duration_ms / 100) / 10} ث · استرداد المساحة مجدول تلقائياً.
                {x.storage_done_at ? <div className="mt-1">ملفات التخزين: حُذفت ({num(x.storage_deleted)} ملف).</div> : x.storage_buckets.length > 0 ? <div className="mt-1 font-bold text-amber-900">ملفات التخزين ({x.storage_buckets.length} حاوية) لم تُحذف بعد — تُحذف من وحدة التصفير بحساب التطوير المركزية.</div> : null}
              </div>
            )}
            {storagePending && canWipeStorage && (
              <button type="button" data-testid="pr-wipe-storage" disabled={wipe.isPending} onClick={() => wipe.mutate({ id: x.id, warehouse: !!x.result?.warehouse_wipe, onProgress: setProgress })}
                className="h-11 w-full rounded-xl bg-amber-600 text-sm font-black text-white disabled:opacity-50">
                {wipe.isPending ? `جارٍ حذف الملفات… ${num(progress)}` : `حذف ملفات التخزين الآن (${num(x.total_files)} ملف${x.result?.warehouse_wipe ? ' + مسح مستودع GPS' : ''})`}
              </button>
            )}
            {x.status === 'pending_approval' && x.can_approve && (
              mode === 'idle' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-testid="pr-approve" onClick={() => setMode('approve')} className="h-12 rounded-xl bg-rose-700 text-sm font-black text-white"><CheckCircle2 size={16} className="inline" /> الموافقة على التصفير</button>
                  <button type="button" data-testid="pr-reject" onClick={() => setMode('reject')} className="h-12 rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-800"><XCircle size={16} className="inline" /> رفض</button>
                </div>
              ) : mode === 'approve' ? (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3" data-testid="pr-approve-box">
                  <label className="text-xs font-black text-rose-900">اكتب «{PLATFORM_RESET_APPROVE_PASSWORD}» لتأكيد الحذف النهائي الفوري
                    <input data-testid="pr-approve-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" />
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" data-testid="pr-approve-confirm" disabled={pw.trim() !== PLATFORM_RESET_APPROVE_PASSWORD || approve.isPending}
                      onClick={() => approve.mutate({ id: x.id, password: pw.trim() }, { onSuccess: () => { setMode('idle'); setPw('') } })}
                      className="h-11 rounded-xl bg-rose-700 text-sm font-black text-white disabled:opacity-40">{approve.isPending ? 'جارٍ التصفير…' : 'تأكيد الموافقة والتنفيذ'}</button>
                    <button type="button" onClick={() => { setMode('idle'); setPw('') }} className="h-11 rounded-xl border bg-white text-sm font-bold">تراجع</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-300 bg-slate-50 p-3" data-testid="pr-reject-box">
                  <label className="text-xs font-bold text-slate-800">سبب الرفض (إلزامي)
                    <textarea data-testid="pr-reject-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" />
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" data-testid="pr-reject-confirm" disabled={note.trim().length < 3 || reject.isPending} onClick={() => reject.mutate({ id: x.id, note: note.trim() }, { onSuccess: () => setMode('idle') })}
                      className="h-11 rounded-xl bg-slate-800 text-sm font-black text-white disabled:opacity-40">تأكيد الرفض</button>
                    <button type="button" onClick={() => setMode('idle')} className="h-11 rounded-xl border bg-white text-sm font-bold">تراجع</button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'slate', testId }: { label: string; value: string; tone?: 'slate' | 'red' | 'amber'; testId?: string }) {
  const cls = tone === 'red' ? 'bg-rose-50 text-rose-900 border-rose-200' : tone === 'amber' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-slate-50 text-slate-800 border-slate-200'
  return <div className={`rounded-xl border p-2 ${cls}`}><div className="text-[11px] font-bold opacity-70">{label}</div><div className="text-base font-black tabular-nums" data-testid={testId}>{value}</div></div>
}
