import { useNavigate } from 'react-router'
import { useAuth } from '@features/auth/hooks/useAuth'
import { resolvePortal } from '@router/portal.router'
import { Button } from '@components/ui'

/** 403 — محاولة دخول بوابة غير مصرح بها */
export default function ForbiddenPage() {
  const navigate = useNavigate()
  const { data: session } = useAuth()
  // العودة إلى البوابة الافتراضية (نفس منطق resolvePortal — super_admin → /it)
  const resolution = session ? resolvePortal(session.roles) : undefined
  const homePath = resolution?.type === 'single' ? resolution.path : '/login'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
      <p className="text-6xl font-black text-brand-600/20">403</p>
      <h1 className="text-xl font-bold">ليس لديك صلاحية الوصول لهذه الصفحة</h1>
      <p className="max-w-md text-sm text-slate-500">
        هذه البوابة محصورة بأدوار محددة. إن كنت تعتقد أن هذا خطأ، راجع إدارة الموارد البشرية.
      </p>
      <Button onClick={() => navigate(homePath, { replace: true })}>
        العودة إلى بوابتك
      </Button>
    </main>
  )
}
