/** 00319: ضغط موحّد قبل الرفع لكل مصادر الصور التي كانت تُرفع خاماً (المتعهدون، GBS، القواطع، معالجة الشكاوى، الكاميرا) */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ compress: vi.fn(), upload: vi.fn(), rpc: vi.fn() }))
vi.mock('@lib/media/image-compress', () => ({ compressImage: h.compress }))
vi.mock('@sdk/client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      storage: { from: () => ({ upload: h.upload, createSignedUrl: vi.fn() }) },
      rpc: h.rpc,
    },
  }
})
import { contractors } from '@sdk/contractors.sdk'
import { gbs } from '@sdk/gbs.sdk'
import { sectorPhotos } from '@sdk/sector.sdk'

const raw = new File([new Uint8Array(50_000)], 'big.jpg', { type: 'image/jpeg' })
const small = new File([new Uint8Array(3_000)], 'big.jpg', { type: 'image/jpeg' })

describe('ضغط الصور قبل الرفع (00319)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.compress.mockResolvedValue(small)
    h.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    h.rpc.mockResolvedValue({ data: { id: 'p1', storage_path: 'x', caption: '', created_at: '2026-01-01' }, error: null })
  })

  it('المتعهد: السيلفي وصورة الفريق تُضغطان ثم تُرفع النسخة المضغوطة', async () => {
    await contractors.checkin({ latitude: 33, longitude: 44, accuracy: 5, headcount: 10, selfie: raw, teamPhoto: raw })
    expect(h.compress).toHaveBeenCalledTimes(2)
    expect(h.compress).toHaveBeenCalledWith(raw)
    for (const call of h.upload.mock.calls) expect(call[1]).toBe(small)
  })

  it('GBS: صورة الحاوية تُضغط قبل الرفع', async () => {
    await gbs.uploadImage(raw)
    expect(h.compress).toHaveBeenCalledWith(raw)
    expect(h.upload.mock.calls[0]?.[1]).toBe(small)
  })

  it('القواطع: صورة القاطع تُضغط قبل الرفع', async () => {
    await sectorPhotos.upload(raw, 'وصف')
    expect(h.compress).toHaveBeenCalledWith(raw)
    expect(h.upload.mock.calls[0]?.[1]).toBe(small)
  })
})
