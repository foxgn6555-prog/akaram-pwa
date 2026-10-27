/**
 * 00355 — وحدة «المنتهية خدماتهم والتصفية النهائية» في بوابة الشؤون المالية.
 *   يُفتح ملف تصفية تلقائياً لكل من أُنهيت خدمته (استقالة/فصل/انتهاء عقد/تقاعد/وفاة) ويُبلَّغ مديره المباشر والمالية.
 *   البنود بنفس معادلات كشف الرواتب: راتب شهر الإنهاء التناسبي حتى آخر يوم + تعويض رصيد الإجازات − السلف غير المسددة.
 *   التصفية مستقلة عن كشف الشهر (الموظف يُستبعد من كشف شهر الإنهاء فلا يُصرف مرتين).
 *   المالية: إعادة احتساب → اعتماد (تجميد) → تأكيد التسليم. صافٍ سالب ⇒ ذمة على الموظف: تسديد أو إعفاء بسبب.
 *   الأرقام إنكليزية (0-9) دائماً.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useLettersForSource, useSettlement, useSettlementApprove, useSettlementDebtClose, useSettlementDeliver, useSettlementRecompute, useSettlementsList, useSettlementsSummary } from '@features/hr/hooks/useHr'
import { LetterViewer } from '@features/letters/components/LetterViewer'
import type { SettlementDetail, SettlementLines, SettlementRow, SettlementStatus } from '@features/hr/types'

type Tab = 'open' | 'closed' | 'all'
const STATUS_CLS: Record<SettlementStatus, string> = {
  pending: 'bg-amber-100 text-amber-800', approved: 'bg-sky-100 text-sky-800', delivered: 'bg-emerald-100 text-emerald-800',
  debt_open: 'bg-rose-100 text-rose-800', debt_paid: 'bg-slate-100 text-slate-700', debt_waived: 'bg-violet-100 text-violet-800',
}
const EVENT_LABEL: Record<string, string> = {
  opened: 'فُتح الملف', compute_failed: 'تعذّر الاحتساب', recomputed: 'أُعيد الاحتساب', approved: 'اعتُمدت التصفية', approved_debt: 'اعتُمدت — ذمة على الموظف',
  delivered: 'أُكّد التسليم', debt_paid: 'سُدّدت الذمة', debt_waived: 'إعفاء من الذمة',
}
const fmtDT = (d: string | null | undefined) => (d ? d.slice(0, 16).replace('T', ' ') : '—')
const fmtDays = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))

export default function FinanceSettlementsPage() {
  const [tab, setTab] = useState<Tab>('open')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useSettlementsList(tab === 'all' ? null : tab, q || null)
  const summary = useSettlementsSummary()
  const s = summary.data
  const rows = list.data ?? []
  return (
    <div className="space-y-4 pb-6" data-testid="fin-settlements">
      <ExecPageHeader icon="user-x" title="المنتهية خدماتهم والتصفية النهائية" stats={[
        { label: 'بانتظار الاعتماد', value: s?.pending ?? 0, tone: 'gold', testId: 'st-stat-pending' },
        { label: 'معتمدة بانتظار التسليم', value: <>{s?.approved ?? 0}{s && <small className="ms-1 text-[10px] font-normal text-blue-100/80">{fmtMoney(s.approved_amount)} د.ع</small>}</>, testId: 'st-stat-approved' },
        { label: 'ذمم مفتوحة', value: <>{s?.debt_open ?? 0}{s && <small className="ms-1 text-[10px] font-normal text-blue-100/80">{fmtMoney(s.debt_amount)} د.ع</small>}</>, tone: 'red', testId: 'st-stat-debt' },
        { label: 'مسلَّم إجمالاً', value: s ? fmtMoney(s.delivered_total) : '—', tone: 'green', testId: 'st-stat-delivered' },
      ]} subtitle={<>يُفتح ملف لكل من أُنهيت خدمته تلقائياً ويُبلَّغ مديره المباشر. البنود بنفس معادلات كشف الرواتب حتى آخر يوم عمل، والموظف يُستبعد من كشف شهر الإنهاء فلا يُصرف مرتين. الصافي السالب يُسجَّل ذمةً على الموظف.</>} />

      <div className="flex flex-wrap items-center gap-2" data-testid="st-tabs">
        {([['open', 'المفتوحة'], ['closed', 'المنجزة'], ['all', 'الكل']] as const).map(([k, l]) => (
          <button key={k} type="button" data-testid={`st-tab-${k}`} onClick={() => setTab(k)} className={clsx('h-9 rounded-full border px-4 text-xs font-bold', tab === k ? 'border-[#0b3d6b] bg-gradient-to-l from-[#0b3d6b] to-[#1d6fa5] text-white' : 'border-slate-200 bg-white text-slate-700')}>{l}</button>
        ))}
        <input className={clsx(field, 'ms-auto max-w-xs')} placeholder="بحث بالاسم / الرقم الوظيفي / رقم الملف" value={q} onChange={(e) => setQ(e.target.value)} data-testid="st-search" />
      </div>

      {list.isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <EmptyState title="لا ملفات تصفية هنا" hint="تظهر الملفات تلقائياً عند تنفيذ إنهاء خدمة أي موظف (استقالة، فصل، انتهاء عقد، تقاعد، وفاة)." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-xs" dir="rtl" data-testid="st-table">
            <thead className="bg-slate-50 text-[11px] text-slate-600"><tr>
              <th className="p-2 text-right">الملف</th><th className="p-2 text-right">الموظف</th><th className="p-2">نوع الإنهاء</th><th className="p-2">آخر يوم</th><th className="p-2">المدير المباشر</th>
              <th className="p-2">صافي التصفية</th><th className="p-2">الحالة</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => <Row key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
            </tbody>
          </table>
        </div>
      )}

      {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function Row({ r, onOpen }: { r: SettlementRow; onOpen: () => void }) {
  const num = r.employee_number ?? r.employee_id
  return (
    <tr className="border-t border-slate-100 align-top" data-testid={`st-row-${num}`}>
      <td className="p-2 font-mono text-[11px]">{r.ref_no}</td>
      <td className="p-2"><div className="font-bold text-slate-800">{r.full_name}</div><div className="text-[11px] text-slate-500">{r.employee_number ?? '—'} · {r.department_name ?? '—'} · {r.job_title ?? '—'}</div></td>
      <td className="p-2 text-center">{r.termination_label}</td>
      <td className="p-2 text-center font-mono">{r.last_day}</td>
      <td className="p-2 text-center">{r.manager_name ?? <span className="text-slate-400">لا مدير مباشر</span>}</td>
      <td className={clsx('p-2 text-center font-mono font-bold', r.net_amount < 0 ? 'text-rose-700' : 'text-emerald-700')} data-testid={`st-net-${num}`}>{fmtMoney(r.net_amount)}{r.status === 'debt_open' && <div className="text-[10px] font-normal text-rose-600">ذمة {fmtMoney(r.debt_amount)}</div>}</td>
      <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_CLS[r.status])} data-testid={`st-status-${num}`}>{r.status_label}</span>
        {r.status === 'pending' && !r.has_profile && <div className="mt-1 text-[10px] text-rose-600" data-testid={`st-noprofile-${num}`}>بلا ملف راتب</div>}</td>
      <td className="p-2 text-center"><Button size="sm" variant="secondary" onClick={onOpen} data-testid={`st-open-${num}`}>الملف</Button></td>
    </tr>
  )
}

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useSettlement(id)
  const d = q.data
  const recompute = useSettlementRecompute(); const approve = useSettlementApprove(); const deliver = useSettlementDeliver(); const debt = useSettlementDebtClose()
  const busy = recompute.isPending || approve.isPending || deliver.isPending || debt.isPending
  const letters = useLettersForSource('settlement', id)   // 00356
  const [letterId, setLetterId] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose} data-testid="st-drawer">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        {!d ? <LoadingSpinner /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">ملف التصفية <span className="font-mono">{d.ref_no}</span></div>
                <h2 className="text-lg font-black text-slate-900" data-testid="st-d-name">{d.full_name}</h2>
                <div className="text-xs text-slate-600">{d.employee_number ?? '—'} · {d.department_name ?? '—'} · {d.job_title ?? '—'}</div>
                <div className="mt-1 text-xs text-slate-700"><b>{d.termination_label}</b> · آخر يوم عمل <span className="font-mono">{d.last_day}</span>{d.reason && <> · السبب: {d.reason}</>}</div>
                <div className="text-xs text-slate-600">المدير المباشر: {d.manager_name ?? 'غير محدد'} {d.manager_name && <span className="text-emerald-700">(بُلّغ)</span>}</div>
              </div>
              <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', STATUS_CLS[d.status])} data-testid="st-d-status">{d.status_label}</span>
            </div>

            <Lines d={d} />

            <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-3" data-testid="st-letters">
              <h3 className="mb-1 text-xs font-bold text-amber-900">الكتب الرسمية لهذا الملف</h3>
              {(letters.data ?? []).length === 0 ? <div className="text-xs text-slate-600" data-testid="st-letters-none">لا كتب بعد — يصدر كتاب إنهاء الخدمة تلقائياً عند فتح الملف، وكتاب التصفية عند الاعتماد.</div> : (
                <div className="flex flex-wrap gap-2">
                  {(letters.data ?? []).map((l) => (
                    <Button key={l.id} size="sm" variant="secondary" onClick={() => setLetterId(l.id)} data-testid={`st-letter-${l.kind}`}>{l.kind_label} — العدد {l.ref}</Button>
                  ))}
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" data-testid="st-actions">
              {d.status === 'pending' && <>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => recompute.mutate(d.id)} data-testid="st-recompute">إعادة الاحتساب بآخر البيانات</Button>
                <Button variant="primary" size="sm" disabled={busy} data-testid="st-approve" onClick={() => { const n = window.prompt('اعتماد التصفية — تُجمَّد البنود بعدها. ملاحظة (اختياري):', ''); if (n === null) return; approve.mutate({ id: d.id, note: n.trim() || null }) }}>اعتماد التصفية</Button>
              </>}
              {d.status === 'approved' && <Button variant="primary" size="sm" disabled={busy} data-testid="st-deliver" onClick={() => { const n = window.prompt(`تأكيد تسليم ${fmtMoney(d.net_amount)} د.ع للموظف. ملاحظة (اختياري):`, ''); if (n === null) return; deliver.mutate({ id: d.id, note: n.trim() || null }) }}>تأكيد التسليم</Button>}
              {d.status === 'debt_open' && <>
                <Button variant="primary" size="sm" disabled={busy} data-testid="st-debt-paid" onClick={() => { const n = window.prompt(`تسجيل تسديد الذمة ${fmtMoney(d.debt_amount)} د.ع. ملاحظة (اختياري):`, ''); if (n === null) return; debt.mutate({ id: d.id, mode: 'paid', note: n.trim() || null }) }}>تم تسديد الذمة</Button>
                <Button variant="danger" size="sm" disabled={busy} data-testid="st-debt-waived" onClick={() => { const n = window.prompt('إعفاء من الذمة — السبب إلزامي:', ''); if (n === null) return; if (n.trim().length < 3) { window.alert('سبب الإعفاء إلزامي (3 أحرف على الأقل)'); return } debt.mutate({ id: d.id, mode: 'waived', note: n.trim() }) }}>إعفاء بسبب</Button>
              </>}
              <Button variant="ghost" size="sm" onClick={onClose} className="ms-auto">إغلاق</Button>
            </div>

            <section>
              <h3 className="mb-1 text-xs font-bold text-slate-600">السجل</h3>
              <ul className="space-y-1 text-xs" data-testid="st-events">
                {d.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5" data-testid="st-event">
                    <b>{EVENT_LABEL[e.action] ?? e.action}</b>
                    {e.amount != null && <span className="font-mono">{fmtMoney(e.amount)}</span>}
                    {e.note && <span className="text-slate-600">{e.note}</span>}
                    <span className="ms-auto text-slate-500">{e.actor_name ?? '—'} · {fmtDT(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
      {letterId && <LetterViewer id={letterId} onClose={() => setLetterId(null)} />}
    </div>
  )
}

function Lines({ d }: { d: SettlementDetail }) {
  const L = d.lines as Partial<SettlementLines>
  if (!L.salary) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="st-lines-missing">لم تُحتسب البنود بعد — اضغط «إعادة الاحتساب».</div>
  const sal = L.salary; const lv = L.leave!; const adv = L.advances ?? []
  return (
    <div className="space-y-2" data-testid="st-lines">
      {!L.has_profile && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="st-noprofile">لا ملف راتب معرَّف — عرِّفه من «ملفات الرواتب» ثم أعد الاحتساب. لا يمكن الاعتماد قبل ذلك.</div>}
      {sal.source === 'paid_in_sheet' && <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800" data-testid="st-paid-in-sheet">راتب شهر {L.salary_month?.slice(0, 7)} صُرف ضمن كشف الشهر المعتمد (إصدار {sal.export_version}) بصافي {fmtMoney(sal.sheet_net)} — لا يُكرَّر هنا.</div>}
      {(L.prior_months_unexported?.length ?? 0) > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" data-testid="st-prior-months">أشهر سابقة لم يُصدَّر كشفها بعد: {L.prior_months_unexported!.join('، ')} — تُصرف من كشفها عند صدوره كالمعتاد.</div>}
      <table className="w-full text-xs" data-testid="st-lines-table">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2 font-bold">① راتب شهر الإنهاء ({L.salary_month?.slice(0, 7)}) حتى آخر يوم</td>
            <td className="py-2 text-[11px] text-slate-600">
              {sal.source === 'computed' && <>الفترة <span className="font-mono">{sal.period_from} → {sal.period_to}</span> · {fmtDays(sal.covered_days)} يوم مغطّى · {fmtDays(sal.payable_days)} يوم مستحق × أجر اليوم {fmtMoney(sal.day_rate)}
                {sal.pay_type === 'monthly' && <> (الأساسي {fmtMoney(sal.base_salary)} ÷ {sal.days_in_month} يوم)</>}
                <br />إجمالي {fmtMoney(sal.gross)} − استقطاعات {fmtMoney(sal.deductions)}{sal.rented_tax > 0 && <> − ضريبة آليات {fmtMoney(sal.rented_tax)}</>}{sal.overtime > 0 && <> + إضافي مصروف {fmtMoney(sal.overtime)}</>}</>}
              {sal.source === 'paid_in_sheet' && 'صُرف ضمن الكشف المعتمد'}
              {sal.source === 'no_profile' && 'لا ملف راتب'}
            </td>
            <td className="py-2 text-left font-mono font-bold" data-testid="st-line-salary">{fmtMoney(sal.net)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2 font-bold">② تعويض رصيد الإجازات المتبقي ({lv.year})</td>
            <td className="py-2 text-[11px] text-slate-600">{fmtDays(lv.remaining_days)} يوم × أجر اليوم {fmtMoney(lv.day_rate)}</td>
            <td className="py-2 text-left font-mono font-bold" data-testid="st-line-leave">{fmtMoney(lv.amount)}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2 font-bold">③ السلف المسلَّمة غير المسددة</td>
            <td className="py-2 text-[11px] text-slate-600">{adv.length === 0 ? 'لا سلف مفتوحة' : adv.map((a) => <div key={a.id}><span className="font-mono">{a.ref_no}</span> {a.type_name}: {fmtMoney(a.amount)} سُدّد {fmtMoney(a.repaid)} ⇒ المتبقي <b>{fmtMoney(a.remaining)}</b></div>)}</td>
            <td className="py-2 text-left font-mono font-bold text-rose-700" data-testid="st-line-advances">− {fmtMoney(L.advances_total ?? 0)}</td>
          </tr>
          <tr>
            <td className="py-2 text-sm font-black">صافي التصفية</td>
            <td className="py-2 text-[11px] text-slate-600">{fmtMoney(L.total_due)} − {fmtMoney(L.total_deduct)}{(L.net ?? 0) < 0 && <b className="ms-2 text-rose-700">صافٍ سالب ⇒ ذمة على الموظف بقيمة {fmtMoney(-(L.net ?? 0))}</b>}</td>
            <td className={clsx('py-2 text-left font-mono text-base font-black', (L.net ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700')} data-testid="st-line-net">{fmtMoney(L.net)}</td>
          </tr>
        </tbody>
      </table>
      <div className="text-[10px] text-slate-500">آخر احتساب: {fmtDT(L.computed_at)}{d.status !== 'pending' && ' · البنود مجمّدة منذ الاعتماد'}</div>
    </div>
  )
}
