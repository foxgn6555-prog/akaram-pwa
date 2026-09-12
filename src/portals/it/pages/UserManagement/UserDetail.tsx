import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import clsx from 'clsx'
import {
  useUserFromList,
  useSetUserRole,
  useUpdateEmployeeProfile,
  useSetUserBanned,
  useResetUserPassword,
  useUpdateUserEmail,
  updateProfileSchema,
  ASSIGNABLE_ROLES,
  type UpdateProfileFormInput,
} from '@features/user-management'
import { useAuth } from '@features/auth/hooks/useAuth'
import { useDepartments } from '@features/departments'
import { useManagerProfileForUser, useSaveManagerProfile, useSectors } from '@features/sector'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import type { Role } from '@lib/constants/roles.constants'
import { formatDate } from '@lib/utils/date.utils'
import { initials } from '@lib/utils/string.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/**
 * تفاصيل المستخدم — إدارة شاملة:
 *  ① بطاقة الحساب + حالة التفعيل
 *  ② تعديل بيانات الموظف المرتبط (RPC set_employee_profile — ينشئ السجل إن لم يوجد)
 *  ③ إدارة الحساب: تعطيل/تفعيل · إعادة تعيين كلمة مرور · تغيير البريد (admin-users)
 *  ④ الأدوار (الخادم يمنع تعديل الذات ويؤرشف كل تغيير)
 * حماية الذات: الخادم يرفض العمليات الحساسة على حسابك — والواجهة تعطّلها وقائياً
 */
export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { data: session } = useAuth()
  const { data: departments } = useDepartments()
  const { data: user, isLoading } = useUserFromList(userId)
  const setUserRole = useSetUserRole()
  const updateProfile = useUpdateEmployeeProfile()
  const setBanned = useSetUserBanned()
  const resetPassword = useResetUserPassword()
  const updateEmail = useUpdateUserEmail()
  const managerProfile = useManagerProfileForUser(userId ?? '')
  const saveManagerProfile = useSaveManagerProfile()
  const { data: sectors = [] } = useSectors()

  const [managerShift, setManagerShift] = useState<'morning' | 'evening' | 'night'>('morning')
  const [managerSectors, setManagerSectors] = useState<number[]>([])
  const [managerProfileReady, setManagerProfileReady] = useState(false)
  const [confirmRole, setConfirmRole] = useState<Role | null>(null)
  const [confirmBan, setConfirmBan] = useState<boolean | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  const isSelf = !!userId && userId === session?.id
  const isBanned = !!user?.banned_until

  // نموذج تعديل بيانات الموظف — يُملأ من بيانات المستخدم عند وصولها
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileFormInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      job_title: '',
      department_id: '',
      employee_number: '',
    },
  })

  useEffect(() => {
    if (user) {
      reset({
        full_name: user.employee_name ?? '',
        phone: user.phone ?? '',
        job_title: user.job_title ?? '',
        department_id: user.department_id ?? '',
        employee_number: user.employee_number ?? '',
      })
    }
  }, [user, reset])

  useEffect(() => {
    setManagerProfileReady(false)
  }, [userId])

  useEffect(() => {
    if (!managerProfile.isLoading && !managerProfileReady) {
      setManagerShift(managerProfile.data?.shift ?? 'morning')
      setManagerSectors(managerProfile.data?.sectors ?? [])
      setManagerProfileReady(true)
    }
  }, [managerProfile.data, managerProfile.isLoading, managerProfileReady])

  if (isLoading) return <LoadingSpinner label="جارٍ جلب المستخدم…" />
  if (!user) {
    return <EmptyState title="المستخدم غير موجود" hint="ربما حُذف أو تغيّر الرابط" />
  }

  const hasRole = (role: Role): boolean => user.roles.includes(role)

  const toggle = (role: Role): void => {
    if (!userId || isSelf) return
    // تأكيد إضافي للمنح العالي (super_admin)
    if (role === 'super_admin' && !hasRole(role)) {
      setConfirmRole(role)
      return
    }
    setUserRole.mutate({ userId, role, grant: !hasRole(role) })
  }

  const saveProfile = (data: UpdateProfileFormInput): void => {
    if (!userId) return
    updateProfile.mutate({
      user_id: userId,
      full_name: data.full_name,
      phone: data.phone || null,
      job_title: data.job_title || null,
      department_id: data.department_id || null,
      employee_number: data.employee_number || null,
    })
  }

  const submitBan = (): void => {
    if (!userId || confirmBan === null) return
    setBanned.mutate({ userId, banned: confirmBan })
    setConfirmBan(null)
  }

  const submitResetPassword = (): void => {
    if (!userId) return
    resetPassword.mutate({ userId, password: newPassword }, { onSuccess: () => setNewPassword('') })
  }

  const submitEmail = (): void => {
    if (!userId) return
    updateEmail.mutate({ userId, email: newEmail.trim() }, { onSuccess: () => setNewEmail('') })
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <button
        onClick={() => navigate('/it/user-management/list')}
        className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
      >
        <Icon name="chevron-right" size={15} /> عودة للقائمة
      </button>

      {/* ① بطاقة المستخدم */}
      <div
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        data-testid="user-card"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">
            {initials(user.employee_name ?? user.email ?? '؟') || '؟'}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{user.employee_name ?? 'بلا سجل موظف'}</h1>
            <p className="truncate text-sm text-slate-500" dir="ltr">
              {user.email}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              أُنشئ: {formatDate(user.created_at)} · آخر دخول:{' '}
              {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'لم يدخل بعد'}
            </p>
          </div>
          {isBanned ? (
            <span
              className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
              data-testid="user-banned-badge"
            >
              معطّل
            </span>
          ) : (
            <span
              className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
              data-testid="user-active-badge"
            >
              مفعّل
            </span>
          )}
        </div>
        {(user.department_name || user.job_title) && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {user.job_title && <span className="me-3">{user.job_title}</span>}
            {user.department_name && <span>القسم: {user.department_name}</span>}
          </p>
        )}
      </div>

      {isSelf && (
        <p
          role="note"
          className="rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-800"
          data-testid="self-notice"
        >
          ℹ️ هذا حسابك — الخادم يمنع تعديل الأدوار والبريد وتعطيل حسابك بنفسك.
        </p>
      )}

      {/* ② تعديل بيانات الموظف */}
      <form
        onSubmit={(e) => void handleSubmit(saveProfile)(e)}
        noValidate
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        data-testid="profile-form"
      >
        <div>
          <h2 className="text-sm font-bold">تعديل بيانات الموظف</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {user.employee_id
              ? 'تحديث سجل الموظف المرتبط — كل تعديل يُدقَّن باسمك'
              : 'لا سجل موظف مرتبط — الحفظ سينشئه ويربطه بالحساب'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الاسم الكامل" htmlFor="ud-name" error={errors.full_name?.message}>
            <input
              id="ud-name"
              autoComplete="off"
              placeholder="مثال: أحمد علي حسن"
              className={inputClass(!!errors.full_name)}
              {...register('full_name')}
            />
          </Field>
          <Field label="الرقم الوظيفي" htmlFor="ud-empno" error={errors.employee_number?.message}>
            <input
              id="ud-empno"
              dir="ltr"
              placeholder="EMP-014"
              className={inputClass(!!errors.employee_number)}
              {...register('employee_number')}
            />
          </Field>
          <Field label="رقم الهاتف" htmlFor="ud-phone" error={errors.phone?.message}>
            <input
              id="ud-phone"
              dir="ltr"
              placeholder="07701234567"
              className={inputClass(!!errors.phone)}
              {...register('phone')}
            />
          </Field>
          <Field label="القسم" htmlFor="ud-dept" error={errors.department_id?.message}>
            <select
              id="ud-dept"
              className={inputClass(!!errors.department_id)}
              {...register('department_id')}
            >
              <option value="">— بدون قسم —</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="المسمى الوظيفي" htmlFor="ud-title" error={errors.job_title?.message}>
          <input
            id="ud-title"
            placeholder="مثال: موظف إداري"
            className={inputClass(!!errors.job_title)}
            {...register('job_title')}
          />
        </Field>

        <div className="flex gap-3">
          <Button
            type="submit"
            isLoading={updateProfile.isPending}
            disabled={!isDirty}
            data-testid="save-profile"
          >
            حفظ التعديلات
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => reset()}
            disabled={!isDirty || updateProfile.isPending}
          >
            تراجع
          </Button>
        </div>
      </form>

      {/* ③ إدارة الحساب */}
      <div
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        data-testid="account-admin"
      >
        <div>
          <h2 className="text-sm font-bold">إدارة الحساب</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            عمليات الحساب عبر خدمة الإدارة — كل عملية تُسجَّل في سجل التدقيق
          </p>
        </div>

        {/* تعطيل / تفعيل */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{isBanned ? 'الحساب معطّل' : 'الحساب مفعّل'}</p>
            <p className="text-xs text-slate-500">
              {isBanned ? 'لا يستطيع صاحبه الدخول حتى التفعيل' : 'يمكن لصاحبه الدخول بشكل طبيعي'}
            </p>
          </div>
          <Button
            type="button"
            variant={isBanned ? 'secondary' : 'danger'}
            onClick={() => setConfirmBan(!isBanned)}
            disabled={isSelf || setBanned.isPending}
            data-testid="toggle-ban"
          >
            <Icon name={isBanned ? 'check-square' : 'lock'} size={15} />
            {isBanned ? 'تفعيل الحساب' : 'تعطيل الحساب'}
          </Button>
        </div>

        {/* إعادة تعيين كلمة المرور */}
        <div className="rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">إعادة تعيين كلمة المرور</p>
          <p className="mb-2 text-xs text-slate-500">
            عيّن كلمة مرور جديدة (8 أحرف فأكثر · حرف · رقم) وشاركها بقناة آمنة
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="كلمة المرور الجديدة"
                autoComplete="new-password"
                data-testid="new-password"
                className="h-10 w-full rounded-xl border border-slate-300 px-3 pe-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'إخفاء' : 'إظهار'}
                className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-slate-400"
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
              </button>
            </div>
            <Button
              type="button"
              onClick={submitResetPassword}
              disabled={resetPassword.isPending || newPassword.length < 8}
              data-testid="reset-password-btn"
            >
              تعيين كلمة المرور
            </Button>
          </div>
        </div>

        {/* تغيير البريد الإلكتروني */}
        <div className="rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold">تغيير البريد الإلكتروني</p>
          <p className="mb-2 text-xs text-slate-500">
            سيصبح البريد الجديد وسيلة الدخول الجديدة للمستخدم
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              dir="ltr"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@akram.iq"
              data-testid="new-email"
              className="h-10 min-w-56 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <Button
              type="button"
              onClick={submitEmail}
              disabled={updateEmail.isPending || isSelf || !newEmail.includes('@')}
              data-testid="update-email-btn"
            >
              تغيير البريد
            </Button>
          </div>
        </div>
      </div>
      {/*__PART4__*/}

      {hasRole('department_manager') && (
        <section
          className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm"
          aria-label="إسناد مناطق مسؤول القسم"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">مناطق مسؤول القسم</h2>
              <p className="mt-1 text-xs text-slate-500">
                هذا الإسناد هو الذي يربط السائقين والآليات بالمسؤول تلقائياً. وجود الحساب أو الدور
                وحده لا يكفي دون تحديد المناطق.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${managerSectors.length ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
            >
              {managerSectors.length
                ? `${managerSectors.length} منطقة مسندة`
                : 'يحتاج إعداد المناطق'}
            </span>
          </div>
          <label className="mt-4 block text-xs font-bold">
            الشفت الإداري
            <select
              aria-label="شفت مسؤول القسم"
              value={managerShift}
              onChange={(event) => setManagerShift(event.target.value as typeof managerShift)}
              className="mt-1 block h-11 w-full max-w-xs rounded-xl border px-3"
            >
              <option value="morning">صباحي</option>
              <option value="evening">مسائي</option>
              <option value="night">ليلي</option>
            </select>
          </label>
          <p className="mt-2 text-[10px] text-slate-500">
            الشفت ينظم أعمال المسؤول، لكن الآليات تُنسب إليه حسب المنطقة في جميع شفتات السائقين.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(['karrada', 'zaafaraniya'] as const).map((parent) => {
              const rows = sectors.filter((sector) => sector.parent_sector === parent)
              const allSelected =
                rows.length > 0 && rows.every((sector) => managerSectors.includes(sector.id))
              return (
                <div key={parent} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <b className="text-xs">
                      {parent === 'karrada' ? 'قاطع الكرادة' : 'قاطع الزعفرانية'}
                    </b>
                    <button
                      type="button"
                      onClick={() =>
                        setManagerSectors((current) =>
                          allSelected
                            ? current.filter((id) => !rows.some((sector) => sector.id === id))
                            : [...new Set([...current, ...rows.map((sector) => sector.id)])],
                        )
                      }
                      className="text-[10px] font-black text-cyan-700"
                    >
                      {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {rows.map((sector) => (
                      <label
                        key={sector.id}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border bg-white p-3 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={managerSectors.includes(sector.id)}
                          onChange={() =>
                            setManagerSectors((current) =>
                              current.includes(sector.id)
                                ? current.filter((id) => id !== sector.id)
                                : [...current, sector.id].sort((a, b) => a - b),
                            )
                          }
                        />
                        {sector.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            disabled={!userId || managerSectors.length === 0 || saveManagerProfile.isPending}
            onClick={() =>
              userId &&
              saveManagerProfile.mutate({ userId, shift: managerShift, sectors: managerSectors })
            }
            className="mt-4 rounded-xl bg-emerald-700 px-6 py-3 text-xs font-black text-white disabled:opacity-40"
          >
            {saveManagerProfile.isPending ? 'جارٍ الحفظ…' : 'حفظ المناطق وتفعيل الربط التلقائي'}
          </button>
        </section>
      )}

      {/* ④ الأدوار */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-bold">أدوار البوابات</h2>
        <p className="mb-4 text-xs text-slate-500">
          المنح/السحب فوري ومؤرشف باسمك — لا يمكنك تعديل أدوارك بنفسك (حماية خادمية)
        </p>
        <ul className="space-y-2" data-testid="roles-list">
          {ASSIGNABLE_ROLES.map((role) => {
            const granted = hasRole(role)
            return (
              <li
                key={role}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3"
              >
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
                  disabled={setUserRole.isPending || isSelf}
                  data-testid={`role-toggle-${role}`}
                  className={
                    granted
                      ? 'rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40'
                      : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40'
                  }
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
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4"
        >
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 pb-8 shadow-xl sm:rounded-2xl sm:pb-6">
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
              <Button variant="secondary" onClick={() => setConfirmRole(null)}>
                تراجع
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد تعطيل/تفعيل الحساب */}
      {confirmBan !== null && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4"
        >
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 pb-8 shadow-xl sm:rounded-2xl sm:pb-6">
            <h3 className="mb-2 font-bold" data-testid="ban-dialog-title">
              {confirmBan ? 'تعطيل هذا الحساب؟' : 'تفعيل هذا الحساب؟'}
            </h3>
            <p className="mb-5 text-sm text-slate-500">
              {confirmBan
                ? 'لن يستطيع صاحبه تسجيل الدخول إطلاقاً حتى إعادة التفعيل. ستُسجَّل العملية باسمك في سجل التدقيق.'
                : 'سيستعيد صاحبه القدرة على تسجيل الدخول فوراً. ستُسجَّل العملية باسمك في سجل التدقيق.'}
            </p>
            <div className="flex gap-3">
              <Button onClick={submitBan} data-testid="confirm-ban">
                تأكيد
              </Button>
              <Button variant="secondary" onClick={() => setConfirmBan(null)}>
                تراجع
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function inputClass(hasError: boolean): string {
  return clsx(
    'h-11 w-full rounded-xl border px-3.5 text-sm outline-none transition-colors',
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
    hasError ? 'border-red-400' : 'border-slate-300',
  )
}

function Field(props: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={props.htmlFor} className="mb-1.5 block text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && <p className="mt-1.5 text-xs text-slate-400">{props.hint}</p>}
      {props.error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {props.error}
        </p>
      )}
    </div>
  )
}
