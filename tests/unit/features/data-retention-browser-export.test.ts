import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })

const h = vi.hoisted(() => ({ rpc: vi.fn(), recorded: vi.fn() }))
vi.mock('@sdk/client', () => ({ supabase: { rpc: h.rpc }, sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data } }))
import { exportFolderName, exportRequestToDirectory, rowsToCsv } from '@features/data-retention/browser-export'
import { sha256Hex, type FsDirHandle, type FsFileHandle } from '@features/cold-archive/browser-pull'

function memDir(name = 'D'): FsDirHandle & { store: Map<string, Uint8Array<ArrayBuffer>> } {
  const store = new Map<string, Uint8Array<ArrayBuffer>>()
  const make = (prefix: string, n: string): FsDirHandle => ({
    kind: 'directory', name: n,
    async getDirectoryHandle(d) { return make(prefix + d + '/', d) },
    async getFileHandle(f): Promise<FsFileHandle> {
      const p = prefix + f
      return {
        kind: 'file', name: f,
        async getFile() { return new File([store.get(p) ?? new Uint8Array()], f) },
        async createWritable() { let buf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0)); return { async write(d) { buf = typeof d === 'string' ? new TextEncoder().encode(d) as Uint8Array<ArrayBuffer> : d instanceof Blob ? new Uint8Array(await new Response(d).arrayBuffer()) : d }, async close() { store.set(p, buf) } } },
      }
    },
  })
  return Object.assign(make('', name), { store })
}

describe('browser export (00326)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'data_retention_export_rows') {
        const page1 = { rows: [{ 'وقت البصمة': '2026-01-05 08:00:00', 'الاتجاه': 'دخول', 'المعرّف': 'a' }, { 'وقت البصمة': '2026-01-05 16:00:00', 'الاتجاه': 'خروج', 'المعرّف': 'b' }], count: 2, next: { t: 'x', id: 'b' }, label: 'البصمات الخام من الأجهزة', cutoff: '2026-04-22T00:00:00+00:00' }
        const page2 = { rows: [{ 'وقت البصمة': '2026-01-06 08:00:00', 'الاتجاه': 'دخول', 'المعرّف': 'c' }], count: 1, next: null, label: page1.label, cutoff: page1.cutoff }
        return { data: args.p_after ? page2 : page1, error: null }
      }
      if (fn === 'data_retention_export_recorded') { h.recorded(args); return { data: { id: 'r1', status: 'exported', rows_exported: args.p_rows }, error: null } }
      return { data: null, error: { message: 'unexpected ' + fn } }
    })
  })

  it('CSV عربي مع BOM واقتباس صحيح', () => {
    const csv = rowsToCsv([{ 'الاسم': 'أحمد "أبو" علي', 'العدد': 3 }])
    expect(csv).toBe('\ufeff"الاسم","العدد"\r\n"أحمد ""أبو"" علي","3"\r\n')
    expect(exportFolderName('البصمات الخام من الأجهزة', '2026-04-22T00:00:00+00:00')).toBe('البصمات الخام من الأجهزة حتى 2026-04-22')
  })

  it('يجمع كل الدفعات، يكتب JSON+CSV+إثبات في مجلد عربي، ويسجّل العدد وبصمة JSON واسم القرص', async () => {
    const dir = memDir('قرص-أ'); const phases: string[] = []
    const r = await exportRequestToDirectory({ id: 'r1' }, dir, { onProgress: (p) => { if (phases.at(-1) !== p.phase) phases.push(p.phase) } })
    expect(phases).toEqual(['fetching', 'writing', 'registering', 'done'])
    expect(r.rows).toBe(3)
    const base = 'الاحتفاظ بالبيانات/البصمات الخام من الأجهزة حتى 2026-04-22/'
    expect([...dir.store.keys()].sort()).toEqual([base + 'الإثبات.txt', base + 'البصمات الخام من الأجهزة.csv', base + 'البصمات الخام من الأجهزة.json'].sort())
    const json = dir.store.get(base + 'البصمات الخام من الأجهزة.json') as Uint8Array<ArrayBuffer>
    expect(JSON.parse(new TextDecoder().decode(json))['عدد الصفوف']).toBe(3)
    expect(r.sha256).toBe(await sha256Hex(json))
    expect(new TextDecoder().decode(dir.store.get(base + 'البصمات الخام من الأجهزة.csv')).split('\r\n')).toHaveLength(5)   // رأس + 3 + سطر فارغ أخير
    expect(h.recorded).toHaveBeenCalledWith({ p_request: 'r1', p_rows: 3, p_sha256: r.sha256, p_label: 'قرص-أ' })
    expect(new TextDecoder().decode(dir.store.get(base + 'الإثبات.txt'))).toContain(r.sha256)
  })

  it('خطأ في الجلب يوقف كل شيء قبل الكتابة ولا يسجَّل إثبات', async () => {
    h.rpc.mockImplementation(async () => ({ data: null, error: { message: 'IT_FORBIDDEN' } }))
    const dir = memDir()
    await expect(exportRequestToDirectory({ id: 'r1' }, dir)).rejects.toThrow('IT_FORBIDDEN')
    expect(dir.store.size).toBe(0)
    expect(h.recorded).not.toHaveBeenCalled()
  })
})
