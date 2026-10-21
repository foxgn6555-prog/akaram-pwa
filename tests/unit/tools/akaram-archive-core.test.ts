import { describe, expect, it } from 'vitest'
// @ts-expect-error — وحدة JS بلا أنواع (أداة سطر أوامر)
import { chunk, compareDisk, fileKey, newManifest, parseArgs, pendingItems, recordDownloaded, recordMissing, safeLocalPath, sha256Hex, toDownloadedPayload } from '../../../tools/akaram-archive/lib/core.mjs'

const pkg = { id: 'p1', code: 'PKG-2026-07-01_2026-08-31-001', period_from: '2026-07-01', period_to: '2026-08-31', file_count: 3, total_bytes: 300 }
const items = [
  { id: 1, bucket: 'media-photos', storage_path: 'u1/a.jpg', status: 'listed' },
  { id: 2, bucket: 'media-photos', storage_path: 'u1/b.jpg', status: 'listed' },
  { id: 3, bucket: 'contractor-photos', storage_path: 'u2/c.jpg', status: 'missing' },
]
const H = (c: string) => c.repeat(64)

describe('🧊 akaram-archive — المنطق الأساسي (00316)', () => {
  it('مسار محلي آمن على ويندوز: الأحرف الممنوعة تُرمَّز، ../ والأسماء المحجوزة تُعطَّل', () => {
    expect(safeLocalPath('media-photos', 'u1/a.jpg')).toBe('files/media-photos/u1/a.jpg')
    expect(safeLocalPath('media-photos', 'u1/12:30?x*.jpg')).toBe('files/media-photos/u1/12%3A30%3Fx%2A.jpg')
    expect(safeLocalPath('media-photos', '../../etc/passwd')).toBe('files/media-photos/%2E%2E/%2E%2E/etc/passwd')
    expect(safeLocalPath('media-photos', 'x/con.jpg')).toBe('files/media-photos/x/_con.jpg')
    expect(safeLocalPath('media-photos', 'x/name. ')).toBe('files/media-photos/x/name%2E%20')
    expect(safeLocalPath('weird bucket!', 'a')).toBe('files/weird_bucket_/a')
  })

  it('البيان: العناصر المعلّقة تستثني المفقودة وما نُزِّل سابقاً ببصمة صالحة (الاستئناف)', () => {
    const m = newManifest(pkg, 'https://x.supabase.co')
    expect(pendingItems(items, m).map((i: { id: number }) => i.id)).toEqual([1, 2])
    recordDownloaded(m, items[0], H('a'), 100)
    expect(pendingItems(items, m).map((i: { id: number }) => i.id)).toEqual([2])
    expect(m.files[fileKey('media-photos', 'u1/a.jpg')]).toMatchObject({ local: 'files/media-photos/u1/a.jpg', sha256: H('a'), bytes: 100 })
    recordMissing(m, items[1]); recordMissing(m, items[1])
    expect(m.missing).toEqual([{ bucket: 'media-photos', path: 'u1/b.jpg' }])
    expect(toDownloadedPayload(Object.values(m.files))).toEqual([{ bucket: 'media-photos', path: 'u1/a.jpg', sha256: H('a'), bytes: 100 }])
  })

  it('مقارنة القرص: مطابق / تالف / ناقص', () => {
    const m = newManifest(pkg, 'https://x.supabase.co')
    recordDownloaded(m, items[0], H('a'), 100); recordDownloaded(m, items[1], H('b'), 100); recordDownloaded(m, items[2], H('c'), 100)
    const r = compareDisk(m, new Map([[fileKey('media-photos', 'u1/a.jpg'), H('a')], [fileKey('media-photos', 'u1/b.jpg'), H('f')], [fileKey('contractor-photos', 'u2/c.jpg'), null]]))
    expect(r.ok).toEqual([{ bucket: 'media-photos', path: 'u1/a.jpg', sha256: H('a') }])
    expect(r.corrupt.map((c: { path: string }) => c.path)).toEqual(['u1/b.jpg'])
    expect(r.absent.map((c: { path: string }) => c.path)).toEqual(['u2/c.jpg'])
  })

  it('SHA-256 حقيقي + تجميع دفعات + تحليل الوسائط', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(parseArgs(['pull', 'PKG-1', '--to', 'D:\\Archive'])).toEqual({ command: 'pull', code: 'PKG-1', opts: { to: 'D:\\Archive' } })
    expect(parseArgs(['verify', 'PKG-1', '--from', '/mnt/d', '--disk', 'قرص-1'])).toEqual({ command: 'verify', code: 'PKG-1', opts: { from: '/mnt/d', disk: 'قرص-1' } })
    expect(parseArgs([])).toEqual({ command: 'help', code: null, opts: {} })
  })
})
