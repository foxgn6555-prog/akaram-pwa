/**
 * صفحة «بيانات المحلة والزقاق» — المناطق التشغيلية الثماني (أربع لكل قاطع) مع محلات كل منطقة.
 * موظف الشكاوي يضيف/يعدّل/يعطّل المحلات؛ السجل يُستخدم لاقتراح المحلة أثناء فرز الصور
 * وربط التذكرة بمسؤول القسم الذي تضم مناطقه تلك المنطقة.
 */
import { useMemo, useState } from 'react'
import { MapPinned, Pencil, Plus, Save, X } from 'lucide-react'
import {
  COMPLAINT_AREAS, normalizeArabicName, useComplaintManagers, useComplaintNeighborhoods, useSaveComplaintNeighborhood,
  type ComplaintNeighborhood,
} from '@features/complaints'
import { useParentSectors } from '@features/sectors'

type Feedback = { kind: 'ok' | 'err'; text: string }

function errorText(error: unknown): string {
  const raw = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error ?? '')
  if (raw.includes('COMPLAINT_NEIGHBORHOOD_DUPLICATE')) return 'هذه المحلة مسجلة مسبقاً في المنطقة نفسها.'
  if (raw.includes('COMPLAINT_NEIGHBORHOOD_NAME_INVALID')) return 'اسم المحلة يجب أن يكون بين حرفين و60 حرفاً.'
  if (raw.includes('COMPLAINT_NEIGHBORHOOD_FORBIDDEN')) return 'لا تملك صلاحية تعديل بيانات المحلات.'
  return 'تعذر حفظ المحلة؛ أعد المحاولة.'
}

export function NeighborhoodsPanel() {
  const { data: registry = [], isLoading, isError } = useComplaintNeighborhoods()
  const { data: managers = [] } = useComplaintManagers()
  const save = useSaveComplaintNeighborhood()
  const { parents } = useParentSectors()   // 00394: القطاعات والمناطق من القاعدة
  const PARENTS = parents.map((p) => ({ id: p.code, label: p.title }))
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [search, setSearch] = useState('')
  const byArea = useMemo(() => {
    const map = new Map<number, ComplaintNeighborhood[]>()
    const key = normalizeArabicName(search)
    for (const entry of registry) {
      if (key && !normalizeArabicName(entry.name).includes(key)) continue
      map.set(entry.sectorId, [...(map.get(entry.sectorId) ?? []), entry])
    }
    return map
  }, [registry, search])
  const activeCount = registry.filter(entry => entry.isActive).length

  return <div className="space-y-5">
    <article className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
      <div className="flex items-start gap-3"><span className="rounded-2xl bg-white p-3 text-indigo-700 shadow-sm"><MapPinned /></span><div>
        <h2 className="font-black text-slate-900">بيانات المحلة والزقاق</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">سجّل محلات كل منطقة من المناطق الثماني. عند كتابة المحلة على صور البريد يقترحها النظام من هذا السجل ويربط التذكرة بالمنطقة، ثم يقترح مسؤول القسم الذي تضم مناطقه تلك المنطقة في شاشة الإسناد (إسناد تلقائي حسب المحلة). الزقاق يبقى حقلاً حراً على كل صورة.</p>
      </div></div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-xl bg-white px-3 py-2 text-slate-700">{activeCount} محلة فعّالة · {registry.length} إجمالاً</span>
        <input aria-label="بحث المحلات" value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن محلة" className="rounded-xl border bg-white px-3 py-2" />
      </div>
    </article>
    {feedback && <p aria-live="polite" className={`rounded-lg p-3 text-sm font-bold ${feedback.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{feedback.text}</p>}
    {isError && <p className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-800">تعذر تحميل سجل المحلات.</p>}
    {isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> : PARENTS.map(parent => <section key={parent.id} className="space-y-3">
      <h3 className="text-lg font-black text-slate-900">{parent.label}</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COMPLAINT_AREAS.filter(area => area.parent === parent.id).map(area => <AreaCard key={area.id} area={area}
          entries={byArea.get(area.id) ?? []}
          managers={managers.filter(manager => manager.sectorIds.includes(area.id)).map(manager => manager.fullName)}
          pending={save.isPending}
          onSave={(input, done) => save.mutate(input, {
            onSuccess: () => { setFeedback({ kind: 'ok', text: input.id ? 'تم تحديث المحلة.' : `تمت إضافة المحلة إلى ${area.name}.` }); done() },
            onError: error => setFeedback({ kind: 'err', text: errorText(error) }),
          })} />)}
      </div>
    </section>)}
  </div>
}

function AreaCard({ area, entries, managers, pending, onSave }: {
  area: { id: number; name: string }; entries: ComplaintNeighborhood[]; managers: string[]; pending: boolean
  onSave: (input: { id?: string; sectorId: number; name: string; isActive?: boolean }, done: () => void) => void
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const add = () => { const name = draft.trim(); if (name.length < 2) return; onSave({ sectorId: area.id, name }, () => setDraft('')) }
  return <article className="flex flex-col rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div><h4 className="font-black text-slate-900">{area.name}</h4><p className="mt-0.5 text-[11px] text-slate-500">{managers.length ? `مسؤول القسم: ${managers.join('، ')}` : 'لا مسؤول قسم مسند لهذه المنطقة بعد'}</p></div>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{entries.filter(entry => entry.isActive).length} محلة</span>
    </div>
    <ul className="mt-3 flex-1 space-y-1.5">
      {!entries.length && <li className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-400">لا توجد محلات مسجلة</li>}
      {entries.map(entry => <li key={entry.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm ${entry.isActive ? 'border-slate-200' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
        {editing?.id === entry.id
          ? <form className="flex flex-1 items-center gap-1" onSubmit={event => { event.preventDefault(); onSave({ id: entry.id, sectorId: area.id, name: editing.name, isActive: entry.isActive }, () => setEditing(null)) }}>
            <input aria-label={`تعديل اسم المحلة ${entry.name}`} autoFocus value={editing.name} onChange={event => setEditing({ id: entry.id, name: event.target.value })} className="min-w-0 flex-1 rounded-lg border px-2 py-1" />
            <button type="submit" disabled={pending} aria-label="حفظ الاسم" className="rounded-lg bg-indigo-700 p-1.5 text-white"><Save size={14} /></button>
            <button type="button" onClick={() => setEditing(null)} aria-label="إلغاء التعديل" className="rounded-lg border p-1.5"><X size={14} /></button>
          </form>
          : <>
            <span className="flex-1 truncate font-bold">{entry.name}</span>
            {entry.usageCount > 0 && <span className="text-[10px] text-slate-400">{entry.usageCount} تذكرة</span>}
            <button type="button" aria-label={`تعديل ${entry.name}`} onClick={() => setEditing({ id: entry.id, name: entry.name })} className="rounded-lg p-1 text-blue-700 hover:bg-blue-50"><Pencil size={14} /></button>
            <button type="button" disabled={pending} onClick={() => onSave({ id: entry.id, sectorId: area.id, name: entry.name, isActive: !entry.isActive }, () => undefined)} className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${entry.isActive ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>{entry.isActive ? 'تعطيل' : 'تفعيل'}</button>
          </>}
      </li>)}
    </ul>
    <form className="mt-3 flex items-center gap-1" onSubmit={event => { event.preventDefault(); add() }}>
      <input aria-label={`إضافة محلة إلى ${area.name}`} value={draft} onChange={event => setDraft(event.target.value)} placeholder="اسم المحلة (مثال: 903)" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
      <button type="submit" disabled={pending || draft.trim().length < 2} className="inline-flex items-center gap-1 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Plus size={14} />إضافة</button>
    </form>
  </article>
}
