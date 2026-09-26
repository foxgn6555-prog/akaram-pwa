/** زر تصدير Excel موحّد — مع اختيار الأعمدة اختيارياً */
import { useState } from 'react'
import { Button } from '@components/ui'
import clsx from 'clsx'

export function ExportButton({ onExport, disabled, label = 'تصدير Excel', testId = 'export-excel' }: { onExport: () => Promise<void>; disabled?: boolean; label?: string; testId?: string }) {
  const [busy, setBusy] = useState(false)
  return <Button size="sm" variant="secondary" disabled={disabled || busy} isLoading={busy} onClick={async () => { setBusy(true); try { await onExport() } finally { setBusy(false) } }} data-testid={testId}>{label}</Button>
}

export function ColumnPicker({ all, selected, onChange, testId = 'column-picker' }: { all: Array<{ key: string; header: string }>; selected: string[]; onChange: (keys: string[]) => void; testId?: string }) {
  const [open, setOpen] = useState(false)
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k])
  return (
    <div className="relative" data-testid={testId}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700" aria-expanded={open} data-testid={`${testId}-toggle`}>أعمدة التصدير ({selected.length})</button>
      {open && (
        <div className="absolute end-0 z-20 mt-1 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex justify-between text-[11px]"><button type="button" className="font-bold text-brand-700" onClick={() => onChange(all.map((c) => c.key))}>تحديد الكل</button><button type="button" className="text-slate-500" onClick={() => onChange([])}>مسح</button></div>
          <ul className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto text-xs">
            {all.map((c) => <li key={c.key}><label className={clsx('flex cursor-pointer items-center gap-1 rounded-lg px-1 py-0.5', selected.includes(c.key) && 'bg-brand-50')}><input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} data-testid={`${testId}-${c.key}`} />{c.header}</label></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
