import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDepartments, useCreateDepartment } from '@features/departments'
import { Icon } from '@components/ui/Icon/Icon'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/** وحدة إدارة المستخدمين — الهيكل التنظيمي: عرض الأقسام + إنشاء قسم/قسم فرعي */
const departmentSchema = z.object({
  name: z.string().min(2, 'اسم القسم مطلوب (حرفان فأكثر)'),
  code: z
    .string()
    .min(2, 'الرمز مطلوب (حرفان فأكثر)')
    .max(10, 'الرمز: 10 خانات كحد أقصى')
    .regex(/^[A-Za-z0-9-]+$/, 'الرمز: حروف إنجليزية وأرقام وشرطات فقط'),
  parent_id: z.string().optional(),
})

type DepartmentForm = z.infer<typeof departmentSchema>

export default function DepartmentsPage() {
  const { data: departments, isLoading } = useDepartments()
  const create = useCreateDepartment()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { parent_id: '' },
  })

  const [formOpen, setFormOpen] = useState(false)
  const selectedParent = watch('parent_id')

  const onSubmit = async (data: DepartmentForm): Promise<void> => {
    await create.mutateAsync({
      name: data.name,
      code: data.code,
      parent_id: data.parent_id || null,
    })
    reset({ name: '', code: '', parent_id: '' })
    setFormOpen(false)
  }

  const parentName = (parentId: string | null): string =>
    departments?.find((d) => d.id === parentId)?.name ?? '—'

  return (
    <section aria-labelledby="org-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="org-title" className="text-lg font-bold">الهيكل التنظيمي</h1>
          <p className="text-sm text-slate-500">
            {departments ? `${departments.length} قسم` : '…'} — الأقسام تظهر فوراً في كل البوابات
          </p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)} data-testid="toggle-dept-form">
          <Icon name={formOpen ? 'x' : 'user-plus'} size={15} />
          {formOpen ? 'إغلاق' : 'قسم جديد'}
        </Button>
      </div>

      {/* نموذج الإنشاء */}
      {formOpen && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          noValidate
          data-testid="dept-form"
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3"
        >
          <div>
            <label htmlFor="dept-name" className="mb-1.5 block text-sm font-medium">اسم القسم</label>
            <input
              id="dept-name"
              data-testid="dept-name"
              placeholder="مثال: شعبة الصيانة"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
              {...register('name')}
            />
            {errors.name && <p role="alert" className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="dept-code" className="mb-1.5 block text-sm font-medium">الرمز</label>
            <input
              id="dept-code"
              data-testid="dept-code"
              dir="ltr"
              placeholder="MAINT"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
              {...register('code')}
            />
            {errors.code && <p role="alert" className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
          </div>

          <div>
            <label htmlFor="dept-parent" className="mb-1.5 block text-sm font-medium">القسم الأب (اختياري)</label>
            <select
              id="dept-parent"
              data-testid="dept-parent"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              {...register('parent_id')}
            >
              <option value="">— قسم رئيسي —</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" isLoading={create.isPending} data-testid="dept-submit">
              {selectedParent ? 'إضافة قسم فرعي' : 'إنشاء القسم'}
            </Button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner label="جارٍ جلب الهيكل…" />}

      {!isLoading && departments && departments.length === 0 && (
        <EmptyState title="لا أقسام بعد" hint="ابدأ بإنشاء القسم الرئيسي الأول" />
      )}

      {departments && departments.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="departments-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                <th className="px-4 py-3 text-start font-semibold">القسم</th>
                <th className="px-4 py-3 text-start font-semibold">الرمز</th>
                <th className="px-4 py-3 text-start font-semibold">القسم الأب</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon name="folder" size={16} className="text-brand-600" />
                      {d.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">{d.code}</td>
                  <td className="px-4 py-3 text-slate-500">{parentName(d.parent_id)}</td>
                  <td className="px-4 py-3">
                    <span className={d.is_active
                      ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700'
                      : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500'}>
                      {d.is_active ? 'نشط' : 'موقوف'}
                    </span>
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
