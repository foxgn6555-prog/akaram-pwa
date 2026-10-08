/**
 * بوابة التطوير المركزية — «سياسة الحضور والإجازات» (00144)
 * كل الأرقام والمعادلات قابلة للتخصيص من هنا: الرصيد السنوي الافتراضي ونمط الاستحقاق والترحيل · الزمنيات (كم زمنية = يوم، الحد الأقصى، السقف الشهري)
 * · الدوام الإضافي → رصيد · عتبات التنبيه · أنواع الإجازات والزمنيات. (00195: كل إعدادات الاستقطاع التلقائي في وحدة «الاستقطاعات التلقائية» المستقلة.)
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useHrPolicy, useLeaveTypes, useSaveLeaveType, useSetHrPolicy } from '@features/hr'
import type { HrPolicy, LeaveType } from '@features/hr'
import { field, fmtMinutes } from '@portals/hr/components/hr-format'

type Draft = HrPolicy
const NUM = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))

export default function HrPolicyPage() {
  const { data: policy, isLoading } = useHrPolicy()
  const save = useSetHrPolicy()
  const [draft, setDraft] = useState<Draft | null>(null)
  useEffect(() => { if (policy && !draft) setDraft(policy) }, [policy, draft])
  const dirty = useMemo(() => !!draft && !!policy && JSON.stringify(draft) !== JSON.stringify(policy), [draft, policy])
  if (isLoading || !draft) return <LoadingSpinner />
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  return (
    <div className="space-y-4" data-testid="hr-policy-page">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-black">سياسة الحضور والإجازات</h1><p className="text-xs text-slate-500">كل الأرقام والمعادلات هنا تُطبَّق فوراً على احتساب الحضور والأرصدة في بوابات HR وغرفة العمليات والموظف</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => setDraft(policy ?? null)} data-testid="policy-reset">تراجع</Button>
          <Button size="sm" disabled={!dirty} isLoading={save.isPending} onClick={() => save.mutate(draft)} data-testid="policy-save">حفظ السياسة</Button>
        </div>
      </header>

      <Section title="محرك البصمة والاحتساب التلقائي" hint="نافذة الالتقاط: البصمات التي تقع قبل بداية الدوام أو بعد نهايته بأكثر من هذه الساعات لا تُنسب لذلك اليوم. إيقاف الاحتساب التلقائي يُبقي زر «احتساب» اليدوي في HR وغرفة العمليات.">
        <L label="نافذة التقاط البصمات حول الدوام (ساعات، 1–12)"><input type="number" min={1} max={12} className={field} value={draft.punch_window_hours ?? 4} onChange={(e) => set('punch_window_hours', Number(e.target.value))} data-testid="p-window" /></L>
        <L label="الاحتساب التلقائي (عند وصول البصمة + الاحتساب اليومي)"><select className={field} value={String(draft.auto_evaluate_enabled ?? true)} onChange={(e) => set('auto_evaluate_enabled', e.target.value === 'true')} data-testid="p-auto"><option value="true">مفعّل</option><option value="false">متوقف (احتساب يدوي فقط)</option></select></L>
        <L label="الاحتساب اليومي يعيد احتساب آخر (أيام، 1–31)"><input type="number" min={1} max={31} className={field} value={draft.evaluate_lookback_days ?? 2} onChange={(e) => set('evaluate_lookback_days', Number(e.target.value))} data-testid="p-lookback" /></L>
      </Section>
      <Section title="رصيد الإجازات" hint="المنحة السنوية الافتراضية لكل موظف (تستطيع HR تعديلها لكل موظف على حدة)">
        <L label="الرصيد السنوي الافتراضي (يوم)"><input type="number" min={0} max={365} className={field} value={draft.annual_leave_days_default} onChange={(e) => set('annual_leave_days_default', NUM(e.target.value))} data-testid="p-annual" /></L>
        <L label="نمط الاستحقاق">
          <select className={field} value={draft.balance_mode} onChange={(e) => set('balance_mode', e.target.value as HrPolicy['balance_mode'])} data-testid="p-mode">
            <option value="annual_upfront">كامل الرصيد متاح من بداية السنة</option><option value="monthly_accrual">يستحق شهرياً (1/12 كل شهر)</option>
          </select>
        </L>
        <L label="ترحيل المتبقي للسنة التالية"><select className={field} value={String(draft.carry_over)} onChange={(e) => set('carry_over', e.target.value === 'true')} data-testid="p-carry"><option value="true">نعم</option><option value="false">لا</option></select></L>
        <L label="الحد الأقصى للترحيل (يوم)"><input type="number" min={0} className={field} value={draft.carry_over_max_days} disabled={!draft.carry_over} onChange={(e) => set('carry_over_max_days', NUM(e.target.value))} data-testid="p-carry-max" /></L>
      </Section>

      <Section title="الزمنيات" hint="الزمنية المدفوعة تُخصم من رصيد الإجازات بنسبة (1 ÷ عدد الزمنيات لكل يوم)">
        <L label="كم زمنية مدفوعة = يوم إجازة"><input type="number" min={1} max={20} className={field} value={draft.permits_per_leave_day} onChange={(e) => set('permits_per_leave_day', NUM(e.target.value, 1))} data-testid="p-permits-per-day" /></L>
        <L label="الحد الأقصى لمدة الزمنية (دقيقة)"><input type="number" min={15} step={15} className={field} value={draft.permit_max_minutes} onChange={(e) => set('permit_max_minutes', NUM(e.target.value, 15))} data-testid="p-permit-max" /></L>
        <L label="السقف الشهري لعدد الزمنيات (فارغ = بلا سقف)"><input type="number" min={0} className={field} value={draft.permits_max_per_month ?? ''} onChange={(e) => set('permits_max_per_month', e.target.value === '' ? null : NUM(e.target.value))} data-testid="p-permits-month" /></L>
      </Section>

      <Section title="الطلب بأثر رجعي (ليوم سابق)" hint="موظف غاب بموافقة شفهية ولم يُسجَّل طلبه: يمكنه الطلب لاحقاً بسبب إلزامي، ويظهر لكل مدير في سلسلة الموافقات كطلب متأخر مع السبب والحالة المسجّلة. HR بلا مهلة. عند بلوغ حد التكرار الشهري تُنبَّه الموارد البشرية.">
        <L label="السماح بالطلب ليوم سابق"><select className={field} value={String(draft.backdated_requests_enabled ?? true)} onChange={(e) => set('backdated_requests_enabled', e.target.value === 'true')} data-testid="p-backdated-enabled"><option value="true">مسموح (بسبب إلزامي وشارة للمدراء)</option><option value="false">موقوف للجميع</option></select></L>
        <L label="المهلة القصوى للموظف والمدير (يوم إلى الوراء)"><input type="number" min={0} max={365} className={field} disabled={draft.backdated_requests_enabled === false} value={draft.backdated_max_days ?? 7} onChange={(e) => set('backdated_max_days', Math.min(365, Math.max(0, NUM(e.target.value, 7))))} data-testid="p-backdated-max" /></L>
        <L label="تنبيه HR عند بلوغ عدد الطلبات بأثر رجعي في الشهر"><input type="number" min={1} max={31} className={field} disabled={draft.backdated_requests_enabled === false} value={draft.backdated_alert_per_month ?? 3} onChange={(e) => set('backdated_alert_per_month', Math.min(31, Math.max(1, NUM(e.target.value, 3))))} data-testid="p-backdated-alert" /></L>
      </Section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900" data-testid="deductions-moved">
        <h2 className="text-sm font-black">الاستقطاعات التلقائية انتقلت إلى وحدة مستقلة</h2>
        <p className="mt-1">السماحية وشرائح نقص الدقائق والغياب والبصمة الناقصة وأساس المبلغ (من الراتب أو ثابت) والسقوف والاستثناءات وتفعيل القواعد على فروع/أقسام/موظفين — كلها تُدار الآن من <Link to="/it/integrations/auto-deductions" className="font-bold underline" data-testid="deductions-link">وحدة «الاستقطاعات التلقائية»</Link> بقواعد متعددة. لا يوجد تكرار لهذه الإعدادات هنا.</p>
      </section>
      <Section title="احتساب الراتب الشهري (المالية تعتمد هذه القواعد)" hint="الفترة المشمولة بالتصدير = من أول الشهر (أو تاريخ التعيين) إلى آخر يوم مكتمل (أمس إن كان الشهر جارياً، أو تاريخ إنهاء الخدمة). مع التناسب: الموظف يستحق أجر الأيام المشمولة فقط (مثال: راتب 500,000 وتصدير بعد 5 أيام ⇒ الإجمالي 83,333 وليس 500,000). الشهر المكتمل = الراتب كاملاً دائماً.">
        <L label="اعتماد الحضورية قبل التصدير للمالية (غرفة العمليات بمرحلتين)"><select className={field} value={String(draft.require_attendance_confirmation ?? true)} onChange={(e) => set('require_attendance_confirmation', e.target.value === 'true')} data-testid="p-require-confirm"><option value="true">إلزامي: تدقيق تفصيلي → اعتماد الشهر → كشف معتمد → تصدير</option><option value="false">غير إلزامي: التصدير متاح مباشرة (لا يُنصح)</option></select></L>
        <L label="أجر اليوم للراتب الشهري"><select className={field} value={draft.salary_day_basis ?? 'fixed_30'} onChange={(e) => set('salary_day_basis', e.target.value as 'fixed_30' | 'calendar_days')} data-testid="p-day-basis"><option value="fixed_30">الأساسي ÷ 30 (ثابت)</option><option value="calendar_days">الأساسي ÷ أيام الشهر الفعلية (28–31)</option></select></L>
        <L label="الشهر الجزئي (تصدير مبكر / تعيين أو إنهاء خلال الشهر)"><select className={field} value={String(draft.prorate_partial_month ?? true)} onChange={(e) => set('prorate_partial_month', e.target.value === 'true')} data-testid="p-prorate"><option value="true">بالنسبة والتناسب: أجر اليوم × الأيام المشمولة</option><option value="false">الراتب كاملاً ثم تُخصم الاستقطاعات</option></select></L>
        <L label="المخصصات في الشهر الجزئي"><select className={field} value={String(draft.prorate_allowances ?? true)} onChange={(e) => set('prorate_allowances', e.target.value === 'true')} data-testid="p-prorate-allow"><option value="true">متناسبة مع الأيام المشمولة</option><option value="false">كاملة</option></select></L>
      </Section>
      <Section title="الدوام الإضافي → رصيد إجازات" hint="يُحتسب الإضافي بعد نهاية الشفت فقط وبعد تغطية أي نقص في اليوم نفسه، ويُضاف إلى الرصيد عند تصدير الشهر">
        <L label="تفعيل"><select className={field} value={String(draft.overtime_enabled)} onChange={(e) => set('overtime_enabled', e.target.value === 'true')} data-testid="p-ot"><option value="true">مفعّل</option><option value="false">معطّل</option></select></L>
        <L label="أقل كتلة تُحتسب في اليوم (دقيقة)"><input type="number" min={0} className={field} value={draft.overtime_min_block_minutes} onChange={(e) => set('overtime_min_block_minutes', NUM(e.target.value))} data-testid="p-ot-block" /></L>
        <L label="دقائق الإضافي لكل يوم إجازة (فارغ = ساعات الشفت)"><input type="number" min={60} className={field} value={draft.overtime_minutes_per_leave_day ?? ''} onChange={(e) => set('overtime_minutes_per_leave_day', e.target.value === '' ? null : NUM(e.target.value))} data-testid="p-ot-per-day" /></L>
      </Section>

      <Section title="عتبات التنبيه (شهرياً)" hint="عند تجاوزها يُنشأ تنبيه للمدير المباشر ولقائمة تنبيهات HR وغرفة العمليات">
        <L label="أيام التأخير"><input type="number" min={1} className={field} value={draft.alert_late_days_per_month} onChange={(e) => set('alert_late_days_per_month', NUM(e.target.value, 1))} data-testid="p-al-late" /></L>
        <L label="مجموع نقص الدقائق"><input type="number" min={1} className={field} value={draft.alert_shortfall_minutes_per_month} onChange={(e) => set('alert_shortfall_minutes_per_month', NUM(e.target.value, 1))} data-testid="p-al-short" /></L>
        <L label="أيام الغياب"><input type="number" min={1} className={field} value={draft.alert_absent_days_per_month} onChange={(e) => set('alert_absent_days_per_month', NUM(e.target.value, 1))} data-testid="p-al-abs" /></L>
        <L label="رصيد منخفض (يوم)"><input type="number" min={0} className={field} value={draft.alert_balance_low_days} onChange={(e) => set('alert_balance_low_days', NUM(e.target.value))} data-testid="p-al-bal" /></L>
      </Section>

      <LeaveTypesPanel />
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black">{title}</h2>{hint && <p className="mb-3 text-[11px] text-slate-500">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-slate-600">{label}<div className="mt-1">{children}</div></label>
}

const EMPTY_TYPE: Partial<LeaveType> = { code: '', name: '', kind: 'leave', is_paid: true, consumes_balance: false, deduction_days_per_day: 1, requires_attachment: false, max_days_per_request: null, max_minutes: null, sort_order: 100, is_active: true }

export function LeaveTypesPanel() {
  const { data: types = [], isLoading } = useLeaveTypes(true)
  const save = useSaveLeaveType()
  const [editing, setEditing] = useState<Partial<LeaveType> | null>(null)
  const valid = !!editing && !!editing.name?.trim() && !!editing.code?.trim()
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="leave-types-panel">
      <div className="flex items-center justify-between">
        <div><h2 className="text-sm font-black">أنواع الإجازات والزمنيات</h2><p className="text-[11px] text-slate-500">المدفوع لا يُستقطع من الراتب · «يستهلك الرصيد» يخصم من رصيد الإجازات (إجازة: أيام، زمنية: جزء من يوم) · غير المدفوع يُستقطع بالأيام المحددة لكل يوم</p></div>
        <Button size="sm" variant="secondary" onClick={() => setEditing({ ...EMPTY_TYPE })} data-testid="lt-new">+ نوع جديد</Button>
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs" data-testid="lt-table">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">الاسم</th><th className="p-2">الرمز</th><th className="p-2">الصنف</th><th className="p-2">مدفوعة</th><th className="p-2">يستهلك الرصيد</th><th className="p-2">استقطاع/يوم</th><th className="p-2">مرفق</th><th className="p-2">الحد</th><th className="p-2">الحالة</th><th className="p-2"></th></tr></thead>
            <tbody>{types.map((t) => (
              <tr key={t.id} className={clsx('border-t border-slate-100', !t.is_active && 'text-slate-400')} data-testid={`lt-row-${t.code}`}>
                <td className="p-2 font-semibold">{t.name}</td><td className="p-2 text-center" dir="ltr">{t.code}</td>
                <td className="p-2 text-center">{t.kind === 'leave' ? 'إجازة' : 'زمنية'}</td>
                <td className="p-2 text-center">{t.is_paid ? '✔' : <span className="font-bold text-red-600">تُستقطع</span>}</td>
                <td className="p-2 text-center">{t.consumes_balance ? '✔' : '—'}</td>
                <td className="p-2 text-center">{t.is_paid ? '—' : t.kind === 'leave' ? `${t.deduction_days_per_day} يوم` : 'بالدقائق'}</td>
                <td className="p-2 text-center">{t.requires_attachment ? 'إلزامي' : '—'}</td>
                <td className="p-2 text-center">{t.kind === 'leave' ? (t.max_days_per_request ? `${t.max_days_per_request} يوم` : '—') : (t.max_minutes ? fmtMinutes(t.max_minutes) : 'حسب السياسة')}</td>
                <td className="p-2 text-center">{t.is_active ? 'نشط' : 'معطّل'}</td>
                <td className="p-2 text-center"><button type="button" className="font-bold text-brand-700 hover:underline" onClick={() => setEditing({ ...t })} data-testid={`lt-edit-${t.code}`}>تعديل</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {editing && (
        <div className="mt-3 grid gap-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="lt-form">
          <L label="الاسم"><input className={field} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="lt-name" /></L>
          <L label="الرمز (لاتيني)"><input className={field} dir="ltr" value={editing.code ?? ''} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} data-testid="lt-code" /></L>
          <L label="الصنف"><select className={field} value={editing.kind} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, kind: e.target.value as LeaveType['kind'] })} data-testid="lt-kind"><option value="leave">إجازة (أيام)</option><option value="time_permit">زمنية (ساعات)</option></select></L>
          <L label="مدفوعة (لا تُستقطع من الراتب)"><select className={field} value={String(editing.is_paid)} onChange={(e) => setEditing({ ...editing, is_paid: e.target.value === 'true' })} data-testid="lt-paid"><option value="true">نعم</option><option value="false">لا — تُستقطع</option></select></L>
          <L label="تستهلك رصيد الإجازات"><select className={field} value={String(editing.consumes_balance)} onChange={(e) => setEditing({ ...editing, consumes_balance: e.target.value === 'true' })} data-testid="lt-consumes"><option value="false">لا</option><option value="true">نعم</option></select></L>
          {editing.kind === 'leave' && !editing.is_paid && <L label="أيام تُستقطع عن كل يوم"><input type="number" min={0} max={3} step={0.25} className={field} value={editing.deduction_days_per_day ?? 1} onChange={(e) => setEditing({ ...editing, deduction_days_per_day: NUM(e.target.value, 1) })} data-testid="lt-ded" /></L>}
          {editing.kind === 'leave' ? <L label="الحد الأقصى للأيام في الطلب (فارغ = بلا)"><input type="number" min={1} className={field} value={editing.max_days_per_request ?? ''} onChange={(e) => setEditing({ ...editing, max_days_per_request: e.target.value === '' ? null : NUM(e.target.value) })} data-testid="lt-max-days" /></L>
            : <L label="الحد الأقصى بالدقائق (فارغ = حسب السياسة)"><input type="number" min={15} className={field} value={editing.max_minutes ?? ''} onChange={(e) => setEditing({ ...editing, max_minutes: e.target.value === '' ? null : NUM(e.target.value) })} data-testid="lt-max-min" /></L>}
          <L label="يتطلب مرفقاً"><select className={field} value={String(editing.requires_attachment)} onChange={(e) => setEditing({ ...editing, requires_attachment: e.target.value === 'true' })} data-testid="lt-attach"><option value="false">لا</option><option value="true">نعم</option></select></L>
          <L label="الترتيب"><input type="number" className={field} value={editing.sort_order ?? 100} onChange={(e) => setEditing({ ...editing, sort_order: NUM(e.target.value, 100) })} /></L>
          <L label="الحالة"><select className={field} value={String(editing.is_active)} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === 'true' })} data-testid="lt-active"><option value="true">نشط</option><option value="false">معطّل</option></select></L>
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-5">
            <Button size="sm" disabled={!valid} isLoading={save.isPending} onClick={() => save.mutate(editing, { onSuccess: () => setEditing(null) })} data-testid="lt-save">حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
          </div>
        </div>
      )}
    </section>
  )
}
