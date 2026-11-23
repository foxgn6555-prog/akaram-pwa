/**
 * اختبارات عمليات SDK تخطيط الخريطة — قراءة وكتابة عبر موك Supabase.
 *
 * الملف مشمول في بوابة التغطية وكان عند **١٤/١٠٠** فرعاً (١٤٪) — أكبر ثغرة
 * في المشروع. هذه العمليات تكتب الشوارع والأزقة وتبني الزيارات وتحسب التغطية،
 * أي أنها قلب ساحة العمل. الاختبار هنا يثبّت **الفروع** لا السعادة: القيم
 * الغائبة، والردود الفارغة، والمسارات المشروطة (`onlyPending`، `id` موجود/غائب).
 */
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: { message: string; code?: string } | null }
  const state = {
    result: { data: [] as unknown, error: null as { message: string } | null } as Result,
    calls: { from: [] as string[], rpc: [] as { fn: string; args: unknown }[] },
    eqCalls: [] as [string, unknown][],
    orderCalls: [] as unknown[][],
    singleCalled: 0,
    updateCalled: 0,
    insertCalled: 0,
  }
  function makeChain() {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'delete']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        if (m === 'eq') state.eqCalls.push(args as [string, unknown])
        if (m === 'order') state.orderCalls.push(args)
        return chain
      })
    }
    chain.single = vi.fn(() => {
      state.singleCalled++
      return chain
    })
    chain.update = vi.fn(() => {
      state.updateCalled++
      return chain
    })
    chain.insert = vi.fn(() => {
      state.insertCalled++
      return chain
    })
    chain.then = (resolve: (r: Result) => void) => resolve(state.result)
    return chain
  }
  return {
    state,
    from: vi.fn((table: string) => {
      state.calls.from.push(table)
      return makeChain()
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      state.calls.rpc.push({ fn, args })
      return state.result
    }),
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = (await importOriginal()) as { supabase: unknown }
  return { ...actual, supabase: { from: h.from, rpc: h.rpc } }
})

const { mapPlanningSdk, STREET_PREFIX, KIND_LABEL_AR, STATUS_LABEL_AR } = await import(
  '@sdk/map-planning.sdk'
)

beforeEach(() => {
  h.state.result = { data: [], error: null }
  h.state.calls.from = []
  h.state.calls.rpc = []
  h.state.eqCalls = []
  h.state.orderCalls = []
  h.state.singleCalled = 0
  h.state.updateCalled = 0
  h.state.insertCalled = 0
  vi.clearAllMocks()
})

describe('ثوابت العرض', () => {
  it('بادئات الأنواع الأربعة', () => {
    expect(STREET_PREFIX).toEqual({ primary: 'STR', secondary: 'SEC', tertiary: 'TRC', local: 'LOC' })
  })

  it('تسميات عربية كاملة لا مفاتيح', () => {
    expect(Object.values(KIND_LABEL_AR).every((v) => /[\u0600-\u06FF]/.test(v))).toBe(true)
    expect(Object.values(STATUS_LABEL_AR).every((v) => /[\u0600-\u06FF]/.test(v))).toBe(true)
  })
})

describe('قراءات — ترتيب وفلترة', () => {
  it('zones يقرأ map_zones مرتّباً بالكود', async () => {
    h.state.result = { data: [{ id: 'z1' }], error: null }
    await expect(mapPlanningSdk.zones()).resolves.toHaveLength(1)
    expect(h.state.calls.from).toContain('map_zones')
    expect(h.state.orderCalls[0]).toEqual(['code'])
  })

  it('streets يُفلتر بالزون', async () => {
    await mapPlanningSdk.streets('rth')
    expect(h.state.eqCalls).toContainEqual(['zone_id', 'rth'])
  })

  it('alleys يُسطّح المحلة ويحوّل الغياب إلى null', async () => {
    h.state.result = {
      data: [
        { code: 'ALY-1', mahalla: { code: 'M1', name: 'محلة أولى' } },
        { code: 'ALY-2', mahalla: null },
        { code: 'ALY-3' },
      ],
      error: null,
    }
    const rows = await mapPlanningSdk.alleys('rth')
    expect(rows[0]).toMatchObject({ mahalla_code: 'M1', mahalla_name: 'محلة أولى' })
    expect(rows[1]).toMatchObject({ mahalla_code: null, mahalla_name: null })
    expect(rows[2]).toMatchObject({ mahalla_code: null, mahalla_name: null })
  })

  it('mahallas يُفلتر بالزون', async () => {
    await mapPlanningSdk.mahallas('jad')
    expect(h.state.eqCalls).toContainEqual(['zone_id', 'jad'])
  })

  it('reviews افتراضياً: المعلّقة فقط', async () => {
    await mapPlanningSdk.reviews('rth')
    expect(h.state.eqCalls).toContainEqual(['reviewed', false])
  })

  it('reviews مع onlyPending=false: الكل بلا فلتر reviewed', async () => {
    await mapPlanningSdk.reviews('rth', false)
    expect(h.state.eqCalls).not.toContainEqual(['reviewed', false])
    expect(h.state.eqCalls).toContainEqual(['zone_id', 'rth'])
  })

  it('skips يقرأ سجل التخطي', async () => {
    await mapPlanningSdk.skips('rth')
    expect(h.state.calls.from).toContain('map_import_skips')
  })
})

describe('saveStreet — إدراج جديد أو تحديث قائم', () => {
  it('بلا id ⇒ insert لا update', async () => {
    h.state.result = { data: { id: 'new' }, error: null }
    await mapPlanningSdk.saveStreet({ zone_id: 'rth', code: 'STR-1', name: null, kind: 'primary', path: [] })
    expect(h.state.insertCalled).toBe(1)
    expect(h.state.updateCalled).toBe(0)
  })

  it('بـ id ⇒ update لا insert', async () => {
    h.state.result = { data: { id: 'old' }, error: null }
    await mapPlanningSdk.saveStreet({ id: 'old', zone_id: 'rth', code: 'STR-1', name: 'x', kind: 'local', path: [] })
    expect(h.state.updateCalled).toBe(1)
    expect(h.state.insertCalled).toBe(0)
  })

  it('width_m و is_bridge الغائبان ⇒ null وfalse (لا undefined في الطلب)', async () => {
    h.state.result = { data: { id: 'n' }, error: null }
    const insert = vi.fn(() => ({ select: () => ({ single: () => ({ then: (r: (v: unknown) => void) => r(h.state.result) }) }) }))
    h.from.mockImplementationOnce(() => ({ insert }) as never)
    await mapPlanningSdk.saveStreet({ zone_id: 'rth', code: 'STR-1', name: null, kind: 'primary', path: [] })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ width_m: null, is_bridge: false }),
    )
  })

  it('القيم المعطاة تُمرَّر كما هي', async () => {
    h.state.result = { data: { id: 'n' }, error: null }
    const insert = vi.fn(() => ({ select: () => ({ single: () => ({ then: (r: (v: unknown) => void) => r(h.state.result) }) }) }))
    h.from.mockImplementationOnce(() => ({ insert }) as never)
    await mapPlanningSdk.saveStreet({
      zone_id: 'rth', code: 'STR-1', name: 'شارع', kind: 'local', path: [[1, 2]], width_m: 7, is_bridge: true,
    })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ width_m: 7, is_bridge: true }))
  })
})

describe('buildVisits — يوم بغداد مسجَّل (20261128000100)', () => {
  it('يستدعي map_visit_build_logged بتاريخ فقط لا بنافذة UTC', async () => {
    h.state.result = { data: { ok: true, day: '2026-11-19', visits_created: 5, visits_merged: 1, places_scanned: 9, skipped_visits: 2, points: 300 }, error: null }
    const r = await mapPlanningSdk.buildVisits({ zoneId: 'rth', day: '2026-11-19' })
    expect(h.state.calls.rpc[0]?.fn).toBe('map_visit_build_logged')
    expect(h.state.calls.rpc[0]?.args).toEqual({ p_zone: 'rth', p_day: '2026-11-19' })
    expect(r).toMatchObject({ visits_created: 5, visits_merged: 1, places_scanned: 9, skipped_visits: 2, points: 300, day: '2026-11-19' })
  })

  it('ردّ فارغ ⇒ أصفار صريحة لا undefined', async () => {
    h.state.result = { data: {}, error: null }
    await expect(mapPlanningSdk.buildVisits({ zoneId: 'rth', day: '2026-11-19' })).resolves.toEqual({
      visits_created: 0, visits_merged: 0, places_scanned: 0, skipped_visits: 0, day: '2026-11-19', points: 0,
    })
  })

  it('خطأ الخادم يصل كرسالة مفهومة (لا صمت)', async () => {
    h.state.result = { data: null, error: { message: 'MAP_VISIT_DAY_NOT_CLOSED: يوم اليوم لم ينتهِ بعد' } }
    await expect(mapPlanningSdk.buildVisits({ zoneId: 'rth', day: '2026-11-19' }))
      .rejects.toThrow(/MAP_VISIT_DAY_NOT_CLOSED/)
  })

  it('isDayCertified يعيد قيمة منطقية صريحة', async () => {
    h.state.result = { data: true, error: null }
    await expect(mapPlanningSdk.isDayCertified('2026-11-19')).resolves.toBe(true)
    expect(h.state.calls.rpc[0]?.fn).toBe('map_day_is_certified')
  })
})

describe('coverage — ردّ فارغ يُعطي مصفوفة لا undefined', () => {
  it('null ⇒ []', async () => {
    h.state.result = { data: null, error: null }
    // sdkGuard يرفع على null — لكن الدالة تُغلّفه بـ ?? [] بعد guard مباشر
    await expect(mapPlanningSdk.coverage('rth', '2026-11-19')).resolves.toEqual([])
  })

  it('صفوف تُعاد كما هي', async () => {
    h.state.result = { data: [{ street_code: 'STR-1' }], error: null }
    await expect(mapPlanningSdk.coverage('rth', '2026-11-19')).resolves.toHaveLength(1)
  })
})

describe('أخطاء القاعدة تصل للمستخدم', () => {
  it('zones يرفع SDKError', async () => {
    h.state.result = { data: null, error: { message: 'denied', code: '42501' } }
    await expect(mapPlanningSdk.zones()).rejects.toMatchObject({ code: '42501' })
  })

  it('streets يرفع', async () => {
    h.state.result = { data: null, error: { message: 'boom' } }
    await expect(mapPlanningSdk.streets('rth')).rejects.toThrow()
  })
})

/**
 * التقرير المُجمَّع (20261127000200 + 00400): الفلاتر تُترجم إلى وسائط RPC.
 *
 * كل فرع هنا مهم: وسيط يُنسى ⇒ صفوف خاطئة تُعرض بثقة. والوسائط الافتراضية
 * (`null`) ليست تفصيلاً: تمرير `false` خطأً حين يقصد «لا تصفية» يستبعد
 * نصف البيانات بصمت.
 */
describe('vehicleVisitsGrouped — ترجمة الفلاتر إلى RPC', () => {
  it('الحد الأدنى يمرّر الزون والمدى وتحيّد الباقي', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.vehicleVisitsGrouped({ zoneId: 'z1', from: '2026-11-22', to: '2026-11-24' })
    const call = h.state.calls.rpc.at(-1)!
    expect(call.fn).toBe('map_vehicle_visits_grouped')
    expect(call.args).toMatchObject({
      p_zone: 'z1', p_from: '2026-11-22', p_to: '2026-11-24',
      p_vehicle: null, p_shift: null, p_status: null, p_mahalla: null,
      p_respect_vehicle_zone: true,
      p_driver: null, p_kind: null, p_confirmed: null,
    })
  })

  it('كل الفلاتر تُمرَّر كما هي', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.vehicleVisitsGrouped({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24',
      vehicleId: 'v1', shift: 'morning', status: 'confirmed', mahalla: '929',
      driverId: 'd1', kind: 'alley', confirmedOnly: true,
    })
    expect(h.state.calls.rpc.at(-1)!.args).toMatchObject({
      p_vehicle: 'v1', p_shift: 'morning', p_status: 'confirmed', p_mahalla: '929',
      p_driver: 'd1', p_kind: 'alley', p_confirmed: true,
    })
  })

  it('confirmedOnly غير مفعّل ⇒ null لا false', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.vehicleVisitsGrouped({ zoneId: 'z1', from: '2026-11-22', to: '2026-11-24' })
    // `false` كان سيصبح «استبعاد المؤكد» لو تغيّر منطق الدالة — null آمن
    expect(h.state.calls.rpc.at(-1)!.args).toMatchObject({ p_confirmed: null })
  })

  it('respectVehicleZone=true لا يُرسل false', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.vehicleVisitsGrouped({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24', respectVehicleZone: true,
    })
    expect(h.state.calls.rpc.at(-1)!.args).toMatchObject({ p_respect_vehicle_zone: true })
  })

  it('تعطيل قيد الزون يصل صريحاً', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.vehicleVisitsGrouped({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24', respectVehicleZone: false,
    })
    expect(h.state.calls.rpc.at(-1)!.args).toMatchObject({ p_respect_vehicle_zone: false })
  })

  it('ردّ فارغ ⇒ مصفوفة لا undefined', async () => {
    h.state.result = { data: null, error: null }
    await expect(mapPlanningSdk.vehicleVisitsGrouped({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24',
    })).resolves.toEqual([])
  })

  it('خطأ القاعدة يُترجم رسالة لا صفوفاً فارغة', async () => {
    h.state.result = { data: null, error: { message: 'denied', code: '42501' } }
    await expect(mapPlanningSdk.vehicleVisitsGrouped({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24',
    })).rejects.toThrow()
  })
})

describe('groupedDrivers — قائمة فلتر السائق', () => {
  it('تمرّر الزون والمدى', async () => {
    h.state.result = { data: [], error: null }
    await mapPlanningSdk.groupedDrivers({ zoneId: 'z1', from: '2026-11-22', to: '2026-11-24' })
    const call = h.state.calls.rpc.at(-1)!
    expect(call.fn).toBe('map_grouped_drivers')
    expect(call.args).toMatchObject({ p_zone: 'z1', p_from: '2026-11-22', p_to: '2026-11-24' })
  })

  it('ردّ فارغ ⇒ مصفوفة', async () => {
    h.state.result = { data: null, error: null }
    await expect(mapPlanningSdk.groupedDrivers({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24',
    })).resolves.toEqual([])
  })

  it('خطأ يُرفع', async () => {
    h.state.result = { data: null, error: { message: 'boom' } }
    await expect(mapPlanningSdk.groupedDrivers({
      zoneId: 'z1', from: '2026-11-22', to: '2026-11-24',
    })).rejects.toThrow()
  })
})
