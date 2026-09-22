/**
 * مسؤول القسم — وحدة GBS الحاويات (00136)
 * الخريطة نفسها للقراءة + اقتراح تحديث حالة (مع صورة اختيارية) لا يُطبق إلا بعد موافقة غرفة العمليات.
 */
import { useMemo, useState } from 'react'
import GbsMap from '@features/gbs/GbsMap'
import SignedPhoto from '@features/gbs/SignedPhoto'
import { GBS_STATUS_META, GBS_STATUS_ORDER, GBS_UPDATE_STATE_META } from '@features/gbs/statusMeta'
import { useGbsContainers, useGbsMyUpdates, useGbsRequestUpdate } from '@features/gbs/hooks'
import { gbs } from '@sdk/gbs.sdk'
import type { GbsContainer, GbsContainerStatus } from '@features/gbs/types'
import { useUiStore } from '@stores/ui.store'

export default function GbsContainersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<GbsContainerStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [proposeFor, setProposeFor] = useState<GbsContainer | null>(null)
  const [proposed, setProposed] = useState<GbsContainerStatus>('damaged')
  const [note, setNote] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const containers = useGbsContainers(search || null, statusFilter || null)
  const myUpdates = useGbsMyUpdates()
  const request = useGbsRequestUpdate()
  const addToast = useUiStore((s) => s.addToast)

  const list = useMemo(() => containers.data ?? [], [containers.data])

  const openPropose = (container: GbsContainer) => {
    setProposeFor(container)
    setProposed(container.status === 'ok' ? 'damaged' : container.status)
    setNote('')
    setPhotoPath(null)
  }

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      setPhotoPath(await gbs.uploadImage(file))
      addToast({ type: 'success', message: 'تم إرفاق الصورة بالطلب' })
    } catch {
      addToast({ type: 'error', message: 'تعذر رفع الصورة — حاول بملف آخر' })
    } finally {
      setUploading(false)
    }
  }

  const submitProposal = (event: React.FormEvent) => {
    event.preventDefault()
    if (!proposeFor) return
    request.mutate(
      {
        containerId: proposeFor.id,
        proposedStatus: proposed,
        photoPath,
        note: note || null,
      },
      { onSuccess: () => setProposeFor(null) },
    )
  }

  return (
    <section className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-black">حاويات GBS</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">
          مسؤوليتك تحديث البيانات: انقر على حاوية واقترح حالتها الجديدة. لا تتغير البيانات تلقائياً —
          تعتمد غرفة العمليات طلبك أولاً.
        </p>
      </header>

      <div
        className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-black text-amber-900"
        data-testid="gbs-approval-banner"
      >
        كل تحديث ترسله يبقى «قيد الانتظار» حتى توافق غرفة العمليات، ويصلك إشعار بالاعتماد أو الرفض.
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3">
        <input
          data-testid="gbs-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث بالرمز أو الاسم أو الملاحظات…"
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
        <span className="text-xs font-black text-slate-500">{list.length} نتيجة</span>
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
                <button
                  type="button"
                  data-testid={`gbs-propose-${container.id}`}
                  onClick={() => openPropose(container)}
                  className="mt-1 w-full rounded-lg bg-cyan-700 px-2 py-1 text-[10px] font-black text-white"
                >
                  اقتراح تحديث الحالة
                </button>
              )}
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-white p-3">
            <h2 className="text-sm font-black">الحاويات</h2>
            {list.map((container) => (
              <button
                key={container.id}
                type="button"
                data-testid={`gbs-list-item-${container.id}`}
                onClick={() => {
                  setSelectedId(container.id)
                  openPropose(container)
                }}
                className={`flex w-full items-center justify-between rounded-xl border p-2 text-right transition ${
                  container.id === selectedId ? 'border-cyan-500 bg-cyan-50' : 'bg-white'
                }`}
              >
                <span className="text-xs font-black">
                  {container.code} · {container.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black ${GBS_STATUS_META[container.status].chip}`}
                >
                  {GBS_STATUS_META[container.status].label}
                </span>
              </button>
            ))}
            {list.length === 0 && (
              <p className="p-2 text-xs font-bold text-slate-400">لا نتائج مطابقة للبحث.</p>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-3">
            <h2 className="text-sm font-black">طلباتي</h2>
            <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {(myUpdates.data ?? []).map((requestRow) => (
                <div
                  key={requestRow.id}
                  className="rounded-xl border p-2"
                  data-testid={`gbs-my-request-${requestRow.id}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black">
                      {requestRow.code} · {requestRow.label}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                        GBS_UPDATE_STATE_META[requestRow.state].chip
                      }`}
                    >
                      {GBS_UPDATE_STATE_META[requestRow.state].label}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">
                    الحالة المقترحة: {GBS_STATUS_META[requestRow.proposedStatus].label}
                  </p>
                  {requestRow.note && (
                    <p className="mt-1 text-[10px] text-slate-600">{requestRow.note}</p>
                  )}
                  {requestRow.photoPath && (
                    <div className="mt-1">
                      <SignedPhoto path={requestRow.photoPath} alt="صورة الطلب" />
                    </div>
                  )}
                  {requestRow.reviewNote && (
                    <p className="mt-1 text-[10px] font-bold text-slate-500">
                      ملاحظة غرفة العمليات: {requestRow.reviewNote}
                    </p>
                  )}
                </div>
              ))}
              {(myUpdates.data ?? []).length === 0 && (
                <p className="p-2 text-xs font-bold text-slate-400">لم ترسل أي طلب بعد.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {proposeFor && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/70 p-3"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={submitProposal}
            className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-3xl bg-white p-5"
          >
            <h2 className="text-lg font-black">
              اقتراح تحديث · {proposeFor.code} — {proposeFor.label}
            </h2>
            <p className="text-xs font-bold text-slate-500">
              الحالة الحالية:{' '}
              <span style={{ color: GBS_STATUS_META[proposeFor.status].color }}>
                {GBS_STATUS_META[proposeFor.status].label}
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {GBS_STATUS_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`gbs-proposed-${key}`}
                  onClick={() => setProposed(key)}
                  className={`h-11 rounded-xl text-xs font-black transition ${
                    proposed === key ? 'text-white' : 'border bg-white text-slate-600'
                  }`}
                  style={proposed === key ? { background: GBS_STATUS_META[key].color } : undefined}
                >
                  {GBS_STATUS_META[key].label}
                </button>
              ))}
            </div>
            <label className="block space-y-1 text-[11px] font-black text-slate-500">
              صورة للحاوية مع التحديث (اختياري)
              <input
                data-testid="gbs-update-photo"
                type="file"
                accept="image/*"
                onChange={(event) => void pickPhoto(event.target.files?.[0])}
                className="w-full rounded-xl border p-2 text-xs"
              />
            </label>
            {uploading && <p className="text-[11px] font-bold text-slate-400">جارٍ رفع الصورة…</p>}
            {photoPath && (
              <SignedPhoto path={photoPath} alt="صورة التحديث" className="h-28 w-full rounded-xl object-cover" />
            )}
            <textarea
              data-testid="gbs-update-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="اشرح سبب التحديث (مثال: تضرر الغطاء بعد الأمطار)"
              maxLength={500}
              rows={3}
              className="w-full rounded-xl border p-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProposeFor(null)}
                className="h-11 rounded-xl border font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                data-testid="gbs-submit-update"
                disabled={request.isPending}
                className="h-11 rounded-xl bg-cyan-700 font-black text-white disabled:opacity-50"
              >
                إرسال إلى غرفة العمليات
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
