/**
 * «الرئيسية» للإدارة العليا — تبويبات ثابتة: «نظرة عامة» قصيرة وخفيفة + تبويب لكل وحدة (صفحة قصيرة بلا تمرير طويل).
 * محرك بيانات واحد وأربع تركيبات: المدير المفوض / التنفيذي / المعاون / المالية (مالية صرفة).
 * التبويب محفوظ في hash الرابط (#complaints) ليُشارَك ويُعاد فتحه.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import {
  attendanceRate, buildDecisions, buildInsights, fmtInt, fmtMoney, fmtNum, healthScore, HOME_TABS, insightsFor, insightsForTab, label, pct, periodLabel, PORTAL_TITLES, presetRange,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview, type ExecPortalKind, type HomeTab, type HomeTabKey, type Insight,
} from '@features/executive'
import { ExecFilterBar } from './ExecFilterBar'
import { DecisionItem, HealthGauge, InsightList, Kpi, Panel, ScoreCard, SectionTitle, Tabs } from './exec-ui'
import { BudgetPanel, ComplaintsPanel, DisclosuresPanel, FinanceBriefPanel, FleetPanel, PayrollPanel, SectorsPanel, SpendPanel, StationPanel, SuppliesPanel, SupportPanel, WorkforcePanel } from './ExecPanels'
export type { ExecPortalKind }

export function ExecHome({ kind, basePath }: { kind: ExecPortalKind; basePath: string }) {
  const [filters, setFilters] = useState<ExecFilters>(() => ({ preset: 'month', ...presetRange('month'), sector: null, shift: null }))
  const tabs = HOME_TABS[kind]
  const { hash } = useLocation(), navigate = useNavigate()
  const fromHash = hash.replace('#', '') as HomeTabKey
  const tab = tabs.some((t) => t.key === fromHash) ? fromHash : 'overview'
  const setTab = (k: HomeTabKey) => navigate({ hash: k === 'overview' ? '' : `#${k}` }, { replace: true })
  const { data: options } = useExecFilterOptions()
  const { data, previous, isLoading, refetch, isFetching, error } = useExecOverview(filters)
  const insights = useMemo(() => (data ? buildInsights(data, previous) : []), [data, previous])
  const t = PORTAL_TITLES[kind]
  useEffect(() => { window.scrollTo?.({ top: 0 }) }, [tab])
  const current = tabs.find((x) => x.key === tab) ?? tabs[0]!

  return (
    <div className="space-y-3" data-testid="exec-home" data-kind={kind} data-tab={tab}>
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

      <Tabs tabs={tabs.map((x) => ({ key: x.key, label: x.label, badge: data && x.key !== 'overview' ? insightsForTab(x, insights).filter((i) => i.tone === 'bad' || i.tone === 'warn').length || undefined : undefined }))} value={tab} onChange={setTab} testId="home-tabs" />

      <ExecFilterBar value={filters} onChange={setFilters} options={options} onRefresh={refetch} isFetching={isFetching} compact />

      {isLoading && <LoadingSpinner />}
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="exec-error">{(error as Error).message}</p>}
      {data && (
        <section data-testid={`tab-panel-${tab}`} className="space-y-3">
          {tab === 'overview' ? <Overview kind={kind} o={data} p={previous} insights={insights} onOpen={setTab} /> : <UnitTab tab={current} o={data} p={previous} insights={insights} />}
        </section>
      )}
    </div>
  )
}

/* ═══════════════ نظرة عامة (خفيفة): قرارات → قراءة قصيرة → بطاقات ═══════════════ */
function Overview({ kind, o, p, insights, onOpen }: { kind: ExecPortalKind; o: ExecOverview; p: ExecOverview | null; insights: Insight[]; onOpen: (k: HomeTabKey) => void }) {
  const decisions = kind === 'admin' ? buildDecisions(o) : []
  const mine = insightsFor(kind, insights)
  const top = [...mine].sort((a, b) => rank(a) - rank(b)).slice(0, 4)
  const h = healthScore(o)
  return (
    <>
      {decisions.length > 0 && (
        <section data-testid="decisions">
          <SectionTitle hint="أرقام حيّة الآن">يحتاج قرارك أو انتباهك</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{decisions.map((d) => <DecisionItem key={d.text} {...d} />)}</div>
        </section>
      )}
      <Panel title="أهم ما في الفترة" subtitle="أربع نتائج فقط — التفاصيل في تبويب كل وحدة" icon="activity" testId="panel-insights" action={kind === 'finance' ? undefined : <HealthGauge score={h.score} label={h.label} compact />}>
        <InsightList items={top} />
      </Panel>
      <SectionTitle hint="اضغط بطاقة لفتح تبويبها">{kind === 'finance' ? 'الأرقام المالية' : 'الوحدات'}</SectionTitle>
      {kind === 'finance' ? <FinanceCards o={o} p={p} onOpen={onOpen} /> : <UnitCards kind={kind} o={o} p={p} onOpen={onOpen} />}
    </>
  )
}
const rank = (i: Insight) => (i.tone === 'bad' ? 0 : i.tone === 'warn' ? 1 : i.tone === 'good' ? 2 : 3)

const Card = ({ k, onOpen, ...rest }: Parameters<typeof ScoreCard>[0] & { k: HomeTabKey; onOpen: (k: HomeTabKey) => void }) => (
  <button type="button" onClick={() => onOpen(k)} className="grid h-full text-right transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900" data-testid={`open-${k}`}><ScoreCard {...rest} /></button>
)

export function UnitCards({ kind, o, p, onOpen }: { kind: ExecPortalKind; o: ExecOverview; p: ExecOverview | null; onOpen: (k: HomeTabKey) => void }) {
  const a = o.workforce.attendance, rate = attendanceRate(a), prate = p ? attendanceRate(p.workforce.attendance) : null
  const done = o.complaints.total ? Math.round((o.complaints.resolved / o.complaints.total) * 100) : 0
  const spend = o.finance.purchases.total + o.finance.maintenance_cost
  const complaints = <Card k="complaints" onOpen={onOpen} title="الشكاوى" icon="clipboard" tone="red" value={o.complaints.total} unit="شكوى" delta={pct(o.complaints.total, p?.complaints.total ?? 0)} increaseIsGood={false} spark={o.complaints.series.map((s) => s.count)} facts={[['إنجاز', `${done}٪`], ['قيد المعالجة', o.complaints.open], ['أبرز نوع', o.complaints.by_type[0]?.name ?? '—']]} testId="card-complaints" />
  const fleet = <Card k="fleet" onOpen={onOpen} title="الأسطول" icon="truck" tone="blue" value={o.fleet.departures} unit="انطلاقة" delta={pct(o.fleet.departures, p?.fleet.departures ?? 0)} spark={o.fleet.series.map((s) => s.count)} facts={[['آليات', o.fleet.vehicles], ['متوسط الرحلة', `${fmtNum(o.fleet.avg_hours)} س`], ['في الصيانة', o.fleet.maintenance.open_now]]} testId="card-fleet" />
  const station = <Card k="station" onOpen={onOpen} title="المحطة التحويلية" icon="scale" tone="emerald" value={fmtNum(o.station.tons)} unit="طن" delta={pct(o.station.tons, p?.station.tons ?? 0)} spark={o.station.series.map((s) => Number(s.tons))} facts={[['وزنات', o.station.weighings], ['مخالفات', o.station.violations], ['عجز', `${fmtNum(o.station.deficit_tons)} طن`]]} testId="card-station" />
  const workforce = <Card k="workforce" onOpen={onOpen} title="القوى العاملة" icon="users" tone="cyan" value={rate === null ? '—' : `${rate}٪`} unit="حضور" delta={rate !== null && prate !== null ? rate - prate : null} spark={o.workforce.attendance_series.map((s) => s.present)} facts={[['الملاك', o.workforce.active], ['غياب', a.absent], ['تأخير', a.late]]} testId="card-workforce" />
  const finance = <Card k="finance" onOpen={onOpen} title="المالية" icon="wallet" tone="violet" value={fmtMoney(o.finance.payroll?.final_total ?? 0)} delta={pct(spend, (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0))} increaseIsGood={false} facts={[['إنفاق تشغيلي', fmtMoney(spend)], ['كشف الرواتب', o.finance.payroll ? label(o.finance.payroll.status) : '—'], ['الموازنة', o.finance.budget.allocated ? `${Math.round((o.finance.budget.spent / o.finance.budget.allocated) * 100)}٪` : '—']]} testId="card-finance" />
  const field = <Card k={kind === 'deputy' ? 'disclosures' : 'field'} onOpen={onOpen} title={kind === 'deputy' ? 'الكشوفات' : 'الميدان'} icon="alert-triangle" tone="amber" value={o.disclosures.total} unit="كشف مخالفة" delta={pct(o.disclosures.total, p?.disclosures.total ?? 0)} increaseIsGood={false} facts={[['أعطال ميدانية', o.fleet.breakdowns], ['طلبات تجهيز', o.supplies.total], ['أنشطة إعلام', o.media.submissions]]} testId="card-field" />
  const sectors = <Card k="sectors" onOpen={onOpen} title="القواطع" icon="map-pin" tone="violet" value={o.complaints.by_sector[0] ? label(o.complaints.by_sector[0].name) : '—'} unit="الأكثر شكاوى" facts={[['قواطع نشطة', o.fleet.by_sector.length], ['أعلى انطلاقات', o.fleet.by_sector[0]?.name ?? '—'], ['طلبات تجهيز', o.supplies.total]]} testId="card-sectors" />
  const order = kind === 'deputy' ? [sectors, field, station, complaints, workforce, fleet] : kind === 'executive' ? [complaints, fleet, station, workforce, field] : [complaints, fleet, station, workforce, finance, field]
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="scorecards">{order.map((c, i) => <div key={i} className="grid">{c}</div>)}</div>
}

function FinanceCards({ o, p, onOpen }: { o: ExecOverview; p: ExecOverview | null; onOpen: (k: HomeTabKey) => void }) {
  const f = o.finance, pr = f.payroll, spend = f.purchases.total + f.maintenance_cost, a = o.workforce.attendance
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="finance-kpis">
      <Card k="payroll" onOpen={onOpen} title="كشف الرواتب" icon="wallet" tone={pr?.status === 'approved' ? 'emerald' : 'amber'} value={fmtMoney(pr?.final_total ?? 0)} unit="صافٍ" delta={pct(pr?.final_total ?? 0, p?.finance.payroll?.final_total ?? 0)} increaseIsGood={false} facts={[['الشهر', pr?.month.slice(0, 7) ?? '—'], ['الحالة', pr ? label(pr.status) : '—'], ['استقطاعات', fmtMoney(pr?.deductions_total ?? 0)]]} testId="kpi-payroll" />
      <Card k="budget" onOpen={onOpen} title={`موازنة ${f.budget.year}`} icon="pie-chart" tone="blue" value={f.budget.allocated ? `${Math.round((f.budget.spent / f.budget.allocated) * 100)}٪` : '—'} unit="مصروف" facts={[['المخصص', fmtMoney(f.budget.allocated)], ['المصروف', fmtMoney(f.budget.spent)], ['بنود', f.budget.by_category.length]]} testId="kpi-budget" />
      <Card k="spend" onOpen={onOpen} title="الإنفاق التشغيلي" icon="shopping-cart" tone="violet" value={fmtMoney(spend)} delta={pct(spend, (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0))} increaseIsGood={false} facts={[['مشتريات', fmtMoney(f.purchases.total)], ['صيانة', fmtMoney(f.maintenance_cost)], ['أوامر شراء', f.purchases.orders]]} testId="kpi-spend" />
      <Card k="workforce_cost" onOpen={onOpen} title="أثر الحضور على الرواتب" icon="users" tone="red" value={a.deduction_days} unit="يوم استقطاع مقترح" facts={[['الملاك', o.workforce.active], ['غياب', a.absent], ['تأخير', a.late]]} testId="kpi-deductions" />
    </div>
  )
}

/* ═══════════════ تبويب وحدة: استنتاجات الوحدة + لوحتها ═══════════════ */
function UnitTab({ tab, o, p, insights }: { tab: HomeTab; o: ExecOverview; p: ExecOverview | null; insights: Insight[] }) {
  const mine = insightsForTab(tab, insights)
  return (
    <>
      {mine.length > 0 && <Panel title={`قراءة ${tab.label}`} icon="activity" testId="tab-insights"><InsightList items={mine} /></Panel>}
      {tab.key === 'complaints' && <ComplaintsPanel o={o} />}
      {tab.key === 'fleet' && <FleetPanel o={o} />}
      {tab.key === 'station' && <StationPanel o={o} />}
      {tab.key === 'workforce' && <WorkforcePanel o={o} />}
      {tab.key === 'finance' && <FinanceBriefPanel o={o} p={p} />}
      {tab.key === 'sectors' && <SectorsPanel o={o} />}
      {tab.key === 'disclosures' && <DisclosuresPanel o={o} />}
      {tab.key === 'supplies' && <SuppliesPanel o={o} />}
      {tab.key === 'field' && <div className="grid gap-3 lg:grid-cols-2"><SectorsPanel o={o} /><DisclosuresPanel o={o} /><SuppliesPanel o={o} /><SupportPanel o={o} /></div>}
      {tab.key === 'payroll' && <PayrollPanel o={o} p={p} />}
      {tab.key === 'budget' && <BudgetPanel o={o} />}
      {tab.key === 'spend' && <SpendPanel o={o} p={p} />}
      {tab.key === 'workforce_cost' && <WorkforcePanel o={o} costFocus />}
    </>
  )
}

/** الأرقام التشغيلية الست (تُستخدم في التقارير) */
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
/** بطاقات الوحدات للتقارير (بلا تنقّل) */
export function UnitScoreCards({ o, p }: { o: ExecOverview; p: ExecOverview | null }) { return <UnitCards kind="admin" o={o} p={p} onOpen={() => undefined} /> }
