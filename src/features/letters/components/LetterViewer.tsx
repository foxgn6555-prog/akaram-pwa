/** 00356 — معاينة كتاب رسمي داخل التطبيق (iframe) مع زر طباعة/حفظ PDF */
import { useMemo } from 'react'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useLetter } from '@features/hr/hooks/useHr'
import { letterDocumentHtml, printLetter } from '../lib/letter-html'

export function LetterViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useLetter(id)
  const l = q.data
  const html = useMemo(() => (l ? letterDocumentHtml(l) : ''), [l])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose} data-testid="letter-viewer">
      <div className="flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          {l && <>
            <span className="rounded-full bg-[#0b3d6b] px-3 py-1 text-xs font-bold text-white" data-testid="letter-kind">{l.kind_label}</span>
            <span className="text-sm font-black text-slate-800" data-testid="letter-ref">العدد {l.ref}</span>
            <span className="text-xs text-slate-600">{l.full_name} · {l.issued_date ?? l.issued_at.slice(0, 10)}</span>
          </>}
          <div className="ms-auto flex gap-2">
            {l && <Button size="sm" variant="primary" onClick={() => printLetter(l)} data-testid="letter-print">طباعة / حفظ PDF</Button>}
            <Button size="sm" variant="ghost" onClick={onClose} data-testid="letter-close">إغلاق</Button>
          </div>
        </div>
        {!l ? <LoadingSpinner /> : <iframe title={`كتاب ${l.ref}`} srcDoc={html} className="h-full w-full flex-1 bg-[#eef2f6]" data-testid="letter-frame" />}
      </div>
    </div>
  )
}
