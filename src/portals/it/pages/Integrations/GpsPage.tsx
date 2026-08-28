import { useState } from 'react'
import { useBranches } from '@features/branches'
import {
  useVehicles, useCreateVehicle, useProviders, useCreateProvider, useLatestPositions,
} from '@features/integrations'
import { formatRelative } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'

/** وحدة التكاملات — تتبع الشاحنات GPS (كل المزودين) */
export default function GpsPage() {
  const { data: vehicles, isLoading: vLoading } = useVehicles()
  const { data: providers } = useProviders()
  const { data: positions } = useLatestPositions()
  const { data: branches } = useBranches()
  const createVehicle = useCreateVehicle()
  const createProvider = useCreateProvider()
  const [formOpen, setFormOpen] = useState(false)
  const [providerFormOpen, setProviderFormOpen] = useState(false)

  type Position = NonNullable<typeof positions>[number]
  // آخر موقع لكل مركبة (dedupe بالـ vehicle_id)
  const latestByVehicle = new Map<string, Position>()
  for (const pos of positions ?? []) {
    if (!latestByVehicle.has(pos.vehicle_id)) latestByVehicle.set(pos.vehicle_id, pos)
  }

  const [plate, setPlate] = useState('')
  const [name, setName] = useState('')
  const [deviceId, setDeviceId] = useState('')

  const submitVehicle = (): void => {
    if (!plate.trim() || !name.trim()) return
    createVehicle.mutate({
      plate: plate.trim(),
      name: name.trim(),
      device_unique_id: deviceId.trim() || undefined,
    })
    setPlate(''); setName(''); setDeviceId('')
  }

  const [provName, setProvName] = useState('')
  const [provType, setProvType] = useState<'traccar' | 'osmand' | 'custom_webhook'>('traccar')
  const [provKey, setProvKey] = useState('')

  const submitProvider = (): void => {
    if (!provName.trim()) return
    createProvider.mutate({ name: provName.trim(), type: provType, apiKey: provKey || undefined })
    setProvName(''); setProvKey('')
    setProviderFormOpen(false)
  }

  return (
    <section aria-labelledby="gps-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="gps-title" className="text-lg font-bold">تتبع الشاحنات (GPS)</h1>
          <p className="text-sm text-slate-500">
            يدعم Traccar وOsmAnd وأي مزود Webhook — المواقع تُحدَّث تلقائياً
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setProviderFormOpen((v) => !v)}>
            <Icon name="settings" size={15} />
            مزود جديد
          </Button>
          <Button onClick={() => setFormOpen((v) => !v)} data-testid="toggle-vehicle-form">
            <Icon name={formOpen ? 'x' : 'user-plus'} size={15} />
            {formOpen ? 'إغلاق' : 'شاحنة جديدة'}
          </Button>
        </div>
      </div>

      {/* نموذج المزود */}
      {providerFormOpen && (
        <form
          onSubmit={(e) => { e.preventDefault(); submitProvider() }}
          data-testid="provider-form"
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3"
        >
          <input value={provName} onChange={(e) => setProvName(e.target.value)}
            placeholder="اسم المزود" data-testid="provider-name"
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
          <select value={provType} onChange={(e) => setProvType(e.target.value as typeof provType)}
            data-testid="provider-type"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm">
            <option value="traccar">Traccar</option>
            <option value="osmand">OsmAnd HTTP</option>
            <option value="custom_webhook">Webhook مخصص</option>
          </select>
          <div className="flex gap-2">
            <input value={provKey} onChange={(e) => setProvKey(e.target.value)} dir="ltr"
              placeholder="API Key (اختياري)"
              className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm" />
            <Button type="submit" isLoading={createProvider.isPending}>إضافة</Button>
          </div>
        </form>
      )}

      {/* نموذج الشاحنة */}
      {formOpen && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4" data-testid="vehicle-form">
          <input value={plate} onChange={(e) => setPlate(e.target.value)}
            placeholder="رقم اللوحة · بغداد-1234" data-testid="vehicle-plate"
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="اسم الشاحنة" data-testid="vehicle-name"
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} dir="ltr"
            placeholder="معرف جهاز التتبع (uniqueId)" data-testid="vehicle-device"
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
          <Button onClick={submitVehicle} isLoading={createVehicle.isPending} data-testid="vehicle-submit">
            تسجيل الشاحنة
          </Button>
        </div>
      )}

      {vLoading && <LoadingSpinner label="جارٍ جلب الشاحنات…" />}

      {!vLoading && vehicles && vehicles.length === 0 && (
        <EmptyState title="لا شاحنات مسجلة" hint="سجل شاحنة + معرف جهاز التتبع لبدء المتابعة" />
      )}

      {vehicles && vehicles.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="vehicles-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                <th className="px-4 py-3 text-start font-semibold">الشاحنة</th>
                <th className="px-4 py-3 text-start font-semibold">اللوحة</th>
                <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">جهاز التتبع</th>
                <th className="px-4 py-3 text-start font-semibold">آخر موقع</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const pos = latestByVehicle.get(v.id)
                const providerName = providers?.find((p) => p.id === v.gps_provider_id)?.name
                const branchName = branches?.find((b) => b.id === v.branch_id)?.name
                return (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon name="truck" size={16} className="text-brand-600" />
                        {v.name}
                        {branchName && <span className="text-[11px] text-slate-400">· {branchName}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{v.plate}</td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 md:table-cell" dir="ltr">
                      {v.device_unique_id ?? '—'}
                      {providerName && <span className="text-slate-400"> ({providerName})</span>}
                    </td>
                    <td className="px-4 py-3">
                      {pos ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className={clsx(
                            'rounded-full px-2 py-0.5 font-bold',
                            (pos.speed_kmh ?? 0) > 5 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                          )}>
                            {Math.round(pos.speed_kmh ?? 0)} كم/س
                          </span>
                          <span className="text-slate-400" dir="ltr">
                            {pos.latitude.toFixed(3)}, {pos.longitude.toFixed(3)}
                          </span>
                          <span className="text-slate-400">{formatRelative(pos.fix_time)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">لا بيانات بعد</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
