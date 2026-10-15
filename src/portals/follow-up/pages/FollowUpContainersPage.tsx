/**
 * بوابة المتابعة — متابعة الحاويات (00260)
 * يرى المتابِع حاويات مناطق نطاقه فقط (خريطة + قائمة)، ويقترح «تحديث الموقع» إلى إحداثيات هاتفه الحالية.
 * الطلب معلّق ولا يُطبَّق إلا بعد اعتماد غرفة العمليات (الآلية نفسها لطلبات مسؤول القسم).
 */
import { useEffect, useMemo, useState } from 'react'
import { Crosshair, LocateFixed, MapPin } from 'lucide-react'
import GbsMap from '@features/gbs/GbsMap'
import { GBS_STATUS_META, GBS_STATUS_ORDER, GBS_UPDATE_STATE_META } from '@features/gbs/statusMeta'
import { useGbsContainers, useGbsMyUpdates, useGbsRequestLocation, useGbsZones } from '@features/gbs/hooks'
import type { GbsContainer, GbsContainerStatus } from '@features/gbs/types'
import { PARENT_AR, dateAr } from '@features/contractors/format'
import { distanceMeters } from '@features/gbs/geo'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

type Geo = { latitude: number; longitude: number; accuracy: number | null }

function useGeolocation() {
  const [geo, setGeo] = useState<Geo | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setError('المتصفح لا يدعم تحديد الموقع'); return }
    setBusy(true); setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setGeo({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? null }); setBusy(false) },
      (e) => { setError(e.code === 1 ? 'رفضت إذن الموقع — فعّله من إعدادات المتصفح' : 'تعذّر تحديد الموقع، حاول مجدداً'); setBusy(false) },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }
  useEffect(() => { locate() }, [])
  return { geo, error, busy, locate }
}

export default function FollowUpContainersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<GbsContainerStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [target, setTarget] = useState<GbsContainer | null>(null)
  const [note, setNote] = useState('')
  const containers = useGbsContainers(search || null, statusFilter || null)
  const zones = useGbsZones()
  const myUpdates = useGbsMyUpdates()
  const request = useGbsRequestLocation()
  const { geo, error: geoError, busy: geoBusy, locate } = useGeolocation()
  const list = useMemo(() => containers.data ?? [], [containers.data])
  const pendingMine = useMemo(() => new Set((myUpdates.data ?? []).filter((u) => u.state === 'pending' && u.kind === 'location').map((u) => u.containerId)), [myUpdates.data])
  const dist = target && geo ? distanceMeters(target.latitude, target.longitude, geo.latitude, geo.longitude) : null
  const canSend = Boolean(target && geo && !pendingMine.has(target.id) && !request.isPending)
  const send = () => {
    if (!target || !geo) return
    request.mutate({ containerId: target.id, latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy, note: note || null }, { onSuccess: () => { setTarget(null); setNote('') } })
  }
  return (
    <div className="space-y-4" data-testid="follow-up-containers">
      <ExecPageHeader icon="box" title="متابعة الحاويات" subtitle="حاويات مناطق نطاقك. قف عند الحاوية واضغط «تحديث الموقع» ليُقترح موقعها الجديد من GPS هاتفك — يبقى الطلب معلّقاً ولا يتغير موقع الحاوية إلا بعد اعتماد غرفة العمليات." />
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث: رمز/اسم/منطقة" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" data-testid="fu-gbs-search" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as GbsContainerStatus | '')} className="rounded-xl border px-3 py-2 text-sm" data-testid="fu-gbs-status">
          <option value="">كل الحالات</option>
          {GBS_STATUS_ORDER.map((s) => <option key={s} value={s}>{GBS_STATUS_META[s].label}</option>)}
        </select>
        <span className="text-xs font-bold text-slate-600" data-testid="fu-gbs-count">{list.length} حاوية</span>
      </section>
      <section className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 text-xs ${geo ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} data-testid="fu-geo-status">
        <LocateFixed size={14} />
        {geo ? <span>موقعك الحالي: {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}{geo.accuracy != null ? ` · دقة ±${Math.round(geo.accuracy)} م` : ''}</span> : <span>{geoError ?? (geoBusy ? 'جارٍ تحديد موقعك…' : 'لم يُحدَّد موقعك بعد')}</span>}
        <button type="button" onClick={locate} disabled={geoBusy} className="ms-auto rounded-lg border bg-white px-3 py-1 font-black disabled:opacity-50" data-testid="fu-geo-refresh">تحديث موقعي</button>
      </section>
      {containers.isLoading ? <LoadingSpinner /> : list.length === 0 ? <EmptyState title="لا حاويات في نطاقك" hint="تُسجَّل الحاويات من غرفة العمليات بمنطقتها؛ تأكد من نطاق متابعتك من التطوير المركزية" /> : (
        <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <GbsMap containers={list} zones={zones.data ?? []} selectedId={selectedId} onSelect={(c) => setSelectedId(c.id)} heightClass="h-[60vh] min-h-[320px]"
            renderPopupActions={(c) => (
              <button type="button" data-testid={`fu-gbs-move-${c.id}`} onClick={() => setTarget(c)} className="mt-1 w-full rounded-lg bg-green-700 px-2 py-1 text-[10px] font-black text-white">تحديث الموقع إلى مكاني</button>
            )} />
          <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-2xl border bg-white p-3" data-testid="fu-gbs-list">
            {list.map((c) => {
              const d = geo ? distanceMeters(c.latitude, c.longitude, geo.latitude, geo.longitude) : null
              return (
                <div key={c.id} className={`rounded-xl border p-2 ${selectedId === c.id ? 'border-green-500 bg-green-50' : ''}`} data-testid={`fu-gbs-item-${c.id}`}>
                  <button type="button" onClick={() => setSelectedId(c.id)} className="flex w-full items-center justify-between text-right">
                    <div>
                      <p className="text-xs font-black">{c.code} · {c.label}</p>
                      <p className="text-[10px] text-slate-500">{c.areaName} · {PARENT_AR[c.parentSector] ?? c.parentSector}{d != null ? ` · يبعد ${d} م` : ''}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${GBS_STATUS_META[c.status].chip}`}>{GBS_STATUS_META[c.status].label}</span>
                  </button>
                  <div className="mt-1 flex items-center justify-between">
                    {pendingMine.has(c.id) ? <span className="text-[10px] font-bold text-amber-700" data-testid={`fu-gbs-pending-${c.id}`}>بانتظار اعتماد غرفة العمليات</span> : <span />}
                    <button type="button" onClick={() => setTarget(c)} disabled={pendingMine.has(c.id)} className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-2 py-1 text-[10px] font-black text-white disabled:opacity-40" data-testid={`fu-gbs-move-btn-${c.id}`}><Crosshair size={11} />تحديث الموقع</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {target && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="تأكيد تحديث موقع الحاوية" data-testid="fu-move-dialog">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
            <h3 className="font-black">تحديث موقع الحاوية {target.code}</h3>
            <p className="mt-1 text-xs text-slate-600">{target.label} · {target.areaName}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-xl bg-slate-50 p-2"><div className="font-bold text-slate-500">الموقع المسجّل</div><div className="font-mono">{target.latitude.toFixed(6)}, {target.longitude.toFixed(6)}</div></div>
              <div className="rounded-xl bg-green-50 p-2"><div className="font-bold text-slate-500">موقعك الآن</div><div className="font-mono" data-testid="fu-move-new">{geo ? `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}` : '—'}</div></div>
            </div>
            {dist != null && <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-700" data-testid="fu-move-distance"><MapPin size={12} />الفرق عن الموقع المسجّل: {dist} م{geo?.accuracy != null ? ` · دقة GPS ±${Math.round(geo.accuracy)} م` : ''}</p>}
            {!geo && <p className="mt-2 text-xs font-bold text-rose-700">{geoError ?? 'لم يُحدَّد موقعك بعد — اضغط «تحديث موقعي»'}</p>}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="ملاحظة لغرفة العمليات (اختياري)" className="mt-3 h-10 w-full rounded-xl border px-3 text-sm" data-testid="fu-move-note" />
            <p className="mt-2 text-[11px] text-slate-500">سيُرسل كطلب معلّق إلى غرفة العمليات؛ لا يتغير موقع الحاوية قبل الاعتماد.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={send} disabled={!canSend} className="h-11 rounded-xl bg-green-700 text-sm font-black text-white disabled:opacity-40" data-testid="fu-move-send">إرسال الطلب</button>
              <button type="button" onClick={() => setTarget(null)} className="h-11 rounded-xl border text-sm font-black" data-testid="fu-move-cancel">إلغاء</button>
            </div>
          </div>
        </div>
      )}
      <section className="rounded-2xl border bg-white p-3 shadow-sm">
        <h2 className="text-sm font-black">طلباتي</h2>
        {(myUpdates.data ?? []).length === 0 ? <p className="mt-1 text-xs text-slate-400">لا طلبات بعد.</p> : (
          <ul className="mt-2 space-y-1" data-testid="fu-my-updates">
            {(myUpdates.data ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-xs" data-testid={`fu-my-update-${u.id}`}>
                <span className="font-black">{u.code} · {u.label}</span>
                <span className="text-slate-500">{u.kind === 'location' ? `موقع جديد (${u.proposedLatitude?.toFixed(5)}, ${u.proposedLongitude?.toFixed(5)})` : `حالة: ${GBS_STATUS_META[u.proposedStatus].label}`} · {dateAr(u.createdAt)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${GBS_UPDATE_STATE_META[u.state].chip}`}>{GBS_UPDATE_STATE_META[u.state].label}</span>
                {u.reviewNote && <span className="w-full text-[10px] text-slate-500">ملاحظة غرفة العمليات: {u.reviewNote}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
