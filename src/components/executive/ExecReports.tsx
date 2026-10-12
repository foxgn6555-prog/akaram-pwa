/**
 * «التقارير» — معالج من ثلاث خطوات:
 *   ١) نوع التقرير والفترة (+ قاطع/شفت/مقارنة)  ٢) الأقسام المطلوبة  ٣) معاينة وتصدير (Excel متعدد الأوراق · PDF بغلاف وألوان)
 * الأقسام تختلف بحسب البوابة (المالية: أقسام مالية فقط).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import {
  buildInsights, downloadExecWorkbook, healthScore, insightsFor, label, periodLabel, PORTAL_TITLES, presetRange, REPORT_SECTIONS, REPORT_TYPES, reportKindLabel, scopeOf, SECTION_HINTS,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview, type ExecPortalKind, type Insight, type PeriodPreset, type SectionKey,
} from '@features/executive'
import { HealthGauge, InsightList, Panel, Stepper } from './exec-ui'
import { Brief, IndicatorsTable, NAVY, NoActivity, SectionFigures, sectionFigures, sectionHasData } from './ExecReportDoc'
import { CitizenReportPanel } from '@components/citizen/CitizenReportPanel'
import { ExecPeoplePanels } from './ExecPeoplePanels'
import { OpsKpiGrid, UnitScoreCards } from './ExecHome'
import { BudgetPanel, ComplaintsPanel, DisclosuresPanel, FinanceBriefPanel, FleetPanel, PayrollPanel, SectorsPanel, SpendPanel, StationPanel, SuppliesPanel, SupportPanel, WorkforcePanel } from './ExecPanels'

const STEPS = ['نوع التقرير والفترة', 'الأقسام', 'معاينة وتصدير']
const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-2 text-xs'

const PRINT_CSS = `
#exec-report table { border-collapse: collapse; width: 100%; }
#exec-report table th, #exec-report table td { border: 1px solid #cbd5e1; padding: 4px 6px; }
#exec-report table thead th { background: #0f172a; color: #fff; font-weight: 800; }
#exec-report table tbody tr:nth-child(even) td { background: #f8fafc; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  #exec-report, #exec-report * { visibility: visible; }
  #exec-report { position: absolute; inset: 0; width: 100%; padding: 14mm 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #exec-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .exec-panel, .exec-kpi, .exec-chart, .exec-brief-card, table tr { break-inside: avoid; }
  .exec-cover { break-after: page; min-height: 262mm; display: flex; flex-direction: column; justify-content: space-between; border-radius: 0 !important; box-shadow: none !important; }
  .exec-brief, .exec-section, .exec-sign { break-before: page; }
  .exec-section { padding-top: 0 !important; }
  .exec-page-foot { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 2mm; }
}`

export function ExecReports({ kind, orgName = 'شركة جزيرة الأكارم' }: { kind: ExecPortalKind; orgName?: string }) {
  const sectionsDef = REPORT_SECTIONS[kind]
  const [step, setStep] = useState(0)
  const [filters, setFilters] = useState<ExecFilters>(() => ({ preset: 'month', ...presetRange('month'), sector: null, shift: null }))
  const [sections, setSections] = useState<Set<SectionKey>>(() => new Set(sectionsDef.map((s) => s.key)))
  const [compare, setCompare] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [hideIdle, setHideIdle] = useState(true)   // 00217: الأقسام بلا نشاط لا تُطبع افتراضياً
  const { data: options } = useExecFilterOptions()
  const { data, previous, isLoading } = useExecOverview(filters, compare)
  const allInsights = useMemo(() => (data ? buildInsights(data, compare ? previous : null) : []), [data, previous, compare])
  const insights = useMemo(() => insightsFor(kind, allInsights), [allInsights, kind])
  const prev = compare ? previous : null
  const toggle = (k: SectionKey) => setSections((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const on = (k: SectionKey) => sections.has(k)
  const chosen = sectionsDef.filter((s) => on(s.key))
  const idleKeys = data ? chosen.filter((s) => !sectionHasData(s.key, data)).map((s) => s.key) : []
  const visible = hideIdle ? chosen.filter((s) => !idleKeys.includes(s.key)) : chosen
  const setPreset = (p: PeriodPreset) => setFilters(p === 'custom' ? { ...filters, preset: p } : { ...filters, preset: p, ...presetRange(p) })

  const fileBase = `${reportKindLabel(filters.from, filters.to)}${kind === 'finance' ? ' مالي' : ''} ${filters.from}${filters.from !== filters.to ? ` إلى ${filters.to}` : ''}`
  const exportExcel = async () => { if (!data) return; setExporting(true); try { await downloadExecWorkbook(data, allInsights, prev, `${fileBase}.xlsx`, scopeOf(kind), PORTAL_TITLES[kind].who) } finally { setExporting(false) } }
  const printPdf = () => { const t = document.title; document.title = fileBase; window.print(); document.title = t }

  /** تقرير بنقرة واحدة: الفترة + كل الأقسام + المعاينة مباشرة */
  const quick = (p: PeriodPreset) => { setFilters({ ...filters, preset: p, ...presetRange(p) }); setSections(new Set(sectionsDef.map((x) => x.key))); setStep(2) }
  const QUICK: Array<{ key: PeriodPreset; label: string; icon: IconName }> = [{ key: 'today', label: 'تقرير اليوم', icon: 'calendar' }, { key: 'week', label: 'آخر 7 أيام', icon: 'activity' }, { key: 'month', label: 'هذا الشهر', icon: 'bar-chart' }, { key: 'prev_month', label: 'الشهر الماضي', icon: 'archive-box' }]

  const groups = new Map<string, NonNullable<typeof options>['sectors']>()
  for (const s of options?.sectors ?? []) { const g = groups.get(s.parent) ?? []; g.push(s); groups.set(s.parent, g) }

  return (
    <div className="space-y-3" data-testid="exec-reports" data-kind={kind} data-step={step + 1}>
      <style>{PRINT_CSS}</style>
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3d6b] via-[#0b4f8a] to-[#0a2f52] p-4 text-white shadow-lg print:hidden sm:rounded-3xl sm:p-5" data-testid="reports-header">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#c9a227] via-[#f3d06a] to-[#c9a227]" /><div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-[#c9a227]/10" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/25"><Icon name="file-text" size={22} className="text-[#f3d06a]" /></span>
          <div className="min-w-0"><h1 className="text-lg font-black sm:text-xl">{kind === 'finance' ? 'التقارير المالية' : 'التقارير الجاهزة'}</h1><p className="text-[11px] text-blue-100/90">{kind === 'finance' ? 'الرواتب والاستقطاعات والإنفاق والموازنة — بيانات مالية فقط' : 'تقرير رسمي كامل بغلاف وموجز تنفيذي — Excel متعدد الأوراق أو PDF ملوّن'}</p></div>
        </div>
        {step === 0 && (
          <div className="relative mt-4">
            <p className="mb-2 text-[11px] font-bold text-[#f3d06a]">تقرير بنقرة واحدة — كل الأقسام ومقارنة بالفترة السابقة</p>
            <div className="grid grid-cols-4 gap-2 sm:flex" data-testid="quick-reports">
              {QUICK.map((q) => <button key={q.key} type="button" onClick={() => quick(q.key)} data-testid={`quick-${q.key}`} className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-2 py-2 text-[11px] font-black text-white ring-1 ring-white/25 transition hover:bg-white sm:h-9 sm:flex-row sm:px-3 sm:text-xs hover:text-[#0b3d6b]"><Icon name={q.icon} size={16} className="text-[#c9a227]" /><span className="truncate">{q.label}</span></button>)}
            </div>
          </div>
        )}
      </header>
      <Stepper steps={STEPS} current={step} onGo={setStep} />

      {/* ── الخطوة ١ ── */}
      {step === 0 && (
        <div className="space-y-3" data-testid="wizard-step-1">
          <Panel title="١ · اختر نوع التقرير" subtitle="الفترة تُضبط تلقائياً، ويمكن تخصيصها" icon="calendar">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup">
              {REPORT_TYPES.map((r) => (
                <button key={r.key} type="button" role="radio" aria-checked={filters.preset === r.key} onClick={() => setPreset(r.key)} data-testid={`preset-${r.key}`}
                  className={clsx('rounded-2xl border p-3 text-right transition', filters.preset === r.key ? 'border-slate-900 bg-slate-900 text-white shadow' : 'border-slate-200 bg-white hover:border-slate-400')}>
                  <p className="text-xs font-black">{r.label}</p><p className={clsx('text-[11px]', filters.preset === r.key ? 'text-slate-300' : 'text-slate-500')}>{r.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] font-bold text-slate-600">من<input type="date" className={field} value={filters.from} max={filters.to} onChange={(e) => e.target.value && setFilters({ ...filters, preset: 'custom', from: e.target.value })} data-testid="date-from" /></label>
              <label className="text-[11px] font-bold text-slate-600">إلى<input type="date" className={field} value={filters.to} min={filters.from} onChange={(e) => e.target.value && setFilters({ ...filters, preset: 'custom', to: e.target.value })} data-testid="date-to" /></label>
              <label className="text-[11px] font-bold text-slate-600">القاطع<select className={field} value={filters.sector ?? ''} onChange={(e) => setFilters({ ...filters, sector: e.target.value ? Number(e.target.value) : null })} data-testid="sector-filter"><option value="">كل القواطع</option>{[...groups.entries()].map(([parent, list]) => <optgroup key={parent} label={label(parent)}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select></label>
              <label className="text-[11px] font-bold text-slate-600">الشفت<select className={field} value={filters.shift ?? ''} onChange={(e) => setFilters({ ...filters, shift: e.target.value || null })} data-testid="shift-filter"><option value="">كل الشفتات</option>{(options?.shifts ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="compare-toggle" />مقارنة بالفترة السابقة المكافئة (تظهر نسب التغيّر)</label>
          </Panel>
          <Summary filters={filters} compare={compare} count={chosen.length} />
          <Nav onNext={() => setStep(1)} />
        </div>
      )}

      {/* ── الخطوة ٢ ── */}
      {step === 1 && (
        <div className="space-y-3" data-testid="wizard-step-2">
          <Panel title="٢ · اختر أقسام التقرير" subtitle={`${chosen.length} من ${sectionsDef.length}`} icon="list"
            action={<button type="button" className="text-[11px] font-bold text-blue-700 hover:underline" onClick={() => setSections(chosen.length === sectionsDef.length ? new Set() : new Set(sectionsDef.map((s) => s.key)))} data-testid="toggle-all">{chosen.length === sectionsDef.length ? 'إلغاء الكل' : 'تحديد الكل'}</button>}>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="section-toggles">
              {sectionsDef.map((s, i) => (
                <li key={s.key}>
                  <label className={clsx('flex cursor-pointer items-start gap-2 rounded-2xl border p-3 transition', on(s.key) ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white')}>
                    <input type="checkbox" className="mt-0.5" checked={on(s.key)} onChange={() => toggle(s.key)} data-testid={`sec-${s.key}`} aria-pressed={on(s.key)} />
                    <span className="min-w-0"><span className="block text-xs font-black text-slate-800">{i + 1}. {s.label}</span><span className="block text-[11px] text-slate-500">{SECTION_HINTS[s.key]}</span></span>
                  </label>
                </li>
              ))}
            </ol>
          </Panel>
          <Summary filters={filters} compare={compare} count={chosen.length} />
          <Nav onPrev={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={chosen.length === 0} nextLabel="معاينة التقرير" />
        </div>
      )}

      {/* ── الخطوة ٣ ── */}
      {step === 2 && (
        <div className="space-y-3" data-testid="wizard-step-3">
          <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur print:hidden sm:flex-row sm:items-center sm:justify-between" data-testid="export-bar">
            <div className="min-w-0 text-xs"><p className="font-black text-slate-800">{fileBase}</p><p className="text-slate-500">{visible.length} قسم{idleKeys.length && hideIdle ? ` (أُخفي ${idleKeys.length} بلا نشاط)` : ''}{compare ? ' · مع مقارنة' : ''}{filters.sector ? ` · قاطع ${filters.sector}` : ''}{filters.shift ? ` · شفت ${label(filters.shift)}` : ''}</p></div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={exportExcel} disabled={!data || exporting} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50" data-testid="export-excel"><Icon name="file-spreadsheet" size={14} />{exporting ? 'جارٍ التصدير…' : 'تنزيل Excel'}</button>
              <button type="button" onClick={printPdf} disabled={!data} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-slate-900 px-4 text-xs font-black text-white shadow hover:bg-slate-800 disabled:opacity-50" data-testid="export-pdf"><Icon name="printer" size={14} />PDF / طباعة</button>
            </div>
          </div>
          {data && idleKeys.length > 0 && (
            <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900 print:hidden" data-testid="hide-idle"><input type="checkbox" checked={hideIdle} onChange={(e) => setHideIdle(e.target.checked)} />إخفاء الأقسام التي لا نشاط فيها خلال الفترة ({idleKeys.length}: {chosen.filter((s) => idleKeys.includes(s.key)).map((s) => s.label).join('، ')})</label>
          )}
          {data && visible.length > 1 && (
            <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] print:hidden" aria-label="أقسام التقرير" data-testid="rep-nav">
              <a href="#rep-brief" className="shrink-0 rounded-full bg-[#0b3d6b] px-3 py-1 text-[11px] font-black text-white">الموجز</a>
              {visible.map((s, i) => <a key={s.key} href={`#rep-sec-${s.key}`} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 hover:border-[#0b3d6b]">{i + 1}. {s.label}</a>)}
            </nav>
          )}
          {isLoading && <LoadingSpinner />}
          {data && (
            <div id="exec-report" className="exec-formal space-y-4 scroll-smooth">
              <Cover o={data} orgName={orgName} kind={kind} sections={visible.map((s) => s.label)} compare={compare} />
              <Brief o={data} p={prev} insights={insights} kind={kind} />
              <ol className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm print:break-after-page" data-testid="rep-toc">
                <p className="mb-2 text-sm font-black">المحتويات</p>
                <li className="flex justify-between border-b border-dotted border-slate-200 py-1"><span>الموجز التنفيذي</span><span className="text-slate-400">المؤشرات الرئيسة · أبرز النتائج · ما يحتاج قراراً</span></li>
                {visible.map((s, i) => <li key={s.key} className="flex justify-between border-b border-dotted border-slate-200 py-1"><span>{i + 1}. {s.label}</span><span className="text-slate-400">{SECTION_HINTS[s.key]}</span></li>)}
                <li className="flex justify-between py-1"><span>المصادقات</span><span className="text-slate-400">إعداد · تدقيق · اعتماد</span></li>
              </ol>
              {visible.map((s, i) => (
                <section key={s.key} id={`rep-sec-${s.key}`} className="exec-section scroll-mt-24 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" data-testid={`rep-sec-${s.key}`}>
                  <header className="flex items-end justify-between gap-3 border-b-2 pb-2" style={{ borderColor: NAVY }}>
                    <div>
                    <h2 className="flex items-center gap-2 text-base font-black text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0b3d6b] text-xs text-[#f3d06a]">{i + 1}</span>{s.label}</h2>
                    <p className="text-[11px] text-slate-500">{SECTION_HINTS[s.key]}</p>
                    </div>
                    <p className="shrink-0 text-[10px] font-bold tracking-wide text-slate-400">القسم {i + 1} / {visible.length}</p>
                  </header>
                  {(() => { const figs = sectionFigures(s.key, data); return figs ? <SectionFigures figs={figs} testId={`rep-figs-${s.key}`} /> : null })()}
                  {sectionHasData(s.key, data) ? <><SectionBody k={s.key} o={data} p={prev} insights={insights} compare={compare} kind={kind} /><SectionReading k={s.key} insights={insights} /></> : <NoActivity what={s.label} />}
                </section>
              ))}
              <Signatures kind={kind} orgName={orgName} />
              <p className="text-center text-[10px] text-slate-400">أُنشئ آلياً من منصة {orgName} · {new Date(data.period.generated_at).toLocaleString('ar-IQ-u-nu-latn')} · الأرقام صافية من سجلات المنصة</p>
              <div className="exec-page-foot hidden print:flex"><span>{orgName} — {reportKindLabel(data.period.from, data.period.to)}{kind === 'finance' ? ' (مالي)' : ''}</span><span>{periodLabel(data.period.from, data.period.to)} · سرّي — للاستعمال الداخلي</span></div>
            </div>
          )}
          <Nav onPrev={() => setStep(1)} />
        </div>
      )}
    </div>
  )
}

function SectionBody({ k, o, p, insights, compare, kind }: { k: SectionKey; o: ExecOverview; p: ExecOverview | null; insights: ReturnType<typeof buildInsights>; compare: boolean; kind: ExecPortalKind }) {
  switch (k) {
    case 'insights': { const h = healthScore(o); return <Panel title={kind === 'finance' ? 'قراءة مالية للفترة' : 'قراءة تحليلية للفترة'} subtitle={compare ? 'مقارنةً بالفترة السابقة المكافئة' : 'بلا مقارنة'} icon="activity" testId="rep-insights" action={kind === 'finance' || !h.basis ? undefined : <HealthGauge score={h.score} label={h.label} compact />}><InsightList items={insights} /></Panel> }
    case 'kpis': return <OpsKpiGrid o={o} p={p} />
    case 'summary': return <Panel title={scopeOf(kind) === 'finance' ? 'جدول المؤشرات المالية' : 'جدول المؤشرات'} subtitle={p ? 'الحالية مقابل السابقة مع حكم واضح لكل مؤشر' : 'قيم الفترة'} icon="bar-chart"><IndicatorsTable o={o} p={p} kind={kind} /></Panel>
    case 'scorecards': return <UnitScoreCards o={o} p={p} />
    case 'payroll': return <PayrollPanel o={o} p={p} />
    case 'budget': return <BudgetPanel o={o} />
    case 'spend': return <SpendPanel o={o} p={p} />
    case 'workforce_cost': return <WorkforcePanel o={o} costFocus />
    case 'sectors': return <SectorsPanel o={o} />
    case 'citizen': return <CitizenReportPanel from={o.period.from} to={o.period.to} />
    case 'people': return <ExecPeoplePanels from={o.period.from} to={o.period.to} kind={kind} />
    case 'complaints': return <ComplaintsPanel o={o} />
    case 'fleet': return <FleetPanel o={o} />
    case 'station': return <StationPanel o={o} />
    case 'workforce': return <WorkforcePanel o={o} />
    case 'disclosures': return <DisclosuresPanel o={o} />
    case 'supplies': return <SuppliesPanel o={o} />
    case 'finance': return <FinanceBriefPanel o={o} p={p} />
    case 'support': return <SupportPanel o={o} />
  }
}

function Summary({ filters, compare, count }: { filters: ExecFilters; compare: boolean; count: number }) {
  return (
    <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700" data-testid="wizard-summary">
      <b>{reportKindLabel(filters.from, filters.to)}</b> · {periodLabel(filters.from, filters.to)}{compare ? ' · مع مقارنة' : ''} · {count} قسم
    </p>
  )
}
function Nav({ onPrev, onNext, nextDisabled, nextLabel = 'التالي' }: { onPrev?: () => void; onNext?: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 print:hidden">
      {onPrev ? <button type="button" onClick={onPrev} className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50" data-testid="prev-step"><Icon name="chevron-right" size={14} />السابق</button> : <span />}
      {onNext && <button type="button" onClick={onNext} disabled={nextDisabled} className="inline-flex h-10 items-center gap-1 rounded-xl bg-slate-900 px-5 text-xs font-black text-white shadow hover:bg-slate-800 disabled:opacity-50" data-testid="next-step">{nextLabel}<Icon name="chevron-left" size={14} /></button>}
    </div>
  )
}

/** الغلاف — ظاهر على الشاشة وفي الطباعة: شعار + الجهة + نوع التقرير + الفترة + بطاقة التعريف */
function Cover({ o, orgName, kind, sections, compare }: { o: ExecOverview; orgName: string; kind: ExecPortalKind; sections: string[]; compare: boolean }) {
  const title = `${reportKindLabel(o.period.from, o.period.to)}${kind === 'finance' ? ' — مالي' : ''}`
  return (
    <div className="exec-cover overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" data-testid="rep-cover">
      <div className="relative bg-gradient-to-l from-[#0b3d6b] via-[#0b4f8a] to-[#0a2f52] p-6 text-white sm:p-10">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-[#c9a227] via-[#f3d06a] to-[#c9a227]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="relative flex items-center justify-between gap-3">
          <div><p className="text-lg font-black">{orgName}</p><p className="text-xs text-blue-100">{PORTAL_TITLES[kind].who} — تقرير دوري</p></div>
          <img src="/icons/logo.png" alt="" className="h-14 w-14 rounded-xl bg-white/90 object-contain p-1" />
        </div>
        <div className="relative py-10 text-center sm:py-16">
          <p className="text-xs font-bold tracking-widest text-[#f3d06a]">تقرير رسمي</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl" data-testid="rep-cover-title">{title}</h1>
          <p className="mt-3 text-base font-bold text-blue-50 sm:text-xl">{periodLabel(o.period.from, o.period.to)}</p>
          {(o.period.sector || o.period.shift) && <p className="mt-1 text-sm text-blue-100">{o.period.sector ? `قاطع ${o.period.sector}` : ''}{o.period.sector && o.period.shift ? ' · ' : ''}{o.period.shift ? `شفت ${label(o.period.shift)}` : ''}</p>}
          <span className="mx-auto mt-5 block h-1 w-24 rounded-full bg-[#c9a227]" />
        </div>
      </div>
      <div className="p-6 sm:p-10">
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
          <div><dt className="text-slate-500">أُعدّ لـ</dt><dd className="font-black text-slate-800">{PORTAL_TITLES[kind].who}</dd></div>
          <div><dt className="text-slate-500">تاريخ الإصدار</dt><dd className="font-black text-slate-800">{new Date().toLocaleDateString('ar-IQ-u-nu-latn')}</dd></div>
          <div><dt className="text-slate-500">المقارنة</dt><dd className="font-black text-slate-800">{compare ? 'مع الفترة السابقة المكافئة' : 'بلا مقارنة'}</dd></div>
          <div><dt className="text-slate-500">عدد الأقسام</dt><dd className="font-black text-slate-800">{sections.length}</dd></div>
          <div className="col-span-2 sm:col-span-4"><dt className="text-slate-500">الأقسام</dt><dd className="font-bold text-slate-700">{sections.join(' · ')}</dd></div>
        </dl>
        <p className="mt-4 text-center text-[10px] text-slate-400">سرّي — للاستعمال الداخلي · الأرقام مستخرجة آلياً من سجلات المنصة بتاريخ {new Date(o.period.generated_at).toLocaleString('ar-IQ-u-nu-latn')}</p>
      </div>
    </div>
  )
}

const SECTION_DOMAIN: Partial<Record<SectionKey, string[]>> = {
  complaints: ['الشكاوى'], fleet: ['الأسطول', 'الصيانة'], station: ['المحطة التحويلية', 'المحطة'], workforce: ['الموارد البشرية', 'الحضور'], workforce_cost: ['الموارد البشرية', 'المالية'],
  disclosures: ['الكشوفات'], supplies: ['التجهيز', 'الإعلام'], finance: ['المالية'], payroll: ['المالية'], budget: ['المالية'], spend: ['المالية'], sectors: ['الأسطول', 'الشكاوى'],
}
/** «القراءة» المكتوبة أسفل كل قسم: استنتاجات الوحدة نفسها بصيغة نص رسمي */
function SectionReading({ k, insights }: { k: SectionKey; insights: Insight[] }) {
  const domains = SECTION_DOMAIN[k]
  if (!domains) return null
  const list = insights.filter((i) => domains.includes(i.domain)).slice(0, 4)
  if (!list.length) return null
  return (
    <div className="rounded-xl border-r-4 bg-slate-50 p-3 text-xs leading-6 text-slate-700" style={{ borderColor: NAVY }} data-testid={`rep-reading-${k}`}>
      <p className="mb-1 flex items-center gap-1 font-black" style={{ color: NAVY }}><Icon name="file-text" size={12} className="text-[#c9a227]" />القراءة</p>
      <p>{list.map((i) => i.text.replace(/[.。]?$/, '')).join('؛ ')}.</p>
    </div>
  )
}

const SIGNERS: Record<ExecPortalKind, Array<[string, string]>> = {
  admin: [['أعدّه', 'مدير غرفة العمليات'], ['دقّقه', 'المدير التنفيذي'], ['اعتمده', 'المدير المفوض']],
  executive: [['أعدّه', 'مدير غرفة العمليات'], ['دقّقه', 'معاون المدير المفوض'], ['اعتمده', 'المدير التنفيذي']],
  deputy: [['أعدّه', 'مدير غرفة العمليات'], ['دقّقه', 'مسؤول القواطع'], ['اعتمده', 'معاون المدير المفوض']],
  finance: [['أعدّه', 'محاسب الرواتب'], ['دقّقه', 'مدير الشؤون المالية'], ['اعتمده', 'المدير المفوض']],
}
function Signatures({ kind, orgName }: { kind: ExecPortalKind; orgName: string }) {
  return (
    <section className="exec-sign rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="rep-signatures">
      <header className="border-b-2 border-slate-900 pb-2"><h2 className="text-base font-black text-slate-900">المصادقات</h2><p className="text-[11px] text-slate-500">{orgName} — يُوقَّع بعد المراجعة ويُحفظ مع نسخة التقرير</p></header>
      <div className="mt-6 grid grid-cols-3 gap-4 text-center text-xs">
        {SIGNERS[kind].map(([role, who]) => (
          <div key={role} className="space-y-10">
            <div><p className="font-black text-slate-800">{role}</p><p className="text-slate-500">{who}</p></div>
            <div className="border-t border-slate-400 pt-1 text-[10px] text-slate-400">الاسم والتوقيع · التاريخ</div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 text-[11px] text-slate-600 sm:grid-cols-3">
        <p>ملاحظات المراجعة: <span className="inline-block w-full border-b border-dotted border-slate-300" /></p>
        <p className="col-span-2 border-b border-dotted border-slate-300" />
      </div>
    </section>
  )
}

/** جدول المؤشرات (مجمّع حسب الوحدة) — يُصدَّر أيضاً للاستخدام في الصفحات الأخرى */
export function SummaryTable({ o, p, kind = 'admin' }: { o: ExecOverview; p: ExecOverview | null; kind?: ExecPortalKind }) { return <IndicatorsTable o={o} p={p} kind={kind} /> }
