/**
 * 00251 — بيانات المحلة والزقاق: مطابقة المحلة بالمنطقة والمسؤول، صفحة الإعدادات،
 * اقتراحات الفرز في الوارد، والإسناد التلقائي حسب المحلة في شاشة الإسناد.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPLAINT_AREAS, matchNeighborhood, neighborhoodSuggestions, normalizeArabicName, planAutoAssign, suggestManager,
} from '../../../src/features/complaints/lib/neighborhoods'
import type { ComplaintManager, ComplaintNeighborhood } from '../../../src/features/complaints/types'
import SettingsPage from '../../../src/portals/complaints/pages/Settings/SettingsPage'
import AssignmentPage from '../../../src/portals/complaints/pages/Assignment/AssignmentPage'
import InboxPage from '../../../src/portals/complaints/pages/Inbox/InboxPage'

const registry: ComplaintNeighborhood[] = [
  { id: 'n1', sectorId: 3, sectorName: 'الواثق', parentSector: 'karrada', name: '903', isActive: true, usageCount: 2 },
  { id: 'n2', sectorId: 2, sectorName: 'الرياض', parentSector: 'karrada', name: '908', isActive: true, usageCount: 0 },
  { id: 'n3', sectorId: 4, sectorName: 'الجادرية', parentSector: 'karrada', name: 'الجادرية القديمة', isActive: true, usageCount: 0 },
  { id: 'n4', sectorId: 7, sectorName: 'ديالى', parentSector: 'zaafaraniya', name: '903', isActive: true, usageCount: 0 },
  { id: 'n5', sectorId: 3, sectorName: 'الواثق', parentSector: 'karrada', name: '905', isActive: false, usageCount: 0 },
]
const managers: ComplaintManager[] = [
  { userId: 'm-wathiq', fullName: 'مسؤول الواثق', jobTitle: null, sectorIds: [3] },
  { userId: 'm-riyadh', fullName: 'مسؤول الرياض', jobTitle: null, sectorIds: [2, 4] },
  { userId: 'm-jad', fullName: 'مسؤول الجادرية', jobTitle: null, sectorIds: [4] },
]

const h = vi.hoisted(() => ({
  registry: [] as unknown[], managers: [] as unknown[], items: [] as unknown[],
  saveNeighborhood: { mutate: vi.fn((_v: unknown, _o?: { onError?: (e: unknown) => void; onSuccess?: () => void }) => {}), isPending: false },
  assign: { mutate: vi.fn(), mutateAsync: vi.fn(async (_vars: { itemIds: string[]; managerId: string }) => 0), isPending: false },
  batch: { mutate: vi.fn(), isPending: false },
}))
vi.mock('@features/complaints', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../../../src/features/complaints/lib/neighborhoods')),
  useComplaintNeighborhoods: () => ({ data: h.registry, isLoading: false, isError: false }),
  useSaveComplaintNeighborhood: () => h.saveNeighborhood,
  useComplaintManagers: () => ({ data: h.managers, isLoading: false }),
  useComplaintContacts: () => ({ data: [], isLoading: false }),
  useComplaintSettings: () => ({ data: [], isLoading: false }),
  useSaveComplaintContact: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveComplaintSetting: () => ({ mutate: vi.fn(), isPending: false }),
  useComplaintItems: () => ({ data: h.items, isLoading: false }),
  useAssignComplaintItems: () => h.assign,
  useComplaintInbox: () => ({ data: [{ id: 'm1', senderEmail: 's@t.iq', senderName: 'لجنة الاشراف', subject: 'بريد', receivedAt: '2026-10-02T06:00:00Z', attachmentCount: 1, status: 'ready' }], isLoading: false, refetch: vi.fn(), isFetching: false }),
  useComplaintInboxMediaPage: () => ({ data: { rows: [{ id: 'f1', mimeType: 'image/jpeg', url: 'u', originalName: 'a.jpg', itemId: null, duplicateCount: 0, sha256: 'x' }], totalCount: 1, imageCount: 1, sortedImageCount: 0, remainingImageCount: 1 }, isLoading: false }),
  useExtractComplaintPdf: () => ({ mutate: vi.fn(), isPending: false }),
  useComplaintOcr: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveComplaintEmail: () => ({ mutate: vi.fn(), isPending: false }),
  useBatchCreateComplaintItems: () => h.batch,
}))

const item = (id: string, neighborhood: string | null, sector: 'karrada' | 'zaafaraniya' = 'karrada') => ({
  id, complaintId: 'c1', referenceNo: 'CMP-1', ticketName: 'بريد الصباح', sector, sequenceNo: Number(id.replace(/\D/g, '')) || 1,
  title: 'أنقاض', municipalCenter: null, neighborhood, alley: '12', locationText: null, ocrText: null, assignedTo: null,
  status: 'under_review', managerNotes: null, reviewerNotes: null, receivedAt: '2026-10-02T06:00:00Z', inboxMessageId: 'm1', complaintStatus: 'under_review',
})

beforeEach(() => {
  h.registry = registry; h.managers = managers; h.items = []
  h.saveNeighborhood.mutate.mockReset(); h.assign.mutateAsync.mockReset(); h.assign.mutateAsync.mockImplementation(async ({ itemIds }: { itemIds: string[] }) => itemIds.length)
})

describe('مطابقة المحلة بالمنطقة والمسؤول', () => {
  it('ثماني مناطق: أربع لكل قاطع', () => {
    expect(COMPLAINT_AREAS).toHaveLength(8)
    expect(COMPLAINT_AREAS.filter(area => area.parent === 'karrada').map(area => area.name)).toEqual(['أرخيته', 'الرياض', 'الواثق', 'الجادرية'])
  })
  it('التوحيد يتجاهل «محلة» والتشكيل والهمزات والمسافات', () => {
    expect(normalizeArabicName('محلة الوَاثق  ')).toBe('الواثق')
    expect(normalizeArabicName('أرخيتة')).toBe(normalizeArabicName('ارخيته'))
    expect(normalizeArabicName(' محلة 903 ')).toBe('903')
  })
  it('يطابق داخل القاطع نفسه فقط ويتجاهل المحلات المعطلة', () => {
    expect(matchNeighborhood('محلة 903', 'karrada', registry)?.areaName).toBe('الواثق')
    expect(matchNeighborhood('903', 'zaafaraniya', registry)?.areaName).toBe('ديالى')
    expect(matchNeighborhood('905', 'karrada', registry)).toBeNull()
    expect(matchNeighborhood('', 'karrada', registry)).toBeNull()
    expect(neighborhoodSuggestions('karrada', registry, '90').map(entry => entry.name)).toEqual(['908', '903'])
  })
  it('يقترح المسؤول الوحيد للمنطقة، ويعلّم التعدد وعدم الوجود', () => {
    expect(suggestManager('903', 'karrada', registry, managers)?.manager?.userId).toBe('m-wathiq')
    const multi = suggestManager('الجادرية القديمة', 'karrada', registry, managers)
    expect(multi?.manager).toBeNull(); expect(multi?.candidates.map(manager => manager.userId)).toEqual(['m-riyadh', 'm-jad'])
    expect(suggestManager('903', 'zaafaraniya', registry, managers)?.candidates).toEqual([])
  })
  it('خطة الإسناد التلقائي: دفعة لكل مسؤول، وغير المطابق أو المتعدد يبقى يدوياً', () => {
    const plan = planAutoAssign([item('i1', '903'), item('i2', 'محلة 903'), item('i3', '908'), item('i4', '777'), item('i5', 'الجادرية القديمة'), item('i6', null)], registry, managers)
    expect(plan.batches).toEqual([
      { manager: managers[0], areaNames: ['الواثق'], itemIds: ['i1', 'i2'] },
      { manager: managers[1], areaNames: ['الرياض'], itemIds: ['i3'] },
    ])
    expect(plan.unmatched.map(entry => entry.id)).toEqual(['i4', 'i6'])
    expect(plan.ambiguous.map(entry => entry.item.id)).toEqual(['i5'])
  })
})

describe('صفحة بيانات المحلة والزقاق في الإعدادات والتواصل', () => {
  it('تعرض المناطق الثماني بمسؤوليها وتضيف محلة إلى منطقة محددة', () => {
    render(<MemoryRouter initialEntries={['/complaints/pages-contact-settings']}><SettingsPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'بيانات المحلة والزقاق' }))
    for (const area of COMPLAINT_AREAS) expect(screen.getByRole('heading', { name: area.name })).toBeInTheDocument()
    expect(screen.getByText('مسؤول القسم: مسؤول الواثق')).toBeInTheDocument()
    expect(screen.getByText('مسؤول القسم: مسؤول الرياض، مسؤول الجادرية')).toBeInTheDocument()
    expect(screen.getAllByText('لا مسؤول قسم مسند لهذه المنطقة بعد')).toHaveLength(5)
    const input = screen.getByLabelText('إضافة محلة إلى الواثق')
    fireEvent.change(input, { target: { value: '  909 ' } })
    fireEvent.submit(input.closest('form')!)
    expect(h.saveNeighborhood.mutate).toHaveBeenCalledWith({ sectorId: 3, name: '909' }, expect.anything())
    const wathiq = within(input.closest('article')!)
    fireEvent.click(wathiq.getByRole('button', { name: 'تعديل 903' }))
    fireEvent.change(wathiq.getByLabelText('تعديل اسم المحلة 903'), { target: { value: '903 أ' } })
    fireEvent.click(wathiq.getByRole('button', { name: 'حفظ الاسم' }))
    expect(h.saveNeighborhood.mutate).toHaveBeenCalledWith({ id: 'n1', sectorId: 3, name: '903 أ', isActive: true }, expect.anything())
    fireEvent.click(wathiq.getByRole('button', { name: 'تفعيل' }))
    expect(h.saveNeighborhood.mutate).toHaveBeenCalledWith({ id: 'n5', sectorId: 3, name: '905', isActive: true }, expect.anything())
  })
  it('تشرح خطأ التكرار بوضوح وتبقي الإدخال', () => {
    h.saveNeighborhood.mutate.mockImplementation((_v, opts) => { opts?.onError?.(new Error('COMPLAINT_NEIGHBORHOOD_DUPLICATE')) })
    render(<MemoryRouter initialEntries={['/complaints/pages-contact-settings?tab=neighborhoods']}><SettingsPage /></MemoryRouter>)
    const input = screen.getByLabelText('إضافة محلة إلى الرياض')
    fireEvent.change(input, { target: { value: '908' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByText('هذه المحلة مسجلة مسبقاً في المنطقة نفسها.')).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('908')
  })
})

describe('الوارد: اقتراح المحلة وربطها بالمنطقة', () => {
  it('قائمة الإكمال تضم محلات القاطع فقط ويظهر اسم المنطقة عند المطابقة', () => {
    render(<MemoryRouter><InboxPage sector="karrada" /></MemoryRouter>)
    fireEvent.click(screen.getByText('بريد'))
    const options = [...document.querySelectorAll('#complaint-neighborhoods option')].map(option => (option as HTMLOptionElement).value)
    expect(options).toEqual(['908', '903', 'الجادرية القديمة'])
    const input = screen.getByLabelText('المحلة للصورة f1')
    fireEvent.change(input, { target: { value: 'محلة 903' } })
    expect(screen.getByText('منطقة الواثق')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '777' } })
    expect(screen.getByText('محلة غير مسجلة في بيانات المحلة والزقاق')).toBeInTheDocument()
  })
})

describe('الإسناد: إسناد تلقائي حسب المحلة', () => {
  it('يعرض المنطقة والمسؤول المقترح لكل تذكرة وينفذ دفعة لكل مسؤول ويترك الباقي يدوياً', async () => {
    h.items = [item('i1', '903'), item('i2', '908'), item('i3', '777'), item('i4', 'الجادرية القديمة')]
    render(<MemoryRouter><AssignmentPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'فتح مجلد CMP-1' }))
    expect(screen.getByText('منطقة الواثق ← مسؤول الواثق')).toBeInTheDocument()
    expect(screen.getByText('منطقة الجادرية ← 2 مسؤولون')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /إسناد تلقائي حسب المحلة \(2\)/ })
    fireEvent.click(button)
    await waitFor(() => expect(h.assign.mutateAsync).toHaveBeenCalledTimes(2))
    expect(h.assign.mutateAsync).toHaveBeenNthCalledWith(1, { itemIds: ['i1'], managerId: 'm-wathiq' })
    expect(h.assign.mutateAsync).toHaveBeenNthCalledWith(2, { itemIds: ['i2'], managerId: 'm-riyadh' })
    const note = await screen.findByText(/تم الإسناد التلقائي حسب المحلة/)
    expect(within(note).getByText(/مسؤول الواثق: 1 تذكرة \(الواثق\)/)).toBeInTheDocument()
    expect(note.textContent).toContain('1 بلا محلة مسجلة')
    expect(note.textContent).toContain('1 لمنطقة بأكثر من مسؤول')
  })
  it('يقتصر على التذاكر المحددة عند وجود تحديد ويتوقف عند أول فشل دون تكرار', async () => {
    h.items = [item('i1', '903'), item('i2', '908')]
    h.assign.mutateAsync.mockImplementation(async () => { throw new Error('x') })
    render(<MemoryRouter><AssignmentPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'فتح مجلد CMP-1' }))
    fireEvent.click(screen.getByLabelText('تحديد CMP-1/1'))
    fireEvent.click(screen.getByRole('button', { name: /إسناد تلقائي حسب المحلة \(1\)/ }))
    await screen.findByText(/توقف الإسناد التلقائي عند مسؤول الواثق/)
    expect(h.assign.mutateAsync).toHaveBeenCalledTimes(1)
  })
})
