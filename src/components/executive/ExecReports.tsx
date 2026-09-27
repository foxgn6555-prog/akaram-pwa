/**
 * «التقارير» — تقارير جاهزة (يومي/أسبوعي/شهري/ربعي/نصف سنوي/سنوي/مخصص) بفلاتر القاطع والشفت،
 * أقسام تختلف بحسب البوابة (المالية: أقسام مالية فقط)، تصدير Excel متعدد الأوراق، وطباعة PDF بغلاف وألوان.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import {
  buildExecSheets, buildInsights, downloadExecWorkbook, healthScore, insightsFor, label, periodLabel, PORTAL_TITLES, presetRange, REPORT_SECTIONS, reportKindLabel, scopeOf,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview, type ExecPortalKind, type ExecScope, type SectionKey,
} from '@features/executive'
import { ExecFilterBar } from './ExecFilterBar'
import { HealthGauge, InsightList, MiniTable, Panel } from './exec-ui'
import { OpsKpiGrid, UnitScoreCards } from './ExecHome'
import { BudgetPanel, ComplaintsPanel, DisclosuresPanel, FinanceBriefPanel, FleetPanel, PayrollPanel, SectorsPanel, SpendPanel, StationPanel, SuppliesPanel, SupportPanel, WorkforcePanel } from './ExecPanels'

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  #exec-report, #exec-report * { visibility: visible; }
  #exec-report { position: absolute; inset: 0; width: 100%; padding: 14mm 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .exec-panel, .exec-kpi, .exec-chart { break-inside: avoid; }
  .exec-cover { break-after: page; min-height: 260mm; display: flex; flex-direction: column; justify-content: center; }
}`

export function ExecReports({ kind, orgName = 'منصة الأكرم' }: { kind: ExecPortalKind; orgName?: string }) {
  const sectionsDef = REPORT_SECTIONS[kind]
  const [filters, setFilters] = useState<ExecFilters>(() => ({ preset: 'month', ...presetRange('month'), sector: null, shift: null }))
  const [sections, setSections] = useState<Set<SectionKey>>(() => new Set(sectionsDef.map((s) => s.key)))
  const [compare, setCompare] = useState(true)
  const [exporting, setExporting] = useState(false)
  const { data: options } = useExecFilterOptions()
  const { data, previous, isLoading, refetch, isFetching } = useExecOverview(filters, compare)
  const allInsights = useMemo(() => (data ? buildInsights(data, compare ? previous : null) : []), [data, previous, compare])
  const insights = useMemo(() => insightsFor(kind, allInsights), [allInsights, kind])
  const toggle = (k: SectionKey) => setSections((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const on = (k: SectionKey) => sections.has(k)
  const prev = compare ? previous : null

  const fileBase = data ? `${reportKindLabel(data.period.from, data.period.to)}${kind === 'finance' ? ' مالي' : ''} ${data.period.from}${data.period.from !== data.period.to ? ` إلى ${data.period.to}` : ''}` : 'تقرير'
  const exportExcel = async () => { if (!data) return; setExporting(true); try { await downloadExecWorkbook(data, allInsights, prev, `${fileBase}.xlsx`, scopeOf(kind)) } finally { setExporting(false) } }
  const printPdf = () => { const prevTitle = document.title; document.title = fileBase; window.print(); document.title = prevTitle }

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="exec-reports" data-kind={kind}>
      <style>{PRINT_CSS}</style>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div><h1 className="text-lg font-black sm:text-xl">{kind === 'finance' ? 'التقارير المالية' : 'التقارير الجاهزة'}</h1><p className="text-xs text-slate-500">{kind === 'finance' ? 'الرواتب والاستقطاعات والإنفاق والموازنة — بيانات مالية فقط' : 'تقارير الشركة والمنصة كاملة — بيانات وعمليات فقط، بلا أي شيء تقني'}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={exportExcel} disabled={!data || exporting} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50" data-testid="export-excel"><Icon name="file-spreadsheet" size={14} />{exporting ? 'جارٍ التصدير…' : 'Excel'}</button>
          <button type="button" onClick={printPdf} disabled={!data} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-black text-white shadow hover:bg-slate-800 disabled:opacity-50" data-testid="export-pdf"><Icon name="printer" size={14} />PDF / طباعة</button>
        </div>
      </header>

      <ExecFilterBar value={filters} onChange={setFilters} options={options} onRefresh={refetch} isFetching={isFetching}>
        <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="compare-toggle" />مقارنة بالفترة السابقة</label>
      </ExecFilterBar>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 print:hidden" data-testid="section-toggles">
        {sectionsDef.map((s) => (
          <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={on(s.key)} data-testid={`sec-${s.key}`}
            className={clsx('h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-bold', on(s.key) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-500')}>{s.label}</button>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}
      {data && (
        <div id="exec-report" className="space-y-3 sm:space-y-4">
          <Cover o={data} orgName={orgName} kind={kind} />
          {on('insights') && <Panel title={kind === 'finance' ? 'قراءة مالية للفترة' : 'قراءة تحليلية للفترة'} subtitle={compare ? 'مقارنةً بالفترة السابقة المكافئة' : 'بلا مقارنة'} icon="activity" testId="rep-insights" action={kind === 'finance' ? undefined : <HealthGauge {...healthScore(data)} compact />}><InsightList items={insights} /></Panel>}
          {on('kpis') && <OpsKpiGrid o={data} p={prev} />}
          {on('summary') && <SummaryTable o={data} p={prev} scope={scopeOf(kind)} />}
          {on('scorecards') && <UnitScoreCards o={data} p={prev} />}
          <div className="grid gap-3 lg:grid-cols-2 sm:gap-4 print:block print:space-y-4">
            {on('payroll') && <PayrollPanel o={data} p={prev} />}
            {on('budget') && <BudgetPanel o={data} />}
            {on('spend') && <SpendPanel o={data} p={prev} />}
            {on('workforce_cost') && <WorkforcePanel o={data} costFocus />}
            {on('sectors') && <SectorsPanel o={data} />}
            {on('complaints') && <ComplaintsPanel o={data} />}
            {on('fleet') && <FleetPanel o={data} />}
            {on('station') && <StationPanel o={data} />}
            {on('workforce') && <WorkforcePanel o={data} />}
            {on('disclosures') && <DisclosuresPanel o={data} />}
            {on('supplies') && <SuppliesPanel o={data} />}
            {on('finance') && <FinanceBriefPanel o={data} p={prev} />}
            {on('support') && <SupportPanel o={data} />}
          </div>
          <p className="text-center text-[10px] text-slate-400">أُنشئ آلياً من {orgName} · {new Date(data.period.generated_at).toLocaleString('ar-IQ')} · الأرقام صافية من سجلات المنصة</p>
        </div>
      )}
    </div>
  )
}

function Cover({ o, orgName, kind }: { o: ExecOverview; orgName: string; kind: ExecPortalKind }) {
  return (
    <div className="exec-cover hidden rounded-3xl bg-slate-900 p-10 text-white print:block" data-testid="rep-cover">
      <p className="text-sm text-slate-300">{orgName}</p>
      <h1 className="mt-6 text-4xl font-black">{reportKindLabel(o.period.from, o.period.to)}{kind === 'finance' ? ' — مالي' : ''}</h1>
      <p className="mt-2 text-lg text-slate-200">{periodLabel(o.period.from, o.period.to)}</p>
      {(o.period.sector || o.period.shift) && <p className="mt-1 text-sm text-slate-300">{o.period.sector ? `قاطع ${o.period.sector}` : ''}{o.period.sector && o.period.shift ? ' · ' : ''}{o.period.shift ? `شفت ${label(o.period.shift)}` : ''}</p>}
      <div className="mt-10 grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-slate-400">أُعدّ لـ</p><p className="font-bold">{PORTAL_TITLES[kind].who}</p></div>
        <div><p className="text-slate-400">تاريخ الإصدار</p><p className="font-bold">{new Date().toLocaleDateString('ar-IQ')}</p></div>
      </div>
    </div>
  )
}

export function SummaryTable({ o, p, scope = 'all' }: { o: ExecOverview; p: ExecOverview | null; scope?: ExecScope }) {
  const sheet = buildExecSheets(o, [], p, scope)[0]!
  return (
    <Panel title={scope === 'finance' ? 'جدول المؤشرات المالية' : 'جدول المؤشرات'} subtitle={p ? 'الحالية مقابل السابقة' : undefined} icon="bar-chart" testId="rep-summary">
      <MiniTable cols={sheet.columns} rows={sheet.rows.map((r) => r.map((c) => (c === null ? '' : c)))} />
    </Panel>
  )
}
