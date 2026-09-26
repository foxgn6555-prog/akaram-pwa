/** مستمسكات الموظف: أنواع ثابتة (صورة، موحدة وجه/ظهر، سكن وجه/ظهر) + مستمسك حر — رفع/عرض/حذف (HR فقط، bucket خاص) */
import { useEffect, useState } from 'react'
import { DOC_TYPE_LABELS, useDeleteDocument, useEmployeeDocuments, useUploadDocument } from '@features/hr'
import type { DocType, EmployeeDocument } from '@features/hr'
import { hr } from '@sdk/hr.sdk'
import { Button } from '@components/ui'
import clsx from 'clsx'

const FIXED: DocType[] = ['photo', 'national_id_front', 'national_id_back', 'residence_front', 'residence_back']

export function DocumentsPanel({ employeeId, readOnly = false }: { employeeId: string; readOnly?: boolean }) {
  const { data: docs = [], isLoading } = useEmployeeDocuments(employeeId)
  const upload = useUploadDocument()
  const del = useDeleteDocument()
  const [otherTitle, setOtherTitle] = useState('')
  const byType = (t: DocType) => docs.filter((d) => d.doc_type === t)

  const onPick = (t: DocType) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 15 * 1024 * 1024) return
    upload.mutate({ employeeId, docType: t, file: f, title: t === 'other' ? otherTitle.trim() || f.name : undefined })
    if (t === 'other') setOtherTitle('')
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="documents-panel">
      <h3 className="text-sm font-bold">المستمسكات</h3>
      <p className="text-[11px] text-slate-500">صور JPG/PNG/WebP أو PDF حتى 15MB — محفوظة في مخزن خاص لا يصل إليه إلا قسم الموارد البشرية.</p>
      {isLoading ? <p className="mt-3 text-xs text-slate-400">جارٍ التحميل…</p> : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIXED.map((t) => <DocSlot key={t} type={t} docs={byType(t)} onPick={onPick(t)} onDelete={(d) => del.mutate(d)} readOnly={readOnly} busy={upload.isPending} />)}
          <div className="rounded-xl border border-dashed border-slate-300 p-3" data-testid="doc-slot-other">
            <p className="text-xs font-bold">{DOC_TYPE_LABELS.other}</p>
            {!readOnly && (
              <div className="mt-2 flex gap-2">
                <input className="h-9 flex-1 rounded-lg border border-slate-300 px-2 text-xs" placeholder="عنوان المستمسك" value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} data-testid="doc-other-title" />
                <label className="cursor-pointer rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold">رفع<input type="file" className="hidden" accept="image/*,application/pdf" onChange={onPick('other')} data-testid="doc-other-file" /></label>
              </div>
            )}
            <ul className="mt-2 space-y-1">
              {byType('other').map((d) => <DocRow key={d.id} doc={d} onDelete={readOnly ? undefined : () => del.mutate(d)} />)}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

function DocSlot({ type, docs, onPick, onDelete, readOnly, busy }: { type: DocType; docs: EmployeeDocument[]; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onDelete: (d: EmployeeDocument) => void; readOnly: boolean; busy: boolean }) {
  const latest = docs[0]
  return (
    <div className={clsx('rounded-xl border p-3', latest ? 'border-emerald-200 bg-emerald-50/30' : 'border-dashed border-slate-300')} data-testid={`doc-slot-${type}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">{DOC_TYPE_LABELS[type]}</p>
        {!readOnly && (
          <label className={clsx('cursor-pointer rounded-lg px-2 py-1 text-[11px] font-bold', latest ? 'bg-white text-slate-600' : 'bg-brand-600 text-white', busy && 'opacity-50')}>
            {latest ? 'استبدال' : 'رفع'}<input type="file" className="hidden" accept="image/*,application/pdf" onChange={onPick} disabled={busy} data-testid={`doc-file-${type}`} />
          </label>
        )}
      </div>
      {latest ? <Thumb doc={latest} /> : <p className="mt-2 text-[11px] text-slate-400">لم يُرفع بعد</p>}
      {latest && !readOnly && <button type="button" onClick={() => onDelete(latest)} className="mt-1 text-[10px] text-red-600 hover:underline" data-testid={`doc-delete-${type}`}>حذف</button>}
    </div>
  )
}

function Thumb({ doc }: { doc: EmployeeDocument }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let on = true; void hr.signedUrl(doc.storage_path).then((u) => { if (on) setUrl(u) }); return () => { on = false } }, [doc.storage_path])
  const isImg = (doc.mime_type ?? '').startsWith('image/')
  return (
    <a href={url ?? '#'} target="_blank" rel="noreferrer" className="mt-2 block" data-testid="doc-thumb">
      {isImg && url ? <img src={url} alt={doc.title ?? doc.doc_type} className="h-28 w-full rounded-lg object-cover" /> : <span className="block rounded-lg bg-white p-3 text-center text-[11px]">📄 {doc.title ?? 'ملف PDF'}</span>}
    </a>
  )
}

function DocRow({ doc, onDelete }: { doc: EmployeeDocument; onDelete?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let on = true; void hr.signedUrl(doc.storage_path).then((u) => { if (on) setUrl(u) }); return () => { on = false } }, [doc.storage_path])
  return (
    <li className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
      <a href={url ?? '#'} target="_blank" rel="noreferrer" className="truncate font-semibold text-brand-700 hover:underline">{doc.title ?? doc.storage_path.split('/').pop()}</a>
      {onDelete && <Button size="sm" variant="ghost" onClick={onDelete}>حذف</Button>}
    </li>
  )
}
