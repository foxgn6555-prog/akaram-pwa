import { ArrowRight, Camera, CheckCircle2, Download, ImagePlus, MapPin, PlayCircle, Printer, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const steps = [
  { icon: PlayCircle, title: 'ابدأ التذكرة', text: 'افتح التذكرة المسندة إليك واضغط «بدء معالجة التذكرة». تُبدأ جميع مواقع البريد المسندة إليك كوحدة واحدة.' },
  { icon: Download, title: 'راجع صور قبل', text: 'راجع كل صورة وكودها والمحلة والزقاق ونوع التلكؤ. بيانات الموقع للقراءة فقط ولا يجوز تعديلها أو إدخال GPS.' },
  { icon: MapPin, title: 'اذهب إلى الموقع الصحيح', text: 'استخدم المحلة والزقاق والعلامات الظاهرة في صورة قبل للوصول. إذا كانت البيانات خاطئة أبلغ موظف الشكاوى ولا تغيّرها بنفسك.' },
  { icon: Camera, title: 'التقط صورة بعد', text: 'استخدم كاميرا التطبيق بعد المعالجة، أو اختر JPG/PNG/WebP محفوظة. اجعل الصورة واضحة وتُظهر الموقع كاملاً وبزاوية مفيدة للمقارنة.' },
  { icon: ImagePlus, title: 'طابق الصور واحداً لواحد', text: 'للرفع الجماعي اختر عدداً مطابقاً تماماً لصور التلكؤ. راجع الترتيب، واستخدم السحب على الدسكتوب أو أزرار السابق/التالي على الموبايل.' },
  { icon: ShieldCheck, title: 'راجع قبل الإرسال', text: 'يجب أن يكون أمام كل صورة قبل صورة بعد واحدة صحيحة. الملف ذو النوع المزيف أو الحجم غير المقبول سيُرفض قبل الرفع.' },
  { icon: CheckCircle2, title: 'أرسل التذكرة كاملة', text: 'أرسل جميع المعالجات للتدقيق بعملية واحدة. لا تعتبر المهمة معتمدة حتى يراجعها موظف الشكاوى.' },
]

export default function ComplaintsGuidancePage() {
  return <section className="space-y-6" dir="rtl">
    <ExecPageHeader icon="file-text" iconNode={<ImagePlus size={22} className="text-[#f3d06a]" />} title="دليل مسؤول القسم لمعالجة الشكاوى" subtitle="من استلام التذكرة إلى مطابقة كل صورة قبل بصورة معالجة وإرسالها للتدقيق." actions={<><Link to="/manager/complaints" className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/25 hover:bg-white/20"><ArrowRight size={15} />العودة إلى التذاكر</Link><button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-[#0b3d6b] shadow hover:bg-blue-50"><Printer size={17} />طباعة الدليل / حفظ PDF</button></>} />

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{steps.map((step, index) => <article key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="absolute left-4 top-4 text-4xl font-black text-slate-100">{index + 1}</span><span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><step.icon size={22} /></span><h2 className="mt-4 font-black text-slate-900">{step.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{step.text}</p></article>)}</div>

    <div className="grid gap-4 md:grid-cols-2">
      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-900">قواعد الصورة المقبولة</h2><ul className="mt-3 space-y-2 text-sm leading-7 text-amber-900"><li>• صورة حديثة وواضحة وليست لقطة شاشة أو صورة قديمة.</li><li>• تُظهر الموقع بعد المعالجة كاملاً.</li><li>• JPG أو PNG أو WebP وبحد أقصى 25MB للصورة.</li><li>• لا ترفع صورة تخص موقعاً أو تذكرة أخرى.</li></ul></aside>
      <aside className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-center gap-2 text-red-900"><ShieldAlert /><h2 className="font-black">متى لا ترسل التذكرة؟</h2></div><ul className="mt-3 space-y-2 text-sm leading-7 text-red-900"><li>• إذا نقصت صورة معالجة لأي تلكؤ.</li><li>• إذا لم تتطابق صورة قبل وبعد.</li><li>• إذا كانت بيانات المحلة أو الزقاق غير صحيحة.</li><li>• إذا ظهرت رسالة خطأ؛ أصلح السبب ولا تكرر الرفع عشوائياً.</li></ul></aside>
    </div>
  </section>
}
