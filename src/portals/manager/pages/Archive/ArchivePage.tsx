/**
 * الأرشيف — كل ما رُفعه ونُقل للأرشيف: الكتب، بلاغات الأعطال، الصور، العمال، الآليات.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  useSupplies, useBreakdowns, usePhotos, useWorkers, useVehicles,
} from '@features/sector'
import { sectorPhotos } from '@sdk/sector.sdk'
import { Icon } from '@components/ui/Icon/Icon'
import { EmptyState } from '@components/feedback/EmptyState'

type TabKey = 'supplies' | 'breakdowns' | 'photos' | 'workers' | 'vehicles'

const TABS: { key: TabKey; label: string; icon: 'send' | 'alert-triangle' | 'photo' | 'users' | 'truck' }[] = [
  { key: 'supplies', label: 'كتب المستلزمات', icon: 'send' },
  { key: 'breakdowns', label: 'بلاغات الأعطال', icon: 'alert-triangle' },
  { key: 'photos', label: 'الصور', icon: 'photo' },
  { key: 'workers', label: 'العمال', icon: 'users' },
  { key: 'vehicles', label: 'الآليات', icon: 'truck' },
]

export default function ArchivePage() {
  const [tab, setTab] = useState<TabKey>('supplies')
  const supplies = useSupplies('archived')
  const breakdowns = useBreakdowns('archived')
  const photos = usePhotos('archived')
  const workers = useWorkers(false)
  const vehicles = useVehicles(false)

  return (
    <div className="space-y-5" data-testid="archive-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">الأرشيف</h1>
        <p className="text-sm text-slate-500">الكتب والبلاغات والصور والعناصر المؤرشفة الخاصة بقواطعك.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx('flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold',
              tab === t.key ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`arch-${tab}`}>
        {tab === 'supplies' && <SuppliesArch data={supplies.data ?? []} loading={supplies.isLoading} />}
        {tab === 'breakdowns' && <BreakdownsArch data={breakdowns.data ?? []} loading={breakdowns.isLoading} />}
        {tab === 'photos' && <PhotosArch data={photos.data ?? []} loading={photos.isLoading} />}
        {tab === 'workers' && <WorkersArch data={workers.data ?? []} loading={workers.isLoading} />}
        {tab === 'vehicles' && <VehiclesArch data={vehicles.data ?? []} loading={vehicles.isLoading} />}
      </div>
    </div>
  )
}

function ArchWrap({ loading, count, emptyTitle, children }: {
  loading: boolean; count: number; emptyTitle: string; children: React.ReactNode
}) {
  if (loading) return <p className="py-8 text-center text-sm text-slate-400">جارٍ الجلب…</p>
  if (count === 0) return <EmptyState title={emptyTitle} hint="ستظهر هنا العناصر المؤرشفة" />
  return <>{children}</>
}

function SuppliesArch({ data, loading }: { data: ReturnType<typeof useSupplies>['data']; loading: boolean }) {
  return (
    <ArchWrap loading={loading} count={data?.length ?? 0} emptyTitle="لا كتب مؤرشفة">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="bg-slate-50/70 text-xs text-slate-500">
            <th className="px-3 py-2.5 font-semibold">رقم الكتاب</th>
            <th className="px-3 py-2.5 font-semibold">المستلزمات</th>
            <th className="px-3 py-2.5 font-semibold">العدد</th>
            <th className="px-3 py-2.5 font-semibold">تاريخ الأرشفة</th>
          </tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className="border-t border-slate-50">
                <td className="px-3 py-2.5 text-xs font-bold text-slate-700 dir-ltr">{r.ref_no ?? '—'}</td>
                <td className="px-3 py-2.5">{r.supply_type}</td>
                <td className="px-3 py-2.5 font-bold dir-ltr">{r.quantity}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{(r.archived_at ?? r.created_at ?? '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ArchWrap>
  )
}

function BreakdownsArch({ data, loading }: { data: ReturnType<typeof useBreakdowns>['data']; loading: boolean }) {
  return (
    <ArchWrap loading={loading} count={data?.length ?? 0} emptyTitle="لا بلاغات مؤرشفة">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr className="bg-slate-50/70 text-xs text-slate-500">
            <th className="px-3 py-2.5 font-semibold">DB</th>
            <th className="px-3 py-2.5 font-semibold">العطل</th>
            <th className="px-3 py-2.5 font-semibold">السبب/ملاحظات</th>
            <th className="px-3 py-2.5 font-semibold">التاريخ</th>
          </tr></thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-t border-slate-50">
                <td className="px-3 py-2.5 font-bold text-orange-700 dir-ltr">{b.db_number}</td>
                <td className="px-3 py-2.5">{b.fault_type}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{b.archive_reason ?? b.notes ?? '—'}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{(b.archived_at ?? b.created_at ?? '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ArchWrap>
  )
}

function PhotosArch({ data, loading }: { data: ReturnType<typeof usePhotos>['data']; loading: boolean }) {
  return (
    <ArchWrap loading={loading} count={data?.length ?? 0} emptyTitle="لا صور مؤرشفة">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data?.map((p) => <ArchPhoto key={p.id} path={p.storage_path} caption={p.caption} />)}
      </div>
    </ArchWrap>
  )
}

function ArchPhoto({ path, caption }: { path: string; caption: string | null }) {
  const q = useQuery({
    queryKey: ['sector-photo-url-arch', path],
    queryFn: () => sectorPhotos.signedUrl(path),
    staleTime: 20 * 60 * 1000,
    enabled: !!path,
  })
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200">
      <div className="aspect-video bg-slate-100">
        {q.data ? <img src={q.data} alt={caption ?? ''} className="size-full object-cover" loading="lazy" /> :
          <div className="flex size-full items-center justify-center text-slate-400"><Icon name="photo" size={22} /></div>}
      </div>
      <figcaption className="truncate px-2 py-1.5 text-[11px] text-slate-600">{caption ?? 'بدون وصف'}</figcaption>
    </figure>
  )
}

function WorkersArch({ data, loading }: { data: ReturnType<typeof useWorkers>['data']; loading: boolean }) {
  return (
    <ArchWrap loading={loading} count={data?.length ?? 0} emptyTitle="لا عمال مؤرشفون">
      <ul className="divide-y divide-slate-50">
        {data?.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-2 py-2.5 text-sm">
            <Icon name="users" size={16} className="text-slate-400" />
            <span className="font-medium">{w.full_name}</span>
            <span className="text-xs text-slate-500">{w.job_title ?? ''}</span>
            <span className="ms-auto text-xs text-slate-400">{(w.archived_at ?? w.created_at ?? '').slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </ArchWrap>
  )
}

function VehiclesArch({ data, loading }: { data: ReturnType<typeof useVehicles>['data']; loading: boolean }) {
  return (
    <ArchWrap loading={loading} count={data?.length ?? 0} emptyTitle="لا آليات مؤرشفة">
      <ul className="divide-y divide-slate-50">
        {data?.map((v) => (
          <li key={v.id} className="flex items-center gap-3 px-2 py-2.5 text-sm">
            <Icon name="truck" size={16} className="text-slate-400" />
            <span className="font-bold text-brand-700 dir-ltr">{v.db_number}</span>
            <span className="text-xs text-slate-500">{v.vehicle_type ?? ''}</span>
            <span className="ms-auto text-xs text-slate-400">{(v.archived_at ?? v.created_at ?? '').slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </ArchWrap>
  )
}
