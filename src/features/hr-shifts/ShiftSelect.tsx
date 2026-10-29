/** قائمة اختيار شفت من شفتات HR (مع خيار «الكل» اختيارياً). القيمة الحالية غير الموجودة بالقائمة تبقى ظاهرة كي لا تضيع. */
import { useShiftOptions } from './hooks'
import { shiftLabel } from '@sdk/hr-shifts.sdk'

export function ShiftSelect({
  value, onChange, allLabel, className, testId = 'shift-select', disabled, id, ariaLabel,
}: {
  value: string
  onChange: (code: string) => void
  /** إن مُرّر يُضاف خيار بقيمة فارغة بهذا النص (فلاتر) */
  allLabel?: string
  className?: string
  testId?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
}) {
  const { data } = useShiftOptions(false)
  const options = data ?? []
  const missing = value && !options.some((o) => o.code === value)
  return (
    <select id={id} aria-label={ariaLabel} data-testid={testId} className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {missing && <option value={value}>{shiftLabel(value, options)}</option>}
      {options.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
    </select>
  )
}
