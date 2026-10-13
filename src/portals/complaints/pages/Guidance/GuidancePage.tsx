import { Archive, ArrowRight, CheckCircle2, FileImage, FileText, Inbox, LayoutTemplate, Mail, Printer, Send, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const stages = [
  { icon: Inbox, title: '1. استلام البريد', text: 'اختر تاريخ بغداد والقاطع الصحيح ثم افتح بريداً واحداً. راجع المرسل والموضوع والنص والعدد الكامل للمرفقات قبل بدء الفرز.' },
  { icon: FileImage, title: '2. تجهيز جميع الصور', text: 'كل صورة واردة هي صورة «قبل». حوّل كل صفحات PDF، وراجع الكود الفريد وتحذير البصمة المكررة. لا تعتمد على اسم الملف وحده.' },
  { icon: FileText, title: '3. إدخال بيانات الموقع', text: 'اكتب المحلة والزقاق ونوع التلكؤ لكل صورة. المركز البلدي يُملأ من القاطع تلقائياً، وOCR اقتراح يحتاج مراجعة بشرية.' },
  { icon: Users, title: '4. إنشاء التذاكر والإسناد', text: 'أنشئ تذكرة لكل صورة ثم وزّع صور البريد على مسؤول واحد أو عدة مسؤولين. راجع المجموعة بصيغة «البريد + المسؤول» قبل الإرسال.' },
  { icon: ShieldCheck, title: '5. تدقيق المعالجة', text: 'راجع كل زوج قبل/بعد بصرياً. لا يمكن الاعتماد دون صورة معالجة فعالة. صحح الموقع أو استبدل الصورة بسبب مسجل، وأعد التذكرة بملاحظة واضحة عند الخطأ.' },
  { icon: LayoutTemplate, title: '6. التقرير وPowerPoint', text: 'أنشئ تقرير البريد أو التقرير اليومي، راجع الغلاف والجدول ومجموعات المسؤولين وكل الشرائح، ثم نزّل النسخة المولدة وأكد مراجعتها قبل الاعتماد.' },
  { icon: Mail, title: '7. الإرسال والتسليم', text: 'أرسل إلى بريد الجهة المرسلة وأضف المستلمين المصرح لهم فقط. تابع سجل التسليم حتى delivered، واستخدم إعادة المحاولة عند الفشل.' },
  { icon: Archive, title: '8. الأرشفة والحذف', text: 'الأرشفة تحفظ البيانات وسجل التدقيق. طلب الحذف النهائي يبدأ من الأرشيف فقط ويتطلب موافقة وتوقيع مدير النظام.' },
]

const mistakes = [
  'فتح أكثر من يوم أو بريد أثناء الفرز وخلط الصور بين المجلدات.',
  'قبول نتيجة OCR دون مطابقتها مع الصورة والنص الأصلي.',
  'اعتماد زوج قبل/بعد لموقعين مختلفين أو بصورة غير واضحة.',
  'إرسال التقرير قبل تنزيل PowerPoint ومراجعة كل الشرائح والمستلمين.',
]

export default function GuidancePage() {
  return <section className="space-y-6" dir="rtl">
    <ExecPageHeader icon="file-text" title="دليل موظف الشكاوى" subtitle="مرجع عملي من وصول البريد إلى اعتماد التقرير وتسليمه، مع نقاط رقابة تمنع الخلط والتكرار والاعتماد الناقص." actions={<>
      <Link to="/complaints" className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/25 hover:bg-white/20"><ArrowRight size={15} />العودة إلى الرئيسية</Link>
      <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-[#0b3d6b] shadow hover:bg-blue-50"><Printer size={15} />طباعة الدليل / حفظ PDF</button>
    </>} />
    <p className="hidden text-xs font-bold text-slate-500 print:block">جزيرة الأكارم · بوابة الشكاوى — دليل موظف الشكاوى</p>

    <div className="relative grid gap-4 lg:grid-cols-2">{stages.map(stage => <article key={stage.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><stage.icon size={23} /></span><div><h2 className="font-black text-slate-900">{stage.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{stage.text}</p></div></article>)}</div>

    <section className="grid gap-4 md:grid-cols-3">
      <aside className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><CheckCircle2 /><h2 className="mt-3 font-black">قبل الاعتماد</h2><ul className="mt-2 space-y-2 text-sm leading-6"><li>• صورة قبل وصورة بعد فعالتان.</li><li>• المحلة والزقاق والنوع صحيحة.</li><li>• كل أزواج التذكرة لنفس البريد والمسؤول.</li></ul></aside>
      <aside className="rounded-2xl bg-blue-50 p-5 text-blue-900"><Send /><h2 className="mt-3 font-black">قبل الإرسال</h2><ul className="mt-2 space-y-2 text-sm leading-6"><li>• نُزّل PowerPoint وراجع بالكامل.</li><li>• البريد الأصلي والمستلمون صحيحون.</li><li>• حالة التقرير معتمد.</li></ul></aside>
      <aside className="rounded-2xl bg-slate-100 p-5 text-slate-800"><Archive /><h2 className="mt-3 font-black">بعد التسليم</h2><ul className="mt-2 space-y-2 text-sm leading-6"><li>• تحقق من delivered في السجل.</li><li>• لا تحذف البيانات النشطة مباشرة.</li><li>• استخدم الأرشيف والطلب الرسمي.</li></ul></aside>
    </section>

    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-900"><ShieldAlert /><h2 className="font-black">أخطاء يجب إيقاف العمل عند اكتشافها</h2></div><ul className="mt-4 grid gap-3 text-sm leading-7 text-amber-950 md:grid-cols-2">{mistakes.map(value => <li key={value} className="rounded-xl bg-white/70 p-3">• {value}</li>)}</ul></section>
  </section>
}
