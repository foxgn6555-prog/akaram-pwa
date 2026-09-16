/**
 * الرئيسية — لوحة قيادة بوابة الإعلام:
 * مؤشرات KPI، رسم أعمدة لنشاط 14 يوماً،_donut_ لتوزيع الصور حسب نوع العمل،
 * منحنى تراكمي، بطاقات تفاصيل الوحدات الحية، وآخر النشاط
 */
import { useMemo } from 'react'
import { Link } from 'react-router'
import {
  Archive,
  ArrowLeft,
  Camera,
  ChartColumn,
  ChartPie,
  Folder,
  LayoutTemplate,
  MapPin,
  Newspaper,
  Palette,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDesigns, useMediaTemplates, useSubmissions } from '@features/media/hooks'
import { baghdadDay } from '@features/media/constants'

const PIE_COLORS = ['#0e7490', '#7c3aed', '#059669', '#db2777', '#d97706', '#334155']

type Ticket = {
  id: string
  title: string
  work_type: string | null
  photo_count: number
  event_date: string | null
  created_at: string
  status: string
}

export default function MediaDashboardPage() {
  const karrada = useSubmissions('karrada', 'all')
  const zaafaraniya = useSubmissions('zaafaraniya', 'all')
  const designs = useDesigns(null)
  const templates = useMediaTemplates()

  const model = useMemo(() => {
    const k = (karrada.data ?? []) as Ticket[]
    const z = (zaafaraniya.data ?? []) as Ticket[]
    const all = [...k, ...z]
    const active = all.filter((t) => t.status !== 'archived')
    const archived = all.filter((t) => t.status === 'archived')
    const today = baghdadDay()
    const dayOf = (t: Ticket) => (t.event_date ?? t.created_at).slice(0, 10)

    const days = Array.from({ length: 14 }, (_, i) => {
      const day = baghdadDay(i - 13)
      const inDay = all.filter((t) => dayOf(t) === day)
      return {
        day: day.slice(8),
        tickets: inDay.length,
        photos: inDay.reduce((s, t) => s + t.photo_count, 0),
      }
    })
    let acc = 0
    const cumulative = days.map((d) => {
      acc += d.photos
      return { day: d.day, total: acc }
    })

    const workMap = new Map<string, number>()
    for (const t of all)
      workMap.set(t.work_type ?? 'عام', (workMap.get(t.work_type ?? 'عام') ?? 0) + t.photo_count)
    const byWork = [...workMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, photos]) => ({ name, photos }))

    const sectorStats = (list: Ticket[]) => ({
      tickets: list.filter((t) => t.status !== 'archived').length,
      photos: list.filter((t) => t.status !== 'archived').reduce((s, t) => s + t.photo_count, 0),
      today: list.filter((t) => dayOf(t) === today).length,
      archived: list.filter((t) => t.status === 'archived').length,
      total: list.length,
      totalPhotos: list.reduce((s, t) => s + t.photo_count, 0),
    })

    const recent = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)
    const dList = designs.data ?? []
    return {
      today: all.filter((t) => dayOf(t) === today).length,
      activeCount: active.length,
      activePhotos: active.reduce((s, t) => s + t.photo_count, 0),
      archivedCount: archived.length,
      archivedPhotos: archived.reduce((s, t) => s + t.photo_count, 0),
      designsDraft: dList.filter((d) => d.status === 'draft').length,
      designsDone: dList.filter((d) => d.status === 'completed').length,
      templatesCount: (templates.data ?? []).length,
      days,
      cumulative,
      byWork,
      karrada: sectorStats(k),
      zaafaraniya: sectorStats(z),
      recent,
    }
  }, [karrada.data, zaafaraniya.data, designs.data, templates.data])

  const kpis = [
    { label: 'تذاكر اليوم', value: model.today, tone: 'from-emerald-600 to-emerald-800', icon: Camera },
    { label: 'تذاكر نشطة', value: model.activeCount, tone: 'from-cyan-600 to-cyan-800', icon: Newspaper },
    { label: 'صور نشطة', value: model.activePhotos, tone: 'from-blue-600 to-blue-800', icon: ChartColumn },
    { label: 'مؤرشفة', value: model.archivedCount, tone: 'from-slate-500 to-slate-700', icon: Archive },
    { label: 'تصاميم', value: model.designsDraft + model.designsDone, tone: 'from-fuchsia-600 to-fuchsia-800', icon: Palette },
    { label: 'قوالب', value: model.templatesCount, tone: 'from-indigo-600 to-indigo-800', icon: LayoutTemplate },
  ]

  const unitCards = [
    {
      id: 'karrada-sector',
      title: 'قاطع الكرادة',
      path: '/media/karrada-sector',
      icon: MapPin,
      tone: 'bg-cyan-50 text-cyan-800',
      lines: [
        `${model.karrada.tickets} تذكرة نشطة`,
        `${model.karrada.photos} صورة نشطة`,
        `${model.karrada.today} اليوم`,
      ],
    },
    {
      id: 'zaafaraniya-sector',
      title: 'قاطع الزعفرانية',
      path: '/media/zaafaraniya-sector',
      icon: MapPin,
      tone: 'bg-blue-50 text-blue-800',
      lines: [
        `${model.zaafaraniya.tickets} تذكرة نشطة`,
        `${model.zaafaraniya.photos} صورة نشطة`,
        `${model.zaafaraniya.today} اليوم`,
      ],
    },
    {
      id: 'karrada-folder',
      title: 'فولدر الكرادة',
      path: '/media/karrada-folder',
      icon: Folder,
      tone: 'bg-violet-50 text-violet-800',
      lines: [
        `${model.karrada.total} تذكرة كلية`,
        `${model.karrada.totalPhotos} صورة`,
        `${model.karrada.archived} مؤرشفة`,
      ],
    },
    {
      id: 'zaafaraniya-folder',
      title: 'فولدر الزعفرانية',
      path: '/media/zaafaraniya-folder',
      icon: Folder,
      tone: 'bg-indigo-50 text-indigo-800',
      lines: [
        `${model.zaafaraniya.total} تذكرة كلية`,
        `${model.zaafaraniya.totalPhotos} صورة`,
        `${model.zaafaraniya.archived} مؤرشفة`,
      ],
    },
    {
      id: 'designs',
      title: 'التصاميم',
      path: '/media/designs',
      icon: Palette,
      tone: 'bg-emerald-50 text-emerald-800',
      lines: [`${model.designsDraft} مسودة`, `${model.designsDone} مكتمل`],
    },
    {
      id: 'design-templates',
      title: 'قوالب التصميم',
      path: '/media/design-templates',
      icon: LayoutTemplate,
      tone: 'bg-fuchsia-50 text-fuchsia-800',
      lines: [`${model.templatesCount} قالب جاهز`],
    },
    {
      id: 'archive',
      title: 'الأرشيف',
      path: '/media/archive',
      icon: Archive,
      tone: 'bg-slate-100 text-slate-800',
      lines: [`${model.archivedCount} تذكرة`, `${model.archivedPhotos} صورة مؤرشفة`],
    },
  ]

  return (
    <section className="space-y-6" dir="rtl">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-cyan-950 to-blue-900 p-7 text-white shadow-xl sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100">
          <Newspaper size={15} />
          المركز الإعلامي — لوحة القيادة
        </span>
        <h1 className="mt-4 text-3xl font-black">بوابة الإعلام</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-cyan-100">
          نظرة حية على القاطعين والفولدرات والتصاميم والقوالب والأرشيف: المؤشرات، النشاط اليومي،
          وتوزيع الأعمال.
        </p>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((s) => (
          <div
            key={s.label}
            data-testid={`kpi-${s.label}`}
            className={`rounded-2xl bg-gradient-to-br p-4 text-white shadow ${s.tone}`}
          >
            <s.icon size={18} className="opacity-80" />
            <b className="mt-2 block text-2xl font-black">{s.value}</b>
            <span className="mt-1 block text-[11px] font-bold opacity-90">{s.label}</span>
          </div>
        ))}
      </div>

      {/* الرسوم البيانية */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
            <ChartColumn size={16} className="text-cyan-700" />
            نشاط آخر 14 يوماً (تذاكر وصور)
          </h2>
          <div dir="ltr" className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.days} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="tickets" name="تذاكر" fill="#0e7490" radius={[4, 4, 0, 0]} />
                <Bar dataKey="photos" name="صور" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
            <ChartPie size={16} className="text-fuchsia-700" />
            توزيع الصور حسب نوع العمل
          </h2>
          <div dir="ltr" className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={model.byWork} dataKey="photos" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {model.byWork.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length] ?? '#334155'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
            <TrendingUp size={16} className="text-emerald-700" />
            التراكم الكلي للصور (14 يوماً)
          </h2>
          <div dir="ltr" className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={model.cumulative} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area dataKey="total" name="إجمالي الصور" stroke="#059669" fill="#a7f3d0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* آخر النشاط */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-black text-slate-800">آخر النشاط</h2>
          <ul className="space-y-2">
            {model.recent.map((t) => (
              <li key={t.id} data-testid="recent-item" className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                <b className="block truncate text-xs text-slate-800">{t.title}</b>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {t.work_type ?? 'عام'} · {t.photo_count} صورة ·{' '}
                  {(t.event_date ?? t.created_at).slice(5, 10)}
                </span>
              </li>
            ))}
            {model.recent.length === 0 && <li className="text-xs text-slate-400">لا نشاط بعد.</li>}
          </ul>
        </div>
      </div>

      {/* بطاقات الوحدات بتفاصيل حية */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {unitCards.map((unit) => (
          <Link
            key={unit.path}
            to={unit.path}
            data-testid={`unit-${unit.id}`}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg"
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`flex size-12 items-center justify-center rounded-2xl ${unit.tone}`}>
                <unit.icon size={23} />
              </span>
              <ArrowLeft
                className="text-slate-300 transition group-hover:-translate-x-1 group-hover:text-cyan-700"
                size={20}
              />
            </div>
            <h2 className="mt-4 font-black text-slate-900">{unit.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1">
              {unit.lines.map((l) => (
                <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {l}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
