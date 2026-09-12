import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BusFront,
  Clock3,
  Factory,
  Satellite,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import {
  useOpsAlerts,
  useOpsAttendance,
  useOpsGarageTrips,
  useOpsMaintenance,
  useOpsMovements,
  useOpsStationVisits,
  useOpsVehicleKpis,
} from '@features/vehicle-operations/hooks'

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const n = (value: unknown) => Number(value ?? 0) || 0
const duration = (minutes: number) =>
  minutes < 60 ? `${minutes} دقيقة` : `${Math.floor(minutes / 60)} س ${minutes % 60} د`
export default function OpsRoomDashboardPage() {
  const day = today(),
    alerts = useOpsAlerts({}),
    kpis = useOpsVehicleKpis(day, day, {}),
    movements = useOpsMovements(day, day),
    station = useOpsStationVisits(day, day),
    garage = useOpsGarageTrips(day, day),
    maintenance = useOpsMaintenance(day, day),
    attendance = useOpsAttendance(day, day)
  const rows = kpis.data ?? [],
    alertRows = alerts.data ?? [],
    productive = rows.reduce((s, r) => s + n(r.productive_minutes), 0),
    moving = rows.reduce((s, r) => s + n(r.movement_minutes), 0),
    stopped = rows.reduce((s, r) => s + n(r.downtime_minutes) + n(r.maintenance_minutes), 0),
    total = Math.max(1, productive + moving + stopped),
    present = (attendance.data ?? []).filter((r) => r.is_present).length
  const volumes = [
      { label: 'حركات الآليات', value: (movements.data ?? []).length, color: 'bg-cyan-500' },
      { label: 'انطلاقات وعودة الكراج', value: (garage.data ?? []).length, color: 'bg-indigo-500' },
      { label: 'زيارات المحطة', value: (station.data ?? []).length, color: 'bg-violet-500' },
      { label: 'حالات الصيانة', value: (maintenance.data ?? []).length, color: 'bg-amber-500' },
    ],
    max = Math.max(1, ...volumes.map((v) => v.value))
  return (
    <section dir="rtl" className="space-y-6" data-testid="ops-dashboard-page">
      <header className="overflow-hidden rounded-[2rem] bg-gradient-to-l from-slate-950 via-indigo-950 to-cyan-800 p-7 text-white shadow-lg">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs text-cyan-200">
              <Activity size={16} />
              مركز المتابعة التشغيلية المباشرة
            </p>
            <h1 className="mt-2 text-3xl font-black">غرفة العمليات</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-200">
              نظرة تنفيذية على حركة الآليات والعمل المنتج والكراج والمحطة والصيانة والحضور. استخدم
              صفحة التقارير للتحليل التفصيلي والتصدير.
            </p>
          </div>
          <Link
            to="/ops-room/operations-data"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-indigo-950"
          >
            فتح التقارير التفصيلية <ArrowLeft size={17} />
          </Link>
        </div>
      </header>
      <Link
        to="/ops-room/gps"
        className="group flex items-center gap-4 rounded-3xl border border-cyan-200 bg-gradient-to-l from-cyan-50 to-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-cyan-700 text-white">
          <Satellite />
        </span>
        <span className="flex-1">
          <b className="text-sm text-slate-900">بيانات أجهزة LVN GPS</b>
          <small className="mt-1 block text-slate-500">
            الأجهزة، الاتصال، الحركة، آخر تحديث، الحساسات والربط بآليات الكراج
          </small>
        </span>
        <ArrowLeft className="text-cyan-700 transition group-hover:-translate-x-1" />
      </Link>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<BusFront />}
          label="الآليات النشطة اليوم"
          value={rows.length}
          note={`${movements.data?.length ?? 0} حركة مسجلة`}
          tone="cyan"
        />
        <Kpi
          icon={<AlertTriangle />}
          label="التنبيهات المفتوحة"
          value={alertRows.length}
          note={`${alertRows.filter((a) => a.severity === 'critical').length} حرجة`}
          tone="red"
        />
        <Kpi
          icon={<Factory />}
          label="زيارات المحطة"
          value={station.data?.length ?? 0}
          note={`${maintenance.data?.length ?? 0} حالة صيانة`}
          tone="violet"
        />
        <Kpi
          icon={<Users />}
          label="الحضور الحالي"
          value={present}
          note={`من ${attendance.data?.length ?? 0} سجل`}
          tone="emerald"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-3xl border bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-900">حجم النشاط حسب البوابة</h2>
              <p className="mt-1 text-xs text-slate-500">عدد العمليات المسجلة خلال اليوم</p>
            </div>
            <Activity className="text-cyan-700" />
          </div>
          <div className="mt-7 space-y-5">
            {volumes.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-xs"
              >
                <span className="font-bold text-slate-700">{item.label}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.max(item.value ? 8 : 0, (item.value / max) * 100)}%` }}
                  />
                </div>
                <b className="text-left text-slate-900">{item.value}</b>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="font-black text-slate-900">توزيع وقت الآليات</h2>
          <p className="mt-1 text-xs text-slate-500">العمل والحركة والتوقف اليوم</p>
          <div
            className="mx-auto mt-6 grid size-48 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#10b981 0 ${(productive / total) * 100}%,#06b6d4 ${(productive / total) * 100}% ${((productive + moving) / total) * 100}%,#f59e0b ${((productive + moving) / total) * 100}% 100%)`,
            }}
          >
            <div className="grid size-32 place-items-center rounded-full bg-white text-center">
              <div>
                <b className="text-xl">{duration(productive + moving + stopped)}</b>
                <p className="text-[10px] text-slate-500">إجمالي الوقت المرصود</p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px]">
            <Legend color="bg-emerald-500" label="عمل منتج" value={duration(productive)} />
            <Legend color="bg-cyan-500" label="حركة" value={duration(moving)} />
            <Legend color="bg-amber-500" label="توقف" value={duration(stopped)} />
          </div>
        </article>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border bg-white p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" />
            <h2 className="font-black">حالة الدورة التشغيلية</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Mini label="العمل المنتج" value={duration(productive)} />
            <Mini label="وقت الحركة" value={duration(moving)} />
            <Mini
              label="المحطة"
              value={duration(rows.reduce((s, r) => s + n(r.station_minutes), 0))}
            />
            <Mini label="الأعطال والصيانة" value={duration(stopped)} />
          </div>
        </article>
        <article className="rounded-3xl border bg-white p-6">
          <div className="flex items-center gap-2">
            <Clock3 className="text-indigo-600" />
            <h2 className="font-black">أحدث التنبيهات</h2>
          </div>
          <div className="mt-4 space-y-3">
            {alertRows.slice(0, 4).map((a) => (
              <div key={a.alert_id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`}
                />
                <div>
                  <b className="text-xs">{a.title}</b>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{a.details}</p>
                </div>
              </div>
            ))}
            {!alertRows.length && (
              <p className="py-8 text-center text-xs text-slate-500">
                لا توجد تنبيهات تشغيلية حالياً.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}
function Kpi({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  note: string
  tone: 'cyan' | 'red' | 'violet' | 'emerald'
}) {
  const styles = {
    cyan: 'bg-cyan-50 text-cyan-700',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <article className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <b className="mt-2 block text-3xl text-slate-950">{value}</b>
          <span className="mt-2 block text-[11px] text-slate-500">{note}</span>
        </div>
        <span className={`grid size-11 place-items-center rounded-2xl ${styles[tone]}`}>
          {icon}
        </span>
      </div>
    </article>
  )
}
function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div>
      <span className={`mx-auto mb-1 block size-2 rounded-full ${color}`} />
      <b>{label}</b>
      <p className="mt-1 text-slate-500">{value}</p>
    </div>
  )
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-[11px] text-slate-500">{label}</p>
      <b className="mt-1 block text-sm text-indigo-900">{value}</b>
    </div>
  )
}
