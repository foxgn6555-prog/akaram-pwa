/**
 * لوحة «البصمات غير المطابقة» داخل صفحات الحضور (HR + غرفة العمليات)
 * ─────────────────────────────────────────────────────────────────
 * الحضور يُحتسب لكل موظف، والبصمة التي لا يُعرف صاحبها (PIN بلا موظف) لا تظهر فيه.
 * هذه اللوحة تكشفها على شكل «يوم/PIN» (أول بصمة = دخول مبدئي، آخر بصمة = خروج مبدئي)
 * حتى يرى المستخدم أن البيانات تصل فعلاً ويعرف ما ينقص: ربط PIN بموظف.
 * قراءة فقط — الربط يتم من دفتر البصمة (مرة واحدة لكل PIN، بأثر رجعي).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { useBiometricPunches } from '@features/integrations'
import { fmtTime } from './hr-format'
import { groupUnmatchedPunches } from './unmatched-punches'

interface Props { from: string; to: string; ledgerPath?: string; className?: string }

export function UnmatchedPunchesPanel({ from, to, ledgerPath = '/hr/biometric', className }: Props) {
  const [open, setOpen] = useState(false)
  const { data: punches = [], isLoading } = useBiometricPunches({ from, to, unmatchedOnly: true, limit: 1000 }, !!from && !!to && from <= to)
  const rows = useMemo(() => groupUnmatchedPunches(punches), [punches])
  const pins = useMemo(() => new Set(rows.map((r) => r.pin)).size, [rows])
  if (isLoading || punches.length === 0) return null

  return (
    <div className={clsx('rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm', className)} data-testid="unmatched-panel">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-start" data-testid="unmatched-toggle">
        <div>
          <p className="text-sm font-bold text-amber-900">
            بصمات وصلت من الأجهزة لكن بلا موظف: <span data-testid="unmatched-count">{punches.length}</span> بصمة · {pins} رقم (PIN)
          </p>
          <p className="text-[11px] text-amber-800">لا تظهر في الحضور لأن النظام لا يعرف صاحبها بعد — اربط كل PIN بموظف مرة واحدة من دفتر البصمة وسيُحتسب حضوره بأثر رجعي تلقائياً.</p>
        </div>
        <span className="text-xs font-semibold text-amber-900">{open ? 'إخفاء ▲' : 'عرض التفاصيل ▼'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-amber-200 bg-white">
          <table className="w-full text-sm" data-testid="unmatched-table">
            <thead className="bg-amber-50 text-xs text-amber-900">
              <tr><th className="p-2 text-start">اليوم</th><th className="p-2">PIN على الجهاز</th><th className="p-2 text-start">الاسم على الجهاز</th><th className="p-2">أول بصمة</th><th className="p-2">آخر بصمة</th><th className="p-2">عدد البصمات</th><th className="p-2">الجهاز</th><th className="p-2">الإجراء</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100" data-testid={`unmatched-row-${r.pin}-${r.day}`}>
                  <td className="p-2 text-xs">{r.day}</td>
                  <td className="p-2 text-center font-mono font-bold" dir="ltr">{r.pin}</td>
                  <td className="p-2 text-xs">{r.deviceName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.firstAt)}</td>
                  <td className="p-2 text-center tabular-nums" dir="ltr">{r.count > 1 ? fmtTime(r.lastAt) : <span className="text-slate-400">—</span>}</td>
                  <td className="p-2 text-center text-xs">{r.count}</td>
                  <td className="p-2 text-center text-[11px] text-slate-500" dir="ltr">{r.deviceSerial}</td>
                  <td className="p-2 text-center"><Link to={ledgerPath} className="text-xs font-semibold text-brand-700 underline" data-testid={`unmatched-link-${r.pin}`}>ربط بموظف</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
