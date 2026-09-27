/**
 * «الرئيسية» للإدارة العليا — أربع تركيبات مختلفة على محرك بيانات واحد:
 *   المدير المفوض: ما يحتاج قراره → قراءة الفترة → بطاقة لكل وحدة → التفاصيل (مطوية على الهاتف)
 *   المدير التنفيذي: مؤشرات التشغيل → قراءة الفترة → لوحات العمليات
 *   المعاون: الميدان أولاً — مقارنة القواطع، الكشوفات، المحطة، التجهيز
 *   المالية: مالية صرفة — الرواتب، الاستقطاعات، الإنفاق، الموازنة، أثر الحضور على الرواتب
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import {
  attendanceRate, buildDecisions, buildInsights, fmtInt, fmtMoney, fmtNum, healthScore, insightsFor, label, pct, periodLabel, presetRange, PORTAL_TITLES,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview, type ExecPortalKind, type Insight,
} from '@features/executive'
import { ExecFilterBar } from './ExecFilterBar'
import { Collapsible, DecisionItem, HealthGauge, InsightList, Kpi, Panel, ScoreCard, SectionTitle } from './exec-ui'
export type { ExecPortalKind }
import { BudgetPanel, ComplaintsPanel, DisclosuresPanel, FinanceBriefPanel, FleetPanel, PayrollPanel, SectorsPanel, SpendPanel, StationPanel, SuppliesPanel, SupportPanel, WorkforcePanel } from './ExecPanels'

export function ExecHome({ kind, basePath }: { kind: ExecPortalKind; basePath: string }) {
  const [filters, setFilters] = useState<ExecFilters>(() => ({ preset: 'month', ...presetRange('month'), sector: null, shift: null }))
  const { data: options } = useExecFilterOptions()
  const { data, previous, isLoading, refetch, isFetching, error } = useExecOverview(filters)
  const insights = useMemo(() => (data ? buildInsights(data, previous) : []), [data, previous])
  const t = PORTAL_TITLES[kind]

  return (
    <div className="space-y-3 sm:space-y-4" data-testid="exec-home" data-kind={kind}>
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-lg sm:rounded-3xl sm:p-5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/5" /><div className="pointer-events-none absolute -bottom-16 right-1/3 h-48 w-48 rounded-full bg-blue-500/10" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0"><h1 className="text-lg font-black sm:text-xl">{t.title}</h1><p className="mt-1 text-xs text-slate-300">{t.subtitle}</p><p className="mt-2 text-[11px] text-slate-400">{periodLabel(filters.from, filters.to)}{data?.period.sector ? ` · قاطع ${data.period.sector}` : ''}{filters.shift ? ` · شفت ${label(filters.shift)}` : ''}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Link to={`${basePath}/reports`} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-slate-900 shadow hover:bg-slate-100" data-testid="go-reports"><Icon name="file-text" size={14} />التقارير الجاهزة</Link>
            <Link to={`${basePath}/announcements`} className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/30 hover:bg-white/20" data-testid="go-announcements"><Icon name="send" size={14} />تبليغ جديد</Link>
          </div>
        </div>
      </header>

      <ExecFilterBar value={filters} onChange={setFilters} options={options} onRefresh={refetch} isFetching={isFetching} compact />

      {isLoading && <LoadingSpinner />}
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="exec-error">{(error as Error).message}</p>}
      {data && kind === 'admin' && <AdminHome o={data} p={previous} insights={insights} basePath={basePath} />}
      {data && kind === 'executive' && <ExecutiveHome o={data} p={previous} insights={insights} />}
      {data && kind === 'deputy' && <DeputyHomeBody o={data} p={previous} insights={insights} />}
      {data && kind === 'finance' && <FinanceHome o={data} p={previous} insights={insights} />}
    </div>
  )
}

type Body = { o: ExecOverview; p: ExecOverview | null; insights: Insight[] }

/* ═══════════════ المدير المفوض ═══════════════ */
function AdminHome({ o, p, insights }: Body & { basePath: string }) {
  const h = healthScore(o)
  const decisions = buildDecisions(o)
  return (
    <>
      {decisions.length > 0 && (
        <section data-testid="decisions">
          <SectionTitle hint="أرقام حيّة الآن، لا تتأثر بالفترة">يحتاج قرارك أو انتباهك</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">{decisions.map((d) => <DecisionItem key={d.text} {...d} />)}</div>
        </section>
      )}

      <Panel title="قراءة الفترة" subtitle="ما الذي حدث؟ وإلى أين يتجه؟ — إجابات جاهزة بلا جداول خام" icon="activity" testId="panel-insights" action={<HealthGauge score={h.score} label={h.label} compact />}>
        <InsightList items={insights} limit={8} />
      </Panel>

      <SectionTitle hint="مقارنةً بالفترة السابقة المكافئة">بطاقة كل وحدة</SectionTitle>
      <UnitScoreCards o={o} p={p} />

      <SectionTitle>التفاصيل</SectionTitle>
      <Collapsible title="الشكاوى والأسطول والمحطة" testId="details-ops">
        <div className="grid gap-3 lg:grid-cols-2 sm:gap-4"><ComplaintsPanel o={o} /><FleetPanel o={o} /><StationPanel o={o} /><WorkforcePanel o={o} /></div>
      </Collapsible>
      <Collapsible title="المالية والكشوفات والدعم" testId="details-more">
        <div className="grid gap-3 lg:grid-cols-2 sm:gap-4"><FinanceBriefPanel o={o} p={p} /><DisclosuresPanel o={o} /><SupportPanel o={o} /><SectorsPanel o={o} /></div>
      </Collapsible>
    </>
  )
}

export function UnitScoreCards({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const a = o.workforce.attendance, rate = attendanceRate(a), prate = p ? attendanceRate(p.workforce.attendance) : null
  const done = o.complaints.total ? Math.round((o.complaints.resolved / o.complaints.total) * 100) : 0
  const spend = o.finance.purchases.total + o.finance.maintenance_cost
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="scorecards">
      <ScoreCard title="الشكاوى" icon="clipboard" tone="red" value={o.complaints.total} unit="شكوى" delta={pct(o.complaints.total, p?.complaints.total ?? 0)} increaseIsGood={false} spark={o.complaints.series.map((s) => s.count)} facts={[['إنجاز', `${done}٪`], ['قيد المعالجة', o.complaints.open], ['أبرز نوع', o.complaints.by_type[0]?.name ?? '—']]} testId="card-complaints" />
      <ScoreCard title="الأسطول" icon="truck" tone="blue" value={o.fleet.departures} unit="انطلاقة" delta={pct(o.fleet.departures, p?.fleet.departures ?? 0)} spark={o.fleet.series.map((s) => s.count)} facts={[['آليات', o.fleet.vehicles], ['متوسط الرحلة', `${fmtNum(o.fleet.avg_hours)} س`], ['في الصيانة', o.fleet.maintenance.open_now]]} testId="card-fleet" />
      <ScoreCard title="المحطة التحويلية" icon="scale" tone="emerald" value={fmtNum(o.station.tons)} unit="طن" delta={pct(o.station.tons, p?.station.tons ?? 0)} spark={o.station.series.map((s) => Number(s.tons))} facts={[['وزنات', o.station.weighings], ['مخالفات', o.station.violations], ['عجز', `${fmtNum(o.station.deficit_tons)} طن`]]} testId="card-station" />
      <ScoreCard title="القوى العاملة" icon="users" tone="cyan" value={rate === null ? '—' : `${rate}٪`} unit="حضور" delta={rate !== null && prate !== null ? rate - prate : null} spark={o.workforce.attendance_series.map((s) => s.present)} facts={[['الملاك', o.workforce.active], ['غياب', a.absent], ['تأخير', a.late]]} testId="card-workforce" />
      <ScoreCard title="المالية" icon="wallet" tone="violet" value={fmtMoney(o.finance.payroll?.final_total ?? 0)} delta={pct(spend, (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0))} increaseIsGood={false} facts={[['إنفاق تشغيلي', fmtMoney(spend)], ['كشف الرواتب', o.finance.payroll ? label(o.finance.payroll.status) : '—'], ['الموازنة', o.finance.budget.allocated ? `${Math.round((o.finance.budget.spent / o.finance.budget.allocated) * 100)}٪` : '—']]} testId="card-finance" />
      <ScoreCard title="الميدان" icon="alert-triangle" tone="amber" value={o.disclosures.total} unit="كشف مخالفة" delta={pct(o.disclosures.total, p?.disclosures.total ?? 0)} increaseIsGood={false} facts={[['أعطال ميدانية', o.fleet.breakdowns], ['طلبات تجهيز', o.supplies.total], ['أنشطة إعلام', o.media.submissions]]} testId="card-field" />
    </div>
  )
}

/* ═══════════════ المدير التنفيذي ═══════════════ */
function ExecutiveHome({ o, p, insights }: Body) {
  const h = healthScore(o)
  return (
    <>
      <SectionTitle hint="مقارنةً بالفترة السابقة">مؤشرات التشغيل</SectionTitle>
      <OpsKpiGrid o={o} p={p} />
      <Panel title="قراءة الفترة" icon="activity" testId="panel-insights" action={<HealthGauge score={h.score} label={h.label} compact />}>
        <InsightList items={insightsFor('executive', insights)} limit={6} />
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2 sm:gap-4">
        <ComplaintsPanel o={o} /><FleetPanel o={o} /><StationPanel o={o} /><WorkforcePanel o={o} /><SectorsPanel o={o} /><SupportPanel o={o} />
      </div>
    </>
  )
}

export function OpsKpiGrid({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const a = o.workforce.attendance, rate = attendanceRate(a), prate = p ? attendanceRate(p.workforce.attendance) : null
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="kpi-grid">
      <Kpi title="الشكاوى الواردة" value={o.complaints.total} delta={pct(o.complaints.total, p?.complaints.total ?? 0)} increaseIsGood={false} hint={`${fmtInt(o.complaints.open)} قيد المعالجة`} tone="red" icon="clipboard" spark={o.complaints.series.map((s) => s.count)} testId="kpi-complaints" />
      <Kpi title="انطلاقات الآليات" value={o.fleet.departures} delta={pct(o.fleet.departures, p?.fleet.departures ?? 0)} hint={`${fmtInt(o.fleet.open_now)} في الميدان الآن`} tone="blue" icon="truck" spark={o.fleet.series.map((s) => s.count)} testId="kpi-departures" />
      <Kpi title="أطنان المحطة" value={fmtNum(o.station.tons)} delta={pct(o.station.tons, p?.station.tons ?? 0)} hint={`${fmtInt(o.station.violations)} مخالفة`} tone="emerald" icon="scale" spark={o.station.series.map((s) => Number(s.tons))} testId="kpi-tons" />
      <Kpi title="نسبة الحضور" value={rate ?? '—'} unit={rate === null ? undefined : '٪'} delta={rate !== null && prate !== null ? rate - prate : null} hint={`${fmtInt(a.absent)} غياب · ${fmtInt(a.late)} تأخير`} tone={rate !== null && rate < 75 ? 'red' : 'cyan'} icon="users" testId="kpi-attendance" />
      <Kpi title="في الصيانة الآن" value={o.fleet.maintenance.open_now} delta={pct(o.fleet.maintenance.opened, p?.fleet.maintenance.opened ?? 0)} increaseIsGood={false} hint={`${fmtInt(o.fleet.maintenance.opened)} دخلت · ${fmtInt(o.fleet.maintenance.closed)} أُنجزت`} tone="amber" icon="settings" testId="kpi-maint" />
      <Kpi title="كشوفات المخالفات" value={o.disclosures.total} delta={pct(o.disclosures.total, p?.disclosures.total ?? 0)} increaseIsGood={false} hint={o.disclosures.by_violation[0] ? `أبرزها ${label(o.disclosures.by_violation[0].name)}` : undefined} tone="violet" icon="alert-triangle" testId="kpi-disclosures" />
    </div>
  )
}

/* ═══════════════ معاون المدير المفوض ═══════════════ */
function DeputyHomeBody({ o, p, insights }: Body) {
  return (
    <>
      <SectionTitle hint="مقارنةً بالفترة السابقة">الميدان في أرقام</SectionTitle>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="kpi-grid">
        <Kpi title="كشوفات المخالفات" value={o.disclosures.total} delta={pct(o.disclosures.total, p?.disclosures.total ?? 0)} increaseIsGood={false} tone="violet" icon="alert-triangle" hint={o.disclosures.by_contractor[0] ? `أكثرها ${o.disclosures.by_contractor[0].name}` : undefined} testId="kpi-disclosures" />
        <Kpi title="الشكاوى الواردة" value={o.complaints.total} delta={pct(o.complaints.total, p?.complaints.total ?? 0)} increaseIsGood={false} tone="red" icon="clipboard" spark={o.complaints.series.map((s) => s.count)} hint={`${fmtInt(o.complaints.open)} قيد المعالجة`} testId="kpi-complaints" />
        <Kpi title="مخالفات نقص الحمولة" value={o.station.violations} delta={pct(o.station.violations, p?.station.violations ?? 0)} increaseIsGood={false} tone="emerald" icon="scale" hint={`${fmtNum(o.station.deficit_tons)} طن عجز`} testId="kpi-violations" />
        <Kpi title="طلبات التجهيز" value={o.supplies.total} delta={pct(o.supplies.total, p?.supplies.total ?? 0)} tone="amber" icon="box" hint={o.supplies.by_status[0] ? `${fmtInt(o.supplies.by_status[0].count)} ${label(o.supplies.by_status[0].key)}` : undefined} testId="kpi-supplies" />
      </div>
      <Panel title="قراءة الميدان" icon="activity" testId="panel-insights"><InsightList items={insightsFor('deputy', insights)} limit={6} /></Panel>
      <div className="grid gap-3 lg:grid-cols-2 sm:gap-4">
        <SectorsPanel o={o} /><DisclosuresPanel o={o} /><StationPanel o={o} /><ComplaintsPanel o={o} /><SuppliesPanel o={o} /><FleetPanel o={o} />
      </div>
    </>
  )
}

/* ═══════════════ الشؤون المالية ═══════════════ */
function FinanceHome({ o, p, insights }: Body) {
  const f = o.finance, spend = f.purchases.total + f.maintenance_cost, pr = f.payroll
  return (
    <>
      <SectionTitle hint="مقارنةً بالفترة السابقة">الأرقام المالية</SectionTitle>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" data-testid="finance-kpis">
        <Kpi title="صافي كشف الرواتب" value={fmtMoney(pr?.final_total ?? 0)} hint={pr ? `${pr.month.slice(0, 7)} · ${label(pr.status)}` : 'لا كشف بعد'} tone={pr?.status === 'approved' ? 'emerald' : 'amber'} icon="wallet" testId="kpi-payroll" />
        <Kpi title="استقطاعات الكشف" value={fmtMoney(pr?.deductions_total ?? 0)} hint={`${fmtInt(pr?.employees ?? 0)} موظفاً · ${fmtInt(o.workforce.attendance.deduction_days)} يوم مقترح`} tone="red" icon="scale" testId="kpi-deductions" />
        <Kpi title="الإنفاق التشغيلي" value={fmtMoney(spend)} delta={pct(spend, (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0))} increaseIsGood={false} hint="مشتريات + صيانة" tone="violet" icon="shopping-cart" testId="kpi-spend" />
        <Kpi title={`صرف موازنة ${f.budget.year}`} value={f.budget.allocated ? Math.round((f.budget.spent / f.budget.allocated) * 100) : 0} unit="٪" hint={`${fmtMoney(f.budget.spent)} من ${fmtMoney(f.budget.allocated)}`} tone="blue" icon="pie-chart" testId="kpi-budget" />
      </div>
      <Panel title="قراءة مالية للفترة" icon="activity" testId="panel-insights"><InsightList items={insightsFor('finance', insights)} limit={6} /></Panel>
      <div className="grid gap-3 lg:grid-cols-2 sm:gap-4">
        <PayrollPanel o={o} p={p} /><BudgetPanel o={o} /><SpendPanel o={o} p={p} /><WorkforcePanel o={o} costFocus />
      </div>
    </>
  )
}
