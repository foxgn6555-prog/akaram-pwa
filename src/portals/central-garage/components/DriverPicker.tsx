/**
 * اختيار السائق من موظفي الموارد البشرية (غرفة العمليات فقط).
 * لا اسم حرّ: القائمة من fleet_driver_options (عنوان «سائق» أو خانة is_driver)، والبحث الحر يصل لأي موظف.
 * يعرض لكل خيار: الرقم الوظيفي، العنوان، هل له بصمة، والآليات المسندة له حالياً.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Fingerprint, Search, UserCheck, X } from 'lucide-react'
import { useFleetDriverOptions } from '@features/central-garage/hooks'
import type { FleetDriverOption } from '@features/central-garage/types'

const inputClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'

export function DriverPicker({
  value,
  onChange,
  initialLabel,
  testId = 'driver-picker',
  error,
}: {
  value: string
  onChange: (employeeId: string, option: FleetDriverOption | null) => void
  /** اسم السائق الحالي (لسجل قديم أو عند فتح الحوار) */
  initialLabel?: string | null
  testId?: string
  error?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const deferred = useDeferredValue(query)
  const { data: options = [], isLoading } = useFleetDriverOptions(deferred, deferred.trim().length >= 2)
  const selected = useMemo(() => options.find((o) => o.employeeId === value) ?? null, [options, value])
  const [selectedLabel, setSelectedLabel] = useState<string | null>(initialLabel ?? null)
  useEffect(() => {
    if (selected) setSelectedLabel(`${selected.fullName} · ${selected.employeeNumber}`)
  }, [selected])

  const pick = (o: FleetDriverOption) => {
    onChange(o.employeeId, o)
    setSelectedLabel(`${o.fullName} · ${o.employeeNumber}`)
    setOpen(false)
    setQuery('')
  }
  const clear = () => {
    onChange('', null)
    setSelectedLabel(null)
    setOpen(true)
  }

  return (
    <div className="space-y-1.5 text-xs font-bold text-slate-600" data-testid={testId}>
      <span className="flex items-center justify-between">
        <span>السائق (موظف)</span>
        {!value && initialLabel && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700" data-testid={`${testId}-unlinked`}>
            سجل قديم: {initialLabel} — اختر الموظف المطابق
          </span>
        )}
      </span>
      {value && selectedLabel ? (
        <div className="flex h-11 items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-3" data-testid={`${testId}-selected`}>
          <span className="flex items-center gap-2 text-sm font-black text-emerald-800">
            <UserCheck size={16} /> {selectedLabel}
          </span>
          <button type="button" onClick={clear} aria-label="تغيير السائق" data-testid={`${testId}-clear`} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
          <input
            data-testid={`${testId}-search`}
            className={`${inputClass} pr-9`}
            placeholder="ابحث بالاسم أو الرقم الوظيفي…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            autoComplete="off"
          />
          {open && (
            <ul
              data-testid={`${testId}-options`}
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
              role="listbox"
            >
              {isLoading && <li className="p-3 text-slate-400">جارٍ التحميل…</li>}
              {!isLoading && options.length === 0 && (
                <li className="p-3 text-slate-500" data-testid={`${testId}-empty`}>
                  لا يوجد سائق مطابق — يجب توظيف السائق وتسجيل بياناته في الموارد البشرية أولاً.
                </li>
              )}
              {options.map((o) => (
                <li key={o.employeeId} role="option" aria-selected={o.employeeId === value}>
                  <button
                    type="button"
                    data-testid={`${testId}-option-${o.employeeNumber}`}
                    onClick={() => pick(o)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-right hover:bg-cyan-50"
                  >
                    <span>
                      <span className="block text-sm font-black text-slate-900">{o.fullName}</span>
                      <span className="block text-[11px] text-slate-500">
                        {o.employeeNumber}
                        {o.jobTitle ? ` · ${o.jobTitle}` : ''}
                        {o.departmentName ? ` · ${o.departmentName}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {o.assignedVehicles.length > 0 && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600" title="آليات مسندة حالياً">
                          {o.assignedVehicles.join('، ')}
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-black ${o.hasBiometric ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                        title={o.hasBiometric ? 'مرتبط بجهاز بصمة' : 'بلا بصمة مسجلة'}
                      >
                        <Fingerprint size={12} /> {o.hasBiometric ? 'بصمة' : 'بلا بصمة'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <span className="block text-red-600">{error}</span>}
    </div>
  )
}
