import { format, isValid, parseISO } from 'date-fns'
import { ar } from 'date-fns/locale'

/** تنسيق تاريخ ميلادي عربي — الافتراض: dd/MM/yyyy */
export function formatDate(value: string | Date, pattern = 'dd/MM/yyyy'): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  return format(d, pattern, { locale: ar })
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, 'dd/MM/yyyy · HH:mm')
}

/** تنسيق نسبي ("منذ 3 أيام") */
export function formatRelative(value: string | Date): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  const diffDays = Math.round((d.getTime() - Date.now()) / 86_400_000)
  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' })
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round((d.getTime() - Date.now()) / 3_600_000)
    if (Math.abs(diffHours) < 1) return rtf.format(Math.round((d.getTime() - Date.now()) / 60_000), 'minute')
    return rtf.format(diffHours, 'hour')
  }
  return rtf.format(diffDays, 'day')
}

/** الشهر المالي بصيغة YYYY-MM-01 (mirror لقيد payrolls) */
export function toPeriodMonth(date = new Date()): string {
  return date.toISOString().slice(0, 8) + '01'
}
