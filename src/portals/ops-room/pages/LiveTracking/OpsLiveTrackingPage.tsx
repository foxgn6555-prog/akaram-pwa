/**
 * البث المباشر — غرفة العمليات (00287).
 * خريطة بالزونات الحالية + مواقع مسؤولي الأقسام والمتعهدين الذين يبثّون الآن (أثناء شفتهم فقط)،
 * فلاتر: الكل / المتعهدون / مسؤولو الأقسام، بحث بالاسم، قائمة جانبية (أسفل الخريطة على الهاتف)،
 * وجدول الزونات: من يُسنَد إلى كل زون ومن منهم يبث الآن. تحديث تلقائي كل دقيقة.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import LiveMap from '@features/live-tracking/LiveMap'
import { useLiveMapRows, useLiveZones } from '@features/live-tracking/useLiveMap'
import { LIVE_FILTERS, LIVE_KIND_COLOR, LIVE_KIND_LABEL, filterLiveRows, liveMarkerStyle, minutesAgoLabel, summarizeLive, timeHM, zoneOccupancy, zoneOf, type LiveFilter } from '@features/live-tracking/live-map.logic'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

const n = (v: number) => v.toLocaleString('en-US')
type Panel = 'people' | 'zones'

export default function OpsLiveTrackingPage() {
  const [filter, setFilter] = useState<LiveFilter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('people')
  const rowsQ = useLiveMapRows()
  const zonesQ = useLiveZones()
  const all = useMemo(() => rowsQ.data ?? [], [rowsQ.data])
  const zones = useMemo(() => zonesQ.data ?? [], [zonesQ.data])
  const rows = useMemo(() => filterLiveRows(all, filter, search), [all, filter, search])
  const sum = useMemo(() => summarizeLive(all), [all])
  const occupancy = useMemo(() => zoneOccupancy(zones, all), [zones, all])
  const error = rowsQ.error ?? zonesQ.error

  return (
    <div dir="rtl" className="flex min-h-0 flex-col gap-3 md:h-[calc(100dvh-5.5rem)]" data-testid="ops-live-tracking-page">
      <ExecPageHeader icon="map-pin" title="البث المباشر" subtitle="مواقع مسؤولي الأقسام والمتعهدين أثناء الشفت — تتحدث كل 15 دقيقة من هواتفهم وكل دقيقة هنا"
        stats={[
          { label: 'يبث الآن', value: n(sum.total) },
          { label: 'مسؤولو الأقسام', value: n(sum.managers) },
          { label: 'المتعهدون', value: n(sum.contractors) },
          { label: 'داخل الزون', value: n(sum.inZone), tone: 'green' },
          { label: 'خارج الزون', value: n(sum.outZone), tone: sum.outZone ? 'red' : 'plain' },
          { label: 'منقطع', value: n(sum.stale), tone: sum.stale ? 'gold' : 'plain' },
        ]}
        links={[{ to: '/ops-room/live-tracking/data', label: 'بيانات البث المباشر', icon: 'list' }]}
        actions={<HeaderButton icon="refresh" testId="live-refresh" onClick={() => { void rowsQ.refetch(); void zonesQ.refetch() }}>{rowsQ.isFetching ? 'جارٍ التحديث…' : 'تحديث الآن'}</HeaderButton>}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
        <div className="flex gap-1" role="tablist" data-testid="live-filters">
          {LIVE_FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} data-testid={`live-filter-${f.id}`} onClick={() => setFilter(f.id)}
              className={clsx('rounded-xl px-3 py-1.5 text-xs font-black transition', filter === f.id ? 'bg-[#0b3d6b] text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {f.label}
              <span className="mr-1 rounded-full bg-white/20 px-1.5 text-[10px]">{n(f.id === 'all' ? sum.total : f.id === 'manager' ? sum.managers : sum.contractors)}</span>
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو المنطقة…" data-testid="live-search"
          className="h-9 min-w-[160px] flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-[#0b3d6b]" />
        <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5 text-[11px] font-black">
          <button type="button" data-testid="live-panel-people" aria-pressed={panel === 'people'} onClick={() => setPanel('people')} className={clsx('rounded-lg px-2.5 py-1', panel === 'people' ? 'bg-white shadow' : 'text-slate-500')}>الأشخاص</button>
          <button type="button" data-testid="live-panel-zones" aria-pressed={panel === 'zones'} onClick={() => setPanel('zones')} className={clsx('rounded-lg px-2.5 py-1', panel === 'zones' ? 'bg-white shadow' : 'text-slate-500')}>الزونات ({n(zones.length)})</button>
        </div>
        {error && <div role="alert" className="w-full rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{disclosureErrorMessage(error)}</div>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[55dvh] min-h-[320px] md:h-full">
          <LiveMap rows={rows} zones={zones} selectedId={selected} onSelect={(r) => setSelected(r.user_id)} heightClass="h-full" />
        </div>
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm md:h-full">
          {panel === 'people' ? (
            <ul data-testid="live-people-list" className="min-h-0 flex-1 divide-y overflow-y-auto">
              {rowsQ.isLoading && <li className="p-4 text-center text-xs font-bold text-slate-500">جارٍ التحميل…</li>}
              {!rowsQ.isLoading && rows.length === 0 && <li className="p-4 text-center text-xs font-bold text-slate-500">لا يوجد بث مطابق الآن.</li>}
              {rows.map((r) => {
                const st = liveMarkerStyle(r); const z = zoneOf(zones, r)
                return (
                  <li key={r.user_id}>
                    <button type="button" data-testid={`live-row-${r.user_id}`} onClick={() => setSelected(r.user_id)} aria-pressed={selected === r.user_id}
                      className={clsx('flex w-full items-start gap-2 px-3 py-2 text-right transition hover:bg-slate-50', selected === r.user_id && 'bg-blue-50')}>
                      <span className="mt-1 size-3 shrink-0 rounded-full border-2" style={{ background: st.fill, borderColor: st.ring, opacity: st.opacity }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-slate-900">{r.full_name}</span>
                        <span className="block truncate text-[10px] font-bold text-slate-500">{LIVE_KIND_LABEL[r.kind]} · {r.area_names || '—'}{z ? ` · ${z.name}` : ''}</span>
                        <span className="block text-[10px] font-bold" style={{ color: r.in_zone === false ? '#dc2626' : r.stale ? '#b45309' : '#047857' }}>{st.label} · {timeHM(r.last_seen_at)} ({minutesAgoLabel(r.last_seen_at)})</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul data-testid="live-zones-list" className="min-h-0 flex-1 divide-y overflow-y-auto">
              {zonesQ.isLoading && <li className="p-4 text-center text-xs font-bold text-slate-500">جارٍ التحميل…</li>}
              {!zonesQ.isLoading && zones.length === 0 && <li className="p-4 text-center text-xs font-bold text-slate-500">لا توجد زونات مفعّلة — تُدار من وحدة بيانات GPS.</li>}
              {occupancy.map(({ zone, live, expected }) => (
                <li key={zone.id} data-testid={`live-zone-${zone.id}`} className="px-3 py-2 text-right">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-black text-slate-900"><span className="size-2.5 rounded-sm" style={{ background: zone.color || '#7c3aed' }} />{zone.name}</span>
                    <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', live.length ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>{n(live.length)} / {n(expected)} يبث</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500">{zone.area_name || 'بلا منطقة'}{zone.parent_sector ? ` · ${zone.parent_sector}` : ''}</div>
                  <div className="mt-0.5 text-[10px] font-bold text-slate-700"><span style={{ color: LIVE_KIND_COLOR.manager }}>مسؤول القسم:</span> {zone.manager_names || '—'}</div>
                  <div className="text-[10px] font-bold text-slate-700"><span style={{ color: LIVE_KIND_COLOR.contractor }}>المتعهد:</span> {zone.contractor_name || '—'}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
