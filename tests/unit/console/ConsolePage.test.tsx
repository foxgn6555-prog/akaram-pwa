/**
 * Console · الصفحة: التبويبات الأربعة، فلتر التنبيهات فقط، شرح + خطوات لكل خطأ،
 * خطأ من بوابة الإعلام يظهر منسوباً إليها، والحل مع ملاحظة.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { feedMock, statsMock, resolveMock, subscribeMock } = vi.hoisted(() => ({
  feedMock: vi.fn(),
  statsMock: vi.fn(),
  resolveMock: vi.fn(),
  subscribeMock: vi.fn(() => () => {}),
}))

vi.mock('@sdk/system.sdk', () => ({
  system: {
    consoleFeed: feedMock,
    consoleStats: statsMock,
    consoleResolve: resolveMock,
    consoleSubscribe: subscribeMock,
  },
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: () => void }) => unknown) => sel({ addToast: vi.fn() }) }))

import ConsolePage, { sinceOf, kindOf, describeRow, pathOnly } from '@portals/it/pages/Console/ConsolePage'

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  error_type: 'runtime',
  message: "Cannot read properties of undefined (reading 'photos')",
  stack: 'TypeError: ...\n at MediaDesigns (src/portals/media/x.tsx:1:1)',
  url: 'https://app/media/designs/4',
  user_agent: 'UA',
  user_id: 'u-1',
  context: {},
  resolved: false,
  created_at: '2026-10-02T08:00:00Z',
  level: 'error',
  source: 'boundary',
  portal: 'media',
  kind: 'null_access',
  fingerprint: 'abcd1234',
  occurrences: 3,
  last_seen_at: '2026-10-02T09:00:00Z',
  resolved_at: null,
  resolution_note: null,
  ...over,
})

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConsolePage />
    </QueryClientProvider>,
  )
}

describe('Console · الصفحة', () => {
  beforeEach(() => {
    feedMock.mockReset()
    statsMock.mockReset()
    resolveMock.mockReset()
    subscribeMock.mockClear()
    statsMock.mockResolvedValue({ open_errors: 5, open_warnings: 2, resolved: 1, affected_users: 3, by_portal: { media: 4, hr: 1 }, by_kind: { null_access: 4 } })
    feedMock.mockResolvedValue([
      row(),
      row({ id: 2, level: 'warn', kind: 'react_warning', source: 'console', portal: 'hr', message: 'Warning: Encountered two children with the same key', occurrences: 1 }),
    ])
  })

  it('يعرض الإحصاءات، البث الحي مُشترك، وخطأ الإعلام يظهر منسوباً لبوابة الإعلام مع نوعه', async () => {
    renderPage()
    expect(await screen.findAllByText('بوابة الإعلام')).not.toHaveLength(0)
    expect(subscribeMock).toHaveBeenCalledTimes(1)
    const stats = screen.getByTestId('console-stats')
    expect(await within(stats).findByText('5')).toBeInTheDocument()
    expect(within(stats).getByText('2')).toBeInTheDocument()
    const rows = await screen.findAllByTestId('console-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.getAttribute('data-kind')).toBe('null_access')
    expect(within(rows[0]!).getByText('وصول إلى قيمة فارغة (undefined/null)')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('×3')).toBeInTheDocument()
    // الافتراضي: المفتوحة فقط، كل المستويات
    expect(feedMock.mock.calls[0]![0]).toMatchObject({ level: null, resolved: false, portal: null })
  })

  it('توسيع الصف يعرض الشرح وخطوات الحل والتفاصيل التقنية', async () => {
    renderPage()
    const rows = await screen.findAllByTestId('console-row')
    fireEvent.click(within(rows[0]!).getByRole('button', { expanded: false }))
    const details = await screen.findByTestId('console-row-details')
    expect(within(details).getByText('لماذا يحدث؟')).toBeInTheDocument()
    expect(within(details).getByText('خطوات الحل')).toBeInTheDocument()
    expect(within(details).getAllByText(/Cannot read properties of undefined/).length).toBeGreaterThan(0)
    expect(within(details).getByText(/أضف \?\. أو قيمة افتراضية/)).toBeInTheDocument()
    expect(within(details).getByText('Stack trace')).toBeInTheDocument()
  })

  it('تبويب «التنبيهات» يطلب warn فقط، و«الأخطاء» يطلب error فقط', async () => {
    renderPage()
    await screen.findAllByTestId('console-row')
    fireEvent.click(screen.getByRole('tab', { name: /التنبيهات/ }))
    await vi.waitFor(() => expect(feedMock.mock.calls.some((c) => c[0].level === 'warn')).toBe(true))
    fireEvent.click(screen.getByRole('tab', { name: /الأخطاء/ }))
    await vi.waitFor(() => expect(feedMock.mock.calls.some((c) => c[0].level === 'error')).toBe(true))
  })

  it('تبويب «الدليل» يعرض كل أنواع الأخطاء مع شرحها (17 نوعاً) بلا طلب خلاصة', async () => {
    renderPage()
    await screen.findAllByTestId('console-row')
    fireEvent.click(screen.getByRole('tab', { name: /الدليل/ }))
    const guide = await screen.findByTestId('console-guide')
    expect(guide.querySelectorAll('article')).toHaveLength(17)
    expect(within(guide).getByText('دالة أو جدول غير موجود في قاعدة البيانات')).toBeInTheDocument()
  })

  it('الفلاتر: البوابة والنوع والحالة والبحث تصل إلى الخادم', async () => {
    renderPage()
    await screen.findAllByTestId('console-row')
    fireEvent.change(screen.getByLabelText('البوابة'), { target: { value: 'media' } })
    fireEvent.change(screen.getByLabelText('نوع الخطأ'), { target: { value: 'rpc_missing' } })
    fireEvent.change(screen.getByLabelText('الحالة'), { target: { value: 'resolved' } })
    fireEvent.change(screen.getByLabelText('بحث'), { target: { value: 'console_feed' } })
    await vi.waitFor(() => {
      const last = feedMock.mock.calls.at(-1)![0]
      expect(last).toMatchObject({ portal: 'media', kind: 'rpc_missing', resolved: true, q: 'console_feed' })
    })
  })

  it('وسم كمحلول يرسل الملاحظة إلى console_resolve', async () => {
    resolveMock.mockResolvedValue(row({ resolved: true }))
    renderPage()
    const rows = await screen.findAllByTestId('console-row')
    fireEvent.click(within(rows[0]!).getByRole('button', { expanded: false }))
    fireEvent.change(await screen.findByLabelText('ملاحظة الحل'), { target: { value: 'أُضيف حارس للصور' } })
    fireEvent.click(screen.getByRole('button', { name: /وسم كمحلول/ }))
    await vi.waitFor(() => expect(resolveMock).toHaveBeenCalledWith(1, true, 'أُضيف حارس للصور'))
  })

  it('مساعدات نقية: sinceOf / kindOf / describeRow / pathOnly', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    expect(sinceOf('1h', now)).toBe('2026-10-02T11:00:00.000Z')
    expect(sinceOf('7d', now)).toBe('2026-09-25T12:00:00.000Z')
    expect(sinceOf('all', now)).toBeNull()
    expect(kindOf({ kind: 'weird' })).toBe('unknown')
    expect(kindOf({ kind: 'permission' })).toBe('permission')
    expect(pathOnly('https://a/media/x?y=1')).toBe('/media/x?y=1')
    expect(pathOnly('garbage')).toBe('garbage')
    const r = row() as unknown as Parameters<typeof describeRow>[0]
    expect(describeRow(r, 'عنوان')).toContain('بوابة الإعلام')
    expect(describeRow(r, 'عنوان')).toContain('Stack:')
  })
})
