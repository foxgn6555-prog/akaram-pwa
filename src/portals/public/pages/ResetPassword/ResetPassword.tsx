import { useEffect, useState } from 'react'
import { Headphones, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import PublicLoginSupport from '../Login/PublicLoginSupport'
import PublicBrandHeader from '../../components/PublicBrandHeader'

/**
 * Reset links no longer expose a self-service password form for staff.
 * A reset can be performed by IT support only, after callback verification.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [supportOpen, setSupportOpen] = useState(false)
  useEffect(() => { document.title = 'جزيرة الأكارم — إعادة ضبط كلمة المرور' }, [])
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-950 p-5" dir="rtl">
      <PublicBrandHeader />
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-7 shadow-2xl sm:p-9">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Headphones size={25} /></div>
        <h1 className="text-center text-xl font-black text-slate-900">إعادة ضبط كلمة المرور عبر الدعم</h1>
        <p className="mt-3 text-center text-sm leading-7 text-slate-600">لا تُتاح للموظف إعادة ضبط كلمة المرور بنفسه. تواصل مع فريق تقنية المعلومات؛ سيتحقق من هويتك عبر اتصال إلى رقمك المسجل ثم يعيّن كلمة جديدة ويبلغك بها هاتفياً. لا يمكن استرجاع كلمة المرور القديمة.</p>
        <button type="button" onClick={() => setSupportOpen(true)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 font-bold text-white"><Headphones size={17} /> التواصل مع الدعم</button>
        <button type="button" onClick={() => navigate('/login')} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"><ArrowRight size={16} /> العودة إلى الدخول</button>
      </section>
      <PublicLoginSupport open={supportOpen} onClose={() => setSupportOpen(false)} />
    </main>
  )
}
