/**
 * التقرير اليومي للمحطة التحويلية — غرفة العمليات (00131):
 *  · تفاصيل الأوزان الداخلة بكل الأزمنة · مجاميع الداخلة حسب الوجهة
 *  · موقف الصادرات (سكسات/نسافات/ناقلات: عدد الشحنات والأطنان بالحمولات القياسية)
 *  · المخالفات · تصدير Excel · إرسال اليوم لبوابة المعاون بعد التدقيق
 */
import { useState } from 'react'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, Send, Scale, Truck } from 'lucide-react'
import { useOpsDailyReport, useSendDailyToDeputy, UNIT_CAPACITIES } from '@features/transfer-station'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const time = (value: unknown) =>
  value ? new Intl.DateTimeFormat('ar-IQ', { timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(String(value))) : '—'
const num = (value: unknown) => Number(value ?? 0)

const PARENT_LABELS: Record<string, string> = { karrada: 'الكرادة', zaafaraniya: 'الزعفرانية' }

export default function StationDailyReportPage() {
  const [day, setDay] = useState(today())
  const [note, setNote] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sentFlash, setSentFlash] = useState(false)
  const report = useOpsDailyReport(day)
  const send = useSendDailyToDeputy()

  const data = report.data
  const inbound = (data?.inbound ?? []) as Record<string, unknown>[]
  const totals = data?.inbound_totals
  const outbound = data?.outbound
  const violations = (data?.violations ?? []) as Record<string, unknown>[]

  const exportExcel = async (): Promise<void> => {
    const columns: ReportColumn[] = [
      { header: 'ت', key: 'seq', width: 6, align: 'center' },
      { header: 'DB', key: 'db_number', width: 12 },
      { header: 'الآلية', key: 'vehicle_name', width: 18 },
      { header: 'السائق', key: 'driver_name', width: 20 },
      { header: 'المنطقة', key: 'area_name', width: 14 },
      { header: 'الوزن (طن)', key: 'weight_tons', width: 10, numFmt: '0.00' },
      { header: 'الوجهة', key: 'destination_label', width: 16 },
      { header: 'نوع الآلية', key: 'kind_label', width: 14 },
      { header: 'الوصول', key: 'arrived', width: 10 },
      { header: 'الوزن', key: 'weighed', width: 10 },
      { header: 'الاكتمال', key: 'completed', width: 10 },
      { header: 'مخالفة', key: 'violation_label', width: 10 },
    ]
    await buildExcelReport({
      sheetName: 'التقرير اليومي',
      companySub: 'غرفة العمليات — المحطة التحويلية',
      title: `تقرير المحطة التحويلية ليوم ${day}`,
      meta: `وارد ${num(totals?.total_tons).toFixed(2)} طن · صادر ${num(outbound?.total_tons).toFixed(2)} طن · ${violations.length} مخالفة`,
      columns,
      rows: inbound.map((row, index) => ({
        seq: index + 1,
        db_number: row.db_number,
        vehicle_name: row.vehicle_name,
        driver_name: row.driver_name,
        area_name: row.area_name,
        weight_tons: row.weight_tons,
        destination_label: row.destination_label,
        kind_label: row.kind_label,
        arrived: time(row.arrived_at),
        weighed: time(row.weighed_at),
        completed: time(row.completed_at),
        violation_label: row.violation ? 'مخالفة' : '—',
      })),
      fileName: `station-daily-${day}.xlsx`,
      totalRow: { seq: 'الإجمالي', weight_tons: num(totals?.total_tons) },
    })
  }

  return (
    <section dir="rtl" className="space-y-5" data-testid="ops-station-daily-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-indigo-800 p-6 text-white shadow-xl">
        <p className="flex items-center gap-2 text-xs text-indigo-100"><Scale size={16} />المحاسبة الوزنية اليومية — تدقيق ثم إرسال للمعاون</p>
        <h1 className="mt-2 text-2xl font-black">التقرير اليومي للمحطة التحويلية</h1>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-indigo-100">اليوم
            <input type="date" value={day} onChange={e => setDay(e.target.value)} data-testid="daily-day" className="h-11 rounded-xl border border-indigo-400/40 bg-indigo-950/50 px-3 text-sm font-bold text-white" />
          </label>
          <button onClick={() => void exportExcel()} disabled={!inbound.length} data-testid="daily-export" className="flex h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black hover:bg-white/20 disabled:opacity-40"><FileSpreadsheet size={16} />تصدير Excel</button>
          <button onClick={() => setConfirmOpen(true)} data-testid="daily-send" className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500"><Send size={16} />إرسال اليوم إلى المعاون</button>
          {sentFlash && <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-200">أُرسل التقرير إلى بوابة المعاون ✓</span>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="أطنان داخلة" value={`${num(totals?.total_tons).toFixed(2)} طن`} icon={<ArrowDownToLine size={16} />} tone="text-emerald-700 bg-emerald-50" />
        <Card label="شحنات داخلة" value={num(totals?.total_count)} icon={<Scale size={16} />} tone="text-indigo-700 bg-indigo-50" />
        <Card label="أطنان خارجة" value={`${num(outbound?.total_tons).toFixed(2)} طن`} icon={<ArrowUpFromLine size={16} />} tone="text-amber-700 bg-amber-50" />
        <Card label="شحنات خارجة" value={num(outbound?.total_count)} icon={<Truck size={16} />} tone="text-sky-700 bg-sky-50" />
        <Card label="مخالفات" value={violations.length} icon={<AlertTriangle size={16} />} tone="text-red-700 bg-red-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-700">مجموع الأوزان الداخلة حسب الوجهة</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <DestBox title="المكبس" count={num(totals?.press?.count)} tons={num(totals?.press?.tons)} />
            <DestBox title="المحطة التحويلية" count={num(totals?.transfer_station?.count)} tons={num(totals?.transfer_station?.tons)} />
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="daily-outbound">
          <h2 className="text-sm font-black text-slate-700">موقف الأوزان والشحنات الخارجة</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="p-2 text-right">الوحدة</th><th className="p-2">شحنات</th><th className="p-2">حمولة قياسية</th><th className="p-2">أطنان</th></tr></thead>
            <tbody>
              {(Object.keys(UNIT_CAPACITIES) as Array<keyof typeof UNIT_CAPACITIES>).map(unit => (
                <tr key={unit} className="border-t border-slate-100">
                  <td className="p-2 font-bold">{UNIT_CAPACITIES[unit].label}</td>
                  <td className="p-2 text-center">{num(outbound?.[unit]?.count)}</td>
                  <td className="p-2 text-center text-slate-500">{UNIT_CAPACITIES[unit].tons} طن</td>
                  <td className="p-2 text-center font-black text-amber-700">{num(outbound?.[unit]?.tons).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-black"><td className="p-2">الإجمالي</td><td className="p-2 text-center">{num(outbound?.total_count)}</td><td className="p-2" /><td className="p-2 text-center text-amber-700">{num(outbound?.total_tons).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-black text-slate-700">تفاصيل الأوزان الداخلة ({inbound.length})</h2>
        </div>
        {report.isLoading ? <p className="p-8 text-center text-sm text-slate-500">جارٍ تحميل التقرير…</p> : inbound.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">لا توجد أوزان مكتملة في هذا اليوم.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm" data-testid="daily-inbound-table">
              <thead><tr className="bg-slate-50 text-xs text-slate-500">
                <th className="p-2 text-right">ت</th><th className="p-2">DB</th><th className="p-2">السائق</th><th className="p-2">المنطقة</th><th className="p-2">الوزن</th><th className="p-2">الوجهة</th><th className="p-2">النوع</th><th className="p-2">الوصول</th><th className="p-2">الوزن</th><th className="p-2">الاكتمال</th><th className="p-2">الحالة</th>
              </tr></thead>
              <tbody>
                {inbound.map((row, index) => (
                  <tr key={String(row.db_number) + String(index)} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="p-2 text-slate-400">{index + 1}</td>
                    <td className="p-2 font-bold dir-ltr">{String(row.db_number ?? '')}</td>
                    <td className="p-2">{String(row.driver_name ?? '')}</td>
                    <td className="p-2 text-slate-500">{String(row.area_name ?? '')}</td>
                    <td className="p-2 font-black text-emerald-700 dir-ltr">{num(row.weight_tons).toFixed(2)}</td>
                    <td className="p-2">{String(row.destination_label ?? '')}</td>
                    <td className="p-2 text-slate-500">{String(row.kind_label ?? '')}</td>
                    <td className="p-2 text-slate-500">{time(row.arrived_at)}</td>
                    <td className="p-2 text-slate-500">{time(row.weighed_at)}</td>
                    <td className="p-2 text-slate-500">{time(row.completed_at)}</td>
                    <td className="p-2">{row.violation ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">مخالفة −{num(row.deficit_tons).toFixed(2)} طن</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">ضمن المسموح</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {violations.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4" data-testid="daily-violations">
          <h2 className="flex items-center gap-2 text-sm font-black text-red-700"><AlertTriangle size={16} />مخالفات اليوم ({violations.length})</h2>
          <ul className="mt-2 space-y-1 text-xs font-bold text-red-700">
            {violations.map((v, i) => <li key={i}>· {String(v.driver_name ?? '')} — DB {String(v.db_number ?? '')}: {num(v.weight_tons).toFixed(2)} طن بدل {num(v.min_tons).toFixed(2)} طن ({String(v.kind_label ?? '')})</li>)}
          </ul>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-white p-6">
            <h2 className="text-lg font-black">إرسال تقرير يوم {day} للمعاون</h2>
            <p className="mt-2 text-xs text-slate-500">بعد التدقيق في غرفة العمليات يصل التقرير كاملاً (وارد/صادر/مخالفات) إلى بوابة معاون المدير المفوض مع تنبيه فوري.</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} data-testid="daily-send-note" className="mt-4 w-full rounded-xl border p-3 text-sm" placeholder="ملاحظة تدقيق اختيارية" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmOpen(false)} className="h-11 rounded-xl border font-black">إلغاء</button>
              <button data-testid="daily-send-confirm" disabled={send.isPending} onClick={() => send.mutate({ day, note: note.trim() || undefined }, { onSuccess: () => { setConfirmOpen(false); setSentFlash(true); setNote('') } })} className="h-11 rounded-xl bg-emerald-700 font-black text-white disabled:opacity-40">إرسال بعد التدقيق</button>
            </div>
            {send.error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-black text-red-700">{(send.error as Error).message}</p>}
          </div>
        </div>
      )}
    </section>
  )
}

function Card({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><span className={`flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black ${tone}`}>{icon}{label}</span><b className="mt-2 block text-xl">{value}</b></div>
}
function DestBox({ title, count, tons }: { title: string; count: number; tons: number }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-xs font-black text-slate-500">{title}</p><p className="mt-1 text-2xl font-black text-indigo-700">{tons.toFixed(2)} طن</p><p className="text-[11px] font-bold text-slate-400">{count} شحنة</p></div>
}

export { PARENT_LABELS }
