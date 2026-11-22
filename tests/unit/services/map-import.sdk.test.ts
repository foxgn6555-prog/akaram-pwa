/**
 * اختبارات SDK استيراد الخريطة — تكامل كامل بلا شبكة.
 *
 * هذا الملف كان **٠٪ تغطية فروع** (٤٦/٤٦ فرعاً ميتاً) رغم أنه الطبقة التي ترسل
 * كل صف استورده المشغّل إلى القاعدة. العيب الذي كشفه المتصفح (٥٠ من ٣٠٨) جعلني
 * أنظر هنا: المعاينة كانت تُقصّ، فهل يصل للقاعدة ما يعرضه الجدول أم ما تعرضه
 * الخريطة؟ الجواب: `sendBatch` يرسل **كل** الصفوف بلا قصّ — والاختبار يثبت ذلك
 * بالعدّ لا بالقراءة.
 */
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: { message: string; code?: string } | null }
  const state = {
    rpc: { data: null as unknown, error: null as { message: string } | null },
    table: { data: [] as unknown, error: null as { message: string } | null },
    calls: { rpc: [] as { fn: string; args: unknown }[], from: [] as string[] },
  }
  function makeChain(result: Result) {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle', 'delete', 'insert', 'update', 'upsert']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.then = (resolve: (r: Result) => void) => resolve(result)
    return chain
  }
  return {
    state,
    from: vi.fn((table: string) => {
      state.calls.from.push(table)
      return makeChain(state.table)
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      state.calls.rpc.push({ fn, args })
      return state.rpc
    }),
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = (await importOriginal()) as { supabase: unknown }
  return {
    ...actual,
    supabase: { from: h.from, rpc: h.rpc },
  }
})

const { mapImportSdk, toBatchRow, chunk, DEFAULT_BATCH_SIZE, DENSITY_REFERENCE } = await import(
  '@sdk/map-import.sdk'
)

/** صف محرّك نموذجي مطابق لعقد `ImportRow` (cls مطلوب، widthSource محصور) */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    cls: 'STR' as const,
    code: 'STR-0001',
    kind: 'primary' as const,
    name: 'شارع تجريبي',
    widthM: 12,
    widthSource: 'measured' as const,
    osmWayId: 12345,
    linkSource: undefined,
    mahallaNum: undefined,
    lengthM: 420,
    pts: [
      [33.31, 44.36],
      [33.32, 44.37],
    ],
    ...over,
  } as unknown as Parameters<typeof toBatchRow>[0]
}

beforeEach(() => {
  h.state.rpc = { data: null, error: null }
  h.state.table = { data: [], error: null }
  h.state.calls.rpc = []
  h.state.calls.from = []
  vi.clearAllMocks()
})

describe('الثوابت — لا تغيير بلا قياس', () => {
  it('المرجع ٢١.٣ كم/كم² (بعد إصلاح clip_path)', () => {
    expect(DENSITY_REFERENCE).toBe(21.3)
  })

  it('الدفعة ٢٠٠ صف — آمنة تحت حدّ الطلب', () => {
    expect(DEFAULT_BATCH_SIZE).toBe(200)
  })
})

describe('toBatchRow — تحويل صف المحرّك إلى شكل الدالة', () => {
  it('ينقل الحقول كاملة', () => {
    const r = toBatchRow(row())
    expect(r).toMatchObject({
      code: 'STR-0001',
      kind: 'primary',
      name: 'شارع تجريبي',
      width_m: 12,
      width_source: 'measured',
      osm_way_id: 12345,
      link_source: null,
      mahalla_num: null,
    })
    expect(r.path).toHaveLength(2)
  })

  it('اسم فارغ ⇒ null (القاعدة تقبله، والزقاق بلا اسم حالة مشروعة)', () => {
    expect(toBatchRow(row({ name: '' })).name).toBeNull()
  })

  it('linkSource و mahallaNum الغائبان ⇒ null لا undefined', () => {
    const r = toBatchRow(row({ linkSource: undefined, mahallaNum: undefined }))
    expect(r.link_source).toBeNull()
    expect(r.mahalla_num).toBeNull()
  })

  it('linkSource موجود يُنقل كما هو', () => {
    expect(toBatchRow(row({ linkSource: 'osm_name' })).link_source).toBe('osm_name')
  })
})

describe('chunk — لا يُسقط ذيلاً', () => {
  it('يقسّم ٣٠٨ صفاً (ملف المشغّل) إلى ٢٠٠ + ١٠٨', () => {
    const parts = chunk(Array.from({ length: 308 }, (_, i) => i))
    expect(parts.map((p) => p.length)).toEqual([200, 108])
    expect(parts.flat()).toHaveLength(308)
  })

  it('مضاعف تام لا يُنتج دفعة فارغة', () => {
    expect(chunk(Array.from({ length: 400 }, (_, i) => i)).map((p) => p.length)).toEqual([200, 200])
  })

  it('أقل من حجم الدفعة ⇒ دفعة واحدة', () => {
    expect(chunk([1, 2, 3]).map((p) => p.length)).toEqual([3])
  })

  it('مصفوفة فارغة ⇒ لا دفعات', () => {
    expect(chunk([])).toEqual([])
  })

  it('حجم مخصّص', () => {
    expect(chunk(Array.from({ length: 10 }, (_, i) => i), 3).map((p) => p.length)).toEqual([3, 3, 3, 1])
  })

  it('حجم غير صالح ⇒ خطأ صريح لا سلوك صامت', () => {
    expect(() => chunk([1], 0)).toThrow('BATCH_SIZE_INVALID')
    expect(() => chunk([1], -5)).toThrow('BATCH_SIZE_INVALID')
    expect(() => chunk([1], NaN)).toThrow('BATCH_SIZE_INVALID')
    expect(() => chunk([1], Infinity)).toThrow('BATCH_SIZE_INVALID')
  })

  it('الترتيب محفوظ — لا إعادة فرز تُفسد تسلسل الصفوف', () => {
    expect(chunk([5, 4, 3, 2, 1], 2).flat()).toEqual([5, 4, 3, 2, 1])
  })
})

describe('zoneScript — سكربت Overpass الجاهز', () => {
  it('يُعيد النص كما هو', async () => {
    h.state.rpc = { data: '[out:json];way(area);out;', error: null }
    await expect(mapImportSdk.zoneScript('rth')).resolves.toEqual({
      script: '[out:json];way(area);out;',
    })
    expect(h.state.calls.rpc[0]).toEqual({ fn: 'map_osm_script', args: { p_zone: 'rth' } })
  })

  it('null من القاعدة ⇒ EMPTY_RESULT صريح (sdkGuard لا يبتلع الغياب)', async () => {
    h.state.rpc = { data: null, error: null }
    await expect(mapImportSdk.zoneScript('rth')).rejects.toMatchObject({ code: 'EMPTY_RESULT' })
  })

  it('خطأ القاعدة يُرفع', async () => {
    h.state.rpc = { data: null, error: { message: 'not found' } }
    await expect(mapImportSdk.zoneScript('nope')).rejects.toThrow()
  })
})

describe('zonePolygonText', () => {
  it('يُعيد النص الخام للعرض والحساب', async () => {
    h.state.rpc = { data: '33.1 44.1 33.2 44.2', error: null }
    await expect(mapImportSdk.zonePolygonText('rth')).resolves.toBe('33.1 44.1 33.2 44.2')
  })

  it('null ⇒ EMPTY_RESULT — الزون بلا مضلّع خطأ لا «نص فارغ»', async () => {
    h.state.rpc = { data: null, error: null }
    await expect(mapImportSdk.zonePolygonText('rth')).rejects.toMatchObject({ code: 'EMPTY_RESULT' })
  })
})

describe('zoneArea — مساحة من مضلّع القاعدة لا نسخة محلية', () => {
  it('يحسب مساحة مربّع ٠.٠٠٩° جانبه ≈ ٠.٨٤ كم² عند خط عرض ٣٣', async () => {
    // 0.009° عرض ≈ 1.000 كم · 0.009° طول × cos(33°) ≈ 0.839 كم ⇒ 0.839 كم²
    h.state.rpc = {
      data: '33.3000 44.3000 33.3000 44.3090 33.3090 44.3090 33.3090 44.3000',
      error: null,
    }
    const a = await mapImportSdk.zoneArea('rth')
    expect(a).toBeCloseTo(0.839, 2)
  })

  it('أقل من ٣ نقاط ⇒ ٠ لا NaN', async () => {
    h.state.rpc = { data: '33.1 44.1', error: null }
    await expect(mapImportSdk.zoneArea('rth')).resolves.toBe(0)
  })

  it('نص فارغ ⇒ ٠', async () => {
    h.state.rpc = { data: '', error: null }
    await expect(mapImportSdk.zoneArea('rth')).resolves.toBe(0)
  })

  it('قيم غير رقمية تُرشَّح إلى مصفوفة فارغة ⇒ أقل من ٣ نقاط ⇒ ٠', async () => {
    h.state.rpc = { data: '33.1 44.1 abc 33.2 44.2 33.3 44.3', error: null }
    await expect(mapImportSdk.zoneArea('rth')).resolves.toBe(0)
  })
})

describe('zoneStats — إحصاءات من القاعدة', () => {
  it('يجمع أطوال الشوارع والأزقة ويقسم على المساحة', async () => {
    let call = 0
    h.from.mockImplementation((table: string) => {
      h.state.calls.from.push(table)
      const data =
        table === 'map_streets'
          ? [{ length_m: 3000 }, { length_m: 1000 }]
          : [{ length_m: 2000 }, { length_m: null }]
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn(() => chain)
      chain.then = (resolve: (r: unknown) => void) => resolve({ data, error: null })
      call++
      return chain
    })
    h.state.rpc = {
      data: '33.3000 44.3000 33.3000 44.3090 33.3090 44.3090 33.3090 44.3000',
      error: null,
    }
    const s = await mapImportSdk.zoneStats('rth')
    expect(s.streets).toBe(2)
    expect(s.alleys).toBe(2)
    expect(s.total_length_km).toBeCloseTo(6, 5)
    expect(s.area_km2).toBeCloseTo(0.839, 2)
    expect(s.density).toBeGreaterThan(0)
    expect(call).toBe(2)
  })

  it('length_m = null يُعامَل ٠ لا NaN', async () => {
    h.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain)
      chain.then = (resolve: (r: unknown) => void) => resolve({ data: [{ length_m: null }], error: null })
      return chain
    })
    h.state.rpc = { data: '', error: null }
    const s = await mapImportSdk.zoneStats('rth')
    expect(s.total_length_km).toBe(0)
    expect(s.density).toBe(0) // القسمة على مساحة ٠ لا تُنتج Infinity
  })
})

describe('batches — سجل الدفعات', () => {
  it('يرتّب الأحدث أولاً ويحدّ العدد', async () => {
    const chain: Record<string, unknown> = {}
    const order = vi.fn(() => chain)
    const limit = vi.fn(() => chain)
    for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain)
    chain.order = order
    chain.limit = limit
    chain.then = (resolve: (r: unknown) => void) => resolve({ data: [{ id: 'b1' }], error: null })
    h.from.mockImplementation(() => chain)
    const list = await mapImportSdk.batches('rth', 5)
    expect(list).toHaveLength(1)
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(5)
  })

  it('الحدّ الافتراضي ٢٠', async () => {
    const chain: Record<string, unknown> = {}
    const limit = vi.fn(() => chain)
    for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain)
    chain.limit = limit
    chain.then = (resolve: (r: unknown) => void) => resolve({ data: [], error: null })
    h.from.mockImplementation(() => chain)
    await mapImportSdk.batches('rth')
    expect(limit).toHaveBeenCalledWith(20)
  })
})

describe('sendBatch — كل الصفوف تُرسل، لا عيّنة', () => {
  it('يرسل ٣٠٨ صفاً كاملة (رقم المشغّل) — هذا يثبت أن القصّ كان في العرض وحده', async () => {
    h.state.rpc = {
      data: { batch_id: 'b-1', inserted: 308, updated: 0, skipped: 0, errors: [] },
      error: null,
    }
    const rows = Array.from({ length: 308 }, (_, i) => row({ code: `STR-${String(i).padStart(4, '0')}` }))
    const res = await mapImportSdk.sendBatch({ zoneId: 'rth', rows, batchId: 'b-1' })
    expect(res.inserted).toBe(308)
    const payload = h.state.calls.rpc[0]?.args as { p_rows: unknown[] }
    expect(payload.p_rows).toHaveLength(308)
  })

  it('يحوّل كل صف إلى شكل الدالة', async () => {
    h.state.rpc = { data: { batch_id: 'b', inserted: 1, updated: 0, skipped: 0 }, error: null }
    await mapImportSdk.sendBatch({ zoneId: 'rth', rows: [row()], batchId: 'b' })
    const payload = h.state.calls.rpc[0]?.args as { p_rows: { code: string }[] }
    expect(payload.p_rows[0]?.code).toBe('STR-0001')
  })

  it('المحلات وmeta الافتراضيان {} و[] لا undefined', async () => {
    h.state.rpc = { data: {}, error: null }
    await mapImportSdk.sendBatch({ zoneId: 'rth', rows: [], batchId: 'b' })
    const args = h.state.calls.rpc[0]?.args as { p_mahallas: unknown; p_meta: unknown }
    expect(args.p_mahallas).toEqual([])
    expect(args.p_meta).toEqual({})
  })

  it('المحلات تُمرَّر كما هي', async () => {
    h.state.rpc = { data: {}, error: null }
    const mahallas = [{ code: 'MHL-1', osm_number: '2', name: 'محلة' }]
    await mapImportSdk.sendBatch({ zoneId: 'rth', rows: [], batchId: 'b', mahallas, meta: { src: 'osm' } })
    const args = h.state.calls.rpc[0]?.args as { p_mahallas: unknown; p_meta: unknown }
    expect(args.p_mahallas).toEqual(mahallas)
    expect(args.p_meta).toEqual({ src: 'osm' })
  })

  it('ردّ null ⇒ EMPTY_RESULT صريح، لا أصفار كاذبة تُوهم بالنجاح', async () => {
    h.state.rpc = { data: null, error: null }
    await expect(mapImportSdk.sendBatch({ zoneId: 'rth', rows: [], batchId: 'b' })).rejects.toMatchObject({
      code: 'EMPTY_RESULT',
    })
  })

  it('errors غير مصفوفة ⇒ [] (ردّ مشوّه لا يُسقط الصفحة)', async () => {
    h.state.rpc = { data: { errors: 'oops' }, error: null }
    await expect(mapImportSdk.sendBatch({ zoneId: 'rth', rows: [], batchId: 'b' })).resolves.toMatchObject({
      errors: [],
    })
  })

  it('أخطاء الدالة تُنقل كما هي للعرض', async () => {
    const errors = [{ code: 'STR-1', kind: 'primary', error: 'طرف خارج الزون' }]
    h.state.rpc = { data: { batch_id: 'b', inserted: 0, skipped: 1, errors }, error: null }
    const res = await mapImportSdk.sendBatch({ zoneId: 'rth', rows: [row()], batchId: 'b' })
    expect(res.errors).toEqual(errors)
  })

  it('حقول ناقصة في الردّ ⇒ ٠', async () => {
    h.state.rpc = { data: { batch_id: 'b' }, error: null }
    const res = await mapImportSdk.sendBatch({ zoneId: 'rth', rows: [], batchId: 'b' })
    expect(res).toMatchObject({ inserted: 0, updated: 0, skipped: 0 })
  })
})

describe('clearSkips — قرار صريح فقط', () => {
  it('يحذف سجل التخطي للزون المطلوب', async () => {
    const chain: Record<string, unknown> = {}
    const eq = vi.fn(() => chain)
    const maybeSingle = vi.fn(() => chain)
    chain.delete = vi.fn(() => chain)
    chain.eq = eq
    chain.select = vi.fn(() => chain)
    chain.maybeSingle = maybeSingle
    chain.then = (resolve: (r: unknown) => void) => resolve({ data: null, error: null })
    h.from.mockImplementationOnce(() => chain)
    // حذف ناجح لا يُرجع صفاً — يجب أن يُحلّ لا أن يرفع EMPTY_RESULT
    await expect(mapImportSdk.clearSkips('rth')).resolves.toBeUndefined()
    expect(h.from).toHaveBeenCalledWith('map_import_skips')
    expect(eq).toHaveBeenCalledWith('zone_id', 'rth')
  })

  it('خطأ القاعدة يُرفع بـ SDKError لا يُبتلع', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['delete', 'eq', 'select', 'maybeSingle']) chain[m] = vi.fn(() => chain)
    chain.then = (resolve: (r: unknown) => void) =>
      resolve({ data: null, error: { message: 'denied', code: '42501' } })
    h.from.mockImplementation(() => chain)
    await expect(mapImportSdk.clearSkips('rth')).rejects.toMatchObject({ code: '42501' })
  })
})
