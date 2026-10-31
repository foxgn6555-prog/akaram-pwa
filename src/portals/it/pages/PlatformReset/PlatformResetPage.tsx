/**
 * 00398-ب — وحدة «التصفير» (التطوير المركزية):
 * ① شاشة قفل بكلمة سر «تصفير»  ② شبكة فئات البيانات (كل الأنواع بلا استثناء) مع الأعداد + «تحديد الكل» + ضم الاعتماديات تلقائياً
 * ③ زر «تصفير» ⇒ كلمة السر مجدداً ⇒ «تم إرسال طلب التصفير» (أو تنفيذ فوري بلا سلسلة)  ④ سجل الطلبات + التفاصيل + حذف ملفات التخزين.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckSquare, Database, HardDrive, Lock, ShieldCheck, Square, Trash2 } from 'lucide-react'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useCanCall } from '@features/permissions/my-permissions'
import { dateAr, timeAr } from '@features/sector-manager/format'
import {
  PLATFORM_RESET_ENTRY_PASSWORD, PlatformResetDetailView, platformReset, usePlatformResetCancel, usePlatformResetCounts, usePlatformResetList, usePlatformResetRequest,
  type PlatformResetCategory,
} from '@features/platform-reset'

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')

export default function PlatformResetPage() {
  const [unlocked, setUnlocked] = useState(false)
  return (
    <section aria-labelledby="pr-title" className="space-y-4" data-testid="platform-reset-page">
      <div>
        <h1 id="pr-title" className="text-lg font-black text-rose-900"><Trash2 size={18} className="inline" /> التصفير</h1>
        <p className="text-sm text-slate-500">تصفير بيانات المنصة بالفئات — حذف نهائي يحرّر المساحة فعلياً ويُسجَّل، ويمرّ بسلسلة «تصفير المنصة» إن كانت مضبوطة.</p>
      </div>
      {!unlocked ? <LockScreen onUnlock={() => setUnlocked(true)} /> : <ResetConsole />}
    </section>
  )
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState(false)
  const submit = () => { if (pw.trim() === PLATFORM_RESET_ENTRY_PASSWORD) onUnlock(); else setErr(true) }
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm" data-testid="pr-lock">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-800"><Lock size={26} /></div>
      <h2 className="mt-3 text-base font-black">هذه الوحدة محمية</h2>
      <p className="mt-1 text-xs text-slate-500">اكتب كلمة السر «{PLATFORM_RESET_ENTRY_PASSWORD}» للدخول.</p>
      <input data-testid="pr-lock-pw" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false) }} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} autoFocus
        className="mt-3 h-11 w-full rounded-xl border px-3 text-center text-sm" placeholder="كلمة السر" />
      {err && <div className="mt-1 text-xs font-bold text-rose-700" data-testid="pr-lock-err">كلمة السر غير صحيحة</div>}
      <button type="button" data-testid="pr-lock-enter" onClick={submit} className="mt-3 h-11 w-full rounded-xl bg-rose-700 text-sm font-black text-white">دخول</button>
    </div>
  )
}

function ResetConsole() {
  const counts = usePlatformResetCounts()
  const list = usePlatformResetList()
  const request = usePlatformResetRequest(), cancel = usePlatformResetCancel()
  const canRequest = useCanCall('platform_reset_request')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [auto, setAuto] = useState<string[]>([])
  const [ask, setAsk] = useState(false), [pw, setPw] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const cats = useMemo(() => counts.data?.categories ?? [], [counts.data])
  const groups = useMemo(() => [...new Set(cats.map((c) => c.grp))], [cats])
  const pending = counts.data?.pending ?? null

  // ضم الاعتماديات تلقائياً: ما تختاره قد يستلزم فئات أخرى (مفاتيح إلزامية) — تُعلَّم وتُميَّز
  useEffect(() => {
    if (sel.size === 0) { setAuto([]); return }
    let alive = true
    platformReset.closure([...sel]).then((r) => { if (!alive) return; setAuto(r.added); if (r.added.some((k) => !sel.has(k))) setSel(new Set(r.categories)) }).catch(() => { if (alive) setAuto([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...sel].sort().join(',')])

  const toggle = (c: PlatformResetCategory) => setSel((s) => { const n = new Set(s); if (n.has(c.key)) { n.delete(c.key); for (const a of auto) n.delete(a) } else n.add(c.key); return n })
  const all = cats.length > 0 && sel.size === cats.length
  const totalRows = cats.filter((c) => sel.has(c.key)).reduce((s, c) => s + (c.rows ?? 0), 0), totalFiles = cats.filter((c) => sel.has(c.key)).reduce((s, c) => s + (c.files ?? 0), 0)
  const submit = () => request.mutate({ categories: [...sel], password: pw.trim() }, { onSuccess: (r) => { setAsk(false); setPw(''); setSel(new Set()); if (!r.via_chain) setOpenId(r.id) } })

  return (
    <div className="space-y-4">
      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="pr-pending-banner">
          <span><AlertTriangle size={14} className="inline" /> يوجد طلب تصفير {pending.status === 'pending_approval' ? 'بانتظار الموافقات' : 'قيد التنفيذ'} منذ {dateAr(pending.created_at)} {timeAr(pending.created_at)} — لا يمكن إرسال طلب آخر قبل اكتماله.</span>
          <div className="flex gap-2">
            <button type="button" data-testid="pr-pending-detail" onClick={() => setOpenId(pending.id)} className="rounded-lg border bg-white px-3 py-1 text-xs font-bold">التفاصيل</button>
            {pending.status === 'pending_approval' && <button type="button" data-testid="pr-pending-cancel" disabled={cancel.isPending} onClick={() => cancel.mutate(pending.id)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white disabled:opacity-50">{cancel.isPending ? "جارٍ…" : "إلغاء الطلب"}</button>}
          </div>
        </div>
      )}
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-black">اختر أنواع البيانات التي تريد تصفيرها</div>
          <button type="button" data-testid="pr-refresh-counts" disabled={counts.isFetching} onClick={() => void counts.refetch()} className="rounded-xl border px-3 py-1.5 text-xs font-bold disabled:opacity-50">{counts.isFetching ? 'جارٍ التحديث…' : 'تحديث الأعداد'}</button>
          <button type="button" data-testid="pr-select-all" onClick={() => setSel(all ? new Set() : new Set(cats.map((c) => c.key)))} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold">
            {all ? <CheckSquare size={14} /> : <Square size={14} />} {all ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
        </div>
        {counts.isLoading ? <div className="py-8"><LoadingSpinner /></div> : (
          <div className="mt-3 space-y-4" data-testid="pr-grid">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 text-xs font-black text-slate-500">{g}</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cats.filter((c) => c.grp === g).map((c) => {
                    const on = sel.has(c.key), isAuto = on && auto.includes(c.key)
                    return (
                      <label key={c.key} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition ${on ? (isAuto ? 'border-amber-300 bg-amber-50' : 'border-rose-300 bg-rose-50') : 'border-slate-200 bg-slate-50 hover:bg-white'}`} data-testid={`pr-cat-${c.key}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c)} className="mt-1 size-4 accent-rose-700" data-testid={`pr-cb-${c.key}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold leading-snug">{c.label}{isAuto && <span className="mr-1 rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-900">اعتمادية</span>}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-600"><Database size={11} className="inline" /> <b className="tabular-nums" data-testid={`pr-rows-${c.key}`}>{c.rows == null ? 'غير متاح' : num(c.rows)}</b> سجل{(c.buckets.length > 0 || c.key === 'gps_warehouse') && <> · <HardDrive size={11} className="inline" /> <b className="tabular-nums">{c.files == null ? 'غير متاح' : num(c.files)}</b> ملف</>}{c.protected_users != null && <> · <ShieldCheck size={11} className="inline" /> يبقى {c.protected_users} حساب</>}</span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">{c.key === 'gps_warehouse' ? 'فئة مستقلة — المشروع الثاني وأرشيفه فقط' : c.key === 'gps_warehouse_settings' ? 'إعدادات المشروع الثاني فقط' : `${c.tables.length} جدول`}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {cats.some((c) => sel.has(c.key) && (c.key === 'gps_warehouse' || c.key === 'gps_warehouse_settings') && (c.rows == null || c.files == null)) && <div className="mt-3 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-900">عدد مستودع GPS غير متاح. تحقّق من الاتصال بالمشروع الثاني واضغط «تحديث الأعداد»، أو ألغِ اختيار المستودع.</div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="text-xs text-slate-600" data-testid="pr-summary">المحدد: <b>{sel.size}</b> فئة · <b className="tabular-nums">{num(totalRows)}</b> سجل · <b className="tabular-nums">{num(totalFiles)}</b> ملف{sel.has('accounts') && <span className="mr-2 font-bold text-rose-800">· يشمل الحسابات (يبقى حسابك وحسابات المدير المفوض)</span>}</div>
          <button type="button" data-testid="pr-submit" disabled={sel.size === 0 || !!pending || !canRequest.allowed || cats.some((c) => sel.has(c.key) && (c.key === 'gps_warehouse' || c.key === 'gps_warehouse_settings') && (c.rows == null || c.files == null))} title={canRequest.title} onClick={() => setAsk(true)}
            className="inline-flex h-11 items-center gap-1 rounded-xl bg-rose-700 px-5 text-sm font-black text-white disabled:opacity-40"><Trash2 size={16} /> تصفير</button>
        </div>
        {ask && (
          <div className="mt-3 rounded-2xl border border-rose-300 bg-rose-50 p-4" data-testid="pr-confirm">
            <div className="text-sm font-black text-rose-900">تأكيد التصفير — اكتب «{PLATFORM_RESET_ENTRY_PASSWORD}»</div>
            <p className="mt-1 text-xs text-rose-800">إن كانت سلسلة «تصفير المنصة» مضبوطة يُرسل طلب ولا يُحذف شيء قبل اكتمال الموافقات؛ وإلا يُنفَّذ الحذف فوراً.</p>
            <input data-testid="pr-confirm-pw" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="mt-2 h-11 w-full rounded-xl border px-3 text-sm" placeholder="كلمة السر" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" data-testid="pr-confirm-go" disabled={pw.trim() !== PLATFORM_RESET_ENTRY_PASSWORD || request.isPending} onClick={submit} className="h-11 rounded-xl bg-rose-700 text-sm font-black text-white disabled:opacity-40">{request.isPending ? 'جارٍ…' : 'تأكيد'}</button>
              <button type="button" onClick={() => { setAsk(false); setPw('') }} className="h-11 rounded-xl border bg-white text-sm font-bold">إلغاء</button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-black">سجل طلبات التصفير</div>
        {list.isLoading ? <LoadingSpinner /> : (list.data ?? []).length === 0 ? <div className="py-6 text-center text-xs text-slate-500" data-testid="pr-log-empty">لا طلبات بعد.</div> : (
          <ul className="mt-2 divide-y text-sm" data-testid="pr-log">
            {(list.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`pr-log-${r.id}`}>
                <div>
                  <div className="font-bold">{r.status_label}{r.current_step ? ` — ${r.current_step}` : ''} <span className="text-xs font-normal text-slate-500">· {r.categories_count} فئة · {r.requested_by_name ?? '—'}</span></div>
                  <div className="text-[11px] text-slate-500">{dateAr(r.created_at)} {timeAr(r.created_at)}{r.rows_deleted != null ? ` · حُذف ${num(r.rows_deleted)} سجل` : ''}{r.users_deleted ? ` · ${r.users_deleted} حساب` : ''}{r.storage_pending ? ' · ملفات التخزين بانتظار الحذف' : ''}{r.rejected_note ? ` · «${r.rejected_note}»` : ''}</div>
                </div>
                <button type="button" data-testid={`pr-log-open-${r.id}`} onClick={() => setOpenId(r.id)} className={`rounded-lg px-3 py-1 text-xs font-bold ${r.storage_pending ? 'bg-amber-600 text-white' : 'border bg-white'}`}>{r.storage_pending ? 'حذف الملفات' : 'التفاصيل'}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {openId && <PlatformResetDetailView id={openId} onClose={() => setOpenId(null)} canWipeStorage />}
    </div>
  )
}
