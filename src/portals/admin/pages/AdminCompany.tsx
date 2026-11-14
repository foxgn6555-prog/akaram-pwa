/**
 * «بيانات الشركة» — بوابة المدير المفوض (/admin/company)
 *
 * قرار المستخدم: المدير المفوض (super_admin) هو مدير الشركة ويرى **كل بيانات الشركة وتفاصيلها**.
 * هذه الشاشة تجمع القطاعات التي لم تكن ظاهرة في بوابته، وتعيد استخدام خدمات موجودة حصراً:
 *   · الأسطول والوقود        → centralGarage.dashboard()
 *   · نقاط التراكم (GPS)      → gpsHotspots.monthStats() + gpsHotspots.list()
 *   · الإعلام                 → mediaService.listDesigns()
 *   · المتعهدون               → contractors.managerOptions() + contractors.wagesMonthStatus()
 *   · سجل التدقيق             → audit.list() + audit.topTables()
 * كل شيء **قراءة فقط** — لا زر كتابة واحد.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { centralGarage } from '@sdk/central-garage.sdk'
import { gpsHotspots } from '@sdk/gps-hotspots.sdk'
import { mediaService } from '@sdk/media.sdk'
import { contractors } from '@sdk/contractors.sdk'
import { audit } from '@sdk/audit.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

const fmt = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('ar-IQ-u-nu-latn', { maximumFractionDigits: digits })

/** تاريخ اليوم بصيغة YYYY-MM-DD (توقيت بغداد) */
const today = (): string => new Date().toISOString().slice(0, 10)

interface CardProps { title: string; icon: IconName; testId: string; children: React.ReactNode; loading?: boolean; error?: boolean }
function Card({ title, icon, testId, children, loading, error }: CardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <header className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name={icon} size={16} /></span>
        <h2 className="text-sm font-black text-slate-800">{title}</h2>
      </header>
      {loading ? <LoadingSpinner /> : error ? <p className="text-xs font-bold text-rose-600">تعذر تحميل هذا القطاع</p> : children}
    </section>
  )
}
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-800">{value}</p>
      {sub ? <p className="text-[10px] text-slate-400">{sub}</p> : null}
    </div>
  )
}

export default function AdminCompany() {
  const [page, setPage] = useState(1)
  const garage = useQuery({ queryKey: ['admin-company-garage'], queryFn: () => centralGarage.dashboard({}) })
  const hotspots = useQuery({ queryKey: ['admin-company-hotspots'], queryFn: () => gpsHotspots.monthStats() })
  const hotspotRows = useQuery({ queryKey: ['admin-company-hotspot-rows'], queryFn: () => gpsHotspots.list() })
  const designs = useQuery({ queryKey: ['admin-company-designs'], queryFn: () => mediaService.listDesigns(null) })
  const managers = useQuery({ queryKey: ['admin-company-contractors'], queryFn: () => contractors.managerOptions() })
  const wageMonth = useQuery({ queryKey: ['admin-company-wages'], queryFn: () => contractors.wagesMonthStatus(today().slice(0, 7)) })
  const logs = useQuery({ queryKey: ['admin-company-audit', page], queryFn: () => audit.list({ page, pageSize: 15 }) })
  const topTables = useQuery({ queryKey: ['admin-company-audit-top'], queryFn: () => audit.topTables(6) })

  const monthStats = useMemo(() => (Array.isArray(hotspots.data) ? hotspots.data[0] : null), [hotspots.data])
  const designCounts = useMemo(() => {
    const rows = designs.data ?? []
    return { total: rows.length, draft: rows.filter((r) => r.status === 'draft').length, done: rows.filter((r) => r.status !== 'draft').length }
  }, [designs.data])

  return (
    <div className="space-y-4" data-testid="admin-company">
      <header className="rounded-2xl bg-gradient-to-l from-[#0b3d6b] to-[#0a2f52] p-4 text-white shadow-lg">
        <h1 className="text-lg font-black">بيانات الشركة</h1>
        <p className="mt-1 text-xs text-white/70">نظرة شاملة على قطاعات المنصة — قراءة فقط. التفاصيل المتخصّصة في بواباتها.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* الأسطول والوقود */}
        <Card title="الأسطول والوقود" icon="truck" testId="company-fleet" loading={garage.isLoading} error={garage.isError}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="الآليات" value={fmt(garage.data?.vehiclesTotal)} />
            <Kpi label="السائقون" value={fmt(garage.data?.driversTotal)} />
            <Kpi label="الانطلاقيات" value={fmt(garage.data?.dispatchesTotal)} />
            <Kpi label="طلبات تصفير خزان" value={fmt(garage.data?.pendingZeroRequests)} />
          </div>
          {(garage.data?.tankStock ?? []).length > 0 && (
            <ul className="mt-3 space-y-1">
              {(garage.data?.tankStock ?? []).slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
                  <span className="font-bold text-slate-700">{t.name}</span>
                  <span className={t.lowStock ? 'font-black text-rose-600' : 'font-black text-slate-600'}>{fmt(t.percent, 1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* نقاط التراكم */}
        <Card title="نقاط التراكم (GPS)" icon="map-pin" testId="company-hotspots" loading={hotspots.isLoading} error={hotspots.isError}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="البقع" value={fmt(monthStats?.spots)} sub={monthStats?.month} />
            <Kpi label="التوقفات" value={fmt(monthStats?.stops)} />
            <Kpi label="ثقيلة" value={fmt(monthStats?.by_class?.heavy)} />
            <Kpi label="متكررة" value={fmt(monthStats?.by_recurrence?.recurring)} />
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            مركبات متعددة في نفس البقعة: {fmt(monthStats?.multi_vehicle)} · إجمالي الدقائق: {fmt(monthStats?.total_minutes)}
            {hotspotRows.data ? ` · نقاط الشهر: ${fmt(hotspotRows.data.total)}` : ''}
          </p>
        </Card>

        {/* الإعلام */}
        <Card title="الإعلام" icon="photo" testId="company-media" loading={designs.isLoading} error={designs.isError}>
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="التصاميم" value={fmt(designCounts.total)} />
            <Kpi label="مسوّدات" value={fmt(designCounts.draft)} />
            <Kpi label="مكتملة" value={fmt(designCounts.done)} />
          </div>
          <ul className="mt-3 space-y-1">
            {(designs.data ?? []).slice(0, 4).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
                <span className="truncate font-bold text-slate-700">{d.title}</span>
                <span className="shrink-0 text-slate-500">{d.period_start}</span>
              </li>
            ))}
            {(designs.data ?? []).length === 0 && <li className="text-[11px] text-slate-400">لا توجد تصاميم</li>}
          </ul>
        </Card>

        {/* المتعهدون */}
        <Card title="المتعهدون" icon="users" testId="company-contractors" loading={managers.isLoading} error={managers.isError}>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="المتعهدون" value={fmt(managers.data?.length)} />
            <Kpi label="شهر الأجور" value={wageMonth.data?.approved ? 'معتمد' : 'غير معتمد'} sub={wageMonth.data?.month?.slice(0, 7)} />
          </div>
          <ul className="mt-3 space-y-1">
            {(managers.data ?? []).slice(0, 5).map((m) => (
              <li key={m.user_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
                <span className="font-bold text-slate-700">{m.full_name}</span>
                <span className="text-slate-500">{m.shift ?? '—'}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* سجل التدقيق */}
      <Card title="سجل التدقيق" icon="shield" testId="company-audit" loading={logs.isLoading} error={logs.isError}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {(topTables.data ?? []).map((t) => (
            <span key={t.table_name} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {t.table_name} · {fmt(t.count)}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="p-1.5">التاريخ</th><th className="p-1.5">الجدول</th><th className="p-1.5">العملية</th><th className="p-1.5">الدور</th></tr>
            </thead>
            <tbody>
              {(logs.data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-1.5 whitespace-nowrap text-slate-500">{new Date(r.created_at).toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad' })}</td>
                  <td className="p-1.5 font-bold text-slate-700">{r.table_name}</td>
                  <td className="p-1.5">{r.operation}</td>
                  <td className="p-1.5 text-slate-500">{r.actor_role ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">الإجمالي: {fmt(logs.data?.total)}</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg bg-slate-100 px-2 py-1 font-bold disabled:opacity-40">السابق</button>
            <span className="text-slate-500">صفحة {page}</span>
            <button type="button" disabled={(logs.data?.total ?? 0) <= page * (logs.data?.pageSize ?? 15)} onClick={() => setPage((p) => p + 1)} className="rounded-lg bg-slate-100 px-2 py-1 font-bold disabled:opacity-40">التالي</button>
          </span>
        </footer>
      </Card>
    </div>
  )
}
