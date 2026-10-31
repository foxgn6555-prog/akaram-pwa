/**
 * غرفة العمليات — «تعديل جماعي» (00397-ب): طلب واحد = نطاق × أيام × نوع التعديل.
 *   ① النطاق: موظفون محددون / فرع / قسم / قسم وأقسامه الفرعية.
 *   ② الأيام: من–إلى (حتى 62 يوماً) مع إمكانية استثناء أيام بالنقر.
 *   ③ نوع التعديل: حضور كامل بأوقات الشفت / تغيير حالة / تحديد أوقات.
 *   ④ معاينة إلزامية (كم موظف، كم يوم، كم دقيقة ستُصحَّح، قبل/بعد لكل صف) ثم: «تنفيذ مباشر» أو «إرسال طلباً إلى الموارد البشرية».
 *   أسفلها: سجل طلبات التعديل (الكل) مع التفاصيل والإلغاء.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { ATTENDANCE_STATUS_LABELS } from '@features/hr'
import type { AttendanceStatus } from '@features/hr'
import { field } from '@portals/hr/components/hr-format'
import {
  ATTENDANCE_EDIT_ACTION_HINTS, ATTENDANCE_EDIT_ACTION_LABELS, ATTENDANCE_EDIT_SCOPE_LABELS, enumerateDays, hmBaghdad,
  useAttendanceEditCancel, useAttendanceEditCreate, useAttendanceEditEmployeeSearch, useAttendanceEditList, useAttendanceEditPreview,
  type AttendanceEditAction, type AttendanceEditDraft, type AttendanceEditMode, type AttendanceEditPreview, type AttendanceEditScopeKind,
} from '@features/attendance-edits'
import { ListFilters, ReasonDialog, RequestDetailDialog, RequestsTable, fmtDate, useListFilters } from '@features/attendance-edits/components/AttendanceEditShared'

const STATUS_CHOICES: AttendanceStatus[] = ['present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit']
const todayIso = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)   // تاريخ بغداد

export function BulkEditPanel({ frozen, canDirect = true, canRequest = true }: { frozen?: boolean; canDirect?: boolean; canRequest?: boolean }) {
  const [scopeKind, setScopeKind] = useState<AttendanceEditScopeKind>('department_tree')
  const [scopeIds, setScopeIds] = useState<string[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<AttendanceEditAction>('full_presence')
  const [status, setStatus] = useState<AttendanceStatus>('leave')
  const [cin, setCin] = useState(''); const [cout, setCout] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<AttendanceEditPreview | null>(null)
  const [confirmMode, setConfirmMode] = useState<AttendanceEditMode | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)

  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const { data: employees = [], isLoading: empLoading } = useAttendanceEditEmployeeSearch(empSearch, scopeKind === 'employees')
  const previewM = useAttendanceEditPreview(); const createM = useAttendanceEditCreate(); const cancelM = useAttendanceEditCancel()
  const { f, setF, query } = useListFilters()
  const { data: rows = [], isLoading: listLoading } = useAttendanceEditList(query)

  const allDays = useMemo(() => enumerateDays(from, to || from), [from, to])
  const dates = useMemo(() => allDays.filter((d) => !excluded.has(d)), [allDays, excluded])
  const tooMany = allDays.length >= 62 && !!to && enumerateDays(from, to, 400).length > 62
  const payload = action === 'set_status' ? { status, ...(cin && { check_in: cin }), ...(cout && { check_out: cout }) } : action === 'set_times' ? { check_in: cin, check_out: cout } : {}
  const draft: AttendanceEditDraft = { scopeKind, scopeIds, dates, action, payload }
  const ready = scopeIds.length > 0 && dates.length > 0 && (action !== 'set_times' || (!!cin && !!cout)) && !tooMany
  const reasonOk = reason.trim().length >= 5
  const invalidate = () => setPreview(null)

  const pickScope = (kind: AttendanceEditScopeKind) => { setScopeKind(kind); setScopeIds([]); invalidate() }
  const toggleEmp = (id: string) => { setScopeIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); invalidate() }
  const toggleDay = (d: string) => { setExcluded((p) => { const n = new Set(p); if (n.has(d)) n.delete(d); else n.add(d); return n }); invalidate() }
  const doPreview = () => previewM.mutate(draft, { onSuccess: setPreview })
  const doCreate = (mode: AttendanceEditMode) => createM.mutate({ draft, reason: reason.trim(), mode }, {
    onSuccess: () => { setConfirmMode(null); setPreview(null); setReason(''); setScopeIds([]); setExcluded(new Set()) },
  })

  const activeDepts = departments.filter((d) => d.is_active && !d.is_job_title)
  const deptLabel = (id: string) => { const d = departments.find((x) => x.id === id); const p = d?.parent_id ? departments.find((x) => x.id === d.parent_id) : null; return d ? `${d.name}${p ? ` ← ${p.name}` : ''}` : id }

  return (
    <div className="space-y-4" data-testid="ae-bulk-panel">
      {frozen && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800" data-testid="ae-frozen">حضورية الشهر المعروض معتمدة/مقفولة — التعديل الجماعي يعمل على الأشهر المفتوحة فقط.</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold">طلب تعديل بيانات الحضور</h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ① النطاق */}
          <div className="space-y-2 rounded-xl border border-slate-100 p-3">
            <div className="text-xs font-bold text-slate-700">① النطاق</div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {(Object.keys(ATTENDANCE_EDIT_SCOPE_LABELS) as AttendanceEditScopeKind[]).map((k) => (
                <button key={k} type="button" onClick={() => pickScope(k)} className={clsx('rounded-lg px-2 py-1 font-bold ring-1', scopeKind === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')} data-testid={`ae-scope-${k}`} aria-pressed={scopeKind === k}>{ATTENDANCE_EDIT_SCOPE_LABELS[k]}</button>
              ))}
            </div>
            {scopeKind === 'branch' && (
              <select className={field} value={scopeIds[0] ?? ''} onChange={(e) => { setScopeIds(e.target.value ? [e.target.value] : []); invalidate() }} data-testid="ae-branch"><option value="">اختر الفرع…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            )}
            {(scopeKind === 'department' || scopeKind === 'department_tree') && (
              <select className={field} value={scopeIds[0] ?? ''} onChange={(e) => { setScopeIds(e.target.value ? [e.target.value] : []); invalidate() }} data-testid="ae-department"><option value="">اختر القسم…</option>{activeDepts.map((d) => <option key={d.id} value={d.id}>{deptLabel(d.id)}</option>)}</select>
            )}
            {scopeKind === 'employees' && (
              <div className="space-y-1">
                <input className={field} value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="ابحث بالاسم أو الرقم الوظيفي…" data-testid="ae-emp-search" />
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 text-xs" data-testid="ae-emp-list">
                  {empLoading ? <LoadingSpinner /> : employees.slice(0, 200).map((e) => (
                    <label key={e.id} className={clsx('flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1.5', scopeIds.includes(e.id) && 'bg-brand-50')}>
                      <input type="checkbox" checked={scopeIds.includes(e.id)} onChange={() => toggleEmp(e.id)} data-testid={`ae-emp-${e.id}`} />
                      <span className="font-bold">{e.full_name}</span><span className="text-[10px] text-slate-500">{e.employee_number}{e.department_name ? ` · ${e.department_name}` : ''}</span>
                    </label>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500">المختارون: <b data-testid="ae-emp-count">{scopeIds.length}</b>{scopeIds.length > 0 && <button type="button" className="mr-2 text-red-600 underline" onClick={() => { setScopeIds([]); invalidate() }}>مسح</button>}</div>
              </div>
            )}
          </div>

          {/* ② الأيام */}
          <div className="space-y-2 rounded-xl border border-slate-100 p-3">
            <div className="text-xs font-bold text-slate-700">② الأيام <span className="font-normal text-slate-500">(حتى 62 يوماً، لا مستقبل)</span></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500">من<input type="date" className={field} max={todayIso()} value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); setExcluded(new Set()); invalidate() }} data-testid="ae-from" /></label>
              <label className="text-[11px] text-slate-500">إلى<input type="date" className={field} max={todayIso()} min={from} value={to} onChange={(e) => { setTo(e.target.value); setExcluded(new Set()); invalidate() }} data-testid="ae-to" /></label>
            </div>
            {tooMany && <div className="text-[11px] text-red-700" data-testid="ae-too-many">المدى يتجاوز 62 يوماً — قسّم الطلب.</div>}
            {allDays.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] text-slate-500">انقر يوماً لاستثنائه — المختار: <b data-testid="ae-days-count">{dates.length}</b> من {allDays.length}</div>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto" data-testid="ae-days">
                  {allDays.map((d) => <button key={d} type="button" onClick={() => toggleDay(d)} className={clsx('rounded px-1.5 py-0.5 text-[10px] tabular-nums ring-1', excluded.has(d) ? 'bg-slate-100 text-slate-400 line-through ring-slate-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200')} data-testid={`ae-day-${d}`} aria-pressed={!excluded.has(d)}>{fmtDate(d).slice(0, 5)}</button>)}
                </div>
              </div>
            )}
          </div>

          {/* ③ نوع التعديل */}
          <div className="space-y-2 rounded-xl border border-slate-100 p-3">
            <div className="text-xs font-bold text-slate-700">③ نوع التعديل</div>
            <div className="space-y-1">
              {(Object.keys(ATTENDANCE_EDIT_ACTION_LABELS) as AttendanceEditAction[]).map((a) => (
                <label key={a} className={clsx('flex cursor-pointer items-start gap-2 rounded-lg p-2 ring-1', action === a ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200')}>
                  <input type="radio" name="ae-action" checked={action === a} onChange={() => { setAction(a); invalidate() }} data-testid={`ae-action-${a}`} className="mt-0.5" />
                  <span><span className="block text-xs font-bold">{ATTENDANCE_EDIT_ACTION_LABELS[a]}</span><span className="block text-[10px] leading-snug text-slate-500">{ATTENDANCE_EDIT_ACTION_HINTS[a]}</span></span>
                </label>
              ))}
            </div>
            {action === 'set_status' && (
              <select className={field} value={status} onChange={(e) => { setStatus(e.target.value as AttendanceStatus); invalidate() }} data-testid="ae-status">{STATUS_CHOICES.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}</select>
            )}
            {action !== 'full_presence' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500">دخول{action === 'set_status' && ' (اختياري)'}<input type="time" className={field} value={cin} onChange={(e) => { setCin(e.target.value); invalidate() }} data-testid="ae-cin" /></label>
                <label className="text-[11px] text-slate-500">خروج{action === 'set_status' && ' (اختياري)'}<input type="time" className={field} value={cout} onChange={(e) => { setCout(e.target.value); invalidate() }} data-testid="ae-cout" /></label>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500">المعاينة لا تغيّر شيئاً — التنفيذ بعدها فقط.</div>
          <Button size="sm" variant="secondary" disabled={!ready} isLoading={previewM.isPending} onClick={doPreview} data-testid="ae-preview"><Icon name="eye" size={14} /> معاينة التأثير</Button>
        </div>
      </section>

      {preview && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 shadow-sm" data-testid="ae-preview-box">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold">{preview.scope_label}</span><span className="text-slate-400">·</span><span>{preview.action_label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[['موظف', preview.employees, 'ae-pv-emps'], ['يوم', preview.days, 'ae-pv-days'], ['يوم عمل سيُعدَّل', preview.items, 'ae-pv-items'], ['مستبعد', preview.skipped, 'ae-pv-skipped'], ['دقيقة ستُصحَّح', preview.minutes_to_fix, 'ae-pv-minutes']].map(([l, v, t]) => (
              <div key={t as string} className="rounded-xl bg-white p-2 text-center ring-1 ring-slate-200"><div className="text-lg font-black tabular-nums" data-testid={t as string}>{v as number}</div><div className="text-[10px] text-slate-500">{l as string}</div></div>
            ))}
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-bold text-brand-700">قبل / بعد لكل صف ({preview.rows.length})</summary>
            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-right text-[11px]">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="p-1.5">الموظف</th><th className="p-1.5">اليوم</th><th className="p-1.5">قبل</th><th className="p-1.5">بعد</th></tr></thead>
                <tbody>{preview.rows.map((r) => (
                  <tr key={`${r.employee_id}-${r.work_date}`} className={clsx('border-t border-slate-100', r.skipped && 'opacity-60')}>
                    <td className="p-1.5"><b>{r.full_name}</b> <span className="text-slate-400">{r.employee_number}</span></td>
                    <td className="p-1.5 tabular-nums">{fmtDate(r.work_date)}</td>
                    <td className="p-1.5">{r.before ? <>{r.before.status_label} <span className="tabular-nums text-slate-500">{hmBaghdad(r.before.check_in)}←{hmBaghdad(r.before.check_out)}</span>{(r.before.early_minutes ?? 0) > 0 && <span className="text-amber-700"> مبكر {r.before.early_minutes}د</span>}{(r.before.late_minutes ?? 0) > 0 && <span className="text-amber-700"> تأخير {r.before.late_minutes}د</span>}</> : <span className="text-slate-400">لا صف</span>}</td>
                    <td className="p-1.5">{r.skipped ? <span className="text-slate-500">مستبعد — {r.skipped}</span> : <><b className="text-brand-700">{r.proposed?.status === 'auto' ? 'تُشتق من الأوقات' : r.proposed_status_label}</b> <span className="tabular-nums text-slate-500">{hmBaghdad(r.proposed?.check_in)}←{hmBaghdad(r.proposed?.check_out)}</span></>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </details>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="text-[11px] text-slate-600">السبب (إلزامي، يظهر في سجل التدقيق وتبليغ المعاون)
              <textarea className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: أيام تجربة البصمة الجديدة — بُصم دخولاً وخروجاً خلال دقائق" data-testid="ae-reason" />
            </label>
            {canRequest && <Button size="sm" variant="secondary" disabled={!reasonOk || preview.items === 0} onClick={() => setConfirmMode('hr_request')} data-testid="ae-submit-hr"><Icon name="send" size={14} /> إرسال طلباً إلى الموارد البشرية</Button>}
            {canDirect && <Button size="sm" disabled={!reasonOk || preview.items === 0} onClick={() => setConfirmMode('direct')} data-testid="ae-submit-direct"><Icon name="check" size={14} /> تنفيذ مباشر الآن</Button>}
          </div>
        </section>
      )}

      {confirmMode && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2" role="dialog" aria-modal="true" data-testid="ae-confirm">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-bold">{confirmMode === 'direct' ? 'تأكيد التنفيذ المباشر' : 'تأكيد الإرسال إلى الموارد البشرية'}</h3>
            <p className="mt-2 text-xs text-slate-600">
              {preview.employees} موظف × {preview.days} يوم = <b>{preview.items}</b> يوم عمل · {preview.action_label}.
              {confirmMode === 'direct' ? ' سيُطبَّق فوراً ويُبلَّغ المعاون والتطوير المركزية بتبليغ مجمّع واحد.' : ' يمرّ بسلسلة الموافقات إن وُجدت، ثم تراجعه الموارد البشرية وتعتمده.'}
            </p>
            <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setConfirmMode(null)}>رجوع</Button><Button size="sm" isLoading={createM.isPending} onClick={() => doCreate(confirmMode)} data-testid="ae-confirm-go">{confirmMode === 'direct' ? 'نفّذ' : 'أرسل'}</Button></div>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">سجل طلبات تعديل الحضور</h3><ListFilters f={f} setF={setF} /></div>
        {listLoading ? <LoadingSpinner /> : <RequestsTable rows={rows} onOpen={(r) => setOpenId(r.id)} extra={(r) => r.can_cancel ? <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} data-testid={`ae-cancel-${r.id}`}><Icon name="x" size={14} /> إلغاء</Button> : null} />}
      </section>

      {openId && <RequestDetailDialog id={openId} onClose={() => setOpenId(null)} />}
      {cancelId && <ReasonDialog title="إلغاء الطلب" cta="إلغاء الطلب" min={0} testId="ae-cancel-dialog" tone="danger" busy={cancelM.isPending} onClose={() => setCancelId(null)} onConfirm={(reason) => cancelM.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })} />}
    </div>
  )
}
