import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import clsx from 'clsx'
import {
  useCreateUser,
  createSuperAdminSchema,
  ASSIGNABLE_ROLES,
  type CreateUserFormInput,
} from '@features/user-management'
import { useDepartments } from '@features/departments'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'

/** إنشاء مستخدم جديد: حساب auth + دور + ربط سجل موظف (اختياري) */
export default function CreateUser() {
  const navigate = useNavigate()
  const create = useCreateUser()
  const { data: departments } = useDepartments()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormInput>({
    resolver: zodResolver(createSuperAdminSchema),
    defaultValues: { role: 'employee', employee_number: '', department_id: '', job_title: '' },
  })

  const selectedRole = watch('role')
  const isHighPrivilege = selectedRole === 'super_admin' || selectedRole === 'it_admin'

  const onSubmit = async (data: CreateUserFormInput): Promise<void> => {
    await create.mutateAsync({
      email: data.email,
      password: data.password,
      full_name: data.full_name,
      role: data.role,
      employee_number: data.employee_number || undefined,
      department_id: data.department_id || undefined,
      job_title: data.job_title || undefined,
    })
    navigate('/it/user-management')
  }

  const inputClass = (hasError: boolean): string =>
    clsx(
      'h-11 w-full rounded-xl border px-3.5 text-sm outline-none transition-colors',
      'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
      hasError ? 'border-red-400' : 'border-slate-300',
    )

  return (
    <section aria-labelledby="create-user-title" className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 id="create-user-title" className="text-lg font-bold">إنشاء مستخدم جديد</h1>
        <p className="text-sm text-slate-500">
          حساب دخول + دور البوابة + ربط بسجل الموظف — كل خطوة تُدقَّن وتُؤرشف على الخادم
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        noValidate
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* البريد + الاسم */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="البريد الإلكتروني" htmlFor="cu-email" error={errors.email?.message}>
            <input id="cu-email" type="email" dir="ltr" autoComplete="off"
              placeholder="name@akram.iq" className={inputClass(!!errors.email)} {...register('email')} />
          </Field>

          <Field label="الاسم الكامل" htmlFor="cu-name" error={errors.full_name?.message}>
            <input id="cu-name" autoComplete="off"
              placeholder="مثال: أحمد علي حسن" className={inputClass(!!errors.full_name)} {...register('full_name')} />
          </Field>
        </div>

        {/* كلمة المرور */}
        <Field
          label="كلمة المرور المبدئية"
          htmlFor="cu-password"
          error={errors.password?.message}
          hint="8 أحرف فأكثر · حرف واحد على الأقل · رقم واحد على الأقل"
        >
          <div className="relative">
            <input id="cu-password" type={showPassword ? 'text' : 'password'} dir="ltr" autoComplete="new-password"
              className={clsx(inputClass(!!errors.password), 'pe-11')} {...register('password')} />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء' : 'إظهار'}
              className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-slate-400">
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
            </button>
          </div>
        </Field>

        {/* الدور */}
        <Field label="دور البوابة" htmlFor="cu-role" error={errors.role?.message}>
          <select id="cu-role" data-testid="create-role" className={inputClass(!!errors.role)} {...register('role')}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
        </Field>

        {isHighPrivilege && (
          <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            ⚠️ أنت تمنح صلاحية مرتفعة — سيُسجَّل هذا الإجراء باسمك في سجل التدقيق.
          </p>
        )}

        {/* ربط الموظف */}
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold text-slate-500">ربط سجل موظف (اختياري — موصى به)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الرقم الوظيفي" htmlFor="cu-empno" error={errors.employee_number?.message}>
              <input id="cu-empno" dir="ltr" placeholder="EMP-014"
                className={inputClass(!!errors.employee_number)} {...register('employee_number')} />
            </Field>
            <Field label="القسم" htmlFor="cu-dept" error={errors.department_id?.message}>
              <select id="cu-dept" className={inputClass(!!errors.department_id)} {...register('department_id')}>
                <option value="">— بدون قسم —</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="المسمى الوظيفي" htmlFor="cu-title" error={errors.job_title?.message}>
              <input id="cu-title" placeholder="مثال: موظف إداري"
                className={inputClass(!!errors.job_title)} {...register('job_title')} />
            </Field>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isSubmitting || create.isPending} data-testid="create-submit">
            إنشاء المستخدم
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/it/user-management')}>
            إلغاء
          </Button>
        </div>
      </form>
    </section>
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
      <label htmlFor={props.htmlFor} className="mb-1.5 block text-sm font-medium">{props.label}</label>
      {props.children}
      {props.hint && !props.error && <p className="mt-1.5 text-xs text-slate-400">{props.hint}</p>}
      {props.error && <p role="alert" className="mt-1.5 text-xs text-red-600">{props.error}</p>}
    </div>
  )
}
