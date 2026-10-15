/** 00259 — بطاقة نطاق المتابعة في تفاصيل المستخدم (التطوير المركزية): قاطع كامل أو أكثر، و/أو مناطق منفردة */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAssignFollowUp, useFollowUpProfile, useFollowUpScopeOptions, useUnassignFollowUp } from '@features/follow-up/hooks'
import type { FollowUpScopeOption, ParentSector } from '@sdk/follow-up.sdk'

export function FollowUpAssignmentCard({ userId }: { userId: string }) {
  const profile = useFollowUpProfile(userId), options = useFollowUpScopeOptions(), save = useAssignFollowUp(), unassign = useUnassignFollowUp()
  const [parents, setParents] = useState<ParentSector[]>([])
  const [areas, setAreas] = useState<number[]>([])
  useEffect(() => { if (profile.data) { setParents(profile.data.parent_sectors); setAreas(profile.data.sector_ids) } }, [profile.data])
  const groups = useMemo(() => {
    const m = new Map<ParentSector, { name: string; areas: FollowUpScopeOption[] }>()
    for (const o of options.data ?? []) { const g = m.get(o.parent_sector) ?? { name: o.parent_name, areas: [] }; g.areas.push(o); m.set(o.parent_sector, g) }
    return Array.from(m.entries())
  }, [options.data])
  const toggleParent = (p: ParentSector) => setParents((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
  const toggleArea = (id: number) => setAreas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const empty = parents.length === 0 && areas.length === 0
  const active = Boolean(profile.data?.is_active)
  return (
    <section className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm" aria-label="نطاق المتابعة" data-testid="follow-up-card">
      <h2 className="text-sm font-black">نطاق المتابعة</h2>
      <p className="mt-1 text-xs text-slate-500">اختر قاطعاً كاملاً (كل مناطقه الحالية والمستقبلية) و/أو مناطق محددة. يرى المتابِع متعهدي هذه المناطق ويسجّل عدد عمالهم يومياً.</p>
      {active ? (
        <p className="mt-3 rounded-xl bg-green-50 p-3 text-xs font-bold text-green-900" data-testid="fu-current">الإسناد الحالي: {profile.data?.scope_label || '—'} · {profile.data?.areas_count ?? 0} منطقة</p>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="fu-none">لا نطاق مسند — لن تعمل بوابة المتابعة حتى يُحدَّد النطاق.</p>
      )}
      <div className="mt-4 space-y-4">
        {groups.map(([p, g]) => {
          const whole = parents.includes(p)
          return (
            <div key={p} className="rounded-xl border border-slate-200 p-3">
              <button type="button" data-testid={`fu-parent-${p}`} aria-pressed={whole} onClick={() => toggleParent(p)}
                className={clsx('rounded-xl border px-4 py-2 text-right text-xs font-bold', whole ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white')}>
                {g.name} — القاطع كاملاً ({g.areas.length} مناطق)
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.areas.map((a) => {
                  const on = whole || areas.includes(a.sector_id)
                  return (
                    <button key={a.sector_id} type="button" data-testid={`fu-area-${a.sector_id}`} aria-pressed={on} disabled={whole} onClick={() => toggleArea(a.sector_id)}
                      className={clsx('rounded-lg border px-3 py-1.5 text-right text-[11px] font-bold disabled:opacity-70', on ? 'border-green-500 bg-green-50 text-green-900' : 'border-slate-300 bg-white')}>
                      <div>{a.area_name}</div>
                      <div className="text-[10px] font-normal text-slate-500">{a.contractor_name ? `المتعهد: ${a.contractor_name}` : 'بلا متعهد'}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" data-testid="fu-save" disabled={empty || save.isPending} onClick={() => save.mutate({ userId, parentSectors: parents, sectorIds: areas })}
          className="h-11 rounded-xl bg-green-600 px-5 text-sm font-black text-white disabled:opacity-40">حفظ النطاق</button>
        {active && (
          <button type="button" data-testid="fu-unassign" disabled={unassign.isPending} onClick={() => { const reason = window.prompt('سبب إلغاء التكليف (اختياري)') ?? null; unassign.mutate({ userId, reason }) }}
            className="h-11 rounded-xl border border-rose-300 px-5 text-sm font-black text-rose-700 disabled:opacity-40">إلغاء التكليف</button>
        )}
      </div>
    </section>
  )
}
