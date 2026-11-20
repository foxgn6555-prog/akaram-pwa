/**
 * الجولة ٥ — نافذة الدعم الفني: التحقق من صحة المدخلات، حد الصور الثلاث،
 * وإرسال المرفقات عبر الدالة المحروسة. (الحراسة الحقيقية في الخادم — تختبرها حزمة SQL)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const createMock = vi.fn(async (_input: unknown) => ({ id: 't1', ticket_number: 7 }))
const contactMock = vi.fn(async () => ({ phone: '07701234567', hours: 'الأحد–الخميس', online: true }))
const uploadMock = vi.fn(async (file: File) => `user-1/${file.name}`)

vi.mock('@sdk/support.sdk', () => ({
  support: {
    contact: () => contactMock(),
    uploadImage: (file: File) => uploadMock(file),
    create: (input: unknown) => createMock(input),
    list: async () => [],
    decide: async () => undefined,
    attachmentUrls: async () => ({}),
  },
}))
vi.mock('@lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { SupportDialog } from '@features/support/SupportDialog'

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SupportDialog open onClose={onClose} portal="employee" />
    </QueryClientProvider>,
  )
  return { onClose }
}

const png = (name: string): File => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })

describe('SupportDialog — الدعم الفني', () => {
  beforeEach(() => {
    createMock.mockClear()
    uploadMock.mockClear()
    contactMock.mockClear()
  })

  it('يعرض رقم الدعم القادم من الإعدادات', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('07701234567')).toBeInTheDocument())
    expect(screen.getByText(/الدعم متاح الآن/)).toBeInTheDocument()
  })

  it('يرفض عنواناً أقصر من ٣ أحرف دون استدعاء الخادم', async () => {
    renderDialog()
    await userEvent.type(screen.getByTestId('support-title'), 'ab')
    await userEvent.type(screen.getByTestId('support-description'), 'وصف كافٍ')
    await userEvent.click(screen.getByTestId('support-submit'))
    expect(await screen.findByTestId('support-error')).toHaveTextContent('عنواناً')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('يرفع الصور ثم ينشئ التذكرة ويغلق النافذة', async () => {
    const { onClose } = renderDialog()
    await userEvent.type(screen.getByTestId('support-title'), 'الطابعة لا تطبع')
    await userEvent.type(screen.getByTestId('support-description'), 'تظهر رسالة خطأ عند الطباعة')
    await userEvent.upload(screen.getByTestId('support-file-input'), [png('a.png'), png('b.png')])
    await userEvent.click(screen.getByTestId('support-submit'))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(uploadMock).toHaveBeenCalledTimes(2)
    const payload = createMock.mock.calls[0]?.[0] as unknown as { attachments: string[]; portal: string; title: string }
    expect(payload.attachments).toHaveLength(2)
    expect(payload.portal).toBe('employee')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('لا يقبل أكثر من ثلاث صور', async () => {
    renderDialog()
    await userEvent.upload(screen.getByTestId('support-file-input'), [
      png('1.png'), png('2.png'), png('3.png'), png('4.png'),
    ])
    expect(await screen.findByTestId('support-error')).toHaveTextContent('الحد الأقصى')
    expect(screen.getByTestId('support-add-image')).toBeDisabled()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
