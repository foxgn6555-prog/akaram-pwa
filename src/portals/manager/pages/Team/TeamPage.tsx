/**
 * فريقي — العمال والآليات المسؤولة عنهم حسب القاطع/الشفت.
 * المدير يرى فقط ما يخص قواطعه (عزل RLS)، ويستطيع إضافة عامل/آلية لقواطعه.
 */
import { useState } from 'react'
import clsx from 'clsx'
import {
  useWorkers, useVehicles, useCreateWorker, useCreateVehicle,
  useArchiveWorker, useArchiveVehicle,
  useSectors, useManagerProfile,
} from '@features/sector'
import { workerSchema, vehicleSchema, type WorkerFormInput, type VehicleFormInput } from '@features/sector'
import { SHIFT_LABELS, type Shift } from '@features/sector/types'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

function todayShift(profileShift?: Shift): Shift {
  return profileShift ?? 'morning'
}

export default function TeamPage() {
  const [tab, setTab] = useState<'workers' | 'vehicles'>('workers')
  const sectors = useSectors()
  const profile = useManagerProfile()
  const workers = useWorkers(true)
  const vehicles = useVehicles(true)
  const createWorker = useCreateWorker()
  const createVehicle = useCreateVehicle()
  const archiveWorker = useArchiveWorker()
  const archiveVehicle = useArchiveVehicle()
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'worker' | 'vehicle'; id: string; label: string } | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  const confirmDelete = (): void => {
    if (!deleteTarget || deleteReason.trim().length < 3) return
    const input = { id: deleteTarget.id, reason: deleteReason.trim() }
    const done = () => { setDeleteTarget(null); setDeleteReason('') }
    if (deleteTarget.type === 'worker') archiveWorker.mutate(input, { onSuccess: done })
    else archiveVehicle.mutate(input, { onSuccess: done })
  }

  const sectorName = (id: number): string =>
    sectors.data?.find((s) => s.id === id)?.name ?? `قاطع ${id}`

  // القواطع المتاحة للمدير هي قواطعه فقط (من ملفه)
  const mySectorIds = profile.data?.sectors ?? []
  const mySectors = (sectors.data ?? []).filter((s) => mySectorIds.includes(s.id))
  const shift = todayShift(profile.data?.shift)

  // نموذج عامل
  const [wForm, setWForm] = useState<WorkerFormInput>({
    full_name: '', phone: '', sector_id: mySectorIds[0] ?? 1, shift, job_title: '',
  })
  const [wErr, setWErr] = useState<Record<string, string>>({})

  // نموذج آلية
  const [vForm, setVForm] = useState<VehicleFormInput>({
    db_number: '', vehicle_type: '', sector_id: mySectorIds[0] ?? 1, shift, driver_name: '',
  })
  const [vErr, setVErr] = useState<Record<string, string>>({})

  const inputBase =
    'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

  const submitWorker = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = workerSchema.safeParse({ ...wForm, sector_id: Number(wForm.sector_id) })
    if (!parsed.success) {
      const er: Record<string, string> = {}
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? '')
        if (k && !er[k]) er[k] = i.message
      }
      setWErr(er)
      return
    }
    createWorker.mutate({
      full_name: parsed.data.full_name.trim(),
      phone: parsed.data.phone?.trim() || null,
      sector_id: parsed.data.sector_id,
      shift: parsed.data.shift,
      job_title: parsed.data.job_title?.trim() || null,
    }, { onSuccess: () => setWForm({ full_name: '', phone: '', sector_id: mySectorIds[0] ?? 1, shift, job_title: '' }) })
  }

  const submitVehicle = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = vehicleSchema.safeParse({ ...vForm, sector_id: Number(vForm.sector_id) })
    if (!parsed.success) {
      const er: Record<string, string> = {}
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? '')
        if (k && !er[k]) er[k] = i.message
      }
      setVErr(er)
      return
    }
    createVehicle.mutate({
      db_number: parsed.data.db_number.trim(),
      vehicle_type: parsed.data.vehicle_type?.trim() || null,
      sector_id: parsed.data.sector_id,
      shift: parsed.data.shift,
      driver_name: parsed.data.driver_name?.trim() || null,
    }, { onSuccess: () => setVForm({ db_number: '', vehicle_type: '', sector_id: mySectorIds[0] ?? 1, shift, driver_name: '' }) })
  }

  const wList = workers.data ?? []
  const vList = vehicles.data ?? []

  return (
    <div className="space-y-5" data-testid="team-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">فريقي</h1>
        <p className="text-sm text-slate-500">
          العمال والآليات المسؤولة عنهم — {SHIFT_LABELS[shift]} · قواطعك: {mySectors.map((s) => s.name).join('، ') || '—'}
        </p>
      </div>

      {/* تبويب */}
      <div className="flex gap-2">
        <TabBtn active={tab === 'workers'} onClick={() => setTab('workers')} icon="users" label={`العمال (${wList.length})`} />
        <TabBtn active={tab === 'vehicles'} onClick={() => setTab('vehicles')} icon="truck" label={`الآليات (${vList.length})`} />
      </div>

      {tab === 'workers' ? (
        <>
          <form onSubmit={submitWorker} data-testid="worker-form"
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
            <input placeholder="اسم العامل *" value={wForm.full_name}
              onChange={(e) => { setWForm((f) => ({ ...f, full_name: e.target.value })); setWErr((x) => ({ ...x, full_name: '' })) }}
              className={clsx(inputBase, wErr.full_name && 'border-red-400')} data-testid="f-worker-name" />
            <input placeholder="رقم الهاتف" value={wForm.phone ?? ''} dir="ltr"
              onChange={(e) => setWForm((f) => ({ ...f, phone: e.target.value }))}
              className={inputBase} data-testid="f-worker-phone" />
            <select value={wForm.sector_id}
              onChange={(e) => setWForm((f) => ({ ...f, sector_id: Number(e.target.value) }))}
              className={clsx(inputBase, wErr.sector_id && 'border-red-400')} data-testid="f-worker-sector">
              {mySectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input placeholder="المسمى (اختياري)" value={wForm.job_title ?? ''}
              onChange={(e) => setWForm((f) => ({ ...f, job_title: e.target.value }))}
              className={inputBase} data-testid="f-worker-title" />
            <button type="submit" disabled={createWorker.isPending} data-testid="worker-submit"
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
              <Icon name="check-square" size={16} /> إضافة عامل
            </button>
          </form>

          <Card>
            {workers.isLoading ? <LoadingSpinner label="جارٍ الجلب…" /> :
              wList.length === 0 ? <EmptyState title="لا يوجد عمال بعد" hint="أضِف عمال قواطعك من النموذج أعلاه" /> : (
                <Table head={['الاسم', 'القاطع', 'المسمى', 'الهاتف', '']}>
                  {wList.map((w) => (
                    <tr key={w.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-medium">{w.full_name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{sectorName(w.sector_id)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{w.job_title ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 dir-ltr">{w.phone ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" data-testid={`archive-worker-${w.id}`}
                          onClick={() => setDeleteTarget({ type: 'worker', id: w.id, label: w.full_name })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
                          <Icon name="trash" size={14} /> حذف العامل
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
          </Card>
        </>
      ) : (
        <>
          <form onSubmit={submitVehicle} data-testid="vehicle-form"
            className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
            <input placeholder="رقم DB *" value={vForm.db_number} dir="ltr"
              onChange={(e) => { setVForm((f) => ({ ...f, db_number: e.target.value })); setVErr((x) => ({ ...x, db_number: '' })) }}
              className={clsx(inputBase, vErr.db_number && 'border-red-400')} data-testid="f-vehicle-db" />
            <input placeholder="نوع/صنف الآلية" value={vForm.vehicle_type ?? ''}
              onChange={(e) => setVForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              className={inputBase} data-testid="f-vehicle-type" />
            <select value={vForm.sector_id}
              onChange={(e) => setVForm((f) => ({ ...f, sector_id: Number(e.target.value) }))}
              className={clsx(inputBase, vErr.sector_id && 'border-red-400')} data-testid="f-vehicle-sector">
              {mySectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input placeholder="اسم السائق (اختياري)" value={vForm.driver_name ?? ''}
              onChange={(e) => setVForm((f) => ({ ...f, driver_name: e.target.value }))}
              className={inputBase} data-testid="f-vehicle-driver" />
            <button type="submit" disabled={createVehicle.isPending} data-testid="vehicle-submit"
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
              <Icon name="check-square" size={16} /> إضافة آلية
            </button>
          </form>

          <Card>
            {vehicles.isLoading ? <LoadingSpinner label="جارٍ الجلب…" /> :
              vList.length === 0 ? <EmptyState title="لا توجد آليات بعد" hint="أضِف آليات قواطعك من النموذج أعلاه" /> : (
                <Table head={['DB', 'نوع الآلية', 'القاطع', 'السائق', '']}>
                  {vList.map((v) => (
                    <tr key={v.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-bold text-brand-700 dir-ltr">{v.db_number}</td>
                      <td className="px-3 py-2.5 text-slate-600">{v.vehicle_type ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{sectorName(v.sector_id)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{v.driver_name ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" data-testid={`archive-vehicle-${v.id}`}
                          onClick={() => setDeleteTarget({ type: 'vehicle', id: v.id, label: v.db_number })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
                          <Icon name="trash" size={14} /> حذف الآلية
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
          </Card>
        </>
      )}

      {deleteTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-team-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="delete-team-title" className="text-lg font-black text-slate-900">
              {deleteTarget.type === 'worker' ? 'حذف العامل' : 'حذف الآلية'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">سيختفي «{deleteTarget.label}» من قوائم العمل وينتقل إلى الأرشيف، ولن يُحذف سجله التاريخي.</p>
            <label className="mt-4 block text-sm font-bold">سبب الحذف
              <textarea autoFocus value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="اكتب سبباً واضحاً" className="mt-2 min-h-24 w-full rounded-xl border p-3" />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={deleteReason.trim().length < 3 || archiveWorker.isPending || archiveVehicle.isPending} onClick={confirmDelete} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">تأكيد الحذف إلى الأرشيف</button>
              <button type="button" onClick={() => { setDeleteTarget(null); setDeleteReason('') }} className="rounded-xl border px-4 py-2 text-sm font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: 'users' | 'truck'; label: string }) {
  return (
    <button onClick={onClick}
      className={clsx('flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors',
        active ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
      <Icon name={icon} size={16} /> {label}
    </button>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="bg-slate-50/70 text-xs text-slate-500">
            {head.map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
