/**
 * «الحضور اليدوي» — الصفحة العامة المبنية مرة واحدة والمسجَّلة في كل بوابة تملك موظفين (/<portal>/manual-attendance).
 * تظهر في الشريط الجانبي للحساب الذي لديه تفعيل مفوّض؛ تفعيلها وإيقافها من التطوير المركزية وحدها.
 * غرفة العمليات وحدها ترى كل التفعيلات افتراضياً؛ بقية الحسابات ترى فقط التفعيلات المفوّضة على بوابتها.
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import {
  MANUAL_SENIOR_PORTALS, loadMyManualActivations, useManualActivationsStore, fmtManualDate, type ManualMyActivation,
} from '@features/attendance-manual'
import { ManualSheetPanel } from '@features/attendance-manual/components/ManualSheetPanel'
import { Banner } from '@features/attendance-manual/components/shared'

/** تفعيلات هذه البوابة (أو الكل لغرفة العمليات وحدها)، الساري أولاً ثم ما بقي فيه معلّق */
export function activationsForPortal(portal: string, items: readonly ManualMyActivation[]): ManualMyActivation[] {
  const list = MANUAL_SENIOR_PORTALS.includes(portal) ? [...items] : items.filter((a) => a.portal === portal)
  return list.sort((a, b) => (a.status === b.status ? b.starts_on.localeCompare(a.starts_on) : a.status === 'active' ? -1 : 1))
}

export default function ManualAttendancePage({ portal }: { portal: string }) {
  const loaded = useManualActivationsStore((s) => s.loaded)
  const items = useManualActivationsStore((s) => s.items)
  const [picked, setPicked] = useState<string | null>(null)

  // قد تُفتح الصفحة برابط مباشر (إشعار/تذكير) قبل اكتمال تحميل AppShell — آمن للتكرار
  useEffect(() => { void loadMyManualActivations(true) }, [])

  const mine = useMemo(() => activationsForPortal(portal, items), [portal, items])
  const current = mine.find((a) => a.id === picked) ?? mine[0] ?? null
  const showPortalLabel = new Set(mine.map((a) => a.portal)).size > 1

  if (!loaded) return <LoadingSpinner />

  return (
    <div className="space-y-4 pb-6" data-testid="manual-attendance-page">
      <header>
        <h1 className="text-lg font-black text-slate-900">الحضور اليدوي</h1>
        <p className="text-xs leading-relaxed text-slate-600">بديل مؤقت عند تعطل جهاز البصمة: سجّل لكل موظف في نطاقك «حاضر» أو «غائب»، ويُطبَّق الكشف فوراً. تفعيل هذه الصفحة وإيقافها من التطوير المركزية.</p>
      </header>

      {!current ? (
        <Banner tone="slate" testId="manual-attendance-empty">
          لا يوجد حضور يدوي مفعَّل لبوابتك حالياً، ولا أيام بانتظار الكشف. إذا تعطل جهاز البصمة فاطلب من التطوير المركزية تفعيل الحضور اليدوي لنطاقك.
        </Banner>
      ) : (
        <>
          {mine.length > 1 && (
            <nav className="flex flex-wrap gap-1.5" aria-label="التفعيلات" data-testid="manual-attendance-tabs">
              {mine.map((a) => (
                <button key={a.id} type="button" onClick={() => setPicked(a.id)} aria-pressed={a.id === current.id} data-testid={`manual-tab-${a.id}`}
                  className={clsx('min-h-10 rounded-xl border px-3 py-1.5 text-start text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                    a.id === current.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                  <span className="block font-black text-slate-800">{showPortalLabel ? `${a.portal_label} — ` : ''}{a.scope_label}</span>
                  <span className="block text-[10px] text-slate-500">
                    {a.status === 'active' ? `مفعّل منذ ${fmtManualDate(a.starts_on)}` : `منتهٍ ${fmtManualDate(a.ends_on)}`}{a.pending > 0 ? ` · ${a.pending} بانتظار الكشف` : ''}
                  </span>
                </button>
              ))}
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="manual-attendance-scope">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-700">{current.portal_label}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-700">{current.scope_label}</span>
            <span className={clsx('rounded-full px-3 py-1 font-bold', current.status === 'active' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800')}>
              {current.status === 'active' ? 'البصمة موقوفة — الكشف هو المصدر' : 'عادت البصمة — أكمل المعلّق'}
            </span>
          </div>
          <ManualSheetPanel key={current.id} activationId={current.id} />
        </>
      )}
    </div>
  )
}
