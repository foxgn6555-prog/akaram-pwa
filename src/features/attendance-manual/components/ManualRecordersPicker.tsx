import { useMemo, useState } from 'react'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useUsers } from '@features/user-management'
import { ROLE_LABELS, type Role } from '@lib/constants/roles.constants'
import { PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'
import { MANUAL_RECORDERS_LIMIT, type ManualActivationRecorder } from '@sdk/attendance-manual.sdk'
import type { PlatformUser } from '@sdk/users.sdk'
import { Banner, fieldCls } from './shared'

export interface ManualRecorderOption {
  id: string
  name: string
  email: string | null
  roles: string[]
  hasPortalRole: boolean
  isOpsRoom: boolean
}

const roleLabels = ROLE_LABELS as Readonly<Record<string, string>>

function optionForAccount(user: { id: string; name: string; email: string | null; roles: string[] }, portalId: string | null): ManualRecorderOption {
  const portal = PORTAL_DEFINITIONS.find((definition) => definition.id === portalId)
  const isOpsRoom = user.roles.includes('ops_room')
  return {
    ...user,
    hasPortalRole: portal?.allowedRoles.some((role) => user.roles.includes(role)) ?? false,
    isOpsRoom,
  }
}

export function recorderOptionFromUser(user: PlatformUser, portalId: string | null): ManualRecorderOption {
  return optionForAccount({
    id: user.id,
    name: user.employee_name || user.email || user.id.slice(0, 8),
    email: user.email,
    roles: user.roles ?? [],
  }, portalId)
}

export function recorderOptionFromGrant(user: ManualActivationRecorder, portalId: string | null): ManualRecorderOption {
  return optionForAccount({
    id: user.user_id,
    name: user.name || user.email || user.user_id.slice(0, 8),
    email: user.email,
    roles: user.roles ?? [],
  }, portalId)
}

export function ManualRecordersPicker({
  portalId,
  accounts,
  onChange,
  disabled = false,
}: {
  portalId: string | null
  accounts: readonly ManualRecorderOption[]
  onChange: (accounts: ManualRecorderOption[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const search = query.trim()
  const canSearch = !!portalId && search.length >= 2 && !disabled
  const users = useUsers(search || undefined, canSearch)
  const options = useMemo(() => (users.data ?? []).slice(0, 40).map((user) => recorderOptionFromUser(user, portalId)), [users.data, portalId])
  const selectedIds = useMemo(() => new Set(accounts.map((user) => user.id)), [accounts])
  const canAddMore = accounts.length < MANUAL_RECORDERS_LIMIT

  const toggle = (account: ManualRecorderOption) => {
    if (disabled || !portalId) return
    if (selectedIds.has(account.id)) {
      onChange(accounts.filter((user) => user.id !== account.id))
      return
    }
    if ((!account.hasPortalRole && !account.isOpsRoom) || !canAddMore) return
    onChange([...accounts, account])
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="am-recorders-picker">
      <div>
        <p className="text-xs font-bold text-slate-700">حسابات التسجيل الإضافية ({accounts.length}/{MANUAL_RECORDERS_LIMIT})</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          اختر حتى {MANUAL_RECORDERS_LIMIT} حسابات موجودة. يلزم أن يحمل الحساب دور بوابة التفعيل أولاً؛ أَسنِده من إدارة المستخدمين ثم اختره هنا.
          غرفة العمليات مخوّلة افتراضياً، ويمكن اختيار حساباتها أيضاً لتوثيقها ضمن القائمة.
        </p>
      </div>

      {accounts.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="الحسابات المختارة" data-testid="am-recorder-selected">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 ring-1 ring-brand-200">
              <span>{account.name}</span>
              {account.isOpsRoom
                ? <span className="font-normal text-sky-800">(غرفة العمليات — صلاحية افتراضية، موثّقة هنا)</span>
                : !account.hasPortalRole && <span className="font-normal text-amber-800">(يلزم إسناد دور البوابة)</span>}
              {!disabled && <button type="button" className="ms-1 min-h-6 min-w-6 rounded-full hover:bg-brand-100" aria-label={`إزالة ${account.name}`} onClick={() => onChange(accounts.filter((user) => user.id !== account.id))}>×</button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-[11px] text-slate-500" data-testid="am-recorder-none">لا حسابات إضافية محددة.</p>}

      {accounts.some((account) => !account.isOpsRoom && !account.hasPortalRole) && (
        <Banner tone="amber" testId="am-recorder-role-warning">
          أُزيل دور بوابة التفعيل عن حساب محدد؛ أَسنِد الدور المناسب أو أزل الحساب من القائمة قبل الحفظ.
        </Banner>
      )}
      {!canAddMore && <p className="text-[11px] font-bold text-amber-800" data-testid="am-recorder-limit">اكتمل الحد الأقصى ({MANUAL_RECORDERS_LIMIT})؛ أزل حساباً لإضافة آخر.</p>}

      <label className="block text-[11px] text-slate-600">ابحث عن حساب موجود في المنصة
        <input className={fieldCls} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم الموظف أو البريد الإلكتروني" aria-label="البحث عن حساب تسجيل" data-testid="am-recorder-search" disabled={disabled || !portalId} />
      </label>

      {!portalId ? (
        <p className="text-[11px] text-slate-500" data-testid="am-recorder-choose-portal">اختر بوابة التفعيل أولاً.</p>
      ) : search.length < 2 ? (
        <p className="text-[11px] text-slate-500" data-testid="am-recorder-search-hint">اكتب حرفين على الأقل للبحث عن حسابات المنصة.</p>
      ) : users.isLoading ? <LoadingSpinner /> : users.isError ? (
        <Banner tone="rose" role="alert" testId="am-recorder-error">تعذّر تحميل الحسابات — حدّث الصفحة أو حاول مجدداً.</Banner>
      ) : options.length === 0 ? (
        <p className="text-[11px] text-slate-500" data-testid="am-recorder-empty">لا توجد حسابات مطابقة.</p>
      ) : (
        <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2" aria-label="نتائج الحسابات" data-testid="am-recorder-options">
          {options.map((account) => {
            const checked = selectedIds.has(account.id)
            const allowed = account.isOpsRoom || account.hasPortalRole
            const optionDisabled = disabled || !allowed || (!checked && !canAddMore)
            const roleSummary = account.roles.map((role) => roleLabels[role as Role] ?? role).join('، ') || 'بلا دور'
            const hint = account.isOpsRoom
              ? 'مخوّل افتراضياً؛ يمكن توثيقه'
              : !account.hasPortalRole
                ? 'يلزم إسناد دور البوابة أولاً'
                : roleSummary
            return (
              <li key={account.id}>
                <label className={`flex min-h-10 items-center gap-2 rounded-lg px-2 py-1 text-xs ${optionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={checked} disabled={optionDisabled} onChange={() => toggle(account)} data-testid={`am-recorder-option-${account.id}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-slate-800">{account.name}</span>
                    <span className="block truncate text-[10px] text-slate-500" dir="ltr">{account.email ?? account.id}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">{hint}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
