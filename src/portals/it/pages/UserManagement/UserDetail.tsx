import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useUserFromList, useSetUserRole, ASSIGNABLE_ROLES } from '@features/user-management'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import type { Role } from '@lib/constants/roles.constants'
import { formatDate } from '@lib/utils/date.utils'
import { initials } from '@lib/utils/string.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/** تفاصيل المستخدم + منح/سحب الأدوار (الخادم يمنع تعديل الذات ويؤرشف) */
export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { data: user, isLoading } = useUserFromList(userId)
  const setUserRole = useSetUserRole()
  const [confirmRole, setConfirmRole] = useState<Role | null>(null)

  if (isLoading) return <LoadingSpinner label="جارٍ جلب المستخدم…" />
  if (!user) {
    return (
      <EmptyState title="المستخدم غير موجود" hint="ربما حُذف أو تغيّر الرابط" />
    )
  }

  const hasRole = (role: Role): boolean => user.roles.includes(role)
  const toggle = (role: Role): void => {
    if (!userId) return
    // تأكيد إضافي للمنح العالي (super_admin)
    if (role === 'super_admin' && !hasRole(role)) {
      setConfirmRole(role)
      return
    }
    setUserRole.mutate({ userId, role, grant: !hasRole(role) })
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <button onClick={() => navigate('/it/user-management/list')}
        className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
        <Icon name="chevron-right" size={15} /> عودة للقائمة
      </button>

      {/* بطاقة المستخدم */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">
          {initials(user.employee_name ?? user.email ?? '؟') || '؟'}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{user.employee_name ?? 'بلا سجل موظف'}</h1>
          <p className="truncate text-sm text-slate-500" dir="ltr">{user.email}</p>
          <p className="mt-1 text-xs text-slate-400">
            أُنشئ: {formatDate(user.created_at)} · آخر دخول: {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'لم يدخل بعد'}
          </p>
        </div>
      </div>

      {/* الأدوار */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-bold">أدوار البوابات</h2>
        <p className="mb-4 text-xs text-slate-500">
          المنح/السحب فوري ومؤرشف باسمك — لا يمكنك تعديل أدوارك بنفسك (حماية خادمية)
        </p>
        <ul className="space-y-2" data-testid="roles-list">
          {ASSIGNABLE_ROLES.map((role) => {
            const granted = hasRole(role)
            return (
              <li key={role}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={granted ? 'text-emerald-600' : 'text-slate-300'}>
                    <Icon name="shield" size={17} />
                  </span>
                  <span className="text-sm">{ROLE_LABELS[role]}</span>
                  {granted && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      ممنوح
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggle(role)}
                  disabled={setUserRole.isPending}
                  data-testid={`role-toggle-${role}`}
                  className={granted
                    ? 'rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50'
                    : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50'}
                >
                  {granted ? 'سحب الدور' : 'منح الدور'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* تأكيد منح الإدارة العليا */}
      {confirmRole && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-bold">منح دور الإدارة العليا؟</h3>
            <p className="mb-5 text-sm text-slate-500">
              هذا الدور يملك كل الصلاحيات. سيُسجَّل المنح باسمك في سجل التدقيق.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (userId) setUserRole.mutate({ userId, role: 'super_admin', grant: true })
                  setConfirmRole(null)
                }}
                data-testid="confirm-super-admin"
              >
                تأكيد المنح
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRole(null)}>تراجع</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

