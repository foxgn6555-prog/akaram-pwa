import { Link } from 'react-router'
import { useComplaintSummary } from '@features/complaints'

export default function DashboardPage() {
  const { data, isLoading } = useComplaintSummary()
  const cards = [
    ['الإجمالي', data?.total], ['جديدة وتحتاج مراجعة', data?.newCount], ['مسندة', data?.assigned],
    ['قيد التنفيذ', data?.inProgress], ['معالجة/تدقيق', data?.processed], ['مؤرشفة', data?.archived],
  ]
  return <section className="space-y-6" dir="rtl">
    <header><h1 className="text-2xl font-bold">الرئيسية — بوابة الشكاوى</h1><p className="text-sm text-slate-500">متابعة يومية للوارد والإسناد والمعالجة والتقارير</p></header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label,value]) => <article key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-3xl text-rose-700">{isLoading ? '…' : value ?? 0}</strong></article>)}</div>
    {data?.karrada !== undefined && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['الكرادة', data.karrada], ['الزعفرانية', data.zaafaraniya]].map(([label, value]) => <article key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">وارد {label}</p><strong className="mt-2 block text-2xl text-slate-800">{isLoading ? '…' : value ?? 0}</strong></article>)}</div>}
    <div className="grid gap-3 md:grid-cols-4">{([
      ['/complaints/karrada-sector','وارد الكرادة'],['/complaints/zaafaraniya-sector','وارد الزعفرانية'],
      ['/complaints/assignment','الفرز والإسناد'],['/complaints/processing','التدقيق والمعالجة'],
      ['/complaints/templates','التقارير والقوالب'],['/complaints/data','قاعدة البيانات'],
      ['/complaints/pages-contact-settings','إعدادات التواصل'],['/complaints/archive','الأرشيف'],
    ] as const).map(([to,label]) => <Link key={to} to={to} className="rounded-xl border bg-white p-4 text-center font-bold text-slate-700 hover:border-rose-400 hover:text-rose-700">{label}</Link>)}</div>
  </section>
}
