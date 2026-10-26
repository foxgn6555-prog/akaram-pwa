/** 00351 — مرشّحات اختيار التذاكر عند إضافة صور إلى التصميم */
import { describe, expect, it } from 'vitest'
import { filterTickets, ticketWorkTypes, type PickableTicket } from '@features/media/lib/ticket-picker'

const t = (id: string, title: string, event_date: string, work_type: string | null, status: 'submitted' | 'archived' = 'submitted', extra: Partial<PickableTicket> = {}): PickableTicket =>
  ({ id, title, event_date, work_type, status, photo_count: 3, ...extra })
const T = [
  t('1', 'غسل شارع فندق بابل', '2026-10-25', 'غسل'),
  t('2', 'كنس شارع السعدون', '2026-10-24', 'كنس'),
  t('3', 'رفع حاويات شارع المدارس الزعفرانية', '2026-10-20', null),
  t('4', 'غسل ساحة كهرمانة', '2026-10-25', 'غسل', 'archived'),
  t('5', 'أعمال كنس مشبكات الجادرية', '2026-09-30', 'كنس', 'submitted', { location: 'الجادرية المحور الرابع', submitted_by_name: 'علي' }),
]
const none = { q: '', workType: '', from: '', to: '', archived: false }

describe('filterTickets', () => {
  it('افتراضياً: بلا مؤرشفة ومرتّبة بالأحدث ثم العنوان', () => {
    expect(filterTickets(T, none).map((x) => x.id)).toEqual(['1', '2', '3', '5'])
  })
  it('من/إلى تاريخ الحدث (افتراضي فترة التصميم)', () => {
    expect(filterTickets(T, { ...none, from: '2026-10-24', to: '2026-10-25' }).map((x) => x.id)).toEqual(['1', '2'])
    expect(filterTickets(T, { ...none, from: '2026-10-26' })).toEqual([])
  })
  it('نوع العمل + إظهار المؤرشفة', () => {
    expect(filterTickets(T, { ...none, workType: 'غسل' }).map((x) => x.id)).toEqual(['1'])
    expect(filterTickets(T, { ...none, workType: 'غسل', archived: true }).map((x) => x.id)).toEqual(['4', '1'])
  })
  it('بحث متسامح (همزة/تاء مربوطة/تشكيل) في العنوان والموقع والمرسل', () => {
    expect(filterTickets(T, { ...none, q: 'إعمال' }).map((x) => x.id)).toEqual(['5'])
    expect(filterTickets(T, { ...none, q: 'المحور' }).map((x) => x.id)).toEqual(['5'])
    expect(filterTickets(T, { ...none, q: 'علي' }).map((x) => x.id)).toEqual(['5'])
    expect(filterTickets(T, { ...none, q: 'كهرمانه', archived: true }).map((x) => x.id)).toEqual(['4'])
  })
  it('ticketWorkTypes: الأنواع الفريدة الموجودة فقط، مرتّبة', () => {
    expect(ticketWorkTypes(T)).toEqual(['غسل', 'كنس'])
  })
})
