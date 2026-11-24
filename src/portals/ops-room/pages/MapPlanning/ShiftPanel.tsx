/**
 * لوحة الشفتات في صفحة الزيارات (20261128000200).
 *
 * لماذا وُجدت: الزيارات تُبنى **ليوم كامل**، لكن عمل الآليات يجري في شفتات.
 * فالسؤال اليومي الحقيقي «ماذا دخلت الآليات في شفت مرن مسائي؟» لا جواب له
 * بالواجهة القديمة. هذه اللوحة تُظهر:
 *   ① نافذة كل شفت ليوم بغداد، **مع العبور لمنتصف الليل** (17:00→04:00) مُعلَماً.
 *   ② حالة نقاط كل شفت: موجودة محلياً · لم تُسحب · بُني ثم حُذفت نقاطه.
 *      «لا صفر كاذب»: الشفت الفارغ ليس شفتاً بلا عمل، بل قد يكون غير مسحوب.
 *   ③ زر سحب صريح من المزوّد، بتقدُّم حقيقي دفعةً دفعة، وإمكانية الإيقاف.
 *
 * ما لا تفعله عمداً: لا تعيد بناء الزيارات جزئياً. محرّك `map_build_visits`
 * يشتغل على يوم بغدادي كامل ويحذف اليوم عند `p_replace`، فلو بنينا شفتاً واحداً
 * لمحونا بقية اليوم. التصفية بالشفت تكون في العرض والتصدير لا في البناء.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, CloudDownload, Loader2, Moon, ShieldAlert, Square } from 'lucide-react'
import { useGpsShiftPending, usePullShiftWindow } from '@features/gps-lvn/hooks'
import type { ShiftPullState } from '@sdk/gps-lvn.sdk'

const STATE_LABEL: Record<ShiftPullState, { text: string, cls: string }> = {
  local: { text: 'النقاط موجودة', cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  missing: { text: 'لم تُسحب', cls: 'bg-rose-50 text-rose-900 ring-rose-200' },
  built_points_purged: { text: 'بُني ثم حُذفت نقاطه', cls: 'bg-sky-50 text-sky-900 ring-sky-200' },
}

export function ShiftPanel({ day }: { day: string }) {
  const pending = useGpsShiftPending(day)
  const pull = usePullShiftWindow()
  const [picked, setPicked] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number, total: number, inserted: number, device: string } | null>(null)
  const [controller, setController] = useState<AbortController | null>(null)

  const data = pending.data
  const shifts = useMemo(() => data?.shifts ?? [], [data])
  const active = useMemo(() => shifts.find((s) => s.shift_name === picked) ?? null, [shifts, picked])

  const start = () => {
    if (!active) return
    const c = new AbortController()
    setController(c)
    setProgress({ done: 0, total: data?.fleet ?? 0, inserted: 0, device: '' })
    pull.mutate({
      day,
      window: { from: active.start, to: active.end },
      signal: c.signal,
      onProgress: setProgress,
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="shift-panel">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] font-black text-slate-600">
          <Moon size={13} /> شفتات اليوم — النافذة وحالة نقاطها
        </p>
        {data && (
          <span className="text-[11px] font-bold text-slate-500">
            الأسطول: {data.fleet} جهازاً مربوطاً
          </span>
        )}
      </header>

      {pending.isLoading && <p className="text-[11px] font-bold text-slate-500">جارٍ حساب نوافذ الشفتات…</p>}

      {pending.isError && (
        <p className="flex items-center gap-1 text-[11px] font-bold text-rose-800">
          <AlertTriangle size={13} /> تعذّر جلب نوافذ الشفتات — أعد المحاولة.
        </p>
      )}

      <div className="space-y-1.5">
        {shifts.map((s) => {
          const st = STATE_LABEL[s.state]
          const isPicked = picked === s.shift_name
          return (
            <div
              key={s.shift_id}
              className={`flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] ring-1 ${
                isPicked ? 'bg-slate-950 text-white ring-slate-900' : 'bg-slate-50 text-slate-800 ring-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setPicked(isPicked ? null : s.shift_name)}
                aria-pressed={isPicked}
                className="flex items-center gap-1 font-black"
              >
                {s.crosses_midnight && <Moon size={11} aria-label="يعبر منتصف الليل" />}
                {s.shift_name}
              </button>
              <span dir="ltr" className={`font-mono ${isPicked ? 'text-white/80' : 'text-slate-500'}`}>
                {s.start}–{s.end}
                {s.crosses_midnight ? ' (+1)' : ''}
              </span>
              <span className={`rounded-md px-1.5 py-0.5 font-bold ring-1 ${
                isPicked ? 'bg-white/15 text-white ring-white/25' : st.cls
              }`}>
                {s.state === 'local' ? `${st.text} · ${s.points}` : st.text}
              </span>
              {s.visits_built > 0 && (
                <span className={isPicked ? 'text-white/70' : 'text-slate-500'}>
                  {s.visits_built} زيارة
                </span>
              )}
              {s.state !== 'local' && !s.can_pull && (
                <span className={`flex items-center gap-1 font-bold ${isPicked ? 'text-white/80' : 'text-amber-800'}`}>
                  <ShieldAlert size={11} /> أقدم من احتفاظ المزوّد
                </span>
              )}
            </div>
          )
        })}
      </div>

      {active && (
        <div className="mt-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          {active.state === 'local' ? (
            <p className="text-[11px] font-bold text-slate-700">
              نقاط هذا الشفت موجودة في القاعدة ({active.points} نقطة) — لا حاجة لسحب.
              التصفية بالشفت في العرض والتصدير لا تتطلب إعادة بناء.
            </p>
          ) : !active.can_pull ? (
            <p className="text-[11px] font-bold text-amber-900">
              المزوّد يحتفظ بالبيانات أكثر من شهر. هذا اليوم أقدم من ذلك، فلا يمكن سحبه —
              مصدره ملف Excel المحفوظ على حاسوبك.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-[11px] font-bold text-slate-700">
                سحب «{active.shift_name}» ({active.start}–{active.end}) لكل الأسطول من المزوّد:
                {' '}{data?.fleet ?? 0} جهازاً، طلبٌ لكل جهاز.
              </p>
              {pull.isPending ? (
                <button
                  type="button"
                  onClick={() => controller?.abort()}
                  className="flex items-center gap-1 rounded-lg bg-rose-700 px-2 py-1 text-[11px] font-black text-white"
                >
                  <Square size={11} /> إيقاف
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  data-testid="shift-pull-start"
                  className="flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white"
                >
                  <CloudDownload size={11} /> اسحب من المزوّد
                </button>
              )}
            </div>
          )}

          {progress && (
            <div className="mt-2" data-testid="shift-pull-progress">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-600">
                {pull.isPending && <Loader2 size={10} className="animate-spin" />}
                {progress.done} من {progress.total}
                {' · '}{progress.inserted} نقطة جديدة
                {progress.device ? ` · ${progress.device}` : ''}
              </p>
            </div>
          )}

          {pull.isSuccess && pull.data.failed.length > 0 && (
            <div className="mt-2 rounded-lg bg-rose-50 p-2 ring-1 ring-rose-200" data-testid="shift-pull-failed">
              <p className="text-[10px] font-black text-rose-900">
                فشل {pull.data.failed.length} جهازاً — النقاط المفقودة معروفة بالاسم:
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-rose-800">
                {pull.data.failed.slice(0, 8).map((f) => `${f.device} (${f.error})`).join(' · ')}
                {pull.data.failed.length > 8 ? ' …' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
