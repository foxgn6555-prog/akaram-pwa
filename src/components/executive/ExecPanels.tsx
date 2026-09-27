/** لوحات الوحدات (مشتركة بين الرئيسية والتقارير) — كل لوحة تجيب عن سؤال عمل واحد برسم + أرقام نصية */
import { attendanceRate, fmtHours, fmtInt, fmtMoney, fmtNum, label, pct, type ExecOverview } from '@features/executive'
import { BarsH, Donut, Kpi, MiniTable, Panel, Progress, StackedBars, TrendArea, PALETTE } from './exec-ui'

const grid2 = 'mt-3 grid gap-3 sm:grid-cols-2'

export function ComplaintsPanel({ o }: { o: ExecOverview }) {
  const done = o.complaints.total ? Math.round((o.complaints.resolved / o.complaints.total) * 100) : 0
  return (
    <Panel title="الشكاوى" subtitle={`${fmtInt(o.complaints.total)} شكوى · إنجاز ${done}٪ · ${fmtInt(o.complaints.open)} قيد المعالجة`} icon="clipboard" tone="red" testId="panel-complaints">
      <TrendArea data={o.complaints.series} keys={[{ key: 'count', name: 'شكاوى/يوم', color: PALETTE[3] }]} />
      <div className={grid2}>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب الحالة</p><Donut data={o.complaints.by_status.map((s) => ({ name: label(s.key), value: s.count }))} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">أكثر الأنواع</p><BarsH data={o.complaints.by_type} color={PALETTE[3]} limit={6} /></div>
      </div>
    </Panel>
  )
}

export function FleetPanel({ o }: { o: ExecOverview }) {
  const m = o.fleet.maintenance
  return (
    <Panel title="الأسطول والصيانة" subtitle={`${fmtInt(o.fleet.vehicles)} آلية · ${fmtInt(o.fleet.departures)} انطلاقة · متوسط الرحلة ${fmtNum(o.fleet.avg_hours)} س`} icon="truck" tone="blue" testId="panel-fleet">
      <TrendArea data={o.fleet.series} keys={[{ key: 'count', name: 'انطلاقات/يوم', color: PALETTE[0] }]} />
      <div className={grid2}>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب الشفت</p><Donut data={o.fleet.by_shift.map((s) => ({ name: label(s.name), value: s.count }))} /></div>
        <div className="grid grid-cols-2 gap-2">
          <Kpi title="في الصيانة الآن" value={m.open_now} tone="amber" hint={`${fmtInt(m.opened)} دخلت · ${fmtInt(m.closed)} أُنجزت`} />
          <Kpi title="متوسط الإصلاح" value={fmtNum(m.avg_hours)} unit="س" tone="slate" />
          <Kpi title="بلاغات الأعطال" value={o.fleet.breakdowns} tone="red" hint={`${fmtInt(o.fleet.gps_alerts)} تنبيه GPS`} />
          <Kpi title="كلفة الصيانة" value={fmtMoney(m.cost)} tone="violet" />
        </div>
      </div>
      {m.by_fault.length > 0 && <div className="mt-3"><p className="mb-1 text-[11px] font-bold text-slate-500">أكثر الأعطال</p><BarsH data={m.by_fault} color={PALETTE[2]} limit={5} /></div>}
    </Panel>
  )
}

export function StationPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="المحطة التحويلية" subtitle={`${fmtNum(o.station.tons)} طن · ${fmtInt(o.station.weighings)} وزنة · ${fmtInt(o.station.violations)} مخالفة نقص (${fmtNum(o.station.deficit_tons)} طن)`} icon="scale" tone="emerald" testId="panel-station">
      <TrendArea data={o.station.series} keys={[{ key: 'tons', name: 'أطنان/يوم', color: PALETTE[1] }]} />
      <div className={grid2}>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">الأطنان حسب نوع الآلية</p><BarsH data={o.station.by_kind} valueKey="tons" color={PALETTE[1]} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">الأكثر مخالفة</p><MiniTable cols={['السائق · الآلية', 'مرات', 'عجز (طن)']} rows={o.station.top_violators.slice(0, 5).map((v) => [v.name, v.count, Number(v.deficit ?? 0)])} /></div>
      </div>
    </Panel>
  )
}

export function WorkforcePanel({ o, costFocus = false }: { o: ExecOverview; costFocus?: boolean }) {
  const a = o.workforce.attendance, rate = attendanceRate(a)
  return (
    <Panel title={costFocus ? 'الملاك وأثر الحضور على الرواتب' : 'القوى العاملة والحضور'} subtitle={`${fmtInt(o.workforce.active)} موظفاً · حضور ${rate ?? '—'}٪ · نقص ${fmtHours(a.shortfall_minutes)} · إضافي ${fmtHours(a.overtime_minutes)}`} icon="users" tone="cyan" testId="panel-workforce">
      {costFocus ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi title="الملاك الفعلي" value={o.workforce.active} tone="cyan" hint={`${fmtInt(o.workforce.hired)} تعيين · ${fmtInt(o.workforce.terminated)} إنهاء`} />
          <Kpi title="أيام استقطاع مقترحة" value={a.deduction_days} tone="red" hint="من الغياب والتأخير" />
          <Kpi title="ساعات النقص" value={fmtHours(a.shortfall_minutes)} tone="amber" />
          <Kpi title="ساعات الإضافي" value={fmtHours(a.overtime_minutes)} tone="emerald" />
        </div>
      ) : (
        <StackedBars data={o.workforce.attendance_series} keys={[{ key: 'present', name: 'حاضر', color: '#059669' }, { key: 'late', name: 'متأخر', color: '#d97706' }, { key: 'absent', name: 'غائب', color: '#dc2626' }]} />
      )}
      <div className={grid2}>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">توزيع أيام الحضور</p><Donut data={[{ name: 'حاضر', value: a.present }, { name: 'متأخر', value: a.late }, { name: 'غائب', value: a.absent }, { name: 'بصمة ناقصة', value: a.incomplete }, { name: 'إجازة/زمنية', value: a.leave }].filter((x) => x.value)} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">الملاك حسب القسم</p><BarsH data={o.workforce.by_department} color={PALETTE[5]} limit={6} format={(v) => fmtInt(v)} /></div>
      </div>
    </Panel>
  )
}

export function DisclosuresPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="كشوفات المخالفات الميدانية" subtitle={`${fmtInt(o.disclosures.total)} كشف`} icon="alert-triangle" tone="violet" testId="panel-disclosures">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب نوع المخالفة</p><Donut data={o.disclosures.by_violation.map((v) => ({ name: label(v.name), value: v.count }))} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب المتعهد</p><BarsH data={o.disclosures.by_contractor} color={PALETTE[4]} limit={6} format={(v) => fmtInt(v)} /></div>
      </div>
      {o.disclosures.by_status.length > 0 && <div className="mt-3"><BarsH data={o.disclosures.by_status.map((s) => ({ name: label(s.key), count: s.count }))} color={PALETTE[8]} format={(v) => fmtInt(v)} /></div>}
    </Panel>
  )
}

export function SupportPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="الإعلام · تجهيز القواطع · حاويات GBS" icon="photo" tone="slate" testId="panel-support">
      <div className="grid grid-cols-3 gap-2">
        <Kpi title="أنشطة موثقة" value={o.media.submissions} hint={`${fmtInt(o.media.photos)} صورة`} tone="cyan" />
        <Kpi title="طلبات تجهيز" value={o.supplies.total} hint={o.supplies.by_type[0]?.name} tone="amber" />
        <Kpi title="حاويات GBS" value={o.gbs.total} hint={`${fmtInt(o.gbs.updates)} تحديثاً`} tone="emerald" />
      </div>
      <div className={grid2}>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">أنشطة الإعلام حسب نوع العمل</p><BarsH data={o.media.by_work_type} color={PALETTE[5]} limit={5} format={(v) => fmtInt(v)} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حالة الحاويات</p><Donut data={o.gbs.by_status.map((s) => ({ name: label(s.key), value: s.count }))} /></div>
      </div>
    </Panel>
  )
}

/** مقارنة القواطع — سؤال المعاون الأول: أي قاطع يشتكي أكثر ويعمل أقل؟ */
export function SectorsPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="مقارنة القواطع" subtitle="الشكاوى مقابل انطلاقات الآليات لكل قاطع" icon="map-pin" tone="violet" testId="panel-sectors">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">الشكاوى حسب القطاع/القاطع</p><BarsH data={o.complaints.by_sector.map((s) => ({ name: label(s.name), count: s.count }))} color={PALETTE[3]} format={(v) => fmtInt(v)} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">انطلاقات الآليات حسب القاطع</p><BarsH data={o.fleet.by_sector} color={PALETTE[0]} format={(v) => fmtInt(v)} /></div>
      </div>
    </Panel>
  )
}

export function SuppliesPanel({ o }: { o: ExecOverview }) {
  return (
    <Panel title="طلبات تجهيز القواطع" subtitle={`${fmtInt(o.supplies.total)} طلب`} icon="box" tone="amber" testId="panel-supplies">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب الحالة</p><Donut data={o.supplies.by_status.map((s) => ({ name: label(s.key), value: s.count }))} /></div>
        <div><p className="mb-1 text-[11px] font-bold text-slate-500">حسب نوع التجهيز (الكمية)</p><BarsH data={o.supplies.by_type} valueKey="qty" color={PALETTE[2]} format={(v) => fmtInt(v)} /></div>
      </div>
    </Panel>
  )
}

/* ─────── لوحات المالية (مالية صرفة) ─────── */
export function PayrollPanel({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const f = o.finance, pr = f.payroll
  return (
    <Panel title="كشف الرواتب" subtitle={pr ? `${pr.month.slice(0, 7)} — ${label(pr.status)} · ${fmtInt(pr.employees)} موظفاً` : 'لا كشف رواتب مصدَّر بعد'} icon="wallet" tone="emerald" testId="panel-payroll">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi title="الراتب المقترح" value={fmtMoney(pr?.proposed_total ?? 0)} tone="slate" />
        <Kpi title="الاستقطاعات" value={fmtMoney(pr?.deductions_total ?? 0)} tone="red" hint={pr?.proposed_total ? `${fmtNum(((pr.deductions_total ?? 0) / pr.proposed_total) * 100)}٪ من المقترح` : undefined} />
        <Kpi title="المخصصات" value={fmtMoney(pr?.allowances_total ?? 0)} tone="cyan" />
        <Kpi title="الصافي النهائي" value={fmtMoney(pr?.final_total ?? 0)} tone="emerald" delta={pct(pr?.final_total ?? 0, p?.finance.payroll?.final_total ?? 0)} increaseIsGood={false} />
      </div>
      <div className="mt-3"><p className="mb-1 text-[11px] font-bold text-slate-500">صافي الكشوف الشهرية</p><BarsH data={f.payroll_months.map((m) => ({ name: `${m.month.slice(0, 7)} · ${label(m.status)}`, count: Number(m.total) }))} color={PALETTE[1]} format={(v) => fmtMoney(v)} limit={12} /></div>
    </Panel>
  )
}

export function BudgetPanel({ o }: { o: ExecOverview }) {
  const b = o.finance.budget
  return (
    <Panel title={`موازنة ${b.year}`} subtitle={`${fmtMoney(b.spent)} مصروف من ${fmtMoney(b.allocated)}`} icon="pie-chart" tone="blue" testId="panel-budget">
      {b.allocated ? (
        <div className="space-y-2">
          <Progress label="الإجمالي" value={b.spent} max={b.allocated} format={fmtMoney} />
          {b.by_category.map((c) => <Progress key={c.name} label={c.name} value={Number(c.spent)} max={Number(c.allocated)} color={PALETTE[0]} format={fmtMoney} />)}
        </div>
      ) : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">لم تُسجَّل مخصصات موازنة لهذه السنة بعد.</p>}
    </Panel>
  )
}

export function SpendPanel({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const f = o.finance, spend = f.purchases.total + f.maintenance_cost, pspend = (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0)
  return (
    <Panel title="الإنفاق التشغيلي" subtitle="مشتريات الصيانة + كلفة أعمال الصيانة" icon="shopping-cart" tone="violet" testId="panel-spend">
      <div className="grid grid-cols-3 gap-2">
        <Kpi title="الإجمالي" value={fmtMoney(spend)} delta={pct(spend, pspend)} increaseIsGood={false} tone="violet" />
        <Kpi title="أوامر الشراء" value={fmtMoney(f.purchases.total)} hint={`${fmtInt(f.purchases.orders)} أمر · ${fmtInt(f.purchases.items)} مادة`} tone="blue" />
        <Kpi title="كلفة الصيانة" value={fmtMoney(f.maintenance_cost)} hint={`${fmtInt(o.fleet.maintenance.closed)} حالة منجزة`} tone="amber" />
      </div>
      {spend > 0 && <div className="mt-3"><Donut data={[{ name: 'مشتريات', value: f.purchases.total }, { name: 'صيانة', value: f.maintenance_cost }].filter((x) => x.value)} /></div>}
    </Panel>
  )
}

/** ملخص مالي مختصر لصفحات الإدارة (ليست المالية) */
export function FinanceBriefPanel({ o, p }: { o: ExecOverview; p: ExecOverview | null }) {
  const f = o.finance, spend = f.purchases.total + f.maintenance_cost
  return (
    <Panel title="المالية (إجماليات)" subtitle={f.payroll ? `كشف ${f.payroll.month.slice(0, 7)} — ${label(f.payroll.status)}` : 'لا كشف رواتب مصدَّر بعد'} icon="wallet" tone="emerald" testId="panel-finance">
      <div className="grid grid-cols-2 gap-2">
        <Kpi title="صافي الرواتب" value={fmtMoney(f.payroll?.final_total ?? 0)} tone="emerald" hint={`${fmtInt(f.payroll?.employees ?? 0)} موظفاً`} />
        <Kpi title="الإنفاق التشغيلي" value={fmtMoney(spend)} delta={pct(spend, (p?.finance.purchases.total ?? 0) + (p?.finance.maintenance_cost ?? 0))} increaseIsGood={false} tone="violet" hint="مشتريات + صيانة" />
      </div>
      {f.budget.allocated > 0 && <div className="mt-3"><Progress label={`موازنة ${f.budget.year}`} value={f.budget.spent} max={f.budget.allocated} format={fmtMoney} /></div>}
    </Panel>
  )
}
