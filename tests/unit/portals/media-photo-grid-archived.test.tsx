/** 00318: شبكة صور الإعلام — الصورة المحذوفة من المنصة تظهر كبطاقة «مؤرشفة خارجياً» لا كأيقونة مكسورة */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ urls: { 'u/a.jpg': 'https://x/a.jpg' } as Record<string, string>, archived: { 'u/gone.jpg': { package_code: 'PKG-2026-07-01_2026-08-31-001', purged_at: '2026-10-20T08:00:00Z', period_from: '2026-07-01', period_to: '2026-08-31', disks: ['قرص-1'] } }, lookupArgs: [] as unknown[] }))
vi.mock('@features/media/hooks', () => ({ useSignedPhotoUrls: () => ({ data: h.urls, isSuccess: true }) }))
vi.mock('@features/cold-archive/ArchivedFile', async (orig) => {
  const actual = await orig() as Record<string, unknown>
  return { ...actual, useArchivedLookup: (bucket: string, paths: string[]) => { h.lookupArgs.push([bucket, paths]); return { data: h.archived } } }
})
import PhotoGrid from '@portals/media/components/PhotoGrid'

describe('PhotoGrid × الأرشيف البارد', () => {
  it('يسأل الأرشيف عن المسارات بلا رابط فقط ويعرض البطاقة مكانها', () => {
    render(<PhotoGrid items={[{ id: '1', path: 'u/a.jpg', caption: null }, { id: '2', path: 'u/gone.jpg', caption: 'قديمة' }, { id: '3', path: 'u/other.jpg', caption: null }]} />)
    expect(h.lookupArgs.at(-1)).toEqual(['media-photos', ['u/gone.jpg', 'u/other.jpg']])
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x/a.jpg')
    expect(screen.getAllByTestId('archived-file-card')).toHaveLength(1)
  })
})
