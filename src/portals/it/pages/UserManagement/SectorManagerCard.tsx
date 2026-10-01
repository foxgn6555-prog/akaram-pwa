/** 00160 — بطاقة قواطع مسؤول القاطع في تفاصيل المستخدم (التطوير المركزية): اختيار قاطع أم أو أكثر */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useSaveSectorManagerProfile, useSectorManagerOptions, useSectorManagerProfile } from '@features/sector-manager/hooks'
import type { ParentSector } from '@sdk/sector-manager.sdk'

export function SectorManagerCard({ userId }: { userId: string }) {
  const profile = useSectorManagerProfile(userId), options = useSectorManagerOptions(), save = useSaveSectorManagerProfile()
  const [sel, setSel] = useState<ParentSector[]>([])
  useEffect(() => { if (profile.data) setSel(profile.data.parent_sectors) }, [profile.data])
  const toggle = (ps: ParentSector) => setSel((s) => (s.includes(ps) ? s.filter((x) => x !== ps) : [...s, ps]))
  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm" aria-label="قواطع مسؤول القاطع" data-testid="sector-manager-card">
      <h2 className="text-sm font-black">قواطع مسؤول القاطع</h2>
      <p className="mt-1 text-xs text-slate-500">مسؤول عن مسؤولي الأقسام في القواطع المختارة؛ تصله طلباتهم (حسب سلاسل الموافقات) وتقاريرهم وتبليغاته تصل إليهم.</p>
      {profile.data ? (
        <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-900" data-testid="sm-current">الإسناد الحالي: {profile.data.parent_names.join(' + ')}</p>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="sm-none">لا قواطع مسندة — لن تعمل بوابة مسؤول القاطع حتى تُسنَد.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {(options.data ?? []).map((o) => {
          const on = sel.includes(o.parent_sector)
          return (
            <button key={o.parent_sector} type="button" data-testid={`sm-opt-${o.parent_sector}`} aria-pressed={on} onClick={() => toggle(o.parent_sector)}
              className={clsx('rounded-xl border px-4 py-2 text-right text-xs font-bold', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white')}>
              <div>{o.name}</div>
              <div className={clsx('mt-0.5 text-[10px] font-normal', on ? 'text-indigo-100' : 'text-slate-500')}>
                {o.areas} مناطق · {o.department_managers} مسؤول قسم{o.sector_managers.length ? ` · يشغله: ${o.sector_managers.map((m) => m.name).join('، ')}` : ''}
              </div>
            </button>
          )
        })}
      </div>
      <button type="button" data-testid="sm-save" disabled={sel.length === 0 || save.isPending} onClick={() => save.mutate({ userId, parentSectors: sel })}
        className="mt-4 h-11 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:opacity-40">حفظ القواطع</button>
    </section>
  )
}
