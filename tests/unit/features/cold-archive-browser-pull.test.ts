/** 🧊 تنزيل الحزمة من المتصفح إلى مجلد (00320): تنزيل → بصمات → تسجيل → تحقق من القرص → تسجيل النسخة، مع استئناف ومعالجة المفقود/التالف */
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })

const h = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), pkg: vi.fn() }))
vi.mock('@sdk/client', () => ({ supabase: { rpc: h.rpc, storage: { from: () => ({ download: h.download }) } } }))
vi.mock('@sdk/cold-archive.sdk', () => ({ coldArchive: { package: h.pkg } }))
import { fileKey, pullPackageToDirectory, safeSegments, sha256Hex, type FsDirHandle, type FsFileHandle } from '@features/cold-archive/browser-pull'

/* مجلد وهمي في الذاكرة */
function memDir(name = 'D'): FsDirHandle & { store: Map<string, Uint8Array<ArrayBuffer>> } {
  const store = new Map<string, Uint8Array<ArrayBuffer>>()
  const make = (prefix: string, dname: string): FsDirHandle => ({
    kind: 'directory', name: dname,
    async getDirectoryHandle(n, o) { const p = prefix + n + '/'; if (!o?.create && ![...store.keys()].some((k) => k.startsWith(p))) throw new Error('NotFound'); return make(p, n) },
    async getFileHandle(n, o): Promise<FsFileHandle> {
      const p = prefix + n
      if (!o?.create && !store.has(p)) throw new Error('NotFound')
      return { kind: 'file', name: n, async getFile() { const b = store.get(p); if (!b) throw new Error('NotFound'); return new File([b], n) },
        async createWritable() { let buf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0)); return { async write(d) { buf = typeof d === 'string' ? new TextEncoder().encode(d) as Uint8Array<ArrayBuffer> : d instanceof Blob ? new Uint8Array(await new Response(d).arrayBuffer()) : d }, async close() { store.set(p, buf) } } } }
    },
  })
  return Object.assign(make('', name), { store })
}
const items = [
  { id: 1, bucket: 'media-photos', storage_path: 'u1/a.jpg', status: 'listed' },
  { id: 2, bucket: 'media-photos', storage_path: 'u1/b:x.jpg', status: 'listed' },
  { id: 3, bucket: 'media-photos', storage_path: 'u1/gone.jpg', status: 'listed' },
]
const enc = (t: string) => new TextEncoder().encode(t) as Uint8Array<ArrayBuffer>
const blobs: Record<string, Uint8Array<ArrayBuffer>> = { 'u1/a.jpg': enc('hello'), 'u1/b:x.jpg': enc('world') }
let pkg: Record<string, unknown>

describe('pullPackageToDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pkg = { id: 'p1', code: 'PKG-T', status: 'ready', period_from: '2026-01-01', period_to: '2026-01-31', file_count: 3, downloaded_count: 0, verified_copies: 0, required_copies: 1 }
    h.pkg.mockImplementation(async () => pkg)
    h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'cold_archive_items_list') return { data: args.p_after ? [] : items, error: null }
      if (fn === 'cold_archive_items_downloaded') { pkg.downloaded_count = (args.p_items as unknown[]).length; return { data: { updated: 1, rejected: 0 }, error: null } }
      if (fn === 'cold_archive_item_missing') { pkg.file_count = 2; return { data: null, error: null } }
      if (fn === 'cold_archive_copy_verify') { pkg = { ...pkg, status: 'verified', verified_copies: 1 }; return { data: pkg, error: null } }
      return { data: null, error: { message: 'unexpected ' + fn } }
    })
    h.download.mockImplementation(async (p: string) => blobs[p] ? { data: new Blob([blobs[p] as BlobPart]), error: null } : { data: null, error: { message: 'Object not found' } })
  })

  it('مسارات آمنة على ويندوز', () => {
    expect(safeSegments('media-photos', 'u1/b:x.jpg')).toEqual(['files', 'media-photos', 'u1', 'b%3Ax.jpg'])
    expect(safeSegments('media-photos', '../con.jpg')).toEqual(['files', 'media-photos', '%2E%2E', '_con.jpg'])
  })

  it('دورة كاملة: ينزّل، يبلّغ المفقود، يكتب البيان، يتحقق من القرص، ويسجّل النسخة باسم المجلد', async () => {
    const dir = memDir('قرص-1'); const phases: string[] = []
    const r = await pullPackageToDirectory('p1', dir, { diskLabel: dir.name, onProgress: (p) => { if (phases.at(-1) !== p.phase) phases.push(p.phase) } })
    expect(r).toMatchObject({ downloaded: 2, missing: 1, failed: 0, verified: true, corrupt: 0 })
    expect(phases).toEqual(['listing', 'downloading', 'verifying', 'registering', 'done'])
    expect(dir.store.has('PKG-T/files/media-photos/u1/b%3Ax.jpg')).toBe(true)
    const manifest = JSON.parse(new TextDecoder().decode(dir.store.get('PKG-T/manifest.json')))
    expect(manifest.files[fileKey('media-photos', 'u1/a.jpg')].sha256).toBe(await sha256Hex(enc('hello')))
    expect(manifest.missing).toEqual([{ bucket: 'media-photos', path: 'u1/gone.jpg' }])
    const verify = h.rpc.mock.calls.find((c) => c[0] === 'cold_archive_copy_verify')
    expect(verify?.[1]).toMatchObject({ p_package: 'p1', p_disk_label: 'قرص-1' })
    expect((verify?.[1] as { p_ok_hashes: unknown[] }).p_ok_hashes).toHaveLength(2)
    expect(h.rpc.mock.calls.some((c) => c[0] === 'cold_archive_item_missing')).toBe(true)
  })

  it('الاستئناف: تشغيل ثانٍ على نفس المجلد لا يعيد تنزيل ما اكتمل', async () => {
    const dir = memDir()
    await pullPackageToDirectory('p1', dir, { diskLabel: 'x' })
    h.download.mockClear()
    pkg = { ...pkg, status: 'ready' }
    await pullPackageToDirectory('p1', dir, { diskLabel: 'x' })
    expect(h.download).not.toHaveBeenCalled()
  })

  it('ملف تالف على القرص: لا تُسجَّل النسخة ويُحذف من البيان ليُعاد تنزيله', async () => {
    const dir = memDir()
    // تنزيل ناجح أولاً، ثم إتلاف ملف على القرص، ثم محاولة نسخة ثانية
    const r1 = await pullPackageToDirectory('p1', dir, { diskLabel: 'x' })
    expect(r1.verified).toBe(true)
    dir.store.set('PKG-T/files/media-photos/u1/a.jpg', enc('CORRUPT'))
    pkg = { ...pkg, status: 'verified' }
    h.rpc.mockClear()
    const r2 = await pullPackageToDirectory('p1', dir, { diskLabel: 'y' })
    expect(r2).toMatchObject({ verified: false, corrupt: 1 })
    expect(h.rpc.mock.calls.some((c) => c[0] === 'cold_archive_copy_verify')).toBe(false)
    const manifest = JSON.parse(new TextDecoder().decode(dir.store.get('PKG-T/manifest.json')))
    expect(manifest.files[fileKey('media-photos', 'u1/a.jpg')]).toBeUndefined()
  })

  it('خطأ شبكة في ملف: يُحصى كفاشل ولا يُسجَّل تحقق', async () => {
    h.download.mockImplementation(async (p: string) => p === 'u1/a.jpg' ? { data: null, error: { message: 'network' } } : { data: new Blob([blobs[p] as BlobPart]), error: null })
    const r = await pullPackageToDirectory('p1', memDir(), { diskLabel: 'x' })
    expect(r).toMatchObject({ failed: 1, verified: false })
  })
})
