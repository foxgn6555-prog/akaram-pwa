import type { LucideIcon } from 'lucide-react'
import { Archive, Folder, LayoutTemplate, MapPin } from 'lucide-react'

export type MediaUnitKind = 'sector' | 'folder' | 'templates' | 'archive'

const meta: Record<MediaUnitKind, { icon: LucideIcon; eyebrow: string; description: string; tone: string }> = {
  sector: { icon: MapPin, eyebrow: 'إدارة محتوى القاطع', description: 'تم إنشاء الوحدة ومسارها وصلاحيتها. سنحدد عملياتها وبياناتها في الجولة التالية.', tone: 'from-cyan-950 to-blue-900' },
  folder: { icon: Folder, eyebrow: 'مجلد المحتوى', description: 'تم إنشاء المجلد كوحدة مستقلة داخل بوابة الإعلام، والتفاصيل التشغيلية مؤجلة حسب الطلب.', tone: 'from-indigo-950 to-violet-900' },
  templates: { icon: LayoutTemplate, eyebrow: 'الهوية البصرية', description: 'وحدة مستقلة لقوالب التصميم؛ أدوات التحرير والحفظ ستُبنى بعد اعتماد التفاصيل.', tone: 'from-fuchsia-950 to-rose-900' },
  archive: { icon: Archive, eyebrow: 'المحتوى المؤرشف', description: 'تم إنشاء وحدة الأرشيف ومسارها المحمي دون منح الدور وصولاً إلى بيانات بوابات أخرى.', tone: 'from-slate-950 to-slate-800' },
}

export default function MediaUnitPage({ title, kind }: { title: string; kind: MediaUnitKind }) {
  const unit = meta[kind]
  const Icon = unit.icon
  return <section className="space-y-5" dir="rtl">
    <header className={`overflow-hidden rounded-3xl bg-gradient-to-l ${unit.tone} p-7 text-white shadow-xl`}>
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80"><Icon size={15} />{unit.eyebrow}</span>
      <h1 className="mt-4 text-2xl font-black sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">{unit.description}</p>
    </header>
    <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800"><Icon size={28} /></span>
      <h2 className="mt-4 font-black text-slate-900">الوحدة جاهزة للبناء التفصيلي</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">المسار مسجل في الموجّه والشريط الجانبي ومحمي بدور بوابة الإعلام. لم تُضف وظائف أو افتراضات غير مطلوبة.</p>
    </article>
  </section>
}
