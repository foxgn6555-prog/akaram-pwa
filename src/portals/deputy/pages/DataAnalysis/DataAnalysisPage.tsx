/**
 * وحدة تحليل البيانات — بوابة معاون المدير المفوض (00131):
 *  · تبني على التقارير اليومية المرسلة من غرفة العمليات بعد التدقيق
 *  · مؤشرات مركبة: وارد/صادر/صافي/مخالفات + نمو واتجاه
 *  · رسم مساحي للوارد مقابل الصادر · رسم تنبؤ (انحدار خطي + نطاق ثقة)
 *  · توزيع الوجهات (مكبس/محطة) · تركيب الصادرات (سكسات/نسافات/ناقلات)
 *  · جدول يومي تفصيلي + تصدير Excel احترافي
 */
import { useMemo, useState } from 'react'
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BrainCircuit, FileSpreadsheet, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useDeputyDailyReports, UNIT_CAPACITIES } from '@features/transfer-station'
import type { DailyStationReport } from '@features/transfer-station/types'
import { forecast, growthRate, linearRegression, movingAverage, trendLabel } from '@features/deputy/lib/forecast'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'

const num = (v: unknown): number => Number(v ?? 0)
const HORIZON = 7

interface DayPoint {
  day: string
  label: string
  inboundTons: number
  outboundTons: number
  inboundCount: number
  outboundCount: number
  violations: number
  pressTons: number
  stationTons: number
  saksatTons: number
  tripsTons: number
  carrierTons: number
}

const pointOf = (day: string, payload: DailyStationReport): DayPoint => ({
  day,
  label: day.slice(5),
  inboundTons: +num(payload.inbound_totals?.total_tons).toFixed(2),
  outboundTons: +num(payload.outbound?.total_tons).toFixed(2),
  inboundCount: num(payload.inbound_totals?.total_count),
  outboundCount: num(payload.outbound?.total_count),
  violations: (payload.violations ?? []).length,
  pressTons: +num(payload.inbound_totals?.press?.tons).toFixed(2),
  stationTons: +num(payload.inbound_totals?.transfer_station?.tons).toFixed(2),
  saksatTons: +num(payload.outbound?.saksat?.tons).toFixed(2),
  tripsTons: +num(payload.outbound?.trips?.tons).toFixed(2),
  carrierTons: +num(payload.outbound?.carrier?.tons).toFixed(2),
})

export default function DataAnalysisPage() {
  const reports = useDeputyDailyReports()
  const [range, setRange] = useState<14 | 30 | 90>(14)

  const series = useMemo<DayPoint[]>(() => {
    const rows = [...(reports.data ?? [])].sort((a, b) => a.report_day.localeCompare(b.report_day))
    return rows.slice(-range).map(r => pointOf(r.report_day, r.payload))
  }, [reports.data, range])

  const inboundSeries = series.map(p => p.inboundTons)
  const reg = useMemo(() => linearRegression(inboundSeries), [inboundSeries])
  const fc = useMemo(() => forecast(inboundSeries, HORIZON), [inboundSeries])
  const smoothed = useMemo(() => movingAverage(inboundSeries, 3), [inboundSeries])

  const chartData = useMemo(() => {
    const base = series.map((p, i) => ({
      ...p,
      smooth: smoothed[i] ?? 0,
      fit: fc[i]?.value ?? 0,
      band: fc[i]?.low != null ? [fc[i]!.low!, fc[i]!.high!] : undefined,
    }))
    const last = series.length
    for (let step = 1; step <= HORIZON; step++) {
      const point = fc[last - 1 + step]
      if (!point) continue
      const date = new Date()
      date.setDate(date.getDate() + step)
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(date)
      base.push({
        day, label: `${day.slice(5)} (تنبؤ)`, inboundTons: 0, outboundTons: 0, inboundCount: 0,
        outboundCount: 0, violations: 0, pressTons: 0, stationTons: 0, saksatTons: 0, tripsTons: 0, carrierTons: 0,
        smooth: 0, fit: point.value, band: [point.low ?? 0, point.high ?? 0],
      } as (typeof base)[number])
    }
    return base
  }, [series, smoothed, fc])

  const totals = useMemo(() => ({
    inbound: +series.reduce((a, p) => a + p.inboundTons, 0).toFixed(2),
    outbound: +series.reduce((a, p) => a + p.outboundTons, 0).toFixed(2),
    violations: series.reduce((a, p) => a + p.violations, 0),
    loads: series.reduce((a, p) => a + p.inboundCount, 0),
    outboundLoads: series.reduce((a, p) => a + p.outboundCount, 0),
  }), [series])
  const growth = growthRate(inboundSeries, 3)
  const trend = trendLabel(reg.slope)
  const forecastWeek = +fc.slice(series.length).reduce((a, p) => a + p.value, 0).toFixed(2)

  const destinationPie = useMemo(() => [
    { name: 'المكبس', value: +series.reduce((a, p) => a + p.pressTons, 0).toFixed(2) },
    { name: 'المحطة التحويلية', value: +series.reduce((a, p) => a + p.stationTons, 0).toFixed(2) },
  ].filter(d => d.value > 0), [series])

  const outboundBars = useMemo(() => (Object.keys(UNIT_CAPACITIES) as Array<keyof typeof UNIT_CAPACITIES>).map(unit => ({
    name: UNIT_CAPACITIES[unit].label,
    tons: +series.reduce((a, p) => a + (unit === 'saksat' ? p.saksatTons : unit === 'trips' ? p.tripsTons : p.carrierTons), 0).toFixed(2),
  })), [series])

  const exportExcel = async (): Promise<void> => {
    const columns: ReportColumn[] = [
      { header: 'اليوم', key: 'day', width: 14 },
      { header: 'وارد (طن)', key: 'inboundTons', numFmt: '0.00', width: 12 },
      { header: 'شحنات واردة', key: 'inboundCount', width: 12 },
      { header: 'صادر (طن)', key: 'outboundTons', numFmt: '0.00', width: 12 },
      { header: 'شحنات صادرة', key: 'outboundCount', width: 12 },
      { header: 'مكبس (طن)', key: 'pressTons', numFmt: '0.00', width: 12 },
      { header: 'محطة (طن)', key: 'stationTons', numFmt: '0.00', width: 12 },
      { header: 'مخالفات', key: 'violations', width: 10 },
    ]
    await buildExcelReport({
      sheetName: 'تحليل البيانات',
      companySub: 'بوابة معاون المدير المفوض',
      title: 'تحليل أداء المحطة التحويلية',
      meta: `${series.length} يوم · وارد ${totals.inbound} طن · صادر ${totals.outbound} طن · نمو ${growth}%`,
      columns,
      rows: series as unknown as Record<string, unknown>[],
      fileName: 'deputy-data-analysis.xlsx',
      totalRow: { day: 'الإجمالي', inboundTons: totals.inbound, outboundTons: totals.outbound, violations: totals.violations },
    })
  }

  if (reports.isLoading) return <section dir="rtl" className="p-10 text-center text-sm text-slate-500">جارٍ تحميل التقارير اليومية…</section>

  return (
    <section dir="rtl" className="space-y-5" data-testid="data-analysis-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-fuchsia-950 to-indigo-900 p-6 text-white shadow-xl">
        <p className="flex items-center gap-2 text-xs text-fuchsia-100"><BrainCircuit size={16} />تحليلات وتنبؤات مبنية على تقارير غرفة_operations المدققة</p>
        <h1 className="mt-2 text-2xl font-black">وحدة تحليل البيانات</h1>
        <p className="mt-1 text-sm text-fuchsia-100">اتجاهات الأوزان والصادرات والمخالفات مع تنبؤ أسبوعي بنطاق ثقة.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([14, 30, 90] as const).map(value => (
            <button key={value} data-testid={`range-${value}`} onClick={() => setRange(value)} className={`rounded-full px-4 py-2 text-xs font-black transition ${range === value ? 'bg-white text-fuchsia-900' : 'bg-white/10 hover:bg-white/20'}`}>آخر {value} يوم</button>
          ))}
          <button onClick={() => void exportExcel()} disabled={!series.length} data-testid="analysis-export" className="ms-auto flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40"><FileSpreadsheet size={15} />تصدير التحليل Excel</button>
        </div>
      </header>

      {series.length === 0 ? (
        <div className="rounded-3xl border border-dashed bg-white p-12 text-center">
          <p className="font-black text-slate-700">لا توجد تقارير يومية بعد</p>
          <p className="mt-2 text-sm text-slate-500">تُبنى التحليلات تلقائياً عندما ترسل غرفةOperations التقرير اليومي بعد التدقيق.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="إجمالي الوارد" value={`${totals.inbound} طن`} sub={`${totals.loads} شحنة`} tone="bg-emerald-50 text-emerald-700" />
            <Kpi label="إجمالي الصادر" value={`${totals.outbound} طن`} sub={`${totals.outboundLoads} شحنة`} tone="bg-amber-50 text-amber-700" />
            <Kpi label="صافي التداول" value={`${(totals.inbound - totals.outbound).toFixed(2)} طن`} sub="وارد − صادر" tone="bg-indigo-50 text-indigo-700" />
            <Kpi label="المخالفات" value={String(totals.violations)} sub="ضمن الفترة" tone="bg-red-50 text-red-700" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <TrendCard growth={growth} trend={trend} r2={reg.r2} />
            <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="forecast-card">
              <p className="text-xs font-black text-slate-500">تنبؤ الوارد للأسبوع القادم</p>
              <p className="mt-1 text-2xl font-black text-fuchsia-700">{forecastWeek} طن</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">انحدار خطي + نطاق ثقة ± انحراف معياري (7 أيام)</p>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-black text-slate-500">متوسط يومي (وارد)</p>
              <p className="mt-1 text-2xl font-black text-indigo-700">{(totals.inbound / Math.max(1, series.length)).toFixed(2)} طن</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">على {series.length} يوم مدقّق</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="analysis-main-chart">
            <h2 className="text-sm font-black text-slate-700">الوارد مقابل الصادر + التنبؤ ونطاق الثقة</h2>
            <div dir="ltr" className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inboundFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => Number(value).toFixed(2)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area dataKey="band" name="نطاق الثقة" stroke="none" fill="#a855f7" fillOpacity={0.15} />
                  <Area dataKey="inboundTons" name="وارد (طن)" stroke="#059669" fill="url(#inboundFill)" strokeWidth={2} />
                  <Line dataKey="outboundTons" name="صادر (طن)" stroke="#d97706" strokeWidth={2} dot={false} />
                  <Line dataKey="smooth" name="تمهيد (متوسط متحرك)" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line dataKey="fit" name="اتجاه/تنبؤ" stroke="#a855f7" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="analysis-destination-chart">
              <h2 className="text-sm font-black text-slate-700">توزيع الوارد حسب الوجهة</h2>
              <div dir="ltr" className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={destinationPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                      {destinationPie.map((entry, i) => <Cell key={entry.name} fill={i === 0 ? '#6366f1' : '#ec4899'} />)}
                    </Pie>
                    <Tooltip formatter={(value) => `${Number(value).toFixed(2)} طن`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="analysis-outbound-chart">
              <h2 className="text-sm font-black text-slate-700">تركيب الصادرات (أطنان)</h2>
              <div dir="ltr" className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outboundBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => `${Number(value).toFixed(2)} طن`} />
                    <Bar dataKey="tons" name="أطنان" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-black text-slate-700">اليوميات المدققة ({series.length})</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm" data-testid="analysis-table">
                <thead><tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="p-2 text-right">اليوم</th><th className="p-2">وارد طن</th><th className="p-2">صادر طن</th><th className="p-2">مكبس</th><th className="p-2">محطة</th><th className="p-2">شحنات خارجة</th><th className="p-2">مخالفات</th>
                </tr></thead>
                <tbody>
                  {[...series].reverse().map(p => (
                    <tr key={p.day} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="p-2 font-bold dir-ltr">{p.day}</td>
                      <td className="p-2 text-center font-black text-emerald-700">{p.inboundTons.toFixed(2)}</td>
                      <td className="p-2 text-center font-black text-amber-700">{p.outboundTons.toFixed(2)}</td>
                      <td className="p-2 text-center text-slate-500">{p.pressTons.toFixed(2)}</td>
                      <td className="p-2 text-center text-slate-500">{p.stationTons.toFixed(2)}</td>
                      <td className="p-2 text-center">{p.outboundCount}</td>
                      <td className="p-2 text-center">{p.violations ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">{p.violations}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${tone}`}>{label}</span>
      <p className="mt-2 text-2xl font-black text-slate-800">{value}</p>
      <p className="text-[11px] font-bold text-slate-400">{sub}</p>
    </div>
  )
}

function TrendCard({ growth, trend, r2 }: { growth: number; trend: string; r2: number }) {
  const icon = trend === 'تصاعدي' ? <TrendingUp size={16} /> : trend === 'تنازلي' ? <TrendingDown size={16} /> : <Minus size={16} />
  const tone = trend === 'تصاعدي' ? 'text-emerald-700' : trend === 'تنازلي' ? 'text-red-700' : 'text-slate-600'
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="trend-card">
      <p className="text-xs font-black text-slate-500">اتجاه الوارد ومعدل النمو</p>
      <p className={`mt-1 flex items-center gap-2 text-2xl font-black ${tone}`}>{icon}{growth > 0 ? '+' : ''}{growth}%</p>
      <p className="mt-1 text-[11px] font-bold text-slate-400">اتجاه {trend} · دقة النموذج R² = {r2.toFixed(2)}</p>
    </div>
  )
}
