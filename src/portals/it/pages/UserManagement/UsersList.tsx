import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUsers } from '@features/user-management'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import type { Role } from '@lib/constants/roles.constants'
import { formatRelative } from '@lib/utils/date.utils'
import { initials } from '@lib/utils/string.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/** وحدة إدارة المستخدمين — صفحة المستخدمون: عرض + بحث + ربط للأدوار */
export default function UsersList() {
  const { t } = useTranslation('sidebar')
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState<string | undefined>(undefined)

  // بحث مؤجل 300ms — يمنع ضرب الخادم بكل ضغطة
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim() || undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { data: users, isLoading, isError } = useUsers(query)

  /** تصدير CSV من البيانات الحقيقية المعروضة */
  const exportCsv = (): void => {
    if (!users || users.length === 0) return
    const headers = ['الاسم', 'البريد', 'الأدوار', 'الرقم الوظيفي', 'آخر دخول']
    const rows = users.map((u) => [
      u.employee_name ?? '',
      u.email ?? '',
      u.roles.join('; '),
      u.employee_number ?? '',
      u.last_sign_in_at ?? 'لم يدخل',
    ])
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const admins = users?.filter((u) =>
    u.roles.some((r) => ['hr_officer', 'department_manager', 'finance_officer', 'it_admin', 'super_admin'].includes(r)),
  ).length ?? 0
  const noRole = users?.filter((u) => u.roles.length === 0).length ?? 0

  return (
    <section aria-labelledby="users-title" className="space-y-4">
      {users && users.length > 0 && (
        <div className="grid grid-cols-3 gap-3" data-testid="users-stats">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">الإجمالي</p>
            <p className="text-base font-bold">{users.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">أصحاب أدوار إدارية</p>
            <p className="text-base font-bold text-brand-700">{admins}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">بلا أدوار</p>
            <p className={noRole > 0 ? 'text-base font-bold text-amber-600' : 'text-base font-bold text-emerald-600'}>{noRole}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="users-title" className="text-lg font-bold">{t('nav.users_list')}</h1>
          <p className="text-sm text-slate-500">
            {users ? `${users.length} مستخدم` : 'جارٍ العد…'} — إنشاء الحساب وتعيين الأدوار
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={!users || users.length === 0}
                  data-testid="export-csv">
            <Icon name="list" size={15} />
            تصدير CSV
          </Button>
          <Button onClick={() => navigate('/it/user-management/create')} data-testid="create-user-btn">
            <Icon name="user-plus" size={16} />
            {t('nav.create_user')}
          </Button>
        </div>
      </div>

      {/* البحث */}
      <div className="relative max-w-sm">
        <Icon name="search" size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="ابحث بالبريد أو الاسم…"
          dir="ltr"
          data-testid="users-search"
          className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 pe-9 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {isLoading && <LoadingSpinner label="جارٍ جلب المستخدمين…" />}

      {isError && (
        <EmptyState title="تعذر جلب المستخدمين" hint="تحقق من صلاحيتك ثم أعد المحاولة" />
      )}

      {users && users.length === 0 && (
        <EmptyState
          title="لا يوجد مستخدمون مطابقون"
          hint="أنشئ أول مستخدم من زر «إنشاء مستخدم»"
        />
      )}

      {users && users.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="users-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-start text-xs text-slate-500">
                <th className="px-4 py-3 text-start font-semibold">المستخدم</th>
                <th className="px-4 py-3 text-start font-semibold">الأدوار</th>
                <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">الموظف المرتبط</th>
                <th className="hidden px-4 py-3 text-start font-semibold lg:table-cell">آخر دخول</th>
                <th className="px-4 py-3 text-start font-semibold">إدارة الأدوار</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                        {initials(u.employee_name ?? u.email ?? '؟') || '؟'}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.employee_name ?? '—'}</span>
                        <span className="block truncate text-xs text-slate-500" dir="ltr">{u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-slate-400">بلا أدوار</span>}
                      {u.roles.map((role) => (
                        <RoleBadge key={role} role={role} />
                      ))}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {u.employee_number ? (
                      <span className="text-xs text-slate-600">
                        {u.employee_name} <span dir="ltr" className="text-slate-400">({u.employee_number})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">غير مرتبط بسجل موظف</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                    {u.last_sign_in_at ? formatRelative(u.last_sign_in_at) : 'لم يدخل بعد'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/it/user-management/${u.id}`)}
                      data-testid={`manage-${u.email?.split('@')[0] ?? u.id}`}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Icon name="shield" size={14} />
                      الأدوار
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}
