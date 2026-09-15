import { Archive, ArrowLeft, Folder, LayoutTemplate, MapPin, Newspaper, Palette } from 'lucide-react'
import { Link } from 'react-router'
import {
  useDesigns,
  useMediaTemplates,
  useSubmissions,
} from '@features/media/hooks'
import { baghdadDay } from '@features/media/constants'

const units = [
  { title: 'قاطع الكرادة', path: '/media/karrada-sector', icon: MapPin, tone: 'bg-cyan-50 text-cyan-800' },
  { title: 'الزعفرانية', path: '/media/zaafaraniya-sector', icon: MapPin, tone: 'bg-blue-50 text-blue-800' },
  { title: 'فولدر الزعفرانية', path: '/media/zaafaraniya-folder', icon: Folder, tone: 'bg-indigo-50 text-indigo-800' },
  { title: 'فولدر الكرادة', path: '/media/karrada-folder', icon: Folder, tone: 'bg-violet-50 text-violet-800' },
  { title: 'التصاميم', path: '/media/designs', icon: Palette, tone: 'bg-emerald-50 text-emerald-800' },
  { title: 'قوالب التصميم', path: '/media/design-templates', icon: LayoutTemplate, tone: 'bg-fuchsia-50 text-fuchsia-800' },
  { title: 'الأرشيف', path: '/media/archive', icon: Archive, tone: 'bg-slate-100 text-slate-800' },
]

export default function MediaDashboardPage() {
  const karrada = useSubmissions('karrada', 'active')
  const zaafaraniya = useSubmissions('zaafaraniya', 'active')
  const designs = useDesigns(null)
  const templates = useMediaTemplates()
  const today = baghdadDay()
  const allTickets = [...(karrada.data ?? []), ...(zaafaraniya.data ?? [])]
  const stats = [
    { label: 'تذاكر اليوم', value: allTickets.filter((t) => (t.event_date ?? t.created_at).slice(0, 10) === today).length, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'تذاكر نشطة', value: allTickets.length, tone: 'text-cyan-800 bg-cyan-50' },
    { label: 'صور بالنشطة', value: allTickets.reduce((s, t) => s + t.photo_count, 0), tone: 'text-blue-800 bg-blue-50' },
    { label: 'تصاميم', value: (designs.data ?? []).length, tone: 'text-fuchsia-800 bg-fuchsia-50' },
    { label: 'قوالب', value: (templates.data ?? []).length, tone: 'text-slate-700 bg-slate-100' },
  ]
  return <section className="space-y-6" dir="rtl">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-cyan-950 to-blue-900 p-7 text-white shadow-xl sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100"><Newspaper size={15} />المركز الإعلامي</span>
      <h1 className="mt-4 text-3xl font-black">بوابة الإعلام</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-cyan-100">دورة المحتوى كاملة: تذاكر الصور من القاطعين، المجلدات الدائمة، التصاميم النصف شهرية وقوالبها، ثم الأرشفة والتقارير.</p>
    </header>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className={`rounded-2xl p-4 text-center ${s.tone}`}>
          <b className="block text-2xl font-black">{s.value}</b>
          <span className="mt-1 block text-[11px] font-bold opacity-80">{s.label}</span>
        </div>
      ))}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{units.map(unit => <Link key={unit.path} to={unit.path} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg"><div className="flex items-center justify-between gap-3"><span className={`flex size-12 items-center justify-center rounded-2xl ${unit.tone}`}><unit.icon size={23} /></span><ArrowLeft className="text-slate-300 transition group-hover:-translate-x-1 group-hover:text-cyan-700" size={20} /></div><h2 className="mt-4 font-black text-slate-900">{unit.title}</h2><p className="mt-1 text-xs text-slate-500">فتح الوحدة</p></Link>)}</div>
  </section>
}
