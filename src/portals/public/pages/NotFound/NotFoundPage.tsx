import { Link, useLocation, useNavigate } from 'react-router'
import { Compass, House, Undo2 } from 'lucide-react'
import { useAuth } from '@features/auth/hooks/useAuth'
import { resolvePortal } from '@router/portal.router'
import { Button } from '@components/ui'

/**
 * 00412 — صفحة 404 داخل الجلسة.
 * قبل الإصلاح: أي رابط غير مسجّل (داخل البوابة أو خارجها) كان يُعاد توجيهه صامتًا إلى
 * الصفحة الرئيسية (`*` → `/`)، فيظن المستخدم أن الرابط موجود، ويضيع المسار من شريط العنوان.
 * الآن: تُعرض صفحة «غير موجود» بهوية المنصة، **داخل قوقعة البوابة** (القائمة تبقى)،
 * مع المسار الخاطئ ظاهرًا ورابطين: العودة إلى البوابة، والرجوع للخلف.
 */
export default function NotFoundPage({ inPortal = false }: { inPortal?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session } = useAuth()
  const resolution = session ? resolvePortal(session.roles) : undefined
  const homePath = resolution?.type === 'single' ? resolution.path : '/login'

  return (
    <main
      data-testid="not-found-page"
      className={
        inPortal
          ? 'mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm'
          : 'flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-8 text-center'
      }
    >
      <p className="text-6xl font-black text-brand-600/20" aria-hidden>
        404
      </p>
      <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
        <Compass size={20} className="text-slate-400" aria-hidden />
        الصفحة غير موجودة
      </h1>
      <p className="max-w-md text-sm text-slate-500">
        الرابط الذي فتحته غير مسجَّل في المنصة. تأكد من الرابط، أو ارجع إلى القائمة الجانبية واختر الصفحة المطلوبة.
      </p>
      <p className="max-w-full break-all rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600" dir="ltr">
        {location.pathname}
        {location.search}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => navigate(-1)} variant="secondary" data-testid="not-found-back">
          <Undo2 size={16} className="me-1" />
          الصفحة السابقة
        </Button>
        {homePath === '/login' ? (
          <Link to="/login" replace className="text-sm font-bold text-brand-700 underline">
            تسجيل الدخول
          </Link>
        ) : (
          <Button onClick={() => navigate(homePath, { replace: true })} data-testid="not-found-home">
            <House size={16} className="me-1" />
            العودة إلى بوابتك
          </Button>
        )}
      </div>
    </main>
  )
}
