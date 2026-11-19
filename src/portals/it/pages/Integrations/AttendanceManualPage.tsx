/**
 * بوابة التطوير المركزية · الحضور اليدوي عند تعطل جهاز البصمة — التفعيل والإيقاف حصراً هنا:
 *   ① تفعيل جديد: بوابة + نطاق من الهيكل التنظيمي (فرع و/أو قسم وأقسامه الفرعية؛ مقترَح من أقسام أصحاب حسابات البوابة) + معاينة قبل التنفيذ.
 *   ② التفعيلات السارية: عدّادات الإنجاز والأيام المعلّقة + إيقاف (تعود البصمة).
 *   ③ السجل: التفعيلات المنتهية.
 * الإيقاف منطقي: البصمات تُخزَّن ولا تُحتسب في أيام التفعيل، ولا يُمَس الجهاز ولا تسجيل موظفيه. الكشف يسجّله الحساب المخوّل من بوابة التفعيل نفسها.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { useCanCall } from '@features/permissions/my-permissions'
import { Overlay } from '@features/attendance-edits/components/AttendanceEditShared'
import {
  MANUAL_ACTIVATION_STATUS_LABELS, MANUAL_RECORDERS_LIMIT, attendanceManualErrorMessage, baghdadToday, buildDepartmentOptions, describeScope, fmtManualDate, shiftDay,
  useManualActivate, useManualActivations, useManualDeactivate, useManualPortalOptions, useManualRecorders, useManualScopePreview, useSetManualRecorders,
  type ManualActivationRow,
} from '@features/attendance-manual'
import { ManualRecordersPicker, recorderOptionFromGrant, type ManualRecorderOption } from '@features/attendance-manual/components/ManualRecordersPicker'
import { Banner, Card, MiniStat, fieldCls } from '@features/attendance-manual/components/shared'

const START_BACK_DAYS = 31

export default function AttendanceManualPage() {
  const canActivate = useCanCall('attendance_manual_activate')
  const canDeactivate = useCanCall('attendance_manual_deactivate')

  const options = useManualPortalOptions()
  const list = useManualActivations(false)
  const { data: branches = [] } = useBranches()
  const { data: departments = [] } = useDepartments()
  const activate = useManualActivate()
  const deactivate = useManualDeactivate()

  const today = baghdadToday()
  const [portal, setPortal] = useState('')
  const [branchId, setBranchId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [includeSub, setIncludeSub] = useState(true)
  const [startsOn, setStartsOn] = useState(today)
  const [reason, setReason] = useState('')
  const [recorderAccounts, setRecorderAccounts] = useState<ManualRecorderOption[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stopping, setStopping] = useState<ManualActivationRow | null>(null)
  const [managingRecorders, setManagingRecorders] = useState<ManualActivationRow | null>(null)

  const scope = useMemo(() => ({ branchId: branchId || null, departmentId: departmentId || null, includeSub }), [branchId, departmentId, includeSub])
  const hasScope = !!scope.branchId || !!scope.departmentId
  const preview = useManualScopePreview(scope, true)
  const deptOptions = useMemo(() => buildDepartmentOptions(departments), [departments])
  const activeBranches = useMemo(() => branches.filter((b) => b.is_active), [branches])
  const portalOpt = (options.data ?? []).find((o) => o.portal === portal) ?? null

  const rows = list.data ?? []
  const active = rows.filter((r) => r.status === 'active')
  const ended = rows.filter((r) => r.status === 'ended')
  const pendingTotal = rows.reduce((n, r) => n + r.pending_days, 0)
  const coveredEmployees = active.reduce((n, r) => n + r.employees, 0)

  const startOk = startsOn >= shiftDay(today, -START_BACK_DAYS) && startsOn <= today
  const reasonOk = reason.trim().length >= 3
  const previewReady = !!preview.data && !preview.isFetching && !preview.isError
  const emptyScope = previewReady && preview.data!.employees === 0
  const ready = !!portal && hasScope && startOk && reasonOk && previewReady && !emptyScope
  const scopeText = describeScope(scope, branches, departments)

  const resetForm = () => { setPortal(''); setBranchId(''); setDepartmentId(''); setIncludeSub(true); setStartsOn(today); setReason(''); setRecorderAccounts([]); setConfirmOpen(false) }
  const doActivate = () => {
    if (!ready) return
    activate.mutate({ portal, branchId: scope.branchId, departmentId: scope.departmentId, includeSub, reason, startsOn, recorderUserIds: recorderAccounts.map((account) => account.id) }, {
      onSuccess: resetForm,
      onError: () => setConfirmOpen(false),
    })
  }
  const applySuggestion = (kind: 'department' | 'branch', id: string) => {
    if (kind === 'department') { setDepartmentId(id); setBranchId('') } else { setBranchId(id); setDepartmentId('') }
  }

  return (
    <div className="space-y-5 pb-6" data-testid="it-attendance-manual">
      <header>
        <h1 className="text-lg font-black">الحضور اليدوي (تعطل البصمة)</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          عند تعطل جهاز البصمة لبوابة ما: فعّل الحضور اليدوي لنطاقها. غرفة العمليات مخوّلة افتراضياً في كل التفعيلات؛ ولا تظهر الوحدة لبقية الحسابات إلا إذا منحتها التطوير المركزية صلاحية هذا التفعيل.
          يشمل الكشف <b>كل موظفي النطاق</b> — بمن فيهم من لا رقم بصمة له (يحتاج شفتاً مُسنداً ليسجّل).
          الإيقاف <b>منطقي</b>: البصمات الواردة تُخزَّن ولا تُحتسب في أيام التفعيل، ولا يُمَس الجهاز ولا تسجيل موظفيه. الإجازات المعتمدة لا تتأثر.
          الجهاز نفسه وتسجيله من <Link to="/it/integrations/biometric" className="font-bold text-brand-700 underline">أجهزة البصمة</Link>.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="am-stats">
        <MiniStat title="تفعيلات سارية" value={active.length} tone={active.length > 0 ? 'sky' : 'slate'} testId="am-stat-active" />
        <MiniStat title="موظفون مشمولون بتفعيل ساري" value={coveredEmployees} testId="am-stat-employees" />
        <MiniStat title="أيام-موظفين بانتظار الكشف" value={pendingTotal} tone={pendingTotal > 0 ? 'amber' : 'slate'} testId="am-stat-pending" />
        <MiniStat title="تفعيلات منتهية" value={ended.length} testId="am-stat-ended" />
      </div>
      {pendingTotal > 0 && (
        <Banner tone="amber" testId="am-pending-note">
          توجد أيام بانتظار الكشف: لا تُحتسب غياباً ولا استقطاعاً، لكنها تمنع اعتماد حضورية الشهر حتى يسجّلها الحسابات المخوّلة أو غرفة العمليات.
        </Banner>
      )}

      <Card title="تفعيل جديد" hint="اختر البوابة المعطّلة بصمتها ثم نطاقها من الهيكل التنظيمي. لن يتغير شيء قبل زر «تفعيل» وتأكيده." testId="am-form">
        {options.isError && <Banner tone="rose" role="alert">تعذّر تحميل البوابات — حدّث الصفحة.</Banner>}
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-bold text-slate-700">البوابة</p>
            <select className={fieldCls} value={portal} onChange={(e) => { setPortal(e.target.value); setRecorderAccounts([]) }} aria-label="البوابة المعطّلة بصمتها" data-testid="am-portal">
              <option value="">اختر البوابة…</option>
              {(options.data ?? []).map((o) => <option key={o.portal} value={o.portal}>{o.label} — {o.holders} حساب</option>)}
            </select>
            {portalOpt && (portalOpt.departments.length > 0 || portalOpt.branches.length > 0) && (
              <div className="space-y-1" data-testid="am-suggestions">
                <p className="text-[11px] text-slate-500">مقترَح من موظفي حسابات هذه البوابة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {portalOpt.departments.map((d) => (
                    <button key={d.id} type="button" onClick={() => applySuggestion('department', d.id)} data-testid={`am-sug-dept-${d.id}`} aria-pressed={departmentId === d.id && !branchId}
                      className="min-h-8 rounded-full bg-white px-3 text-[11px] font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-brand-50 aria-pressed:bg-brand-600 aria-pressed:text-white aria-pressed:ring-brand-600">قسم {d.name} · {d.employees}</button>
                  ))}
                  {portalOpt.branches.map((b) => (
                    <button key={b.id} type="button" onClick={() => applySuggestion('branch', b.id)} data-testid={`am-sug-branch-${b.id}`} aria-pressed={branchId === b.id && !departmentId}
                      className="min-h-8 rounded-full bg-white px-3 text-[11px] font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-brand-50 aria-pressed:bg-brand-600 aria-pressed:text-white aria-pressed:ring-brand-600">فرع {b.name} · {b.employees}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-bold text-slate-700">النطاق (فرع و/أو قسم)</p>
            <label className="block text-[11px] text-slate-500">الفرع
              <select className={fieldCls} value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="الفرع" data-testid="am-branch">
                <option value="">— بلا تقييد بفرع —</option>
                {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block text-[11px] text-slate-500">القسم
              <select className={fieldCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="القسم" data-testid="am-department">
                <option value="">— بلا تقييد بقسم —</option>
                {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            {departmentId && (
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={includeSub} onChange={(e) => setIncludeSub(e.target.checked)} data-testid="am-include-sub" />
                تشمل الأقسام الفرعية
              </label>
            )}
            {!hasScope && <p className="text-[11px] text-amber-700" data-testid="am-scope-hint">اختر فرعاً أو قسماً على الأقل.</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <p className="text-xs font-bold text-slate-700">البدء والسبب</p>
            <label className="block text-[11px] text-slate-500">يبدأ من
              <input type="date" className={fieldCls} value={startsOn} min={shiftDay(today, -START_BACK_DAYS)} max={today} onChange={(e) => setStartsOn(e.target.value)} aria-label="تاريخ بدء الحضور اليدوي" data-testid="am-starts-on" />
            </label>
            {!startOk && <p role="alert" className="text-[11px] font-bold text-red-700" data-testid="am-start-invalid">البدء يكون اليوم أو أحد الأيام الـ{START_BACK_DAYS} الماضية.</p>}
            {startsOn < today && startOk && <p className="text-[11px] text-amber-700">البدء بتاريخ سابق يزيل الحضور التلقائي المبني منذ ذلك اليوم لموظفي النطاق ليحلّ الكشف محلّه.</p>}
            <label className="block text-[11px] text-slate-500">سبب التفعيل (إلزامي)
              <textarea className="mt-1 min-h-[72px] w-full rounded-xl border border-slate-300 p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: عطل جهاز بصمة محطة التحويل منذ الصباح" aria-label="سبب التفعيل" aria-required="true" data-testid="am-reason" />
            </label>
          </div>
        </div>

        <ManualRecordersPicker portalId={portal || null} accounts={recorderAccounts} onChange={setRecorderAccounts} />

        {hasScope && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 text-xs" data-testid="am-preview" aria-live="polite">
            {preview.isFetching && !preview.data ? <LoadingSpinner /> : preview.isError ? (
              <p role="alert" className="font-bold text-red-700">تعذّرت المعاينة — {attendanceManualErrorMessage(preview.error)}</p>
            ) : preview.data ? (
              <div className="space-y-2">
                <p className="font-bold text-slate-800">{scopeText}</p>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat title="داخل الكشف" value={preview.data.employees} tone={preview.data.employees > 0 ? 'emerald' : 'rose'} testId="am-prev-employees" />
                  <MiniStat title="منهم بلا رقم بصمة" value={preview.data.no_pin} testId="am-prev-nopin" />
                  <MiniStat title="متعهدون (يُدفعون بالأعداد)" value={preview.data.contractors} testId="am-prev-contractors" />
                </div>
                {preview.data.sample.length > 0 && <p className="leading-relaxed text-slate-600" data-testid="am-prev-sample">منهم: {preview.data.sample.join('، ')}{preview.data.employees > preview.data.sample.length ? ` … و${preview.data.employees - preview.data.sample.length} آخرين` : ''}</p>}
                {emptyScope && <Banner tone="rose" role="alert" testId="am-prev-empty">لا يوجد موظفون في هذا النطاق (ببصمة أو بلا بصمة) — اختر فرعاً أو قسماً فيه موظفون.</Banner>}
                {preview.data.overlapping.length > 0 && (
                  <Banner tone="amber" testId="am-prev-overlap">
                    يتقاطع مع تفعيل ساريٍ: {preview.data.overlapping.map((o) => o.portal_label).join('، ')}. يمكن المتابعة؛ يسجّل الكشف أيٌّ من البوابتين، ويُعدّ اليوم مكتملاً متى سُجّل الموظف مرة.
                  </Banner>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">لا تفعيل مكرر للبوابة بالنطاق نفسه. يبدأ التفويض بغرفة العمليات فقط؛ والحسابات الإضافية تُحدَّد أعلاه.</p>
          <Button disabled={!ready || !canActivate.allowed || activate.isPending} title={canActivate.title} isLoading={activate.isPending} onClick={() => setConfirmOpen(true)} data-testid="am-activate">تفعيل الحضور اليدوي…</Button>
        </div>
      </Card>

      <Card title="التفعيلات السارية" testId="am-active-list" hint="ما دام التفعيل ساريًا فالكشف هو المصدر الوحيد لحضور موظفي النطاق.">
        {list.isLoading ? <LoadingSpinner /> : list.isError ? (
          <Banner tone="rose" role="alert" action={<Button size="sm" variant="secondary" onClick={() => void list.refetch()}>إعادة المحاولة</Button>}>تعذّر تحميل التفعيلات.</Banner>
        ) : active.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500" data-testid="am-active-empty">لا يوجد تفعيل ساريٍ — كل البوابات تعمل ببصمتها.</p>
        ) : (
          <ul className="space-y-2">{active.map((r) => <ActivationItem key={r.id} r={r} onStop={() => setStopping(r)} stopDisabled={!canDeactivate.allowed} stopTitle={canDeactivate.title} onManageRecorders={() => setManagingRecorders(r)} manageDisabled={!canActivate.allowed} manageTitle={canActivate.title} />)}</ul>
        )}
      </Card>

      {ended.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="am-ended-list">
          <summary className="cursor-pointer text-sm font-black text-slate-800">③ السجل — تفعيلات منتهية ({ended.length})</summary>
          <ul className="mt-3 space-y-2">{ended.map((r) => <ActivationItem key={r.id} r={r} onManageRecorders={r.pending_days > 0 ? () => setManagingRecorders(r) : undefined} manageDisabled={!canActivate.allowed} manageTitle={canActivate.title} />)}</ul>
        </details>
      )}

      {confirmOpen && (
        <Overlay title="تأكيد تفعيل الحضور اليدوي" onClose={() => setConfirmOpen(false)} testId="am-confirm">
          <div className="space-y-3 text-xs leading-relaxed">
            <p><b>{portalOpt?.label ?? portal}</b> — {scopeText} — من <b>{fmtManualDate(startsOn)}</b>: <b>{preview.data?.employees ?? 0}</b> موظفاً.</p>
            <ul className="list-disc space-y-1 ps-5 text-slate-700">
              <li>تتوقف البصمة <b>منطقياً</b> لهذا النطاق: تُخزَّن البصمات ولا تُحتسب، ولا يُمَس الجهاز.</li>
              <li>يُزال الحضور التلقائي المبني في أيام النطاق منذ البدء ليحلّ الكشف محلّه (الإجازات المعتمدة لا تُمَس).</li>
              <li>غرفة العمليات مخوّلة تلقائياً؛ ولا يسجّل غيرها إلا الحسابات الإضافية التي منحتها التطوير المركزية صلاحية هذا التفعيل ({recorderAccounts.length} حساب، ويمكن توثيق حسابات غرفة العمليات ضمنها أيضاً).</li>
              <li>الموظف الذي لا يملك شفتاً لا يُسجَّل له حضور حتى يُسنَد له شفت.</li>
              <li>كل يوم عمل بلا كشف يبقى «بانتظار الكشف» (لا غياب ولا استقطاع) ويمنع اعتماد حضورية الشهر.</li>
              <li>المتعهدون في النطاق يُدفعون من الأعداد التي يرسلونها.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={activate.isPending}>رجوع</Button>
              <Button size="sm" disabled={!ready || !canActivate.allowed || activate.isPending} title={canActivate.title} isLoading={activate.isPending} onClick={doActivate} data-testid="am-confirm-activate">تأكيد التفعيل</Button>
            </div>
          </div>
        </Overlay>
      )}

      {stopping && (
        <StopDialog r={stopping} today={today} busy={deactivate.isPending} blocked={!canDeactivate.allowed} blockedTitle={canDeactivate.title} onClose={() => setStopping(null)}
          onConfirm={(lastDay, note) => deactivate.mutate({ id: stopping.id, lastDay, note }, { onSuccess: () => setStopping(null) })} />
      )}

      {managingRecorders && <RecordersDialog r={managingRecorders} blocked={!canActivate.allowed} blockedTitle={canActivate.title} onClose={() => setManagingRecorders(null)} />}
    </div>
  )
}

function ActivationItem({ r, onStop, stopDisabled, stopTitle, onManageRecorders, manageDisabled, manageTitle }: {
  r: ManualActivationRow; onStop?: () => void; stopDisabled?: boolean; stopTitle?: string
  onManageRecorders?: () => void; manageDisabled?: boolean; manageTitle?: string
}) {
  const isActive = r.status === 'active'
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-xs" data-testid={`am-item-${r.id}`} data-status={r.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">{r.portal_label} <span className="font-bold text-slate-500">— {r.scope_label}</span></p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {isActive ? `منذ ${fmtManualDate(r.starts_on)}` : `${fmtManualDate(r.starts_on)} ← ${fmtManualDate(r.ends_on)}`}
            {r.activated_by_name ? ` · فعّله ${r.activated_by_name}` : ''}{!isActive && r.ended_by_name ? ` · أوقفه ${r.ended_by_name}` : ''}
          </p>
          <p className="mt-1 leading-relaxed text-slate-700">السبب: {r.reason}{!isActive && r.end_note ? ` — الإيقاف: ${r.end_note}` : ''}</p>
        </div>
        <span className={isActive ? 'rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold text-sky-800' : 'rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600'}>{MANUAL_ACTIVATION_STATUS_LABELS[r.status]}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-600" data-testid={`am-counters-${r.id}`}>
          {r.employees} موظفاً · {r.entries} تسجيلاً · <span className={r.pending_days > 0 ? 'font-bold text-amber-700' : ''}>{r.pending_days} يوم-موظف بانتظار الكشف{r.pending_dates > 0 ? ` (في ${r.pending_dates} يوم)` : ''}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {onManageRecorders && <Button size="sm" variant="secondary" disabled={manageDisabled} title={manageTitle} onClick={onManageRecorders} data-testid={`am-recorders-${r.id}`}>حسابات التسجيل</Button>}
          {isActive && onStop && <Button size="sm" variant="danger" disabled={stopDisabled} title={stopTitle} onClick={onStop} data-testid={`am-stop-${r.id}`}>إيقاف وعودة البصمة…</Button>}
        </div>
      </div>
    </li>
  )
}

function StopDialog({ r, today, busy, blocked, blockedTitle, onClose, onConfirm }: {
  r: ManualActivationRow; today: string; busy: boolean; blocked: boolean; blockedTitle: string | undefined
  onClose: () => void; onConfirm: (lastDay: string, note: string | null) => void
}) {
  const [lastDay, setLastDay] = useState(today)
  const [note, setNote] = useState('')
  const min = shiftDay(r.starts_on, -1)
  const valid = lastDay >= min && lastDay <= today
  return (
    <Overlay title={`إيقاف الحضور اليدوي — ${r.portal_label}`} onClose={onClose} testId="am-stop-dialog">
      <div className="space-y-3 text-xs leading-relaxed">
        <p className="text-slate-700">{r.scope_label}: تعود البصمة للأيام التي بعد «آخر يوم مغطّى». الأيام داخل التفعيل بلا كشف تبقى «بانتظار الكشف» وتمنع اعتماد الشهر حتى تُسجَّل.</p>
        <label className="block text-[11px] text-slate-500">آخر يوم يبقى مغطّى بالكشف (الافتراضي اليوم)
          <input type="date" className={fieldCls} value={lastDay} min={min} max={today} onChange={(e) => setLastDay(e.target.value)} aria-label="آخر يوم مغطّى بالكشف" data-testid="am-last-day" />
        </label>
        {!valid && <p role="alert" className="font-bold text-red-700">اختر يوماً بين {fmtManualDate(min)} واليوم.</p>}
        {lastDay < today && valid && <p className="text-amber-700">الأيام بعد {fmtManualDate(lastDay)} حتى اليوم تُحسب من بصمات الجهاز الآن.</p>}
        <label className="block text-[11px] text-slate-500">ملاحظة الإيقاف (اختيارية)
          <textarea className="mt-1 min-h-[64px] w-full rounded-xl border border-slate-300 p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: أُصلح الجهاز وأُعيد ربطه" aria-label="ملاحظة الإيقاف" data-testid="am-stop-note" />
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>رجوع</Button>
          <Button size="sm" variant="danger" disabled={!valid || blocked || busy} title={blockedTitle} isLoading={busy} onClick={() => onConfirm(lastDay, note.trim() || null)} data-testid="am-stop-confirm">تأكيد الإيقاف</Button>
        </div>
      </div>
    </Overlay>
  )
}

function RecordersDialog({ r, blocked, blockedTitle, onClose }: {
  r: ManualActivationRow; blocked: boolean; blockedTitle: string | undefined; onClose: () => void
}) {
  const recorders = useManualRecorders(r.id)
  const save = useSetManualRecorders()
  const [accounts, setAccounts] = useState<ManualRecorderOption[] | null>(null)
  const editable = !blocked && (r.status === 'active' || r.pending_days > 0)
  const validAccounts = !!accounts && accounts.length <= MANUAL_RECORDERS_LIMIT && accounts.every((account) => account.isOpsRoom || account.hasPortalRole)

  useEffect(() => {
    if (recorders.data) setAccounts(recorders.data.map((account) => recorderOptionFromGrant(account, r.portal)))
  }, [recorders.data, r.portal])

  const commit = () => {
    if (!editable || !accounts) return
    save.mutate({ activation: r.id, userIds: accounts.map((account) => account.id) }, { onSuccess: onClose })
  }

  return (
    <Overlay title={`حسابات التسجيل — ${r.portal_label}`} onClose={onClose} testId="am-recorders-dialog">
      <div className="space-y-3 text-xs leading-relaxed">
        <p className="font-bold text-slate-800">{r.scope_label}</p>
        <p className="text-slate-600">غرفة العمليات مخوّلة افتراضياً؛ ويمكن إضافة حساباتها هنا أيضاً للتوثيق. يلزم لبقية الحسابات دور بوابة التفعيل المناسب.</p>
        {r.status === 'ended' && r.pending_days > 0 && <Banner tone="amber">بقيت أيام معلّقة؛ يحتفظ الحساب المخوّل بالوصول لإكمالها، ثم يُسحب الوصول تلقائياً عند اكتمالها.</Banner>}
        {r.status === 'ended' && r.pending_days === 0 && <Banner tone="slate">اكتملت الأيام المعلّقة لهذا التفعيل؛ انتهى الوصول ولا يمكن تغيير القائمة.</Banner>}
        {recorders.isLoading ? <LoadingSpinner /> : recorders.isError ? (
          <Banner tone="rose" role="alert" testId="am-recorders-load-error" action={<Button size="sm" variant="secondary" onClick={() => void recorders.refetch()}>إعادة المحاولة</Button>}>تعذّر تحميل الحسابات المخوّلة.</Banner>
        ) : accounts && (
          <ManualRecordersPicker portalId={r.portal} accounts={accounts} onChange={setAccounts} disabled={!editable || save.isPending} />
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={save.isPending}>إغلاق</Button>
          <Button size="sm" disabled={!editable || !validAccounts || recorders.isLoading || recorders.isError || save.isPending} title={blocked ? blockedTitle : undefined} isLoading={save.isPending} onClick={commit} data-testid="am-recorders-save">حفظ الحسابات المخوّلة</Button>
        </div>
      </div>
    </Overlay>
  )
}
