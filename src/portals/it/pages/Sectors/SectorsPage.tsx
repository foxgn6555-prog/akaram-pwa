import { useState } from 'react'
import { useSaveArea, useSaveParentSector, useSectorsTree, useSetParentSectorActive, type ParentSectorNode, type SectorArea } from '@features/sectors'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const CODE_RE = /^[a-z][a-z0-9_]{1,30}$/

/** 00393 — القطاعات والمناطق (ديناميكية): إضافة قطاع ومناطقه، تعديل الأسماء/الترتيب، إيقاف/تفعيل بلا حذف */
export default function SectorsPage() {
  const { data: tree, isLoading } = useSectorsTree(true)
  const saveParent = useSaveParentSector()
  const setActive = useSetParentSectorActive()
  const saveArea = useSaveArea()
  const [newOpen, setNewOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const submitParent = async (): Promise<void> => {
    const c = code.trim().toLowerCase(); const n = name.trim()
    if (!CODE_RE.test(c)) { setErr('الرمز: حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط، يبدأ بحرف (مثال: dora)'); return }
    if (n.length < 2) { setErr('اسم القطاع مطلوب'); return }
    setErr(null)
    await saveParent.mutateAsync({ code: c, name: n })
    setCode(''); setName(''); setNewOpen(false)
  }

  const activeCount = tree?.filter((p) => p.is_active).length ?? 0
  const areasCount = tree?.reduce((s, p) => s + p.areas.filter((a) => a.is_active).length, 0) ?? 0

  return (
    <section aria-labelledby="sectors-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="sectors-title" className="text-lg font-bold">القطاعات والمناطق</h1>
          <p className="text-sm text-slate-500" data-testid="sectors-summary">
            {tree ? `${activeCount} قطاع فعّال · ${areasCount} منطقة فعّالة` : '…'} — المصدر الوحيد لقوائم القطاعات في كل البوابات. لا حذف: الإيقاف يخفي من القوائم ويُبقي كل السجلات.
          </p>
        </div>
        <Button onClick={() => setNewOpen((v) => !v)} data-testid="sec-new-parent">
          <Icon name={newOpen ? 'x' : 'map-pin'} size={15} />
          {newOpen ? 'إغلاق' : 'قطاع جديد'}
        </Button>
      </div>

      {newOpen && (
        <form onSubmit={(e) => { e.preventDefault(); void submitParent() }} noValidate data-testid="sec-parent-form"
              className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label htmlFor="sec-name" className="mb-1.5 block text-sm font-medium">اسم القطاع</label>
            <input id="sec-name" data-testid="sec-parent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="الدورة"
                   className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="sec-code" className="mb-1.5 block text-sm font-medium">الرمز الثابت (لا يتغير لاحقاً)</label>
            <input id="sec-code" data-testid="sec-parent-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="dora"
                   className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          </div>
          {err && <p role="alert" data-testid="sec-parent-error" className="text-xs text-red-600 sm:col-span-2">{err}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={saveParent.isPending} data-testid="sec-parent-submit">إنشاء القطاع</Button>
          </div>
        </form>
      )}

      {isLoading && <LoadingSpinner label="جارٍ جلب القطاعات…" />}

      <div className="grid gap-4 lg:grid-cols-2" data-testid="sec-list">
        {tree?.map((p) => (
          <ParentCard key={p.code} node={p}
                      onRename={(n) => saveParent.mutate({ code: p.code, name: n })}
                      onToggle={() => setActive.mutate({ code: p.code, active: !p.is_active })}
                      onSaveArea={(a) => saveArea.mutate(a)}
                      busy={saveParent.isPending || setActive.isPending || saveArea.isPending} />
        ))}
      </div>
    </section>
  )
}

function ParentCard({ node, onRename, onToggle, onSaveArea, busy }: {
  node: ParentSectorNode; onRename: (name: string) => void; onToggle: () => void; busy: boolean
  onSaveArea: (a: { id?: number | null; parent_sector: string; name: string; sort?: number | null; is_active?: boolean | null }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [newArea, setNewArea] = useState('')
  const [areaErr, setAreaErr] = useState<string | null>(null)
  const addArea = (): void => {
    const n = newArea.trim()
    if (n.length < 2) { setAreaErr('اسم المنطقة مطلوب'); return }
    setAreaErr(null); onSaveArea({ parent_sector: node.code, name: n }); setNewArea('')
  }
  return (
    <article data-testid={`sec-parent-${node.code}`} className={`rounded-2xl border bg-white p-4 shadow-sm ${node.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80'}`}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="map-pin" size={16} className="text-brand-600" />
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) { onRename(name.trim()); setEditing(false) } }} className="flex items-center gap-1">
              <input value={name} onChange={(e) => setName(e.target.value)} data-testid={`sec-rename-${node.code}`} className="h-8 rounded-lg border border-slate-300 px-2 text-sm" />
              <Button type="submit" size="sm" data-testid={`sec-rename-save-${node.code}`}>حفظ</Button>
              <button type="button" onClick={() => { setEditing(false); setName(node.name) }} className="text-xs text-slate-500">إلغاء</button>
            </form>
          ) : (
            <h2 className="text-base font-bold" data-testid={`sec-parent-name-${node.code}`}>{node.name}
              <span className="ms-2 text-[11px] font-normal text-slate-400" dir="ltr">{node.code}</span>
              <button type="button" onClick={() => setEditing(true)} data-testid={`sec-edit-${node.code}`} className="ms-2 text-xs text-brand-600 hover:underline">تعديل الاسم</button>
            </h2>
          )}
        </div>
        <button type="button" onClick={onToggle} disabled={busy} data-testid={`sec-toggle-${node.code}`}
                className={node.is_active ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700' : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500'}>
          {node.is_active ? 'فعّال — اضغط للإيقاف' : 'موقوف — اضغط للتفعيل'}
        </button>
      </header>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100" data-testid={`sec-areas-${node.code}`}>
        {node.areas.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">لا مناطق بعد</li>}
        {node.areas.map((a) => <AreaRow key={a.id} area={a} parent={node.code} onSave={onSaveArea} busy={busy} />)}
      </ul>
      <div className="mt-3 flex items-start gap-2">
        <div className="flex-1">
          <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="اسم منطقة جديدة" data-testid={`sec-area-new-${node.code}`}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea() } }}
                 className="h-9 w-full rounded-xl border border-slate-300 px-3 text-sm" />
          {areaErr && <p role="alert" className="mt-1 text-xs text-red-600">{areaErr}</p>}
        </div>
        <Button size="sm" onClick={addArea} disabled={busy} data-testid={`sec-area-add-${node.code}`}>إضافة منطقة</Button>
      </div>
    </article>
  )
}

function AreaRow({ area, parent, onSave, busy }: {
  area: SectorArea; parent: string; busy: boolean
  onSave: (a: { id?: number | null; parent_sector: string; name: string; sort?: number | null; is_active?: boolean | null }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(area.name)
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm" data-testid={`sec-area-${area.id}`}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) { onSave({ id: area.id, parent_sector: parent, name: name.trim() }); setEditing(false) } }} className="flex items-center gap-1">
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid={`sec-area-rename-${area.id}`} className="h-8 rounded-lg border border-slate-300 px-2 text-sm" />
          <Button type="submit" size="sm" data-testid={`sec-area-rename-save-${area.id}`}>حفظ</Button>
          <button type="button" onClick={() => { setEditing(false); setName(area.name) }} className="text-xs text-slate-500">إلغاء</button>
        </form>
      ) : (
        <span className={area.is_active ? '' : 'text-slate-400 line-through'}>
          {area.name} <span className="text-[11px] text-slate-400" dir="ltr">#{area.id}</span>
          <button type="button" onClick={() => setEditing(true)} data-testid={`sec-area-edit-${area.id}`} className="ms-2 text-xs text-brand-600 hover:underline">تعديل</button>
        </span>
      )}
      <button type="button" disabled={busy} data-testid={`sec-area-toggle-${area.id}`}
              onClick={() => onSave({ id: area.id, parent_sector: parent, name: area.name, is_active: !area.is_active })}
              className={area.is_active ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700' : 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500'}>
        {area.is_active ? 'فعّالة' : 'موقوفة'}
      </button>
    </li>
  )
}
