/**
 * 00351 — ترشيح تذكرات الإعلام عند إضافة صور إلى التصميم (بدل قائمة منسدلة بكل التذكرات):
 * بحث بالعنوان/الموقع/المرسل · نوع العمل · من/إلى تاريخ الحدث · إظهار المؤرشفة — ثم ترتيب بالأحدث.
 */
export interface PickableTicket {
  id: string
  title: string
  work_type: string | null
  event_date: string
  photo_count: number
  status: 'submitted' | 'archived'
  location?: string | null
  submitted_by_name?: string
}
export interface TicketFilters {
  q: string
  workType: string
  from: string
  to: string
  archived: boolean
}

const norm = (s: string) => s.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()

export function filterTickets<T extends PickableTicket>(tickets: readonly T[], f: TicketFilters): T[] {
  const q = norm(f.q.trim())
  return tickets
    .filter((t) => (f.archived ? true : t.status !== 'archived'))
    .filter((t) => !f.workType || (t.work_type ?? '') === f.workType)
    .filter((t) => !f.from || t.event_date >= f.from)
    .filter((t) => !f.to || t.event_date <= f.to)
    .filter((t) => !q || norm(`${t.title} ${t.location ?? ''} ${t.submitted_by_name ?? ''} ${t.work_type ?? ''}`).includes(q))
    .sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : a.title.localeCompare(b.title, 'ar')))
}

/** أنواع العمل الموجودة فعلاً في التذاكر (للقائمة المنسدلة) */
export function ticketWorkTypes(tickets: readonly PickableTicket[]): string[] {
  return [...new Set(tickets.map((t) => t.work_type).filter((w): w is string => !!w))].sort((a, b) => a.localeCompare(b, 'ar'))
}
