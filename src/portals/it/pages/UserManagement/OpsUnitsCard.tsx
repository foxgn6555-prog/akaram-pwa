/** 00170 — بطاقة وحدات غرفة العمليات الظاهرة لهذا الحساب (التطوير المركزية): الكل ظاهر افتراضياً، ويمكن إخفاء وحدات محددة */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { useHiddenUnits, useSetHiddenUnits } from '@features/disclosures/unit'

export function OpsUnitsCard({ userId, portal = PORTALS.OPS_ROOM }: { userId: string; portal?: string }) {
  const { t } = useTranslation('sidebar')
  const units = ((PORTAL_UNITS[portal as keyof typeof PORTAL_UNITS] ?? []) as readonly SidebarUnit[]).filter((u) => u.path !== `/${portal}`)
  const hidden = useHiddenUnits(userId, portal), save = useSetHiddenUnits()
  const [sel, setSel] = useState<string[]>([])
  useEffect(() => { if (hidden.data) setSel(hidden.data) }, [hidden.data])
  const toggle = (p: string) => setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...(hidden.data ?? [])].sort())
  return (
    <section className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm" aria-label="وحدات غرفة العمليات" data-testid="ops-units-card">
      <h2 className="text-sm font-black">وحدات غرفة العمليات الظاهرة لهذا الحساب</h2>
      <p className="mt-1 text-xs text-slate-500">كل الوحدات ظاهرة افتراضياً. ألغِ تفعيل وحدة لإخفائها من قوائم هذا الحساب فقط (الرئيسية تبقى دائماً). الإخفاء يسري عند دخوله التالي أو تحديث الصفحة.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => {
          const visible = !sel.includes(u.path)
          return (
            <button key={u.path} type="button" role="switch" aria-checked={visible} data-testid={`unit-${u.path.split('/').pop()}`} onClick={() => toggle(u.path)} disabled={!hidden.data}
              className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 text-right text-xs font-bold', visible ? 'border-cyan-600 bg-cyan-50 text-cyan-900' : 'border-slate-300 bg-slate-50 text-slate-400 line-through')}>
              <span>{t(u.labelKey)}</span><span className="text-[10px]">{visible ? 'ظاهرة' : 'مخفية'}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" data-testid="units-save" disabled={!dirty || save.isPending} onClick={() => save.mutate({ userId, portal, paths: sel })} className="h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white disabled:opacity-40">حفظ</button>
        {sel.length > 0 ? <span className="text-xs text-slate-500">{sel.length} وحدة مخفية</span> : <span className="text-xs text-emerald-700">كل الوحدات ظاهرة</span>}
      </div>
    </section>
  )
}
