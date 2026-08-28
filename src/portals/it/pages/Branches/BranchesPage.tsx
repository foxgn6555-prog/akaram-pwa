import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBranches, useCreateBranch, useToggleBranch } from '@features/branches'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

const branchSchema = z.object({
  name: z.string().min(2, 'اسم الفرع مطلوب'),
  code: z
    .string()
    .min(2, 'الرمز مطلوب')
    .max(8, '8 خانات كحد أقصى')
    .regex(/^[A-Za-z0-9]+$/, 'حروف إنجليزية وأرقام فقط'),
  city: z.string().optional(),
  address: z.string().optional(),
})

type BranchForm = z.infer<typeof branchSchema>

/** وحدة فروع الشركة — عرض + إنشاء + تفعيل/تعطيل */
export default function BranchesPage() {
  const { data: branches, isLoading } = useBranches(true)
  const create = useCreateBranch()
  const toggle = useToggleBranch()
  const [formOpen, setFormOpen] = useState(false)

  const {
    register, handleSubmit, reset,
    formState: { errors },
  } = useForm<BranchForm>({ resolver: zodResolver(branchSchema) })

  const onSubmit = async (data: BranchForm): Promise<void> => {
    await create.mutateAsync(data)
    reset()
    setFormOpen(false)
  }

  return (
    <section aria-labelledby="branches-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="branches-title" className="text-lg font-bold">فروع الشركة</h1>
          <p className="text-sm text-slate-500">
            {branches ? `${branches.length} فرع نشط` : '…'} — تُربط بالموظفين والأجهزة والمركبات
          </p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)} data-testid="toggle-branch-form">
          <Icon name={formOpen ? 'x' : 'user-plus'} size={15} />
          {formOpen ? 'إغلاق' : 'فرع جديد'}
        </Button>
      </div>

      {formOpen && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          noValidate
          data-testid="branch-form"
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"
        >
          <div>
            <label htmlFor="br-name" className="mb-1.5 block text-sm font-medium">اسم الفرع</label>
            <input id="br-name" data-testid="branch-name"
              placeholder="فرع الكرادة"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('name')} />
            {errors.name && <p role="alert" className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="br-code" className="mb-1.5 block text-sm font-medium">الرمز</label>
            <input id="br-code" data-testid="branch-code" dir="ltr"
              placeholder="KRR"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('code')} />
            {errors.code && <p role="alert" className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
          </div>
          <div>
            <label htmlFor="br-city" className="mb-1.5 block text-sm font-medium">المدينة (اختياري)</label>
            <input id="br-city" placeholder="بغداد"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('city')} />
          </div>
          <div>
            <label htmlFor="br-address" className="mb-1.5 block text-sm font-medium">العنوان (اختياري)</label>
            <input id="br-address" placeholder="شارع الجامعة"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('address')} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={create.isPending} data-testid="branch-submit">
              إنشاء الفرع
            </Button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner label="جارٍ جلب الفروع…" />}

      {!isLoading && branches && branches.length === 0 && (
        <EmptyState title="لا فروع بعد" hint="أنشئ الفرع الأول — حتى المركز الرئيسي يُسجل كفرع" />
      )}

      {branches && branches.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="branches-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                <th className="px-4 py-3 text-start font-semibold">الفرع</th>
                <th className="px-4 py-3 text-start font-semibold">الرمز</th>
                <th className="hidden px-4 py-3 text-start font-semibold sm:table-cell">المدينة</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon name="layout-grid" size={15} className="text-brand-600" />
                      {b.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600" dir="ltr">{b.code}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{b.city ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle.mutate({ id: b.id, active: !b.is_active })}
                      data-testid={`branch-toggle-${b.code}`}
                      disabled={toggle.isPending}
                      className={b.is_active
                        ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700'
                        : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500'}
                    >
                      {b.is_active ? 'نشط — اضغط للتعطيل' : 'موقوف — اضغط للتفعيل'}
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
