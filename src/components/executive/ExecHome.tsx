/**
 * «الرئيسية» للإدارة العليا — بيانات صافية محلَّلة: مؤشر عام + استنتاجات مكتوبة + مؤشرات مقارنة بالفترة السابقة
 * + ملخص لكل وحدة برسوم. تُعاد استخدامها في بوابات: المدير المفوض / التنفيذي / المعاون / المالية بتركيز مختلف.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import {
  attendanceRate, buildInsights, fmtHours, fmtInt, fmtMoney, fmtNum, healthScore, label, pct, periodLabel, presetRange,
  useExecFilterOptions, useExecOverview, type ExecFilters, type ExecOverview,
} from '@features/executive'
import { ExecFilterBar } from './ExecFilterBar'
import { BarsH, Donut, HealthGauge, InsightList, Kpi, Panel, SectionTitle, StackedBars, TrendArea, MiniTable, PALETTE } from './exec-ui'

export type ExecPortalKind = 'admin' | 'executive' | 'deputy' | 'finance'
const TITLES: Record<ExecPortalKind, { title: string; subtitle: string }> = {
  admin: { title: 'المدير المفوض — الرئيسية', subtitle: 'صورة الشركة كاملة: نتائج صافية محلّلة لكل الوحدات مقارنةً بالفترة السابقة' },
  executive: { title: 'المدير التنفيذي — الرئيسية', subtitle: 'متابعة تنفيذية لعمليات الشركة وأداء الوحدات' },
  deputy: { title: 'معاون المدير المفوض — الرئيسية', subtitle: 'متابعة العمليات الميدانية والكشوفات والقواطع' },
  finance: { title: 'الشؤون المالية — الرئيسية', subtitle: 'الرواتب والإنفاق والموازنة، مع مؤشرات التشغيل المؤثرة على الكلفة' },
}

export function ExecHome({ kind, basePath }: { kind: ExecPortalKind; basePath: string }) {
  const [filters, setFilters] = useState<ExecFilters>(() => ({ preset: 'month', ...presetRange('month'), sector: null, shift: null }))
  const { data: options } = useExecFilterOptions()
  const { data, previous, isLoading, refetch, isFetching, error } = useExecOverview(filters)
  const insights = useMemo(() => (data ? buildInsights(data, previous) : []), [data, previous])
  const t = TITLES[kind]

  return (
    <div className="space-y-4" data-testid="exec-home" data-kind={kind}>
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/5" /><div className="pointer-events-none absolute -bottom-16 right-1/3 h-48 w-48 rounded-full bg-blue-500/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-xl font-black">{t.title}</h1><p className="mt-1 text-xs text-slate-300">{t.subtitle}</p><p className="mt-2 text-[11px] text-slate-400">{periodLabel(filters.from, filters.to)}{data?.period.sector ? ` · قاطع ${data.period.sector}` : ''}{filters.shift ? ` · شفت ${label(filters.shift)}` : ''}</p></div>
          <div className="flex gap-2">
            <Link to={`${basePath}/reports`} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-slate-900 shadow hover:bg-slate-100" data-testid="go-reports"><Icon name="file-text" size={14} />التقارير الجاهزة</Link>
            <Link to={`${basePath}/announcements`} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/30 hover:bg-white/20" data-testid="go-announcements"><Icon name="send" size={14} />تبليغ جديد</Link>
          </div>
        </div>
      </header>

      <ExecFilterBar value={filters} onChange={setFilters} options={options} onRefresh={refetch} isFetching={isFetching} compact />

      {isLoading && <LoadingSpinner />}
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="exec-error">{(error as Error).message}</p>}
      {data && (kind === 'finance' ? <FinanceFirst o={data} p={previous} insights={insights} basePath={basePath} /> : <OpsFirst o={data} p={previous} insights={insights} kind={kind} basePath={basePath} />)}
    </div>
  )
}

// ═══ ترتيب الإدارة (المفوض/التنفيذي/المعاون): الاستنتاجات أولاً ═══
function OpsFirst({ o, p, insights, kind, basePath }: { o: ExecOverview; p: ExecOverview | null; insights: ReturnType<typeof buildInsights>; kind: ExecPortalKind; basePath: string }) {
  const h = healthScore(o)
  return (
    <>
      <Panel title="قراءة الفترة" subtitle="ما الذي حدث؟ وإلى أين يتجه؟ — بلا جداول خام" icon="activity" testId="panel-insights"
        action={<HealthGauge score={h.score} label={h.label} />}>
        <InsightList items={insights} limit={kind === 'admin' ? 8 : 6} />
      </Panel>

      <SectionTitle>المؤشرات الرئيسية</SectionTitle>
      <KpiGrid o={o} p={p} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ComplaintsPanel o={o} />
        <FleetPanel o={o} />
        <StationPanel o={o} />
        <WorkforcePanel o={o} />
        {kind === 'deputy' ? <DisclosuresPanel o={o} /> : <FinancePanel o={o} p={p} brief />}
        <SupportPanel o={o} />
      </div>
      <UnitsIndex basePath={basePath} />
    </>
  )
}

// ═══ ترتيب المالية: الأرقام المالية أولاً ═══
function FinanceFirst({ o, p, insights, basePath }: { o: ExecOverview; p: ExecOverview | null; insights: ReturnType<typeof buildInsights>; basePath: string }) {
  const f = o.finance, pf = p?.finance
  const spend = f.purchases.total + f.maintenance_cost
  return (
    <>
      <SectionTitle>المالية أولاً</SectionTitle>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="finance-kpis">
        <Kpi title="صافي كشف الرواتب" value={fmtMoney(f.payroll?.final_total ?? 0)} hint={f.payroll ? `${f.payroll.month.slice(0, 7)} · ${label(f.payroll.status)}` : 'لا كشف بعد'} tone={f.payroll?.status === 'approved' ? 'emerald' : 'amber'} icon="wallet" testId="kpi-payroll" />
        <Kpi title="استقطاعات الكشف" value={fmtMoney(f.payroll?.deductions_total ?? 0)} hint={`${fmtInt(f.payroll?.employees ?? 0)} موظفاً`} tone="red" icon="scale" />
        <Kpi title="الإنفاق التشغيلي" value={fmtMoney(spend)} delta={pct(spend, (pf?.purchases.total ?? 0) + (pf?.maintenance_cost ?? 0))} increaseIsGood={false} hint="مشتريات + صيانة" tone="violet" icon="shopping-cart" />
        <Kpi title={`صرف موازنة ${f.budget.year}`} value={f.budget.allocated ? Math.round((f.budget.spent / f.budget.allocated) * 100) : 0} unit="٪" hint={`${fmtMoney(f.budget.spent)} من ${fmtMoney(f.budget.allocated)}`} tone="blue" icon="pie-chart" />
      </div>
      <Panel title="قراءة الفترة" icon="activity" testId="panel-insights"><InsightList items={insights.filter((i) => i.domain === 'المالية').concat(insights.filter((i) => i.domain !== 'المالية'))} limit={8} /></Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <FinancePanel o={o} p={p} />
        <Panel title="الرواتب الشهرية" subtitle="صافي الكشوف المصدَّرة/المعتمدة" icon="bar-chart" testId="panel-payroll-months">
          <BarsH data={f.payroll_months.map((m) => ({ name: m.month.slice(0, 7), count: Number(m.total) }))} color={PALETTE[1]} />
        </Panel>
        <WorkforcePanel o={o} />
        <FleetPanel o={o} />
        <StationPanel o={o} />
        <ComplaintsPanel o={o} />
      </div>
      <UnitsIndex basePath={basePath} />
    </>
  )
}

function KpiGrid({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const a = o.workforce.attendance, rate = attendanceRate(a), prate = p ? attendanceRate(p.workforce.attendance) : null
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="kpi-grid">
      <Kpi title="الشكاوى الواردة" value={o.complaints.total} delta={pct(o.complaints.total, p?.complaints.total ?? 0)} increaseIsGood={false} hint={`${fmtInt(o.complaints.open)} قيد المعالجة`} tone="red" icon="clipboard" testId="kpi-complaints" />
      <Kpi title="انطلاقات الآليات" value={o.fleet.departures} delta={pct(o.fleet.departures, p?.fleet.departures ?? 0)} hint={`${fmtInt(o.fleet.open_now)} في الميدان الآن`} tone="blue" icon="truck" testId="kpi-departures" />
      <Kpi title="أطنان المحطة" value={fmtNum(o.station.tons)} delta={pct(o.station.tons, p?.station.tons ?? 0)} hint={`${fmtInt(o.station.weighings)} وزنة · ${fmtInt(o.station.violations)} مخالفة`} tone="emerald" icon="scale" testId="kpi-tons" />
      <Kpi title="نسبة الحضور" value={rate ?? '—'} unit={rate === null ? undefined : '٪'} delta={rate !== null && prate !== null ? rate - prate : null} hint={`${fmtInt(a.absent)} غياب · ${fmtInt(a.late)} تأخير`} tone={rate !== null && rate < 75 ? 'red' : 'cyan'} icon="users" testId="kpi-attendance" />
      <Kpi title="في الصيانة الآن" value={o.fleet.maintenance.open_now} delta={pct(o.fleet.maintenance.opened, p?.fleet.maintenance.opened ?? 0)} increaseIsGood={false} hint={`${fmtInt(o.fleet.maintenance.opened)} دخلت · ${fmtInt(o.fleet.maintenance.closed)} أُنجزت`} tone="amber" icon="settings" testId="kpi-maint" />
      <Kpi title="كشوفات المخالفات" value={o.disclosures.total} delta={pct(o.disclosures.total, p?.disclosures.total ?? 0)} increaseIsGood={false} hint={o.disclosures.by_violation[0] ? `أبرزها ${label(o.disclosures.by_violation[0].name)}` : undefined} tone="violet" icon="alert-triangle" testId="kpi-disclosures" />
    </div>
  )
}

export function ComplaintsPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="الشكاوى" subtitle={`${fmtInt(o.complaints.total)} شكوى · إنجاز ${o.complaints.total ? Math.round((o.complaints.resolved / o.complaints.total) * 100) : 0}٪`} icon="clipboard" testId="panel-complaints">
      <TrendArea data={o.complaints.series} keys={[{ key: 'count', name: 'شكاوى/يوم', color: PALETTE[3] }]} height={170} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Donut data={o.complaints.by_status.map((s) => ({ name: label(s.key), value: s.count }))} height={150} />
        <BarsH data={o.complaints.by_type.slice(0, 6)} color={PALETTE[3]} />
      </div>
    </Panel>
  )
}
export function FleetPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="الأسطول والصيانة" subtitle={`${fmtInt(o.fleet.vehicles)} آلية · متوسط الرحلة ${fmtNum(o.fleet.avg_hours)} س · ${fmtInt(o.fleet.breakdowns)} عطل`} icon="truck" testId="panel-fleet">
      <TrendArea data={o.fleet.series} keys={[{ key: 'count', name: 'انطلاقات/يوم', color: PALETTE[0] }]} height={170} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Donut data={o.fleet.by_shift.map((s) => ({ name: label(s.name), value: s.count }))} height={150} />
        <MiniTable cols={['الصيانة', '']} rows={[['حالات جديدة', o.fleet.maintenance.opened], ['أُنجزت', o.fleet.maintenance.closed], ['مفتوحة الآن', o.fleet.maintenance.open_now], ['متوسط الإصلاح (س)', o.fleet.maintenance.avg_hours], ['الكلفة', fmtMoney(o.fleet.maintenance.cost)]]} />
      </div>
    </Panel>
  )
}
export function StationPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="المحطة التحويلية" subtitle={`${fmtNum(o.station.tons)} طن · ${fmtInt(o.station.violations)} مخالفة نقص (${fmtNum(o.station.deficit_tons)} طن عجز)`} icon="scale" testId="panel-station">
      <TrendArea data={o.station.series} keys={[{ key: 'tons', name: 'أطنان/يوم', color: PALETTE[1] }]} height={170} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BarsH data={o.station.by_kind.map((k) => ({ name: k.name, count: Number(k.tons ?? 0) }))} color={PALETTE[1]} />
        <MiniTable cols={['الأكثر مخالفة', 'مرات', 'عجز']} rows={o.station.top_violators.slice(0, 5).map((v) => [v.name, v.count, Number(v.deficit ?? 0)])} />
      </div>
    </Panel>
  )
}
export function WorkforcePanel({ o }: { o: ExecOverview }) {
  const a = o.workforce.attendance
  return (
    <Panel title="القوى العاملة والحضور" subtitle={`${fmtInt(o.workforce.active)} موظفاً · نقص ${fmtHours(a.shortfall_minutes)} · إضافي ${fmtHours(a.overtime_minutes)}`} icon="users" testId="panel-workforce">
      <StackedBars data={o.workforce.attendance_series} keys={[{ key: 'present', name: 'حاضر', color: '#059669' }, { key: 'late', name: 'متأخر', color: '#d97706' }, { key: 'absent', name: 'غائب', color: '#dc2626' }]} height={170} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Donut data={[{ name: 'حاضر', value: a.present }, { name: 'متأخر', value: a.late }, { name: 'غائب', value: a.absent }, { name: 'بصمة ناقصة', value: a.incomplete }, { name: 'إجازة/زمنية', value: a.leave }].filter((x) => x.value)} height={150} />
        <BarsH data={o.workforce.by_department.slice(0, 6)} color={PALETTE[5]} />
      </div>
    </Panel>
  )
}
export function DisclosuresPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="الكشوفات الميدانية" subtitle={`${fmtInt(o.disclosures.total)} كشف`} icon="alert-triangle" testId="panel-disclosures">
      <div className="grid gap-3 sm:grid-cols-2">
        <Donut data={o.disclosures.by_violation.map((v) => ({ name: label(v.name), value: v.count }))} height={150} />
        <BarsH data={o.disclosures.by_contractor.slice(0, 6)} color={PALETTE[4]} />
      </div>
    </Panel>
  )
}
export function FinancePanel({ o, p, brief = false }: { o: ExecOverview; p: ExecOverview | null; brief?: boolean }) {
  const f = o.finance
  return (
    <Panel title="المالية (إجماليات)" subtitle={f.payroll ? `كشف ${f.payroll.month.slice(0, 7)} — ${label(f.payroll.status)}` : 'لا كشف رواتب مصدَّر بعد'} icon="wallet" testId="panel-finance">
      <div className="grid grid-cols-2 gap-2">
        <Kpi title="صافي الرواتب" value={fmtMoney(f.payroll?.final_total ?? 0)} tone="emerald" />
        <Kpi title="مشتريات الصيانة" value={fmtMoney(f.purchases.total)} delta={pct(f.purchases.total, p?.finance.purchases.total ?? 0)} increaseIsGood={false} tone="violet" />
        <Kpi title="كلفة الصيانة" value={fmtMoney(f.maintenance_cost)} delta={pct(f.maintenance_cost, p?.finance.maintenance_cost ?? 0)} increaseIsGood={false} tone="amber" />
        <Kpi title={`موازنة ${f.budget.year}`} value={f.budget.allocated ? Math.round((f.budget.spent / f.budget.allocated) * 100) : 0} unit="٪ مصروف" tone="blue" />
      </div>
      {!brief && f.budget.by_category.length > 0 && <div className="mt-3"><MiniTable cols={['بند الموازنة', 'المخصص', 'المصروف']} rows={f.budget.by_category.map((b) => [b.name, Number(b.allocated), Number(b.spent)])} /></div>}
    </Panel>
  )
}
export function SupportPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="الإعلام · التجهيز · حاويات GBS" icon="photo" testId="panel-support">
      <div className="grid grid-cols-3 gap-2">
        <Kpi title="أنشطة موثقة" value={o.media.submissions} hint={`${fmtInt(o.media.photos)} صورة`} tone="cyan" />
        <Kpi title="طلبات تجهيز" value={o.supplies.total} hint={o.supplies.by_type[0] ? o.supplies.by_type[0].name : undefined} tone="amber" />
        <Kpi title="حاويات GBS" value={o.gbs.total} hint={`${fmtInt(o.gbs.updates)} تحديثاً`} tone="emerald" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BarsH data={o.media.by_work_type.slice(0, 5)} color={PALETTE[5]} />
        <Donut data={o.gbs.by_status.map((s) => ({ name: label(s.key), value: s.count }))} height={140} />
      </div>
    </Panel>
  )
}

function UnitsIndex({ basePath }: { basePath: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden" data-testid="units-index">
      {([
        { t: 'التقارير الجاهزة', to: `${basePath}/reports`, ic: 'file-text' as const }, { t: 'التبليغات', to: `${basePath}/announcements`, ic: 'send' as const },
      ]).map((x) => <Link key={x.to} to={x.to} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Icon name={x.ic} size={14} />{x.t}</Link>)}
    </div>
  )
}
