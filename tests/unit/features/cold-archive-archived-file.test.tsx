/** 🧊 بطاقة «مؤرشفة خارجياً» (00318): الصورة الموجودة تُعرض؛ المفقودة المؤرشفة تُستبدل بالبطاقة؛ المفقودة لسبب آخر تعرض البديل */
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('@sdk/cold-archive.sdk', () => ({ coldArchiveLookup: h.lookup }))
import { ArchiveAwarePhoto, ArchivedFileCard, __resetArchivedLookupCache } from '@features/cold-archive/ArchivedFile'

const info = { package_code: 'PKG-2026-07-01_2026-08-31-001', purged_at: '2026-10-20T08:00:00Z', period_from: '2026-07-01', period_to: '2026-08-31', disks: ['قرص-1'] }
const wrap = (ui: React.ReactElement) => render(ui)

describe('ArchivedFile', () => {
  beforeEach(() => { vi.clearAllMocks(); __resetArchivedLookupCache(); h.lookup.mockResolvedValue({}) })

  it('البطاقة الكاملة تعرض الرمز والقرص وتاريخ الحذف؛ المضغوطة العنوان فقط', () => {
    const { unmount } = render(<ArchivedFileCard info={info} />)
    const card = screen.getByTestId('archived-file-card')
    expect(card).toHaveTextContent('مؤرشفة خارجياً')
    expect(card).toHaveTextContent('PKG-2026-07-01_2026-08-31-001')
    expect(card).toHaveTextContent('القرص: قرص-1')
    expect(card).toHaveTextContent('20/10/2026')
    unmount()
    render(<ArchivedFileCard info={info} compact />)
    expect(screen.getByTestId('archived-file-card')).not.toHaveTextContent('PKG-')
  })

  it('مع رابط: صورة عادية ولا استعلام', () => {
    wrap(<ArchiveAwarePhoto bucket="media-photos" path="a.jpg" url="https://x/a.jpg" missing={false} alt="صورة" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/a.jpg')
    expect(h.lookup).not.toHaveBeenCalled()
  })

  it('مفقودة ومؤرشفة: تظهر البطاقة بعد الاستعلام بالمسار والدلو الصحيحين', async () => {
    h.lookup.mockResolvedValue({ 'u1/a.jpg': info })
    wrap(<ArchiveAwarePhoto bucket="contractor-photos" path="u1/a.jpg" url={undefined} missing alt="سيلفي" fallback={<span>جارٍ التحميل</span>} />)
    expect(screen.getByText('جارٍ التحميل')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('archived-file-card')).toBeInTheDocument())
    expect(h.lookup).toHaveBeenCalledWith('contractor-photos', ['u1/a.jpg'])
  })

  it('مفقودة وغير مؤرشفة: يبقى البديل', async () => {
    wrap(<ArchiveAwarePhoto bucket="sector-photos" path="z.jpg" url={null} missing alt="" fallback={<span>الملف غير متاح</span>} />)
    await waitFor(() => expect(h.lookup).toHaveBeenCalled())
    expect(screen.getByText('الملف غير متاح')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-file-card')).toBeNull()
  })

  it('غير مفقودة بعد (ما زالت تُحمَّل): لا استعلام', () => {
    wrap(<ArchiveAwarePhoto bucket="sector-photos" path="z.jpg" url={undefined} missing={false} alt="" fallback={<span>…</span>} />)
    expect(h.lookup).not.toHaveBeenCalled()
  })
})
