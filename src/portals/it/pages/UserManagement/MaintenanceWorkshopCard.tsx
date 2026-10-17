/** 00271 — بطاقة ورشة الصيانة في تفاصيل المستخدم (التطوير المركزية): المركزية أو ورشة قاطع الزعفرانية */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAssignMaintenanceWorkshop, useMaintenanceWorkshopAccount, useMaintenanceWorkshops } from '@features/maintenance-workshops/hooks'
import type { WorkshopKey } from '@sdk/maintenance-workshops.sdk'

export function MaintenanceWorkshopCard({ userId }: { userId: string }) {
  const account = useMaintenanceWorkshopAccount(userId), workshops = useMaintenanceWorkshops(), save = useAssignMaintenanceWorkshop()
  const [key, setKey] = useState<WorkshopKey>('central')
  useEffect(() => { if (account.data?.workshop_key) setKey(account.data.workshop_key) }, [account.data?.workshop_key])
  const current = account.data?.workshop_key ?? 'central'
  const dirty = key !== current
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm" aria-label="ورشة الصيانة" data-testid="maintenance-workshop-card">
      <h2 className="text-sm font-black">ورشة الصيانة</h2>
      <p className="mt-1 text-xs text-slate-500">يعمل الحساب داخل ورشة واحدة: يرى حالاتها وفنييها ومخزنها ومشترياتها فقط. آليات قاطع الزعفرانية تُوجَّه تلقائياً إلى ورشته، وباقي القواطع إلى المركزية.</p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="mw-current">
        الورشة الحالية: {account.data?.workshop_name ?? 'الصيانة المركزية'}
        {account.data?.explicit ? '' : ' (افتراضي)'}
        {account.data?.assigned_by_name ? ` · أسندها: ${account.data.assigned_by_name}` : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(workshops.data ?? []).filter((w) => w.is_active).map((w) => (
          <button key={w.key} type="button" data-testid={`mw-opt-${w.key}`} aria-pressed={key === w.key} onClick={() => setKey(w.key)}
            className={clsx('rounded-xl border px-4 py-2 text-right text-xs font-bold', key === w.key ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white')}>
            <div>{w.name}</div>
            <div className={clsx('text-[10px] font-normal', key === w.key ? 'text-amber-100' : 'text-slate-500')}>{w.accounts} حساب · {w.open_cases} حالة مفتوحة</div>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <button type="button" data-testid="mw-save" disabled={!dirty || save.isPending} onClick={() => save.mutate({ userId, workshopKey: key })}
          className="h-11 rounded-xl bg-amber-600 px-5 text-sm font-black text-white disabled:opacity-40">حفظ الورشة</button>
      </div>
    </section>
  )
}
