/** اختبارات معاينة تقرير الشكاوى — تضمن تطابق المعاينة مع مواصفات مولّد PowerPoint. */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ReportCoverPreview, ReportPreviewImage, ReportSlidePreview, ReportSummaryPreview, ReportTablePreview,
} from '../../../src/portals/complaints/components/reportPreview'
import {
  authorityLineFor, buildSlidePlan, coverDateLine, entryGroupKey, siteCaption,
  type ReportEntry,
} from '../../../src/portals/complaints/components/reportPreviewModel'

const entry = (overrides: Partial<{ itemId: string; neighborhood: string | null; alley: string | null; title: string | null; assignedTo: string | null; inboxMessageId: string | null; ticketName: string; municipalCenter: string | null; status: ReportEntry['item']['status'] }> = {}): ReportEntry => ({
  itemId: overrides.itemId ?? 'item-1',
  displayOrder: 1,
  included: true,
  slideLayout: {},
  item: {
    id: overrides.itemId ?? 'item-1',
    complaintId: 'complaint-1',
    referenceNo: 'ش-2026-001',
    complaintStatus: 'open',
    sector: 'zaafaraniya',
    sequenceNo: 1,
    title: overrides.title === undefined ? 'أنقاض' : overrides.title,
    municipalCenter: overrides.municipalCenter === undefined ? 'مركز الزعفرانية' : overrides.municipalCenter,
    neighborhood: overrides.neighborhood === undefined ? '44' : overrides.neighborhood,
    alley: overrides.alley === undefined ? '44' : overrides.alley,
    locationText: null,
    ocrText: null,
    assignedTo: overrides.assignedTo === undefined ? 'user-1' : overrides.assignedTo,
    status: overrides.status ?? 'approved',
    managerNotes: null,
    reviewerNotes: null,
    receivedAt: '2026-09-06T08:00:00Z',
    inboxMessageId: overrides.inboxMessageId === undefined ? 'msg-1' : overrides.inboxMessageId,
    ticketName: overrides.ticketName ?? 'شكوى الأنقاض اليومية',
  },
})

const managers = new Map([['user-1', 'المهندس علي']])

describe('الصيغ المشتركة بين المعاينة وملف PowerPoint', () => {
  it('تذييل شريحة قبل/بعد يطابق التصميم: محلة - زقاق - نوع', () => {
    expect(siteCaption(entry())).toBe('محلة 44 - زقاق 44 - أنقاض')
  })

  it('تذييل قبل/بعد يعرض شرطات عند نقص البيانات', () => {
    expect(siteCaption(entry({ neighborhood: null, alley: null, title: null }))).toBe('محلة — - زقاق — - نوع غير محدد')
  })

  it('سطر التاريخ على الغلاف يبدأ بالقاطع ثم التاريخ كما في التصميم', () => {
    expect(coverDateLine('zaafaraniya', '2026-09-06')).toBe('قاطع الزعفرانية - 2026-09-06')
    expect(coverDateLine('karrada', '2026-09-06')).toBe('قاطع الكرادة - 2026-09-06')
  })

  it('سطر الجهة الحكومية يتبع القطاع ما لم يُخصص', () => {
    expect(authorityLineFor({}, 'zaafaraniya')).toBe('أمانة بغداد / دائرة بلدية الزعفرانية')
    expect(authorityLineFor({ authorityLine: 'أمانة بغداد / دائرة بلدية الكرادة' }, 'zaafaraniya')).toBe('أمانة بغداد / دائرة بلدية الزعفرانية')
    expect(authorityLineFor({ authorityLine: 'أمانة بغداد / دائرة بلدية الرشيد' }, 'karrada')).toBe('أمانة بغداد / دائرة بلدية الرشيد')
  })

  it('مفتاح المجموعة يجمع البريد نفسه مع المسؤول نفسه', () => {
    expect(entryGroupKey(entry())).toBe(entryGroupKey(entry({ itemId: 'item-2' })))
    expect(entryGroupKey(entry())).not.toBe(entryGroupKey(entry({ inboxMessageId: 'msg-2' })))
    expect(entryGroupKey(entry())).not.toBe(entryGroupKey(entry({ assignedTo: 'user-2' })))
  })
})

describe('خطة شرائح ملف PowerPoint الناتج', () => {
  it('ترتيب الشرائح: غلاف ثم مؤشرات ثم جدول ثم فواصل المجموعات وصورها', () => {
    const entries = [entry({ itemId: 'a' }), entry({ itemId: 'b' }), entry({ itemId: 'c', inboxMessageId: 'msg-2', ticketName: 'بريد ثانٍ' })]
    const plan = buildSlidePlan(entries, managers)
    expect(plan.map(step => step.kind)).toEqual(['cover', 'summary', 'table', 'group', 'photo', 'photo', 'group', 'photo'])
    expect(plan[1]?.label).toBe('المؤشرات التنفيذية')
    expect(plan[3]?.label).toContain('المهندس علي')
    expect(plan[6]?.label).toContain('بريد ثانٍ')
  })

  it('يجزئ الجدول إلى صفحات من 11 صفاً مثل المولّد', () => {
    const entries = Array.from({ length: 12 }, (_, index) => entry({ itemId: `item-${index}` }))
    const plan = buildSlidePlan(entries, managers)
    const tableSteps = plan.filter(step => step.kind === 'table')
    expect(tableSteps.map(step => step.label)).toEqual(['جدول بيانات التلكؤات 1/2', 'جدول بيانات التلكؤات 2/2'])
  })
})

describe('مكونات المعاينة', () => {
  it('شريحة قبل/بعد تعرض المعالجة يميناً والتذييل بصيغة التصميم مع لافتة الفاصل', () => {
    render(<ReportSlidePreview entry={entry()} before="before.png" after="after.png" accent="#cf63c6" layout={{ afterLabel: 'صورة المعالجة', beforeLabel: 'صورة التلكؤ / الشكوى' }} groupNote="شكوى الأنقاض اليومية — المهندس علي" />)
    const headers = screen.getAllByText(/صورة المعالجة|صورة التلكؤ/)
    expect(headers[0]?.textContent).toBe('صورة المعالجة')
    expect(headers[1]?.textContent).toBe('صورة التلكؤ / الشكوى')
    expect(screen.getByText('محلة 44 - زقاق 44 - أنقاض')).toBeTruthy()
    expect(screen.getByText(/تسبق هذه الشريحة شريحة فاصل/)).toBeTruthy()
  })

  it('صورة المعاينة تتحول إلى رسالة واضحة عند فشل التحميل', () => {
    render(<ReportPreviewImage title="صورة المعالجة" src="https://example.com/photo.jpg" accent="#cf63c6" />)
    const image = screen.getByRole('img', { name: 'صورة المعالجة' })
    fireEvent.error(image)
    expect(screen.getByText('الصورة غير متاحة')).toBeTruthy()
  })

  it('معاينة المؤشرات تعرض الإجمالي والمعتمدة وصور المعالجة وتوزيع المراكز', () => {
    const entries = [entry({ itemId: 'a', municipalCenter: 'مركز الزعفرانية' }), entry({ itemId: 'b', municipalCenter: 'مركز الزعفرانية', status: 'in_progress' }), entry({ itemId: 'c', municipalCenter: 'مركز آخر', status: 'approved' })]
    render(<ReportSummaryPreview entries={entries} afterPhotos={2} accent="#cf63c6" />)
    expect(screen.getByText('المؤشرات التنفيذية للتقرير')).toBeTruthy()
    expect(screen.getByText('إجمالي المواقع').parentElement?.textContent).toContain('3')
    expect(screen.getByText('صور المعالجة').parentElement?.textContent).toContain('2')
    expect(screen.getByText('مركز الزعفرانية')).toBeTruthy()
    expect(screen.getByText('مركز آخر')).toBeTruthy()
  })

  it('معاينة الجدول بأعمدة التصميم نفسها ورسالة التجزئة بعد 11 صفاً', () => {
    const entries = Array.from({ length: 12 }, (_, index) => entry({ itemId: `item-${index}`, sequenceNo: index + 1 } as Partial<Parameters<typeof entry>[0]>))
    render(<ReportTablePreview entries={entries} accent="#cf63c6" managerNames={managers} />)
    for (const header of ['ت', 'مسؤول القسم', 'نوع التلكؤ', 'المركز', 'المحلة', 'الزقاق']) {
      expect(screen.getByText(header)).toBeTruthy()
    }
    expect(screen.getByText('+ 1 موقع في الصفحات التالية')).toBeTruthy()
  })

  it('غلاف المعاينة يعرض سطر التاريخ بصيغة القاطع أولاً', () => {
    render(<ReportCoverPreview layout={{ title: 'تقرير معالجة التلكؤات ليوم' }} title="التقرير اليومي الجامع للشكاوى" accent="#cf63c6" sector="zaafaraniya" reportDate="2026-09-06" />)
    expect(screen.getByText('قاطع الزعفرانية - 2026-09-06')).toBeTruthy()
    expect(screen.getByText('أمانة بغداد / دائرة بلدية الزعفرانية')).toBeTruthy()
  })
})
