/** أدوات مشتركة لوحدات المحطة الجديدة (السكسات · النسافات) */

export type StationUnitKind = 'saksat' | 'trips'

/** الشهر الحالي بصيغة YYYY-MM */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** اسم الشهر العربي + السنة */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ]
  const idx = Math.max(0, Math.min(11, Number(m) - 1))
  return `${names[idx]} ${y}`
}

/** تنسيق وقت الخروج التلقائي */
export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}