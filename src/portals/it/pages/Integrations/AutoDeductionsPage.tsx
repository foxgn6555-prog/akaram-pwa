/**
 * بوابة التطوير المركزية — «الاستقطاعات التلقائية» (00195)
 * الوحدة الوحيدة لكل إعدادات وطرق الاستقطاع التلقائي:
 *  · القواعد: قاعدة افتراضية (تُطبَّق على الجميع) + قواعد إضافية بإعدادات مستقلة (شرائح، غياب، بصمة ناقصة، من الراتب أو مبالغ ثابتة، سقوف).
 *  · النطاق: كل قاعدة تُفعَّل على فروع/أقسام/مسميات/موظفين — الأخص يغلب (موظف ← مسمى/قسم ← فرع ← افتراضي).
 *  · الاستثناءات: إيقاف الاستقطاع التلقائي كلياً لموظف/قسم/فرع بسبب ومدة.
 *  · الموظفون: القاعدة الفعّالة لكل موظف ومصدرها + أرقام الشهر، مع تعيين قاعدة أو استثناء مباشرة.
 *  · المحاكاة والسجل. غرفة العمليات تدقّق وتعتمد فقط — لا تُعدِّل القواعد.
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useBranches } from '@features/branches/hooks/useBranches'
import {
  useAddDeductionExemption, useDeductionAudit, useDeductionEmployees, useDeductionExemptions, useDeductionRules, useDeleteDeductionRule, useHrDepartments, useHrEmployees,
  useHrPolicy, useRemoveDeductionExemption, useSaveDeductionRule, useSetDeductionTargets, useSimulateDeductionV2,
} from '@features/hr'
import type { DeductionEmployeeRow, DeductionRule, DeductionRuleSettings, DeductionRuleSource, DeductionSimCase, DeductionSimulationV2, DeductionTargetType, DeductionTier, ShortfallMethod } from '@features/hr'
import { ATTENDANCE_STATUS_LABELS } from '@features/hr/types'
import { applyShortfall, SHORTFALL_METHOD_LABEL, validateTiers } from '@features/hr/lib/policy'
import { field, fmtMinutes, fmtMoney, isoDay, monthStart } from '@portals/hr/components/hr-format'

type Tab = 'rules' | 'scope' | 'exemptions' | 'employees' | 'simulate' | 'audit'
const TABS: { id: Tab; label: string }[] = [
  { id: 'rules', label: 'القواعد' }, { id: 'scope', label: 'النطاق' }, { id: 'exemptions', label: 'الاستثناءات' },
  { id: 'employees', label: 'الموظفون' }, { id: 'simulate', label: 'المحاكاة' }, { id: 'audit', label: 'السجل' },
]
const NUM = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))
const SOURCE_LABEL: Record<DeductionRuleSource, string> = { exempt: 'مستثنى', employee: 'تعيين مباشر للموظف', department: 'عبر القسم/المسمى', branch: 'عبر الفرع', default: 'الافتراضية' }
const TYPE_LABEL: Record<DeductionTargetType, string> = { branch: 'فرع', department: 'قسم / مسمى', employee: 'موظف' }
const ACTION_LABEL = { rule_save: 'حفظ قاعدة', rule_delete: 'حذف قاعدة', target_set: 'تعديل نطاق', exemption_add: 'إضافة استثناء', exemption_remove: 'إلغاء استثناء' } as const
const DEFAULT_RULE_SETTINGS: DeductionRuleSettings = {
  grace_minutes_default: 15, absent_day_deduction_days: 1, incomplete_punch_as_absent: false,
  deduction_tiers: [{ from: 1, to: 15, minutes: 0, day_fraction: null }, { from: 16, to: 30, minutes: 30, day_fraction: null }, { from: 31, to: 60, minutes: 60, day_fraction: null }, { from: 61, to: 120, minutes: 120, day_fraction: null }, { from: 121, to: null, minutes: null, day_fraction: 0.5 }],
  auto_deduction_enabled: true, deduct_absence_enabled: true, deduct_shortfall_enabled: true, deduct_unpaid_leave_enabled: true,
  auto_deduction_amount_mode: 'salary', fixed_absent_day_amount: 0, fixed_shortfall_minute_amount: 0, max_auto_deduction_days_per_month: 0, auto_deduction_cap_ratio: 1,
  shortfall_method: 'tiers', shortfall_multiplier: 1, shortfall_block_minutes: 30,
}
const summarize = (s: DeductionRuleSettings) => {
  if (s.auto_deduction_enabled === false) return 'متوقف — لا يُقترح أي استقطاع'
  const parts = [s.auto_deduction_amount_mode === 'fixed' ? `ثابت: ${fmtMoney(s.fixed_absent_day_amount)} د.ع/يوم · ${fmtMoney(s.fixed_shortfall_minute_amount)} د.ع/دقيقة` : 'من راتب الموظف (أجر اليوم والدقيقة)']
  parts.push(s.deduct_absence_enabled === false ? 'الغياب: لا يُستقطع' : `الغياب: ${s.absent_day_deduction_days} يوم`)
  const m = s.shortfall_method ?? 'tiers'
  const methodText = m === 'tiers' ? `${s.deduction_tiers.length} شرائح` : m === 'actual' ? 'دقيقة بدقيقة' : m === 'multiplier' ? `دقيقة بدقيقة × ${s.shortfall_multiplier ?? 1}` : `كتل ${s.shortfall_block_minutes ?? 30} د${(s.shortfall_multiplier ?? 1) !== 1 ? ` × ${s.shortfall_multiplier}` : ''}`
  parts.push(s.deduct_shortfall_enabled === false ? 'النقص: لا يُستقطع' : `النقص: ${methodText} بعد ${s.grace_minutes_default} د سماحية`)
  if (s.incomplete_punch_as_absent) parts.push('البصمة الناقصة = غياب')
  if ((s.max_auto_deduction_days_per_month ?? 0) > 0) parts.push(`سقف ${s.max_auto_deduction_days_per_month} يوم/شهر`)
  if ((s.auto_deduction_cap_ratio ?? 1) < 1) parts.push(`سقف ${Math.round((s.auto_deduction_cap_ratio ?? 1) * 100)}% من الإجمالي`)
  return parts.join(' · ')
}

export default function AutoDeductionsPage() {
  const [tab, setTab] = useState<Tab>('rules')
  const rules = useDeductionRules()
  const [scopeRule, setScopeRule] = useState<string | null>(null)
  const [exemptPrefill, setExemptPrefill] = useState<{ target_type: DeductionTargetType; target_id: string; name: string } | null>(null)
  if (rules.isLoading || !rules.data) return <LoadingSpinner />
  const list = rules.data
  return (
    <div className="space-y-4" data-testid="auto-deductions-page">
      <header>
        <h1 className="text-xl font-black">الاستقطاعات التلقائية</h1>
        <p className="text-xs text-slate-500">كل إعدادات وطرق الاستقطاع التلقائي في مكان واحد. الأولوية: استثناء ← تعيين الموظف ← المسمى/القسم ← الفرع ← القاعدة الافتراضية. أي تغيير يُعيد احتساب الشهر الجاري فوراً؛ غرفة العمليات تدقّق الاستقطاعات المقترحة وتعتمدها قبل وصولها إلى المالية.</p>
      </header>
      <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1" data-testid="ad-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`ad-tab-${t.id}`}
            className={clsx('rounded-xl px-3 py-1.5 text-xs font-bold', tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>{t.label}</button>
        ))}
      </nav>
      {tab === 'rules' && <RulesTab rules={list} onScope={(id) => { setScopeRule(id); setTab('scope') }} />}
      {tab === 'scope' && <ScopeTab rules={list} ruleId={scopeRule ?? list.find((r) => !r.is_default)?.id ?? null} setRuleId={setScopeRule} />}
      {tab === 'exemptions' && <ExemptionsTab prefill={exemptPrefill} clearPrefill={() => setExemptPrefill(null)} />}
      {tab === 'employees' && <EmployeesTab rules={list} onExempt={(e) => { setExemptPrefill({ target_type: 'employee', target_id: e.employee_id, name: `${e.full_name} (${e.employee_number})` }); setTab('exemptions') }} />}
      {tab === 'simulate' && <SimulateTab rules={list} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

// ───────────────────────── القواعد ─────────────────────────
function RulesTab({ rules, onScope }: { rules: DeductionRule[]; onScope: (id: string) => void }) {
  const [editing, setEditing] = useState<DeductionRule | 'new' | null>(null)
  const del = useDeleteDeductionRule()
  if (editing) return <RuleEditor rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
  return (
    <div className="space-y-3" data-testid="ad-rules">
      <div className="flex justify-end"><Button size="sm" onClick={() => setEditing('new')} data-testid="rule-new">+ قاعدة جديدة</Button></div>
      {rules.map((r) => (
        <article key={r.id} className={clsx('rounded-2xl border bg-white p-4 shadow-sm', r.is_default ? 'border-slate-900' : 'border-slate-200', !r.is_active && 'opacity-60')} data-testid={`rule-${r.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-black">{r.name} {r.is_default && <span className="ms-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-white">الافتراضية — للجميع ما لم تُحدَّد قاعدة أخرى</span>}{!r.is_active && <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">غير مفعّلة</span>}</h2>
              {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
              <p className="mt-1 text-xs text-slate-700" data-testid={`rule-${r.id}-summary`}>{summarize(r.settings)}</p>
              <p className="mt-1 text-[11px] text-slate-500" data-testid={`rule-${r.id}-scope`}>
                {r.is_default ? `يسري على ${r.employees_count} موظفاً حالياً` : r.targets.length === 0 ? 'بلا نطاق — لا تسري على أحد بعد' : `النطاق: ${r.targets.map((t) => `${TYPE_LABEL[t.target_type]} ${t.name ?? ''}`).join('، ')} — يسري على ${r.employees_count} موظفاً`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)} data-testid={`rule-${r.id}-edit`}>تعديل الإعدادات</Button>
              {!r.is_default && <Button size="sm" variant="secondary" onClick={() => onScope(r.id)} data-testid={`rule-${r.id}-scope-btn`}>النطاق</Button>}
              {!r.is_default && <Button size="sm" variant="danger" isLoading={del.isPending} onClick={() => { if (window.confirm(`حذف القاعدة «${r.name}»؟ سيعود موظفوها إلى القاعدة الأعم.`)) del.mutate(r.id) }} data-testid={`rule-${r.id}-delete`}>حذف</Button>}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function RuleEditor({ rule, onClose }: { rule: DeductionRule | null; onClose: () => void }) {
  const save = useSaveDeductionRule()
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [isActive, setIsActive] = useState(rule?.is_active ?? true)
  const [s, setS] = useState<DeductionRuleSettings>(rule ? { ...DEFAULT_RULE_SETTINGS, ...rule.settings } : DEFAULT_RULE_SETTINGS)
  const [sample, setSample] = useState(30)
  const [previewSalary, setPreviewSalary] = useState(600000)
  const [previewShift, setPreviewShift] = useState(480)
  const tiersError = useMemo(() => validateTiers(s.deduction_tiers), [s.deduction_tiers])
  const set = <K extends keyof DeductionRuleSettings>(k: K, v: DeductionRuleSettings[K]) => setS((d) => ({ ...d, [k]: v }))
  const setTier = (i: number, patch: Partial<DeductionTier>) => set('deduction_tiers', s.deduction_tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const addTier = () => {
    const last = s.deduction_tiers[s.deduction_tiers.length - 1]
    const closedTo = last ? (last.to ?? last.from) + 30 : 30
    const tiers = s.deduction_tiers.map((t, i) => (i === s.deduction_tiers.length - 1 ? { ...t, to: closedTo } : t))
    set('deduction_tiers', [...tiers, { from: closedTo + 1, to: null, minutes: null, day_fraction: 1 }])
  }
  const removeTier = (i: number) => {
    const tiers = s.deduction_tiers.filter((_t, j) => j !== i)
    const last = tiers[tiers.length - 1]
    if (last) tiers[tiers.length - 1] = { ...last, to: null }
    set('deduction_tiers', tiers)
  }
  const method = s.shortfall_method ?? 'tiers'
  const preview = applyShortfall(s, sample, previewShift)
  // 00202: نفس أساس أجر اليوم الذي يستعمله التصدير — نموذج الأيام المستحقة: الأساسي ÷ أيام الشهر الحالي الفعلية؛ النموذج القديم: ÷ 30
  const { data: policy } = useHrPolicy()
  const earned = (policy?.salary_model ?? 'earned_days') === 'earned_days'
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayDivisor = earned ? daysInMonth : 30
  const dayRate = previewSalary / dayDivisor
  const minuteRate = dayRate / Math.max(1, previewShift)
  const fixed = (s.auto_deduction_amount_mode ?? 'salary') === 'fixed'
  const amountOf = (minutes: number, days: number) => (s.auto_deduction_enabled === false ? 0 : fixed ? (s.fixed_shortfall_minute_amount ?? 0) * minutes + (s.fixed_absent_day_amount ?? 0) * days : minuteRate * minutes + dayRate * days)
  const describe = (minutes: number, days: number) => (days > 0 ? `${days} يوم` : minutes > 0 ? `${minutes} دقيقة` : 'لا استقطاع')
  const off = s.auto_deduction_enabled === false
  const canSave = name.trim().length > 0 && !tiersError
  return (
    <div className="space-y-4" data-testid="rule-editor">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-black">{rule ? `تعديل القاعدة: ${rule.name}` : 'قاعدة جديدة'}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} data-testid="rule-cancel">إلغاء</Button>
          <Button size="sm" disabled={!canSave} isLoading={save.isPending} data-testid="rule-save"
            onClick={() => save.mutate({ id: rule?.id ?? null, name: name.trim(), description: description.trim() || null, is_active: isActive, settings: s }, { onSuccess: onClose })}>حفظ القاعدة</Button>
        </div>
      </header>
      <Section title="التعريف" hint={rule?.is_default ? 'القاعدة الافتراضية تسري على كل موظف لا تشمله قاعدة أخرى ولا استثناء. لا يمكن حذفها أو تعطيلها.' : 'اسم واضح يظهر للمالية وغرفة العمليات بجانب كل استقطاع ناتج عن هذه القاعدة.'}>
        <L label="اسم القاعدة"><input className={field} value={name} onChange={(e) => setName(e.target.value)} data-testid="rule-name" /></L>
        <L label="وصف (اختياري)"><input className={field} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="rule-desc" /></L>
        {!rule?.is_default && <L label="الحالة"><select className={field} value={String(isActive)} onChange={(e) => setIsActive(e.target.value === 'true')} data-testid="rule-active"><option value="true">مفعّلة</option><option value="false">غير مفعّلة — موظفوها يعودون مؤقتاً إلى القاعدة الأعم</option></select></L>}
      </Section>
      <Section title="التشغيل والمبالغ" hint="يُحتسب الحضور والغياب والنقص دائماً؛ هذه المفاتيح تتحكم فيما يُقترح استقطاعه ومقداره فقط.">
        <L label="الاستقطاع التلقائي"><select className={field} value={String(s.auto_deduction_enabled ?? true)} onChange={(e) => set('auto_deduction_enabled', e.target.value === 'true')} data-testid="r-auto"><option value="true">مُفعَّل</option><option value="false">متوقف — لا يُقترح أي استقطاع تلقائي</option></select></L>
        <L label="أساس المبلغ"><select className={field} disabled={off} value={s.auto_deduction_amount_mode ?? 'salary'} onChange={(e) => set('auto_deduction_amount_mode', e.target.value as 'salary' | 'fixed')} data-testid="r-mode"><option value="salary">تلقائي من الراتب: أجر اليوم وأجر الدقيقة لكل موظف</option><option value="fixed">مبالغ ثابتة بالدينار</option></select></L>
        {(s.auto_deduction_amount_mode ?? 'salary') === 'fixed' && (<>
          <L label="مبلغ ثابت لكل يوم استقطاع (د.ع)"><input type="number" min={0} step={250} className={field} dir="ltr" disabled={off} value={s.fixed_absent_day_amount ?? 0} onChange={(e) => set('fixed_absent_day_amount', Math.max(0, NUM(e.target.value)))} data-testid="r-fixed-day" /></L>
          <L label="مبلغ ثابت لكل دقيقة نقص (د.ع)"><input type="number" min={0} step={10} className={field} dir="ltr" disabled={off} value={s.fixed_shortfall_minute_amount ?? 0} onChange={(e) => set('fixed_shortfall_minute_amount', Math.max(0, NUM(e.target.value)))} data-testid="r-fixed-minute" /></L>
        </>)}
        <L label="استقطاع الغياب بلا إجازة"><select className={field} disabled={off} value={String(s.deduct_absence_enabled ?? true)} onChange={(e) => set('deduct_absence_enabled', e.target.value === 'true')} data-testid="r-ded-absence"><option value="true">مُفعَّل</option><option value="false">متوقف</option></select></L>
        <L label="أيام الاستقطاع عن يوم الغياب"><input type="number" min={0} max={3} step={0.5} className={field} dir="ltr" disabled={off || s.deduct_absence_enabled === false} value={s.absent_day_deduction_days} onChange={(e) => set('absent_day_deduction_days', NUM(e.target.value))} data-testid="r-absent-days" /></L>
        <L label="البصمة الناقصة (دخول أو خروج فقط)"><select className={field} disabled={off} value={String(s.incomplete_punch_as_absent)} onChange={(e) => set('incomplete_punch_as_absent', e.target.value === 'true')} data-testid="r-incomplete"><option value="false">لا تُستقطع (تُدقَّق يدوياً في غرفة العمليات)</option><option value="true">تُعامل كغياب</option></select></L>
        <L label="استقطاع الإجازات غير المدفوعة"><select className={field} disabled={off} value={String(s.deduct_unpaid_leave_enabled ?? true)} onChange={(e) => set('deduct_unpaid_leave_enabled', e.target.value === 'true')} data-testid="r-ded-unpaid"><option value="true">مُفعَّل</option><option value="false">متوقف</option></select></L>
        <L label="سقف أيام الاستقطاع في الشهر (0 = بلا سقف)"><input type="number" min={0} max={31} step={0.5} className={field} dir="ltr" disabled={off} value={s.max_auto_deduction_days_per_month ?? 0} onChange={(e) => set('max_auto_deduction_days_per_month', Math.min(31, Math.max(0, NUM(e.target.value))))} data-testid="r-max-days" /></L>
        <L label="سقف الاستقطاع (% من الإجمالي المستحق، 100 = بلا سقف)"><input type="number" min={0} max={100} step={5} className={field} dir="ltr" disabled={off} value={Math.round((s.auto_deduction_cap_ratio ?? 1) * 100)} onChange={(e) => set('auto_deduction_cap_ratio', Math.min(100, Math.max(0, NUM(e.target.value))) / 100)} data-testid="r-cap" /></L>
      </Section>
      <Section title="نقص الدقائق اليومي (التأخر والخروج المبكر)" hint="النقص = دقائق الشفت − الدقائق المنجزة فعلاً − الزمنيات المدفوعة المعتمدة. الإجازات المدفوعة (اعتيادية/مرضية/طارئة/مهمة) والزمنيات المدفوعة لا تُستقطع أبداً؛ التأخر الذي يعوّضه الموظف بالبقاء بعد الدوام لا يُستقطع.">
        <L label="استقطاع نقص الدقائق"><select className={field} disabled={off} value={String(s.deduct_shortfall_enabled ?? true)} onChange={(e) => set('deduct_shortfall_enabled', e.target.value === 'true')} data-testid="r-ded-shortfall"><option value="true">مُفعَّل</option><option value="false">متوقف</option></select></L>
        <L label="السماحية اليومية (دقيقة) — ما دونها لا يُستقطع"><input type="number" min={0} max={120} className={field} dir="ltr" disabled={off} value={s.grace_minutes_default} onChange={(e) => set('grace_minutes_default', NUM(e.target.value))} data-testid="r-grace" /></L>
        <L label="طريقة احتساب النقص"><select className={field} disabled={off} value={method} onChange={(e) => set('shortfall_method', e.target.value as ShortfallMethod)} data-testid="r-method">{(Object.keys(SHORTFALL_METHOD_LABEL) as ShortfallMethod[]).map((k) => <option key={k} value={k}>{SHORTFALL_METHOD_LABEL[k]}</option>)}</select></L>
        {(method === 'multiplier' || method === 'blocks') && <L label="المضاعف (1 = نفس الدقائق، 2 = ضعفها)"><input type="number" min={0.25} max={5} step={0.25} className={field} dir="ltr" disabled={off} value={s.shortfall_multiplier ?? 1} onChange={(e) => set('shortfall_multiplier', Math.min(5, Math.max(0.25, NUM(e.target.value, 1))))} data-testid="r-multiplier" /></L>}
        {method === 'blocks' && <L label="حجم الكتلة (دقيقة)"><input type="number" min={5} max={240} step={5} className={field} dir="ltr" disabled={off} value={s.shortfall_block_minutes ?? 30} onChange={(e) => set('shortfall_block_minutes', Math.min(240, Math.max(5, NUM(e.target.value, 30))))} data-testid="r-block" /></L>}
        <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-6 text-sky-900" data-testid="r-formula">
          <div className="font-black">المعادلة بوضوح</div>
          <div>١. أجر اليوم = {fixed ? `مبلغ ثابت ${fmtMoney(s.fixed_absent_day_amount)} د.ع` : <span data-testid="r-day-basis">{earned ? `الراتب الأساسي ÷ أيام الشهر الفعلية (هذا الشهر ${daysInMonth})` : 'الراتب الأساسي ÷ 30'}</span>} · أجر الدقيقة = {fixed ? `مبلغ ثابت ${fmtMoney(s.fixed_shortfall_minute_amount)} د.ع` : 'أجر اليوم ÷ دقائق الشفت'}.</div>
          <div>٢. نقص اليوم = دقائق الشفت − المنجز − الزمنية المدفوعة. إن كان النقص ≤ {s.grace_minutes_default} دقيقة ⇒ لا استقطاع.</div>
          <div>٣. وإلا: {method === 'tiers' ? 'نبحث عن الشريحة التي يقع فيها النقص ونستقطع دقائقها أو كسر يومها.' : method === 'actual' ? 'نستقطع نفس عدد دقائق النقص.' : method === 'multiplier' ? `نستقطع دقائق النقص × ${s.shortfall_multiplier ?? 1}.` : `نقرّب النقص لأعلى إلى أقرب ${s.shortfall_block_minutes ?? 30} دقيقة${(s.shortfall_multiplier ?? 1) !== 1 ? ` ثم × ${s.shortfall_multiplier}` : ''}.`} وإذا بلغ الناتج دقائق شفت كامل يُحتسب يوماً واحداً.</div>
          <div>٤. المبلغ = الدقائق المستقطعة × أجر الدقيقة + الأيام المستقطعة × أجر اليوم. {earned ? <span data-testid="r-absence-note">الغياب بلا إجازة والإجازة غير المدفوعة لا تُستقطع بل لا تُدفع أصلاً (الراتب = أجر اليوم × الأيام المستحقة)؛ الإجازة/الزمنية المدفوعة = صفر.</span> : <>الغياب بلا إجازة = {s.absent_day_deduction_days} يوم لكل يوم؛ الإجازة غير المدفوعة حسب نوعها؛ الإجازة/الزمنية المدفوعة = صفر.</>}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sky-800">مثال حي بـ: راتب <input type="number" min={0} step={50000} className={clsx(field, 'w-28 py-0.5')} dir="ltr" value={previewSalary} onChange={(e) => setPreviewSalary(NUM(e.target.value))} data-testid="r-preview-salary" /> د.ع وشفت <input type="number" min={60} step={30} className={clsx(field, 'w-20 py-0.5')} dir="ltr" value={previewShift} onChange={(e) => setPreviewShift(NUM(e.target.value, 480))} data-testid="r-preview-shift" /> دقيقة ⇒ أجر اليوم <b dir="ltr">{fmtMoney(fixed ? s.fixed_absent_day_amount : dayRate)}</b> · أجر الدقيقة <b dir="ltr">{fixed ? fmtMoney(s.fixed_shortfall_minute_amount) : minuteRate.toFixed(1)}</b> د.ع</div>
        </div>
        {method === 'tiers' && (
        <div className="sm:col-span-2 lg:col-span-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs" data-testid="r-tiers-table">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">من دقيقة</th><th className="p-2">إلى دقيقة</th><th className="p-2">استقطاع (دقائق)</th><th className="p-2">أو كسر يوم</th><th className="p-2 text-start">المعنى</th><th className="p-2"></th></tr></thead>
              <tbody>{s.deduction_tiers.map((t, i) => (
                <tr key={i} className="border-t border-slate-100" data-testid={`r-tier-${i}`}>
                  <td className="p-1"><input type="number" className={field} dir="ltr" value={t.from} onChange={(e) => setTier(i, { from: NUM(e.target.value) })} data-testid={`r-tier-${i}-from`} /></td>
                  <td className="p-1"><input type="number" className={field} dir="ltr" value={t.to ?? ''} placeholder={i === s.deduction_tiers.length - 1 ? 'مفتوح' : ''} onChange={(e) => setTier(i, { to: e.target.value === '' ? null : NUM(e.target.value) })} data-testid={`r-tier-${i}-to`} /></td>
                  <td className="p-1"><input type="number" min={0} className={field} dir="ltr" value={t.minutes ?? ''} onChange={(e) => setTier(i, { minutes: e.target.value === '' ? null : NUM(e.target.value) })} data-testid={`r-tier-${i}-minutes`} /></td>
                  <td className="p-1"><input type="number" min={0} max={3} step={0.25} className={field} dir="ltr" value={t.day_fraction ?? ''} onChange={(e) => setTier(i, { day_fraction: e.target.value === '' ? null : NUM(e.target.value) })} data-testid={`r-tier-${i}-days`} /></td>
                  <td className="p-1 text-[11px] text-slate-600" data-testid={`r-tier-${i}-meaning`}>{t.to != null && t.to <= s.grace_minutes_default ? `نقص ${t.from}–${t.to} د: ضمن السماحية ⇒ لا استقطاع` : `نقص ${t.from}–${t.to ?? '∞'} د ⇒ ${describe(t.minutes ?? 0, t.day_fraction ?? 0)}${(t.minutes ?? 0) > 0 || (t.day_fraction ?? 0) > 0 ? ` ≈ ${fmtMoney(Math.round(amountOf(t.minutes ?? 0, t.day_fraction ?? 0)))} د.ع` : ''}`}</td>
                  <td className="p-1 text-center"><button type="button" className="text-red-600 hover:underline" onClick={() => removeTier(i)} data-testid={`r-tier-${i}-remove`}>حذف</button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={addTier} data-testid="r-tier-add">+ شريحة</Button>
            {tiersError ? <span className="text-xs font-bold text-red-600" data-testid="r-tiers-error">{tiersError}</span> : <span className="text-xs text-emerald-700">الشرائح صالحة</span>}
          </div>
        </div>)}
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 text-xs">
          <span>معاينة: نقص</span><input type="number" min={0} className={clsx(field, 'w-20')} dir="ltr" value={sample} onChange={(e) => setSample(NUM(e.target.value))} data-testid="r-sample" /><span>دقيقة ⇒</span>
          <b data-testid="r-preview">{sample <= s.grace_minutes_default ? 'ضمن السماحية' : preview.minutes > 0 ? fmtMinutes(preview.minutes) : preview.days > 0 ? `${preview.days} يوم` : 'لا استقطاع'}</b>
          {sample > s.grace_minutes_default && (preview.minutes > 0 || preview.days > 0) && <span className="text-slate-500" data-testid="r-preview-amount">({preview.note}) ≈ <b dir="ltr">{fmtMoney(Math.round(amountOf(preview.minutes, preview.days)))}</b> د.ع</span>}
        </div>
      </Section>
    </div>
  )
}

// ───────────────────────── النطاق ─────────────────────────
type TargetDraft = { target_type: DeductionTargetType; target_id: string; name: string }
function ScopeTab({ rules, ruleId, setRuleId }: { rules: DeductionRule[]; ruleId: string | null; setRuleId: (id: string) => void }) {
  const rule = rules.find((r) => r.id === ruleId) ?? null
  const branches = useBranches(); const depts = useHrDepartments()
  const [search, setSearch] = useState('')
  const emps = useHrEmployees({ search: search.trim() || undefined })
  const setTargets = useSetDeductionTargets()
  const [draft, setDraft] = useState<TargetDraft[]>([])
  useEffect(() => { setDraft(rule ? rule.targets.map((t) => ({ target_type: t.target_type, target_id: t.target_id, name: t.name ?? '' })) : []) }, [rule])
  const custom = rules.filter((r) => !r.is_default)
  const has = (type: DeductionTargetType, id: string) => draft.some((t) => t.target_type === type && t.target_id === id)
  const toggle = (t: TargetDraft) => setDraft((d) => (has(t.target_type, t.target_id) ? d.filter((x) => !(x.target_type === t.target_type && x.target_id === t.target_id)) : [...d, t]))
  const ownerOf = (type: DeductionTargetType, id: string) => rules.find((r) => r.id !== rule?.id && r.targets.some((t) => t.target_type === type && t.target_id === id))
  const dirty = rule ? JSON.stringify([...draft].map((t) => `${t.target_type}:${t.target_id}`).sort()) !== JSON.stringify(rule.targets.map((t) => `${t.target_type}:${t.target_id}`).sort()) : false
  if (custom.length === 0) return <Empty text="لا توجد قواعد إضافية بعد — أنشئ قاعدة من تبويب «القواعد» ثم حدّد نطاقها هنا. القاعدة الافتراضية تسري على الجميع تلقائياً." testid="scope-empty" />
  const tree = (depts.data ?? []).filter((d) => d.is_active)
  const roots = tree.filter((d) => !d.parent_id)
  const children = (pid: string) => tree.filter((d) => d.parent_id === pid)
  const renderNode = (d: (typeof tree)[number], depth: number): React.ReactNode => {
    const owner = ownerOf('department', d.id)
    return (
      <li key={d.id}>
        <label className="flex items-center gap-2 py-0.5 text-xs" style={{ paddingInlineStart: depth * 16 }}>
          <input type="checkbox" checked={has('department', d.id)} onChange={() => toggle({ target_type: 'department', target_id: d.id, name: d.name })} data-testid={`scope-dept-${d.id}`} />
          <span className={clsx(d.is_job_title && 'text-slate-500')}>{d.is_job_title ? `👤 ${d.name} (مسمى)` : d.name}</span>
          {owner && !has('department', d.id) && <span className="text-[10px] text-amber-700">— حالياً على «{owner.name}»</span>}
        </label>
        <ul>{children(d.id).map((c) => renderNode(c, depth + 1))}</ul>
      </li>
    )
  }
  return (
    <div className="space-y-3" data-testid="ad-scope">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <L label="القاعدة"><select className={field} value={rule?.id ?? ''} onChange={(e) => setRuleId(e.target.value)} data-testid="scope-rule">{custom.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></L>
        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-slate-500" data-testid="scope-count">{draft.length} عنصر في النطاق</span>
          <Button size="sm" disabled={!rule || !dirty} isLoading={setTargets.isPending} onClick={() => rule && setTargets.mutate([rule.id, draft.map((t) => ({ target_type: t.target_type, target_id: t.target_id }))])} data-testid="scope-save">حفظ النطاق</Button>
        </div>
      </div>
      {rule && <p className="text-[11px] text-slate-500">اختر الفروع أو الأقسام/المسميات أو الموظفين الذين تسري عليهم «{rule.name}». القسم يشمل كل الأقسام والمسميات تحته. العنصر المرتبط بقاعدة أخرى يُنقل إلى هذه القاعدة عند الحفظ.</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        <Box title="الفروع">
          {(branches.data ?? []).map((b) => { const owner = ownerOf('branch', b.id); return (
            <label key={b.id} className="flex items-center gap-2 py-0.5 text-xs"><input type="checkbox" checked={has('branch', b.id)} onChange={() => toggle({ target_type: 'branch', target_id: b.id, name: b.name })} data-testid={`scope-branch-${b.id}`} />{b.name}{owner && !has('branch', b.id) && <span className="text-[10px] text-amber-700">— حالياً على «{owner.name}»</span>}</label>) })}
        </Box>
        <Box title="الأقسام والمسميات الوظيفية"><ul>{roots.map((d) => renderNode(d, 0))}</ul></Box>
        <Box title="موظفون بعينهم">
          <input className={clsx(field, 'mb-2')} placeholder="ابحث بالاسم أو الرقم الوظيفي…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="scope-emp-search" />
          <ul className="max-h-64 overflow-y-auto">{(emps.data ?? []).slice(0, 50).map((e) => { const owner = ownerOf('employee', e.id); return (
            <li key={e.id}><label className="flex items-center gap-2 py-0.5 text-xs"><input type="checkbox" checked={has('employee', e.id)} onChange={() => toggle({ target_type: 'employee', target_id: e.id, name: `${e.full_name} (${e.employee_number})` })} data-testid={`scope-emp-${e.id}`} />{e.full_name} <span className="text-slate-400">{e.employee_number}</span>{owner && !has('employee', e.id) && <span className="text-[10px] text-amber-700">— حالياً على «{owner.name}»</span>}</label></li>) })}</ul>
          {draft.filter((t) => t.target_type === 'employee').length > 0 && <p className="mt-2 text-[11px] text-slate-600">المحددون: {draft.filter((t) => t.target_type === 'employee').map((t) => t.name).join('، ')}</p>}
        </Box>
      </div>
    </div>
  )
}

// ───────────────────────── الاستثناءات ─────────────────────────
function ExemptionsTab({ prefill, clearPrefill }: { prefill: TargetDraft | null; clearPrefill: () => void }) {
  const list = useDeductionExemptions(); const add = useAddDeductionExemption(); const remove = useRemoveDeductionExemption()
  const branches = useBranches(); const depts = useHrDepartments()
  const [type, setType] = useState<DeductionTargetType>(prefill?.target_type ?? 'employee')
  const [target, setTarget] = useState(prefill?.target_id ?? '')
  const [search, setSearch] = useState('')
  const emps = useHrEmployees({ search: search.trim() || undefined })
  const [reason, setReason] = useState(''); const [from, setFrom] = useState(isoDay()); const [to, setTo] = useState('')
  const canAdd = !!target && reason.trim().length > 0 && (!to || to >= from)
  return (
    <div className="space-y-3" data-testid="ad-exemptions">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">استثناء جديد</h2>
        <p className="mb-3 text-[11px] text-slate-500">المستثنى لا يُقترح له أي استقطاع تلقائي طوال المدة (الحضور يبقى محسوباً ومرئياً). السبب إلزامي ويظهر في السجل.</p>
        {prefill && <p className="mb-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800" data-testid="exempt-prefill">الموظف المختار: <b>{prefill.name}</b> <button type="button" className="ms-2 underline" onClick={() => { clearPrefill(); setTarget('') }}>تغيير</button></p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <L label="النوع"><select className={field} value={type} onChange={(e) => { setType(e.target.value as DeductionTargetType); setTarget(''); clearPrefill() }} data-testid="exempt-type"><option value="employee">موظف</option><option value="department">قسم / مسمى</option><option value="branch">فرع</option></select></L>
          {type === 'branch' && <L label="الفرع"><select className={field} value={target} onChange={(e) => setTarget(e.target.value)} data-testid="exempt-target"><option value="">— اختر —</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></L>}
          {type === 'department' && <L label="القسم / المسمى"><select className={field} value={target} onChange={(e) => setTarget(e.target.value)} data-testid="exempt-target"><option value="">— اختر —</option>{(depts.data ?? []).filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.is_job_title ? `👤 ${d.name}` : d.name}</option>)}</select></L>}
          {type === 'employee' && !prefill && (
            <L label="الموظف"><input className={clsx(field, 'mb-1')} placeholder="ابحث…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="exempt-emp-search" />
              <select className={field} value={target} onChange={(e) => setTarget(e.target.value)} data-testid="exempt-target"><option value="">— اختر —</option>{(emps.data ?? []).slice(0, 100).map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number})</option>)}</select></L>
          )}
          <L label="السبب (إلزامي)"><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="exempt-reason" /></L>
          <L label="من تاريخ"><input type="date" className={field} dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="exempt-from" /></L>
          <L label="إلى تاريخ (فارغ = مفتوح)"><input type="date" className={field} dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} data-testid="exempt-to" /></L>
        </div>
        <div className="mt-3 flex justify-end"><Button size="sm" disabled={!canAdd} isLoading={add.isPending} data-testid="exempt-add"
          onClick={() => add.mutate({ target_type: type, target_id: target, reason: reason.trim(), from_date: from, to_date: to || null }, { onSuccess: () => { setReason(''); setTo(''); setTarget(''); clearPrefill() } })}>إضافة الاستثناء</Button></div>
      </section>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-xs" data-testid="exempt-table">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">النوع</th><th className="p-2 text-start">الهدف</th><th className="p-2 text-start">السبب</th><th className="p-2">من</th><th className="p-2">إلى</th><th className="p-2">الحالة</th><th className="p-2"></th></tr></thead>
          <tbody>
            {(list.data ?? []).length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400">لا استثناءات</td></tr>}
            {(list.data ?? []).map((x) => (
              <tr key={x.id} className="border-t border-slate-100" data-testid={`exempt-row-${x.id}`}>
                <td className="p-2">{TYPE_LABEL[x.target_type]}</td><td className="p-2 font-semibold">{x.name ?? x.target_id}</td><td className="p-2">{x.reason}</td>
                <td className="p-2 text-center" dir="ltr">{x.from_date}</td><td className="p-2 text-center" dir="ltr">{x.to_date ?? 'مفتوح'}</td>
                <td className="p-2 text-center">{x.active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">ساري</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">غير ساري</span>}</td>
                <td className="p-2 text-center"><button type="button" className="text-red-600 hover:underline" onClick={() => { if (window.confirm('إلغاء هذا الاستثناء؟')) remove.mutate(x.id) }} data-testid={`exempt-remove-${x.id}`}>إلغاء</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ───────────────────────── الموظفون ─────────────────────────
function EmployeesTab({ rules, onExempt }: { rules: DeductionRule[]; onExempt: (e: DeductionEmployeeRow) => void }) {
  const [month, setMonth] = useState(monthStart()); const [branch, setBranch] = useState(''); const [dept, setDept] = useState(''); const [search, setSearch] = useState('')
  const branches = useBranches(); const depts = useHrDepartments()
  const rows = useDeductionEmployees({ month, branchId: branch || null, departmentId: dept || null, search: search || null })
  const setTargets = useSetDeductionTargets()
  const assign = (e: DeductionEmployeeRow, ruleId: string) => {
    // إزالة الموظف من أي قاعدة يُعيَّن عليها مباشرة، ثم إضافته إلى القاعدة المختارة (أو تركه يرث من القسم/الفرع/الافتراضية عند «حسب النطاق»)
    const current = rules.find((r) => r.targets.some((t) => t.target_type === 'employee' && t.target_id === e.employee_id))
    if (current && current.id !== ruleId) setTargets.mutate([current.id, current.targets.filter((t) => !(t.target_type === 'employee' && t.target_id === e.employee_id)).map((t) => ({ target_type: t.target_type, target_id: t.target_id }))])
    const target = rules.find((r) => r.id === ruleId)
    if (target && !target.is_default && target.id !== current?.id) setTargets.mutate([target.id, [...target.targets.map((t) => ({ target_type: t.target_type, target_id: t.target_id })), { target_type: 'employee' as const, target_id: e.employee_id }]])
  }
  return (
    <div className="space-y-3" data-testid="ad-employees">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <L label="الشهر"><input type="month" className={field} dir="ltr" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} data-testid="emp-month" /></L>
        <L label="الفرع"><select className={field} value={branch} onChange={(e) => setBranch(e.target.value)} data-testid="emp-branch"><option value="">الكل</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></L>
        <L label="القسم"><select className={field} value={dept} onChange={(e) => setDept(e.target.value)} data-testid="emp-dept"><option value="">الكل</option>{(depts.data ?? []).filter((d) => !d.is_job_title).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></L>
        <L label="بحث"><input className={field} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم أو رقم وظيفي" data-testid="emp-search" /></L>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-xs" data-testid="emp-table">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">الفرع / القسم</th><th className="p-2 text-start">القاعدة الفعّالة</th><th className="p-2">الحالة</th><th className="p-2">غياب</th><th className="p-2">نقص الشهر</th><th className="p-2">المقترح (دقائق / أيام)</th><th className="p-2">ملغى</th><th className="p-2 text-start">إجراء</th></tr></thead>
          <tbody>
            {rows.isLoading && <tr><td colSpan={9} className="p-4 text-center text-slate-400">جارٍ التحميل…</td></tr>}
            {!rows.isLoading && (rows.data ?? []).length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا موظفين</td></tr>}
            {(rows.data ?? []).map((e) => {
              const direct = rules.find((r) => r.targets.some((t) => t.target_type === 'employee' && t.target_id === e.employee_id))
              return (
                <tr key={e.employee_id} className="border-t border-slate-100" data-testid={`emp-row-${e.employee_id}`}>
                  <td className="p-2"><div className="font-semibold">{e.full_name}</div><div className="text-[10px] text-slate-400" dir="ltr">{e.employee_number}{e.job_title ? ` · ${e.job_title}` : ''}</div></td>
                  <td className="p-2">{e.branch_name ?? '—'}<div className="text-[10px] text-slate-400">{e.department_name ?? '—'}</div></td>
                  <td className="p-2"><div className="font-semibold" data-testid={`emp-${e.employee_id}-rule`}>{e.rule_name ?? '—'}</div><div className="text-[10px] text-slate-500">{SOURCE_LABEL[e.source]}</div></td>
                  <td className="p-2 text-center" data-testid={`emp-${e.employee_id}-status`}>{e.exempt ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800" title={e.exempt_reason ?? ''}>مستثنى{e.exempt_until ? ` حتى ${e.exempt_until}` : ''}</span> : e.enabled ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{e.amount_mode === 'fixed' ? 'مفعّل · ثابت' : 'مفعّل · من الراتب'}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">متوقف</span>}</td>
                  <td className="p-2 text-center" dir="ltr">{e.month_absent}</td>
                  <td className="p-2 text-center" dir="ltr">{fmtMinutes(e.month_shortfall)}</td>
                  <td className="p-2 text-center" dir="ltr">{e.month_minutes > 0 ? fmtMinutes(e.month_minutes) : '—'} / {e.month_days > 0 ? e.month_days : '—'}</td>
                  <td className="p-2 text-center" dir="ltr">{e.month_waived}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <select className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs" value={direct?.id ?? ''} disabled={setTargets.isPending} onChange={(ev) => assign(e, ev.target.value)} data-testid={`emp-${e.employee_id}-assign`}>
                        <option value="">حسب النطاق (قسم/فرع/افتراضية)</option>
                        {rules.filter((r) => !r.is_default && r.is_active).map((r) => <option key={r.id} value={r.id}>تعيين مباشر: {r.name}</option>)}
                      </select>
                      {!e.exempt && <button type="button" className="text-amber-700 hover:underline" onClick={() => onExempt(e)} data-testid={`emp-${e.employee_id}-exempt`}>استثناء…</button>}
                    </div>
                  </td>
                </tr>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ───────────────────────── المحاكاة ─────────────────────────
function SimulateTab({ rules }: { rules: DeductionRule[] }) {
  const sim = useSimulateDeductionV2()
  const [ruleId, setRuleId] = useState(rules.find((r) => r.is_default)?.id ?? '')
  const [c, setC] = useState<DeductionSimCase>({ shift_minutes: 480, base_salary: 600000, pay_type: 'monthly', late_minutes: 20, early_minutes: 20, paid_permit_minutes: 0, unpaid_permit_minutes: 0, absent_days: 1, incomplete_days: 0, unpaid_leave_days: 0, paid_leave_days: 0, leave_deduction_days_per_day: 1 })
  const [result, setResult] = useState<DeductionSimulationV2 | null>(null)
  const rule = rules.find((r) => r.id === ruleId)
  const setN = (k: keyof DeductionSimCase) => (e: React.ChangeEvent<HTMLInputElement>) => setC((d) => ({ ...d, [k]: Math.max(0, NUM(e.target.value)) }))
  const PRESETS: { id: string; label: string; patch: Partial<DeductionSimCase> }[] = [
    { id: 'late', label: 'تأخر 40 د', patch: { late_minutes: 40, early_minutes: 0, paid_permit_minutes: 0, unpaid_permit_minutes: 0, absent_days: 0, incomplete_days: 0, unpaid_leave_days: 0, paid_leave_days: 0 } },
    { id: 'paid-permit', label: 'خرج نصف يوم بزمنية مدفوعة', patch: { late_minutes: 0, early_minutes: 240, paid_permit_minutes: 240, unpaid_permit_minutes: 0, absent_days: 0, incomplete_days: 0, unpaid_leave_days: 0, paid_leave_days: 0 } },
    { id: 'unpaid-permit', label: 'خرج نصف يوم بزمنية غير مدفوعة', patch: { late_minutes: 0, early_minutes: 240, paid_permit_minutes: 0, unpaid_permit_minutes: 240, absent_days: 0, incomplete_days: 0, unpaid_leave_days: 0, paid_leave_days: 0 } },
    { id: 'sick', label: 'إجازة مرضية 3 أيام', patch: { late_minutes: 0, early_minutes: 0, paid_permit_minutes: 0, unpaid_permit_minutes: 0, absent_days: 0, incomplete_days: 0, unpaid_leave_days: 0, paid_leave_days: 3 } },
    { id: 'absent', label: 'غياب يومان + إجازة بلا راتب يوم', patch: { late_minutes: 0, early_minutes: 0, paid_permit_minutes: 0, unpaid_permit_minutes: 0, absent_days: 2, incomplete_days: 0, unpaid_leave_days: 1, paid_leave_days: 0 } },
  ]
  return (
    <div className="space-y-3" data-testid="ad-simulate">
      <Section title="محاكاة قاعدة على حالة كاملة" hint="أدخل يوماً واحداً (تأخر، خروج مبكر، زمنية مدفوعة أو غير مدفوعة) وحالة الشهر (غياب، بصمة ناقصة، إجازات) وراتباً تقديرياً — لترى الحالة التي ستظهر في الحضور، وكل خطوة حساب بالعربية، والمبلغ المقترح، وسلّم النقص للقاعدة.">
        <L label="القاعدة"><select className={field} value={ruleId} onChange={(e) => setRuleId(e.target.value)} data-testid="sim-rule">{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></L>
        <L label="نوع التعاقد"><select className={field} value={c.pay_type} onChange={(e) => setC((d) => ({ ...d, pay_type: e.target.value as 'monthly' | 'daily' }))} data-testid="sim-pay-type"><option value="monthly">شهري (الراتب ÷ 30)</option><option value="daily">يومي (الأجر = أجر اليوم)</option></select></L>
        <L label={c.pay_type === 'daily' ? 'أجر اليوم (د.ع)' : 'الراتب الأساسي (د.ع)'}><input type="number" min={0} step={c.pay_type === 'daily' ? 1000 : 50000} className={field} dir="ltr" value={c.base_salary} onChange={setN('base_salary')} data-testid="sim-salary" /></L>
        <L label="دقائق الشفت"><input type="number" min={60} className={field} dir="ltr" value={c.shift_minutes} onChange={setN('shift_minutes')} data-testid="sim-shift" /></L>
        <L label="تأخر في الدخول (دقيقة)"><input type="number" min={0} className={field} dir="ltr" value={c.late_minutes} onChange={setN('late_minutes')} data-testid="sim-late" /></L>
        <L label="خروج مبكر (دقيقة)"><input type="number" min={0} className={field} dir="ltr" value={c.early_minutes} onChange={setN('early_minutes')} data-testid="sim-early" /></L>
        <L label="زمنية مدفوعة معتمدة (دقيقة)"><input type="number" min={0} className={field} dir="ltr" value={c.paid_permit_minutes} onChange={setN('paid_permit_minutes')} data-testid="sim-paid-permit" /></L>
        <L label="زمنية غير مدفوعة معتمدة (دقيقة)"><input type="number" min={0} className={field} dir="ltr" value={c.unpaid_permit_minutes} onChange={setN('unpaid_permit_minutes')} data-testid="sim-unpaid-permit" /></L>
        <L label="أيام غياب بلا إجازة"><input type="number" min={0} className={field} dir="ltr" value={c.absent_days} onChange={setN('absent_days')} data-testid="sim-absent" /></L>
        <L label="أيام ببصمة ناقصة"><input type="number" min={0} className={field} dir="ltr" value={c.incomplete_days} onChange={setN('incomplete_days')} data-testid="sim-incomplete" /></L>
        <L label="أيام إجازة مدفوعة (اعتيادية/مرضية/طارئة)"><input type="number" min={0} className={field} dir="ltr" value={c.paid_leave_days} onChange={setN('paid_leave_days')} data-testid="sim-paid-leave" /></L>
        <L label="أيام إجازة بدون راتب"><input type="number" min={0} className={field} dir="ltr" value={c.unpaid_leave_days} onChange={setN('unpaid_leave_days')} data-testid="sim-unpaid-leave" /></L>
        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-500">حالات جاهزة:</span>
          {PRESETS.map((p) => <button key={p.id} type="button" className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50" onClick={() => setC((d) => ({ ...d, ...p.patch }))} data-testid={`sim-preset-${p.id}`}>{p.label}</button>)}
          <Button size="sm" className="ms-auto" isLoading={sim.isPending} onClick={() => sim.mutate({ settings: rule?.settings ?? null, scenario: c }, { onSuccess: setResult })} data-testid="sim-run">احسب</Button>
        </div>
      </Section>
      {result && (
        <div className="space-y-3" data-testid="sim-result">
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="الحالة في الحضور" value={ATTENDANCE_STATUS_LABELS[result.status] ?? result.status} testid="sim-status" />
            <Stat label="النقص المحاسَب عليه" value={result.shortfall_minutes > 0 ? `${result.shortfall_minutes} د` : '—'} hint={`ناقص ${result.missing_minutes} د − زمنية مدفوعة ${result.covered_minutes} د`} testid="sim-shortfall-out" />
            <Stat label="دقائق مقترحة" value={result.minutes > 0 ? fmtMinutes(result.minutes) : '—'} testid="sim-minutes" />
            <Stat label="أيام مقترحة" value={`${result.days}`} hint={`نقص ${result.shortfall_days} + غياب ${result.absent_days} + بصمة ناقصة ${result.incomplete_days} + بلا راتب ${result.unpaid_leave_days}`} testid="sim-days" />
            <Stat label="أجر اليوم / الدقيقة" value={`${fmtMoney(result.day_rate)} / ${result.minute_rate}`} hint={result.salary_model === 'earned_days' ? `الأساسي ÷ ${result.days_in_month ?? ''} يوم (أيام الشهر الفعلية)` : result.salary_model === 'daily' ? 'أجر يومي' : undefined} testid="sim-rates" />
            {(result.unpaid_days_amount ?? 0) > 0 && <Stat label="أيام غير مدفوعة (ليست استقطاعاً)" value={fmtMoney(result.unpaid_days_amount)} hint="لا تدخل الراتب أصلاً" testid="sim-unpaid" />}
            <Stat label="المبلغ المقترح" value={`${fmtMoney(result.amount)} د.ع${result.capped ? ' (بسقف)' : ''}`} strong testid="sim-amount" />
          </div>
          <ol className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4 text-xs" data-testid="sim-steps">
            {result.steps.map((st, i) => <li key={st.key} className="flex gap-2" data-testid={`sim-step-${st.key}`}><span className="shrink-0 font-black text-emerald-700">{i + 1}.</span><span><b>{st.title}:</b> {st.text}</span></li>)}
          </ol>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white" data-testid="sim-ladder">
            <div className="p-3 text-xs font-black">سلّم النقص لهذه القاعدة — كم يُستقطع عند كل قيمة نقص في يوم واحد</div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">نقص (دقيقة)</th><th className="p-2">يُستقطع</th><th className="p-2">المبلغ (د.ع)</th></tr></thead>
              <tbody>{result.ladder.map((l) => (
                <tr key={l.shortfall} className="border-t border-slate-100 text-center" data-testid={`sim-ladder-${l.shortfall}`}>
                  <td className="p-1" dir="ltr">{l.shortfall}</td>
                  <td className="p-1">{l.within_grace ? 'ضمن السماحية' : l.days > 0 ? `${l.days} يوم` : l.minutes > 0 ? `${l.minutes} دقيقة` : 'لا استقطاع'}</td>
                  <td className="p-1" dir="ltr">{fmtMoney(l.amount)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── السجل ─────────────────────────
function AuditTab() {
  const audit = useDeductionAudit(200)
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white" data-testid="ad-audit">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-start">الوقت</th><th className="p-2 text-start">الإجراء</th><th className="p-2 text-start">القاعدة</th><th className="p-2 text-start">بواسطة</th><th className="p-2 text-start">التفاصيل</th></tr></thead>
        <tbody>
          {(audit.data ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">لا سجلات</td></tr>}
          {(audit.data ?? []).map((a) => (
            <tr key={a.id} className="border-t border-slate-100" data-testid={`audit-row-${a.id}`}>
              <td className="p-2 whitespace-nowrap" dir="ltr">{new Date(a.created_at).toLocaleString('en-GB', { hour12: false })}</td>
              <td className="p-2 font-semibold">{ACTION_LABEL[a.action] ?? a.action}</td>
              <td className="p-2">{a.rule_name ?? (a.after?.name as string | undefined) ?? '—'}</td>
              <td className="p-2">{a.actor_name ?? '—'}</td>
              <td className="p-2 text-[10px] text-slate-500" dir="ltr"><details><summary className="cursor-pointer">عرض</summary><pre className="max-w-xl whitespace-pre-wrap">{JSON.stringify({ before: a.before, after: a.after }, null, 1)}</pre></details></td>
            </tr>))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── عناصر مشتركة ─────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-black">{title}</h2>{hint && <p className="mb-3 text-[11px] text-slate-500">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<div className="mt-1">{children}</div></label>
}
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-3"><h3 className="mb-2 text-xs font-black">{title}</h3>{children}</div>
}
function Empty({ text, testid }: { text: string; testid: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500" data-testid={testid}>{text}</div>
}
function Stat({ label, value, hint, strong, testid }: { label: string; value: string; hint?: string; strong?: boolean; testid?: string }) {
  return <div><div className="text-[10px] text-slate-500">{label}</div><div className={clsx('font-bold', strong && 'text-base text-emerald-700')} dir="ltr" data-testid={testid}>{value}</div>{hint && <div className="text-[10px] text-slate-400">{hint}</div>}</div>
}
