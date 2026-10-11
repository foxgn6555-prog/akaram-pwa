/**
 * «الرئيسية» للإدارة العليا — تبويبات ثابتة: «نظرة عامة» قصيرة وخفيفة + تبويب لكل وحدة (صفحة قصيرة بلا تمرير طويل).
 * محرك بيانات واحد وأربع تركيبات: المدير المفوض / التنفيذي / المعاون / المالية (مالية صرفة).
 * التبويب محفوظ في hash الرابط (#complaints) ليُشارَك ويُعاد فتحه.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import {
  attendanceRate, buildDecisions, buildInsights, fmtInt, fmtMoney, fmtNum, healthScore, HOME_TABS, insightsFor, insightsForTab, label, pct, periodLabel, PORTAL_TITLES, presetRange,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview, type ExecPortalKind, type HomeTab, type HomeTabKey, type Insight,
} from '@features/executive'
import { ExecFilterBar } from './ExecFilterBar'
import { DecisionItem, HealthGauge, InsightList, Kpi, Panel, ScoreCard, SectionTitle, Sparkline, Tabs } from './exec-ui'
import { BudgetPanel, ComplaintsPanel, DisclosuresPanel, FinanceBriefPanel, FleetPanel, PayrollPanel, SectorsPanel, SpendPanel, StationPanel, SuppliesPanel, SupportPanel, WorkforcePanel } from './ExecPanels'
export type { ExecPortalKind }

const TAB_ICONS: Record<HomeTabKey, IconName> = {
  overview: 'layout-grid', complaints: 'clipboard', fleet: 'truck', station: 'scale', workforce: 'users', finance: 'wallet', sectors: 'map-pin', disclosures: 'alert-triangle', supplies: 'box', field: 'map-pin',
  payroll: 'wallet', budget: 'pie-chart', spend: 'shopping-cart', workforce_cost: 'users',
}
/** اختصارات الرأس — تختلف بحسب البوابة (المدير المفوض: الموافقات والكشوفات أيضاً) */
const QUICK: Record<ExecPortalKind, Array<{ to: string; label: string; icon: IconName; testId?: string }>> = {
  admin: [{ to: '/reports', label: 'التقارير', icon: 'file-text', testId: 'go-reports' }, { to: '/announcements', label: 'تبليغ جديد', icon: 'send', testId: 'go-announcements' }, { to: '/approvals', label: 'الموافقات', icon: 'check-square' }, { to: '/disclosures', label: 'الكشوفات', icon: 'alert-triangle' }],
  executive: [{ to: '/reports', label: 'التقارير', icon: 'file-text', testId: 'go-reports' }, { to: '/announcements', label: 'تبليغ جديد', icon: 'send', testId: 'go-announcements' }],
  deputy: [{ to: '/reports', label: 'التقارير', icon: 'file-text', testId: 'go-reports' }, { to: '/announcements', label: 'تبليغ جديد', icon: 'send', testId: 'go-announcements' }],
  finance: [{ to: '/reports', label: 'التقارير', icon: 'file-text', testId: 'go-reports' }, { to: '/announcements', label: 'تبليغ جديد', icon: 'send', testId: 'go-announcements' }],
}
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : h < 17 ? 'طاب يومك' : 'مساء الخير' }

export function ExecHome({ kind, basePath, userName }: { kind: ExecPortalKind; basePath: string; userName?: string | null }) {
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
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3d6b] via-[#0b4f8a] to-[#0a2f52] p-4 text-white shadow-lg sm:rounded-3xl sm:p-5" data-testid="exec-header">
        <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-white/5" /><div className="pointer-events-none absolute -bottom-20 right-1/4 h-56 w-56 rounded-full bg-[#c9a227]/10" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#c9a227] via-[#f3d06a] to-[#c9a227]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/icons/logo.png" alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white/90 object-contain p-1 shadow sm:h-14 sm:w-14" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#f3d06a]">{greeting()}{userName ? `، ${userName}` : ''}</p>
              <h1 className="truncate text-lg font-black sm:text-xl">{t.title}</h1>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-blue-100/90">{t.subtitle}</p>
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-blue-50 ring-1 ring-white/20"><Icon name="calendar" size={11} />{periodLabel(filters.from, filters.to)}{data?.period.sector ? ` · قاطع ${data.period.sector}` : ''}{filters.shift ? ` · شفت ${label(filters.shift)}` : ''}</p>
            </div>
          </div>
          {data && kind !== 'finance' && <div className="w-fit shrink-0 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20 [&_p]:!text-white [&_.text-slate-500]:!text-blue-100 [&_text]:!fill-white"><HealthGauge score={healthScore(data).score} label={healthScore(data).label} compact /></div>}
        </div>
        <nav className={`relative mt-4 grid gap-2 ${QUICK[kind].length > 2 ? 'grid-cols-4' : 'grid-cols-2'} sm:flex`} aria-label="اختصارات" data-testid="exec-quick">
          {QUICK[kind].map((q, i) => (
            <Link key={q.to} to={`${basePath}${q.to}`} data-testid={q.testId} className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-black transition sm:h-9 sm:flex-row sm:px-3 sm:text-xs ${i === 0 ? 'bg-white text-[#0b3d6b] shadow hover:bg-blue-50' : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'}`}>
              <Icon name={q.icon} size={16} className={i === 0 ? 'text-[#c9a227]' : 'text-[#f3d06a]'} /><span className="truncate">{q.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      <Tabs tabs={tabs.map((x) => ({ key: x.key, label: x.label, icon: TAB_ICONS[x.key], badge: data && x.key !== 'overview' ? insightsForTab(x, insights).filter((i) => i.tone === 'bad' || i.tone === 'warn').length || undefined : undefined }))} value={tab} onChange={setTab} testId="home-tabs" />

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
      {kind !== 'finance' && <HeroStrip o={o} p={p} onOpen={onOpen} />}
      {decisions.length > 0 && (
        <section data-testid="decisions">
          <SectionTitle hint="أرقام حيّة الآن">يحتاج قرارك أو انتباهك</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{decisions.map((d) => <DecisionItem key={d.text} {...d} />)}</div>
        </section>
      )}
      <Panel title="أهم ما في الفترة" subtitle="أربع نتائج فقط — التفاصيل في تبويب كل وحدة" icon="activity" testId="panel-insights" action={kind === 'finance' ? undefined : <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">الأداء العام {h.score}</span>}>
        <InsightList items={top} />
      </Panel>
      <SectionTitle hint="اضغط بطاقة لفتح تبويبها">{kind === 'finance' ? 'الأرقام المالية' : 'الوحدات'}</SectionTitle>
      {kind === 'finance' ? <FinanceCards o={o} p={p} onOpen={onOpen} /> : <UnitCards kind={kind} o={o} p={p} onOpen={onOpen} />}
    </>
  )
}
/** شريط الأرقام الأربعة الكبيرة — ينزلق أفقياً على الهاتف، شبكة على الشاشات الواسعة */
function HeroStrip({ o, p, onOpen }: { o: ExecOverview; p: ExecOverview | null; onOpen: (k: HomeTabKey) => void }) {
  const a = o.workforce.attendance, rate = attendanceRate(a), prate = p ? attendanceRate(p.workforce.attendance) : null
  const items: Array<{ k: HomeTabKey; title: string; value: string | number; unit?: string; delta: number | null; up: boolean; icon: IconName; color: string; spark: number[] }> = [
    { k: 'complaints', title: 'الشكاوى', value: fmtInt(o.complaints.total), unit: `${fmtInt(o.complaints.open)} قيد المعالجة`, delta: pct(o.complaints.total, p?.complaints.total ?? 0), up: false, icon: 'clipboard', color: '#dc2626', spark: o.complaints.series.map((s) => s.count) },
    { k: 'fleet', title: 'انطلاقات الآليات', value: fmtInt(o.fleet.departures), unit: `${fmtInt(o.fleet.open_now)} في الميدان الآن`, delta: pct(o.fleet.departures, p?.fleet.departures ?? 0), up: true, icon: 'truck', color: '#2563eb', spark: o.fleet.series.map((s) => s.count) },
    { k: 'station', title: 'أطنان المحطة', value: fmtNum(o.station.tons), unit: `${fmtInt(o.station.violations)} مخالفة`, delta: pct(o.station.tons, p?.station.tons ?? 0), up: true, icon: 'scale', color: '#059669', spark: o.station.series.map((s) => Number(s.tons)) },
    { k: 'workforce', title: 'نسبة الحضور', value: rate === null ? '—' : `${rate}٪`, unit: `${fmtInt(a.absent)} غياب · ${fmtInt(a.late)} تأخير`, delta: rate !== null && prate !== null ? rate - prate : null, up: true, icon: 'users', color: '#0891b2', spark: o.workforce.attendance_series.map((s) => s.present) },
  ]
  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-4" data-testid="hero-strip">
      {items.map((it) => {
        const good = it.delta === null || it.delta === 0 ? null : it.up ? it.delta > 0 : it.delta < 0
        return (
          <button key={it.k} type="button" onClick={() => onOpen(it.k)} data-testid={`hero-${it.k}`} className="relative w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-right shadow-sm transition hover:-translate-y-0.5 sm:w-auto">
            <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: it.color }} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-[11px] font-bold text-slate-500">{it.title}</p><p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900">{it.value}</p><p className="truncate text-[10px] text-slate-500">{it.unit}</p></div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${it.color}1a`, color: it.color }}><Icon name={it.icon} size={18} /></span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className={`text-[11px] font-black tabular-nums ${good === null ? 'text-slate-400' : good ? 'text-emerald-700' : 'text-red-700'}`}>{it.delta === null ? 'لا مقارنة' : it.delta === 0 ? 'ثابت' : `${it.delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(it.delta))}${it.k === 'workforce' ? ' نقطة' : '٪'}`}</span>
              <span className="w-24"><Sparkline values={it.spark} color={it.color} /></span>
            </div>
          </button>
        )
      })}
    </div>
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
