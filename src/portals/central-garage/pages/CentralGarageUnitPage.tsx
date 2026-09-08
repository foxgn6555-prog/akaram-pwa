import type { LucideIcon } from 'lucide-react'
import { Archive, BusFront, Database, Droplets, Fuel } from 'lucide-react'

export type GarageUnitKind = 'drivers' | 'vehicles' | 'fuel' | 'fuel-page' | 'archive'

const meta: Record<GarageUnitKind, { icon: LucideIcon; eyebrow: string; description: string; tone: string }> = {
  drivers: { icon: BusFront, eyebrow: 'حركة السائقين', description: 'تم إنشاء وحدة انطلاقية السائقين ومسارها المحمي، وتفاصيل التشغيل ستُبنى في الجولة المخصصة لها.', tone: 'from-blue-950 to-cyan-800' },
  vehicles: { icon: Database, eyebrow: 'سجل الأسطول', description: 'تم إنشاء وحدة قاعدة بيانات الآليات دون إضافة اتصال مباشر بالبيانات أو افتراض حقول غير معتمدة.', tone: 'from-slate-950 to-blue-900' },
  fuel: { icon: Fuel, eyebrow: 'إدارة الوقود والزيوت', description: 'تضم هذه الوحدة أربع صفحات فعلية: الكاز، الهيدروليك، الدهن، وC-Oil.', tone: 'from-amber-950 to-orange-800' },
  'fuel-page': { icon: Droplets, eyebrow: 'سجل الوقود والزيوت', description: 'الصفحة مسجلة داخل وحدة الوقود. نموذج الإدخال والتقارير والصلاحيات التفصيلية مؤجلة للجولة التالية.', tone: 'from-amber-950 to-yellow-700' },
  archive: { icon: Archive, eyebrow: 'السجلات المؤرشفة', description: 'تم إنشاء الأرشيف كوحدة مستقلة دون منح دور الكراج وصولاً إلى أرشيفات البوابات الأخرى.', tone: 'from-slate-950 to-slate-700' },
}

export default function CentralGarageUnitPage({ title, kind }: { title: string; kind: GarageUnitKind }) {
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
      <h2 className="mt-4 font-black text-slate-900">الصفحة جاهزة للبناء التفصيلي</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">المسار والشريط الجانبي والحماية النظامية مكتملة، ولم تُضف وظائف بيانات قبل تحديد متطلباتها.</p>
    </article>
  </section>
}
