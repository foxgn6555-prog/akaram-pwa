import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useBranches } from '@features/branches'
import { useDevices, useCreateDevice, useToggleDevice } from '@features/integrations'
import { integrations } from '@sdk/integrations.sdk'
import { formatRelative } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'

/** وحدة التكاملات — أجهزة البصمة ZKTeco (بروتوكول ADMS Push) */
export default function BiometricPage() {
  const { data: devices, isLoading } = useDevices()
  const { data: branches } = useBranches()
  const create = useCreateDevice()
  const toggle = useToggleDevice()
  const [formOpen, setFormOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    serial_number: string
    name: string
    branch_id: string
  }>()

  const onSubmit = async (data: { serial_number: string; name: string; branch_id: string }): Promise<void> => {
    await create.mutateAsync({
      serial_number: data.serial_number.trim(),
      name: data.name,
      branch_id: data.branch_id || undefined,
    })
    reset()
    setFormOpen(false)
  }

  const admsUrl = integrations.getAdmsServerUrl()

  return (
    <section aria-labelledby="bio-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="bio-title" className="text-lg font-bold">أجهزة البصمة (ZKTeco)</h1>
          <p className="text-sm text-slate-500">الجهاز يدفع سجلات الحضور إلينا مباشرة — بلا IP ثابت</p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)} data-testid="toggle-device-form">
          <Icon name={formOpen ? 'x' : 'user-plus'} size={15} />
          {formOpen ? 'إغلاق' : 'تسجيل جهاز'}
        </Button>
      </div>

      {/* إرشادات الربط */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4" data-testid="adms-guide">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-800">
          <Icon name="fingerprint" size={16} />
          طريقة الربط (بروتوكول ADMS)
        </h2>
        <ol className="space-y-1.5 text-xs leading-5 text-brand-900">
          <li>① سجّل الجهاز هنا برقمه التسلسلي (SN)</li>
          <li>② في إعدادات الجهاز: Cloud Server URL ← الصق:</li>
        </ol>
        <code data-testid="adms-url" dir="ltr"
              className="mt-2 block overflow-x-auto rounded-lg bg-white px-3 py-2 text-[11px] text-brand-700">
          {admsUrl}
        </code>
        <p className="mt-1.5 text-[11px] text-brand-700">
          ③ الجهاز سيتصل تلقائياً — ستشاهد "آخر اتصال" يحدث كل ثوانٍ عند نجاح الربط
        </p>
      </div>

      {formOpen && (
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate
              data-testid="device-form"
              className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <div>
            <label htmlFor="dev-sn" className="mb-1.5 block text-sm font-medium">الرقم التسلسلي (SN)</label>
            <input id="dev-sn" data-testid="device-sn" dir="ltr" required
              placeholder="CL8732103456"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('serial_number')} />
            {errors.serial_number && <p role="alert" className="mt-1 text-xs text-red-600">{errors.serial_number.message}</p>}
          </div>
          <div>
            <label htmlFor="dev-name" className="mb-1.5 block text-sm font-medium">اسم الجهاز</label>
            <input id="dev-name" data-testid="device-name" required
              placeholder="بصمة المدخل الرئيسي"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              {...register('name')} />
          </div>
          <div>
            <label htmlFor="dev-branch" className="mb-1.5 block text-sm font-medium">الفرع</label>
            <select id="dev-branch" data-testid="device-branch"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              {...register('branch_id')}>
              <option value="">— بدون فرع —</option>
              {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" isLoading={create.isPending} data-testid="device-submit">
              تسجيل الجهاز
            </Button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner label="جارٍ جلب الأجهزة…" />}

      {!isLoading && devices && devices.length === 0 && (
        <EmptyState title="لا أجهزة مسجلة" hint="سجّل أول جهاز بصمة من الزر أعلاه" />
      )}

      {devices && devices.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="devices-grid">
          {devices.map((d) => {
            const online = d.last_seen_at
              ? Date.now() - new Date(d.last_seen_at).getTime() < 2 * 60_000
              : false
            const branchName = branches?.find((b) => b.id === d.branch_id)?.name
            return (
              <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <Icon name="fingerprint" size={16} className="text-brand-600" />
                      {d.name}
                    </p>
                    <p className="text-xs text-slate-500" dir="ltr">{d.serial_number}</p>
                  </div>
                  <span className={clsx(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                    online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  )}>
                    <span className={clsx('size-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-400')} />
                    {online ? 'متصل' : 'غير متصل'}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2.5">
                  <span className="text-[11px] text-slate-400">
                    {d.last_seen_at ? `آخر اتصال: ${formatRelative(d.last_seen_at)}` : 'لم يتصل بعد'}
                    {branchName && ` · ${branchName}`}
                  </span>
                  <button
                    onClick={() => toggle.mutate({ id: d.id, active: !d.is_active })}
                    data-testid={`device-toggle-${d.serial_number}`}
                    className={d.is_active
                      ? 'text-[11px] font-semibold text-red-600 hover:underline'
                      : 'text-[11px] font-semibold text-emerald-600 hover:underline'}
                  >
                    {d.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
