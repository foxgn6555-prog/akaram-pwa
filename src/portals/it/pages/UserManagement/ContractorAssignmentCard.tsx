/** 00158 — بطاقة إسناد حساب المتعهد في تفاصيل المستخدم (التطوير المركزية): مسؤول القسم → المنطقة (من مناطقه) → القاطع/الشفت تلقائياً */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAssignContractor, useContractorManagerOptions, useContractorProfileForUser, useUnassignContractor } from '@features/contractors/hooks'
import { PARENT_AR, SHIFT_AR, dateAr } from '@features/contractors/format'

export function ContractorAssignmentCard({ userId }: { userId: string }) {
  const profile = useContractorProfileForUser(userId), options = useContractorManagerOptions(), assign = useAssignContractor(), unassign = useUnassignContractor()
  const [managerId, setManagerId] = useState(''), [sectorId, setSectorId] = useState<number | null>(null), [reason, setReason] = useState('')
  useEffect(() => {
    if (profile.data?.is_active) { setManagerId(profile.data.manager_user_id); setSectorId(profile.data.sector_id) }
  }, [profile.data])
  const manager = (options.data ?? []).find((m) => m.user_id === managerId), areas = manager?.areas ?? []
  const effectiveSector = areas.length === 1 ? (areas[0]?.id ?? null) : sectorId
  const canSave = Boolean(managerId) && (areas.length === 1 || effectiveSector !== null) && !assign.isPending
  const p = profile.data
  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm" aria-label="إسناد المتعهد" data-testid="contractor-assignment-card">
      <h2 className="text-sm font-black">إسناد المتعهد إلى مسؤول القسم</h2>
      <p className="mt-1 text-xs text-slate-500">القاطع والمنطقة والشفت تُشتق من ملف مسؤول القسم تلقائياً. منطقة واحدة = متعهد واحد.</p>
      {p?.is_active ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-900" data-testid="contractor-current">
          الإسناد الحالي: {p.manager_name} · {p.area_name} · {PARENT_AR[p.parent_sector] ?? p.parent_sector} · {SHIFT_AR[p.shift] ?? p.shift} · عمال نشطون {p.workers_count} · منذ {dateAr(p.assigned_at)}
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="contractor-none">لا إسناد نشط — لن تعمل بوابة المتعهد حتى يُسنَد.</p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold">مسؤول القسم
          <select aria-label="مسؤول القسم المسؤول" data-testid="ca-manager" value={managerId} onChange={(e) => { setManagerId(e.target.value); setSectorId(null) }} className="mt-1 h-11 w-full rounded-xl border px-3">
            <option value="">اختر مسؤول القسم</option>
            {(options.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name} — {SHIFT_AR[m.shift] ?? m.shift} — {m.areas.map((a) => a.name).join('، ')}</option>)}
          </select>
        </label>
        <div className="text-xs font-bold">المنطقة
          {!manager ? <p className="mt-1 text-slate-400">اختر مسؤول القسم أولاً</p> : areas.length === 1 ? (
            <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 font-normal" data-testid="ca-area-auto">{areas[0]?.name} · {PARENT_AR[areas[0]?.parent_sector ?? ''] ?? ''} (تلقائياً)</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {areas.map((a) => {
                const takenByOther = Boolean(a.taken_by) && !(p?.is_active && p.sector_id === a.id)
                return (
                  <button key={a.id} type="button" data-testid={`ca-area-${a.id}`} disabled={takenByOther} onClick={() => setSectorId(a.id)}
                    className={clsx('rounded-full border px-3 py-1 disabled:opacity-40', sectorId === a.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-white')} title={takenByOther ? `لها متعهد نشط: ${a.taken_by}` : undefined}>
                    {a.name}{takenByOther ? ' (مشغولة)' : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" data-testid="ca-save" disabled={!canSave} onClick={() => assign.mutate({ userId, managerUserId: managerId, sectorId: effectiveSector })}
          className="h-11 rounded-xl bg-emerald-700 px-6 text-xs font-black text-white disabled:opacity-40">{assign.isPending ? 'جارٍ الحفظ…' : p?.is_active ? 'تحديث الإسناد' : 'إسناد المتعهد'}</button>
        {p?.is_active && (
          <>
            <input data-testid="ca-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب إلغاء الإسناد" className="h-11 flex-1 rounded-xl border px-3 text-xs" />
            <button type="button" data-testid="ca-unassign" disabled={reason.trim().length < 3 || unassign.isPending} onClick={() => unassign.mutate({ userId, reason }, { onSuccess: () => setReason('') })}
              className="h-11 rounded-xl border border-rose-300 px-4 text-xs font-black text-rose-700 disabled:opacity-40">إلغاء الإسناد</button>
          </>
        )}
      </div>
    </section>
  )
}
