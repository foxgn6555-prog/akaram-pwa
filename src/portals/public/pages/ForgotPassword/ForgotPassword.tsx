import { useEffect, useState } from 'react'
import { Headphones, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import PublicLoginSupport from '../Login/PublicLoginSupport'
import PublicBrandHeader from '../../components/PublicBrandHeader'

/** لا يوجد رابط استعادة ذاتي للموظفين؛ يفتح طلباً للدعم بعد التحقق الهاتفي. */
export default function ForgotPassword() {
  const navigate = useNavigate()
  const [supportOpen, setSupportOpen] = useState(false)
  useEffect(() => { document.title = 'جزيرة الأكارم — استعادة كلمة المرور' }, [])
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-950 p-5" dir="rtl">
      <PublicBrandHeader />
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-7 shadow-2xl sm:p-9">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-sky-100 text-sky-800"><Headphones size={25} /></div>
        <h1 className="text-center text-xl font-black text-slate-900">نسيت كلمة المرور؟</h1>
        <p className="mt-3 text-center text-sm leading-7 text-slate-600">لا يمكن استرجاع كلمة المرور القديمة أو تغييرها من رابط بريد. تواصل مع دعم تقنية المعلومات؛ سيتحقق الفريق من هويتك عبر رقم الهاتف المسجل ثم يضبط كلمة جديدة.</p>
        <button type="button" onClick={() => setSupportOpen(true)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 font-bold text-white"><Headphones size={17} /> فتح محادثة الدعم</button>
        <button type="button" onClick={() => navigate('/login')} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"><ArrowRight size={16} /> العودة إلى الدخول</button>
      </section>
      <PublicLoginSupport open={supportOpen} onClose={() => setSupportOpen(false)} />
    </main>
  )
}
