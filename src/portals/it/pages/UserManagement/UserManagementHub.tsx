import { UnitHub, type HubPageLink } from '@components/layout/UnitHub'
import { useUsers } from '@features/user-management'
import { useDepartments } from '@features/departments'
import { ROLE_LABELS, type Role } from '@lib/constants/roles.constants'
import { initials } from '@lib/utils/string.utils'
import { formatRelative } from '@lib/utils/date.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

/** صفحة وحدة إدارة المستخدمين — روابط صفحاتها + تقاريرها المجمعة */
const PAGES: readonly HubPageLink[] = [
  { path: '/it/user-management/list', label: 'المستخدمون', hint: 'قائمة كل الحسابات والأدوار', icon: 'users' },
  { path: '/it/user-management/create', label: 'إنشاء مستخدم', hint: 'حساب + دور + ربط موظف', icon: 'user-plus' },
  { path: '/it/user-management/departments', label: 'الهيكل التنظيمي', hint: 'الأقسام والأقسام الفرعية', icon: 'layout-grid' },
]

export default function UserManagementHub() {
  const { data: users, isLoading } = useUsers()
  const { data: departments } = useDepartments()

  const total = users?.length ?? 0
  const admins = users?.filter((u) =>
    u.roles.some((r) => ['hr_officer', 'department_manager', 'finance_officer', 'it_admin', 'super_admin'].includes(r)),
  ).length ?? 0
  const noRole = users?.filter((u) => u.roles.length === 0).length ?? 0
  const banned = users?.filter((u) => !!u.banned_until).length ?? 0
  const recent = [...(users ?? [])]
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 5)

  const roleCounts = new Map<string, number>()
  for (const u of users ?? []) {
    for (const r of u.roles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)
  }

  return (
    <UnitHub
      title="وحدة إدارة المستخدمين"
      description="إنشاء الحسابات وتعيين الأدوار وإدارة الهيكل — كل صفحات الوحدة أدناه"
      pages={PAGES}
      testId="hub-user-management"
    >
      {isLoading ? (
        <LoadingSpinner label="جارٍ تجهيز التقارير…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* تقرير: أرقام الوحدة */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="um-stats">
            <MiniStat label="إجمالي الحسابات" value={fmtNum(total)} />
            <MiniStat label="أصحاب أدوار إدارية" value={fmtNum(admins)} accent />
            <MiniStat label="بلا أدوار" value={fmtNum(noRole)} danger={noRole > 0} />
            <MiniStat label="حسابات معطّلة" value={fmtNum(banned)} danger={banned > 0} />
          </div>

          {/* تقرير: توزيع الأدوار */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-bold text-slate-500">توزيع الأدوار</h3>
            {roleCounts.size === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">لا مستخدمين بعد</p>
            ) : (
              <ul className="space-y-1.5" data-testid="um-roles">
                {[...roleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                  <li key={role} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{ROLE_LABELS[role as Role] ?? role}</span>
                    <span className="font-bold text-slate-800">{fmtNum(count)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              الأقسام المسجلة: {departments?.length ?? 0}
            </p>
          </div>

          {/* تقرير: أحدث الحسابات */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h3 className="mb-3 text-xs font-bold text-slate-500">أحدث الحسابات المنشأة</h3>
            {recent.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">لا حسابات بعد — ابدأ من «إنشاء مستخدم»</p>
            ) : (
              <ul className="divide-y divide-slate-50" data-testid="um-recent">
                {recent.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 py-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                      {initials(u.employee_name ?? u.email ?? '؟') || '؟'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{u.employee_name ?? '—'}</span>
                      <span className="block truncate text-[11px] text-slate-400" dir="ltr">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(u.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </UnitHub>
  )
}

function MiniStat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${danger ? 'text-amber-600' : accent ? 'text-brand-700' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  )
}
