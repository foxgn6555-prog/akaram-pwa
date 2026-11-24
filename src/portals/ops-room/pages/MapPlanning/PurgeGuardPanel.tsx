/**
 * لوحة «تصدير قبل الحذف» — الجولة ④.
 *
 * ─── ما الذي تفعله ولماذا هنا؟ ─────────────────────────────────────────────
 * `map_visits` مزوّدة من الجولة ① بسياسة احتفاظ شهر واحد مع تصدير إلزامي.
 * لكن «تصدير إلزامي» على مستوى **الطلب** لا على مستوى **اليوم**: طلب واحد
 * لـ٣٠ يوماً يجعل التصدير شرطاً لكل الأيام معاً، فلو صُدِّر ٢٩ يوماً ومرّ
 * الطلب، يُحذف الثلاثون بلا نسخة. هذه اللوحة تفحص **كل يوم على حدة**:
 *
 *   جاهز   — يوجد طلب احتفاظ قاطعه بعد هذا اليوم ومُثبت ببصمة/عدد صفوف
 *   ممنوع  — لا طلب يغطيه  ⇒ لا حذف
 *   ناقص   — طلب يغطيه لكن بلا بصمة ولا عدد صفوف ⇒ لا حذف
 *
 * ─── لماذا لا زر «احذف» هنا؟ ──────────────────────────────────────────────
 * لأن الحذف عملية **مُتعددة الخطوات بمُثبت** (طلب ← تصدير ← تأكيد ← دفعات)
 * وله شاشة مخصّصة (`data-retention`) تعرض الطلب وأثره. لو أضفنا زراً ثانياً
 * هنا لصار مساران للحذف، وأحدهما بلا سجل. هذه اللوحة **بوابة إثبات** تُقرأ
 * قبل الذهاب إلى الشاشة، لا منفذ تنفيذ.
 *
 * ─── البيانات تُقرأ من `map_visits` لا من نقاط GPS ─────────────────────────
 * لأن النقاط الخام تُحذف بعد ٤٨ ساعة، فلو اعتمدت اللوحة عليها لأظهرت
 * «٠ زيارة» بعد يومين — صفر كاذب يُغري بالحذف. وهذا بالضبط عطب الجولة ①.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useVisitPurgeGuard } from '@features/map-planning/hooks/useMapPlanning'
import type { VisitPurgeVerdict } from '@sdk/map-planning.sdk'

/** القاطع الافتراضي: اليوم (بغداد) ناقص مدة الاحتفاظ (٣٠ يوماً) */
function defaultCutoff(keepDays: number): string {
  return new Date(Date.now() + 3 * 60 * 60_000 - keepDays * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** ثلاث حالات، لا اثنتان — «ناقص» ليست «ممنوع» ولا «جاهز» */
type Verdict = 'ready' | 'blocked' | 'incomplete'

export function verdictOf(v: VisitPurgeVerdict): Verdict {
  if (!v.exported) return 'blocked'
  if (!v.can_purge) return 'incomplete'
  return 'ready'
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: 'جاهز للحذف',
  blocked: 'ممنوع — لا تصدير',
  incomplete: 'ناقص — الإثبات غير مكتمل',
}

/** ملخّص يُعرض في رأس اللوحة: ماذا سيجري فعلاً لو مرّ الطلب */
export interface GuardSummary {
  days: number
  visits: number
  readyDays: number
  blockedDays: number
  incompleteDays: number
  /** الزيارات المعرّضة للفقدان لو حُذف كل ما هو قديم بلا تمييز */
  atRiskVisits: number
  /** هل هناك يوم واحد على الأقل يحتاج تدخّلاً؟ */
  needsAction: boolean
}

export function summarize(rows: VisitPurgeVerdict[]): GuardSummary {
  const out: GuardSummary = {
    days: rows.length,
    visits: 0,
    readyDays: 0,
    blockedDays: 0,
    incompleteDays: 0,
    atRiskVisits: 0,
    needsAction: false,
  }
  for (const r of rows) {
    out.visits += r.visits
    const v = verdictOf(r)
    if (v === 'ready') out.readyDays += 1
    else {
      out.atRiskVisits += r.visits
      if (v === 'blocked') out.blockedDays += 1
      else out.incompleteDays += 1
    }
  }
  out.needsAction = out.blockedDays + out.incompleteDays > 0
  return out
}

export interface PurgeGuardPanelProps {
  /** مدة الاحتفاظ بالأيام — الافتراضي ٣٠ (قرار المالك للزيارات) */
  keepDays?: number
}

export function PurgeGuardPanel({ keepDays = 30 }: PurgeGuardPanelProps) {
  const [cutoff, setCutoff] = useState(() => defaultCutoff(keepDays))
  const { data, isLoading, isError, error } = useVisitPurgeGuard(cutoff, keepDays)
  const rows = useMemo(() => data ?? [], [data])
  const summary = useMemo(() => summarize(rows), [rows])

  return (
    <section
      dir="rtl"
      data-testid="purge-guard"
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-800">
            <ShieldAlert size={16} className="text-amber-600" />
            حارس «تصدير قبل الحذف»
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            يوم بيوم — لا طلب واحد لكل المدة. اليوم بلا نسخة مُثبتة لا يُحذف.
          </p>
        </div>
        <label className="flex items-center gap-1 text-[10px] font-black text-slate-500">
          القاطع
          <input
            type="date"
            value={cutoff}
            data-testid="purge-cutoff"
            onChange={(e) => setCutoff(e.target.value)}
            className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </label>
      </header>

      {isLoading && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500" data-testid="purge-loading">
          <Loader2 size={14} className="animate-spin" /> يُفحص…
        </p>
      )}

      {isError && (
        <p className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700" data-testid="purge-error">
          تعذّر الفحص: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        </p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600" data-testid="purge-empty">
          لا زيارات أقدم من {cutoff} — لا شيء يُحذف. هذه ليست حالة «آمنة» بل
          «لا بيانات»: الحارس لا يقول إن التصدير تمّ، بل إن لا شيء لُيمسّ.
        </p>
      )}

      {rows.length > 0 && (
        <>
          {/* الملخّص: الأرقام المعرّضة للفقدان أولاً، لا الجاهزة */}
          <div
            data-testid="purge-summary"
            className={`mb-3 rounded-xl p-3 text-xs ${
              summary.needsAction
                ? 'border border-amber-200 bg-amber-50 text-amber-900'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <p className="font-black" data-testid="purge-headline">
              {summary.days} يوماً · {summary.visits} زيارة
              {summary.needsAction
                ? ` — ${summary.blockedDays + summary.incompleteDays} يوماً بلا إثبات (${summary.atRiskVisits} زيارة معرّضة للفقدان)`
                : ' — كل الأيام مُثبتة التصدير'}
            </p>
            <p className="mt-1 text-[10px] opacity-80">
              {summary.readyDays} يوماً جاهز · {summary.blockedDays} ممنوع ·{' '}
              {summary.incompleteDays} ناقص الإثبات
            </p>
          </div>

          {/* الجدول: كل يوم وحكمه وسببه — السبب من القاعدة لا من العميل */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-right text-[10px] text-slate-500">
                  <th className="py-1.5 font-black">اليوم</th>
                  <th className="py-1.5 font-black">الزيارات</th>
                  <th className="py-1.5 font-black">العمر</th>
                  <th className="py-1.5 font-black">الحكم</th>
                  <th className="py-1.5 font-black">السبب</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = verdictOf(r)
                  return (
                    <tr
                      key={r.placeday}
                      data-testid={`purge-row-${r.placeday}`}
                      data-verdict={v}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-1.5 font-mono text-[10px]">{r.placeday}</td>
                      <td className="py-1.5 font-bold">{r.visits}</td>
                      <td className="py-1.5 text-slate-500">{r.days_old} ي</td>
                      <td className="py-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${
                            v === 'ready'
                              ? 'bg-emerald-100 text-emerald-800'
                              : v === 'incomplete'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {v === 'ready' ? <ShieldCheck size={10} /> : v === 'incomplete' ? <AlertTriangle size={10} /> : <ShieldAlert size={10} />}
                          {VERDICT_LABEL[v]}
                        </span>
                      </td>
                      <td className="py-1.5 text-[10px] text-slate-500">{r.reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* التوجيه: أين يُكمَل الإثبات — لا زر حذف ثانٍ هنا */}
          {summary.needsAction && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-slate-50 p-2 text-[10px] text-slate-600" data-testid="purge-hint">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                لإكمال الإثبات: صدّر اليوم من «التقرير المعتمد» (يُحفظ تلقائياً في
                الأرشيف ببصمة SHA-256)، ثم أنشئ طلب احتفاظ من شاشة الاحتفاظ.
                الحذف لا ينفَّذ من هنا.
              </span>
            </p>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        القاعدة: زيارة بلا نسخة مُثبتة (بصمة أو عدد صفوف مسجَّل) لا تُحذف.
        نقاط GPS الخام تُحذف بعد ٤٨ ساعة، فالتقرير المؤرشف هو الدليل الدائم —
        ولهذا لا يكفي «طلب تصدير» بلا بصمة.
      </p>
    </section>
  )
}

export default PurgeGuardPanel
