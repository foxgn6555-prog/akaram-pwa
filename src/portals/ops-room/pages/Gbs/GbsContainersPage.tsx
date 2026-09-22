/**
 * غرفة العمليات — وحدة GBS الحاويات (00136)
 * خريطة كاملة + إضافة/تعديل/حذف + بحث متقدم + اعتماد أو رفض طلبات تحديث مسؤولي الأقسام.
 */
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import GbsMap from '@features/gbs/GbsMap'
import SignedPhoto from '@features/gbs/SignedPhoto'
import { GBS_STATUS_META, GBS_STATUS_ORDER, GBS_UPDATE_STATE_META } from '@features/gbs/statusMeta'
import {
  useGbsContainers,
  useGbsDeleteContainer,
  useGbsReviewUpdate,
  useGbsSaveContainer,
  useGbsUpdates,
} from '@features/gbs/hooks'
import { gbs } from '@sdk/gbs.sdk'
import type { GbsContainer, GbsContainerStatus, GbsUpdateState } from '@features/gbs/types'
import { useUiStore } from '@stores/ui.store'

type Draft = {
  id?: string
  label: string
  latitude: number | null
  longitude: number | null
  status: GbsContainerStatus
  imagePath: string | null
  notes: string
}

const emptyDraft = (): Draft => ({
  label: '',
  latitude: null,
  longitude: null,
  status: 'ok',
  imagePath: null,
  notes: '',
})

function PointCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) =>
      onPick(
        Number(event.latlng.lat.toFixed(7)),
        Number(event.latlng.lng.toFixed(7)),
      ),
  })
  return null
}

export default function GbsContainersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<GbsContainerStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GbsContainer | null>(null)
  const [queueState, setQueueState] = useState<GbsUpdateState>('pending')
  const [reviewNote, setReviewNote] = useState('')
  const [uploading, setUploading] = useState(false)

  const containers = useGbsContainers(search || null, statusFilter || null)
  const updates = useGbsUpdates(queueState)
  const save = useGbsSaveContainer()
  const remove = useGbsDeleteContainer()
  const review = useGbsReviewUpdate()
  const addToast = useUiStore((s) => s.addToast)

  const list = useMemo(() => containers.data ?? [], [containers.data])
  const stats = useMemo(() => {
    const counts: Record<GbsContainerStatus, number> = { ok: 0, damaged: 0, replace: 0, missing: 0 }
    for (const c of containers.data ?? []) counts[c.status] += 1
    return counts
  }, [containers.data])

  const openEdit = (container: GbsContainer) =>
    setDraft({
      id: container.id,
      label: container.label,
      latitude: container.latitude,
      longitude: container.longitude,
      status: container.status,
      imagePath: container.imagePath,
      notes: container.notes ?? '',
    })

  const submitDraft = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft) return
    if (draft.latitude == null || draft.longitude == null) {
      addToast({ type: 'error', message: 'حدّد إحداثيات الحاوية على الخريطة أو أدخلها يدوياً' })
      return
    }
    save.mutate(
      {
        id: draft.id ?? null,
        label: draft.label,
        latitude: draft.latitude,
        longitude: draft.longitude,
        status: draft.status,
        imagePath: draft.imagePath,
        notes: draft.notes || null,
      },
      { onSuccess: () => setDraft(null) },
    )
  }

  const pickImage = async (file: File | undefined) => {
    if (!file || !draft) return
    setUploading(true)
    try {
      const path = await gbs.uploadImage(file)
      setDraft({ ...draft, imagePath: path })
      addToast({ type: 'success', message: 'تم رفع صورة الحاوية' })
    } catch {
      addToast({ type: 'error', message: 'تعذر رفع الصورة — حاول بملف آخر' })
    } finally {
      setUploading(false)
    }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
  }

  const doReview = (updateId: string, approve: boolean) => {
    review.mutate(
      { updateId, approve, reviewNote: reviewNote || undefined },
      { onSuccess: () => setReviewNote('') },
    )
  }

  return (
    <section className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">GBS الحاويات</h1>
          <p className="mt-1 text-xs font-bold text-slate-500">
            خريطة الحاويات الكاملة — الإضافة والتعديل والحذف واعتماد تحديثات مسؤولي الأقسام من غرفة
            العمليات فقط.
          </p>
        </div>
        <button
          type="button"
          data-testid="gbs-add-container"
          onClick={() => setDraft(emptyDraft())}
          className="h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white"
        >
          إضافة حاوية
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GBS_STATUS_ORDER.map((key) => (
          <div
            key={key}
            className="rounded-2xl border bg-white p-3 text-center"
            data-testid={`gbs-stat-${key}`}
          >
            <p className="text-2xl font-black" style={{ color: GBS_STATUS_META[key].color }}>
              {stats[key]}
            </p>
            <p className="text-[11px] font-bold text-slate-500">{GBS_STATUS_META[key].label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3">
        <input
          data-testid="gbs-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث متقدم: الرمز، الاسم، أو الملاحظات…"
          className="h-10 min-w-52 flex-1 rounded-xl border px-3 text-sm"
        />
        <select
          data-testid="gbs-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as GbsContainerStatus | '')}
          className="h-10 rounded-xl border bg-white px-3 text-sm"
          aria-label="فلتر الحالة"
        >
          <option value="">كل الحالات</option>
          {GBS_STATUS_ORDER.map((key) => (
            <option key={key} value={key}>
              {GBS_STATUS_META[key].label}
            </option>
          ))}
        </select>
        <span className="text-xs font-black text-slate-500" data-testid="gbs-result-count">
          {list.length} نتيجة
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {containers.isLoading ? (
            <div className="flex h-[520px] items-center justify-center rounded-3xl border bg-white text-sm font-bold text-slate-400">
              جارٍ تحميل الخريطة…
            </div>
          ) : (
            <GbsMap
              containers={list}
              selectedId={selectedId}
              onSelect={(container) => setSelectedId(container.id)}
              renderPopupActions={(container) => (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    data-testid={`gbs-edit-${container.id}`}
                    onClick={() => openEdit(container)}
                    className="rounded-lg bg-cyan-700 px-2 py-1 text-[10px] font-black text-white"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    data-testid={`gbs-delete-${container.id}`}
                    onClick={() => setDeleteTarget(container)}
                    className="rounded-lg bg-rose-700 px-2 py-1 text-[10px] font-black text-white"
                  >
                    حذف
                  </button>
                </div>
              )}
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-white p-3">
            <h2 className="text-sm font-black">الحاويات ({list.length})</h2>
            {list.map((container) => (
              <button
                key={container.id}
                type="button"
                data-testid={`gbs-list-item-${container.id}`}
                onClick={() => setSelectedId(container.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-2 text-right transition ${
                  container.id === selectedId ? 'border-cyan-500 bg-cyan-50' : 'bg-white'
                }`}
              >
                <span className="text-xs font-black">
                  {container.code} · {container.label}
                </span>
                <span className="flex items-center gap-1">
                  {container.pendingCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">
                      {container.pendingCount} طلب
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black ${GBS_STATUS_META[container.status].chip}`}
                  >
                    {GBS_STATUS_META[container.status].label}
                  </span>
                </span>
              </button>
            ))}
            {list.length === 0 && (
              <p className="p-2 text-xs font-bold text-slate-400">لا نتائج مطابقة للبحث.</p>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black">طلبات تحديث الحالة</h2>
              <select
                data-testid="gbs-queue-state"
                value={queueState}
                onChange={(event) => setQueueState(event.target.value as GbsUpdateState)}
                className="h-8 rounded-lg border bg-white px-2 text-[11px] font-bold"
                aria-label="حالة الطلبات"
              >
                <option value="pending">معلقة</option>
                <option value="approved">معتمدة</option>
                <option value="rejected">مرفوضة</option>
              </select>
            </div>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {(updates.data ?? []).map((request) => (
                <div key={request.id} className="rounded-xl border p-2" data-testid={`gbs-update-${request.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black">
                      {request.code} · {request.label}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black ${GBS_STATUS_META[request.proposedStatus].chip}`}
                    >
                      {GBS_STATUS_META[request.proposedStatus].label}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">
                    {request.requesterName ?? 'مسؤول قسم'} ·{' '}
                    {GBS_UPDATE_STATE_META[request.state].label}
                  </p>
                  {request.note && <p className="mt-1 text-[10px] text-slate-600">{request.note}</p>}
                  {request.photoPath && (
                    <div className="mt-1">
                      <SignedPhoto path={request.photoPath} alt={`صورة طلب ${request.code}`} />
                    </div>
                  )}
                  {request.reviewNote && (
                    <p className="mt-1 text-[10px] font-bold text-slate-500">
                      ملاحظة المراجعة: {request.reviewNote}
                    </p>
                  )}
                  {request.state === 'pending' && (
                    <>
                      <input
                        data-testid={`gbs-review-note-${request.id}`}
                        value={reviewNote}
                        onChange={(event) => setReviewNote(event.target.value)}
                        placeholder="ملاحظة اعتماد/رفض (اختياري)"
                        maxLength={500}
                        className="mt-2 h-8 w-full rounded-lg border px-2 text-[11px]"
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          data-testid={`gbs-approve-${request.id}`}
                          onClick={() => doReview(request.id, true)}
                          disabled={review.isPending}
                          className="h-9 rounded-lg bg-emerald-700 text-[11px] font-black text-white disabled:opacity-50"
                        >
                          اعتماد وتطبيق
                        </button>
                        <button
                          type="button"
                          data-testid={`gbs-reject-${request.id}`}
                          onClick={() => doReview(request.id, false)}
                          disabled={review.isPending}
                          className="h-9 rounded-lg bg-rose-700 text-[11px] font-black text-white disabled:opacity-50"
                        >
                          رفض
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {(updates.data ?? []).length === 0 && (
                <p className="p-2 text-xs font-bold text-slate-400">
                  لا توجد طلبات {GBS_UPDATE_STATE_META[queueState].label}.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {draft && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/70 p-3"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={submitDraft}
            className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-white p-5"
          >
            <h2 className="text-lg font-black">
              {draft.id ? `تعديل الحاوية ${list.find((c) => c.id === draft.id)?.code ?? ''}` : 'إضافة حاوية جديدة'}
            </h2>
            <input
              data-testid="gbs-label"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="اسم/وصف الحاوية (2-120 حرفاً)"
              maxLength={120}
              className="h-11 w-full rounded-xl border px-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] font-black text-slate-500">
                خط العرض
                <input
                  data-testid="gbs-lat"
                  type="number"
                  step="0.0000001"
                  min={-90}
                  max={90}
                  value={draft.latitude ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      latitude: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  className="h-10 w-full rounded-xl border px-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-[11px] font-black text-slate-500">
                خط الطول
                <input
                  data-testid="gbs-lng"
                  type="number"
                  step="0.0000001"
                  min={-180}
                  max={180}
                  value={draft.longitude ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      longitude: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  className="h-10 w-full rounded-xl border px-2 text-sm"
                />
              </label>
            </div>
            <div className="relative h-56 overflow-hidden rounded-2xl border bg-slate-900">
              <div className="absolute right-3 top-3 z-[1000] rounded-xl bg-slate-950/85 px-3 py-1.5 text-[10px] font-black text-white">
                انقر على الخريطة لتحديد موقع الحاوية
              </div>
              <MapContainer
                center={[draft.latitude ?? 33.3152, draft.longitude ?? 44.3661]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <PointCapture
                  onPick={(lat, lng) => setDraft((prev) => (prev ? { ...prev, latitude: lat, longitude: lng } : prev))}
                />
                {draft.latitude != null && draft.longitude != null && (
                  <CircleMarker
                    center={[draft.latitude, draft.longitude]}
                    radius={10}
                    pathOptions={{
                      color: '#fff',
                      weight: 2,
                      fillColor: GBS_STATUS_META[draft.status].color,
                      fillOpacity: 0.95,
                    }}
                  />
                )}
              </MapContainer>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-black text-slate-500">حالة الحاوية</p>
              <div className="grid grid-cols-4 gap-2">
                {GBS_STATUS_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    data-testid={`gbs-status-${key}`}
                    onClick={() => setDraft({ ...draft, status: key })}
                    className={`h-10 rounded-xl text-[11px] font-black transition ${
                      draft.status === key ? 'text-white' : 'border bg-white text-slate-600'
                    }`}
                    style={draft.status === key ? { background: GBS_STATUS_META[key].color } : undefined}
                  >
                    {GBS_STATUS_META[key].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1 text-[11px] font-black text-slate-500">
              صورة الحاوية (اختياري)
              <input
                data-testid="gbs-image"
                type="file"
                accept="image/*"
                onChange={(event) => void pickImage(event.target.files?.[0])}
                className="w-full rounded-xl border p-2 text-xs"
              />
            </label>
            {uploading && <p className="text-[11px] font-bold text-slate-400">جارٍ رفع الصورة…</p>}
            {draft.imagePath && (
              <SignedPhoto path={draft.imagePath} alt="صورة الحاوية" className="h-28 w-full rounded-xl object-cover" />
            )}
            <textarea
              data-testid="gbs-notes"
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="ملاحظات (اختياري — 500 حرف كحد أقصى)"
              maxLength={500}
              rows={2}
              className="w-full rounded-xl border p-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="h-11 rounded-xl border font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                data-testid="gbs-save"
                disabled={save.isPending || draft.label.trim().length < 2}
                className="h-11 rounded-xl bg-cyan-700 font-black text-white disabled:opacity-50"
              >
                {draft.id ? 'حفظ التعديلات' : 'إضافة إلى الخريطة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/70 p-3"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center">
            <h2 className="text-lg font-black">حذف الحاوية؟</h2>
            <p className="mt-2 text-xs font-bold text-slate-500">
              سيُحذف {deleteTarget.code} · {deleteTarget.label} وكل طلبات التحديث المرتبطة بها نهائياً.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-xl border font-bold"
              >
                تراجع
              </button>
              <button
                type="button"
                data-testid="gbs-confirm-delete"
                onClick={confirmDelete}
                disabled={remove.isPending}
                className="h-11 rounded-xl bg-rose-700 font-black text-white disabled:opacity-50"
              >
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
