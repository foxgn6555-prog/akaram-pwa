/** اختبارات SDK وحدة GBS الحاويات — كل العمليات عبر RPC/Storage حصراً (00136). */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: { message: string; code?: string } | null }
type MockFn = ReturnType<typeof vi.fn>
interface Bucket {
  upload: MockFn
  createSignedUrl: MockFn
}

const h = vi.hoisted(() => {
  const state = { result: { data: [], error: null } as Result }
  const buckets: Bucket[] = []
  return {
    state,
    buckets,
    rpc: vi.fn(async () => state.result),
    getUser: vi.fn(async () => ({ data: { user: { id: 'gbs-user' } }, error: null })),
    storageFrom: vi.fn(() => {
      const bucket: Bucket = {
        upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://signed/${path}` },
          error: null,
        })),
      }
      h.buckets.push(bucket)
      return bucket
    }),
    profileResult: { data: { sectors: [4, 6] }, error: null } as {
      data: { sectors: number[] } | null
      error: { message: string } | null
    },
    fromCalls: [] as string[],
    eqCalls: [] as [string, unknown][],
    from: vi.fn((table: string) => {
      h.fromCalls.push(table)
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string, val: unknown) => {
            h.eqCalls.push([col, val])
            return { maybeSingle: vi.fn(async () => h.profileResult) }
          }),
        })),
      }
    }),
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    supabase: {
      auth: { getUser: h.getUser },
      rpc: h.rpc,
      from: h.from,
      storage: { from: h.storageFrom },
    },
  }
})

import { gbs } from '@sdk/gbs.sdk'
import { SDKError } from '@lib/errors/SDKError'

const containerRow = {
  id: 'c1',
  code: 'GBS-0001',
  label: 'حاوية الكرادة',
  latitude: 33.3,
  longitude: 44.4,
  status: 'damaged',
  image_path: 'u/gbs-1.jpg',
  notes: 'ملاحظة',
  updated_at: '2026-09-21T08:00:00Z',
  pending_count: 2,
  sector_id: 4,
  area_name: 'الجادرية',
  parent_sector: 'karrada',
}

beforeEach(() => {
  h.state.result = { data: [], error: null }
  h.buckets.length = 0
  h.rpc.mockClear()
  h.storageFrom.mockClear()
  h.profileResult = { data: { sectors: [4, 6] }, error: null }
  h.fromCalls.length = 0
  h.eqCalls.length = 0
})

describe('gbs.sdk — الحاويات', () => {
  it('يجلب القائمة مع البحث والفلتر ويوحد الشكل', async () => {
    h.state.result = { data: [containerRow], error: null }
    const rows = await gbs.containers('كرادة', 'damaged', 'karrada', 4)
    expect(h.rpc).toHaveBeenCalledWith('gbs_containers_list', {
      p_search: 'كرادة',
      p_status: 'damaged',
      p_parent: 'karrada',
      p_sector_id: 4,
    })
    expect(rows[0]).toEqual({
      id: 'c1',
      code: 'GBS-0001',
      label: 'حاوية الكرادة',
      latitude: 33.3,
      longitude: 44.4,
      status: 'damaged',
      imagePath: 'u/gbs-1.jpg',
      notes: 'ملاحظة',
      updatedAt: '2026-09-21T08:00:00Z',
      pendingCount: 2,
      sectorId: 4,
      areaName: 'الجادرية',
      parentSector: 'karrada',
    })
  })

  it('يمرر البحث الفارغ null', async () => {
    await gbs.containers('   ', null)
    expect(h.rpc).toHaveBeenCalledWith('gbs_containers_list', {
      p_search: null,
      p_status: null,
      p_parent: null,
      p_sector_id: null,
    })
  })

  it('يضيف حاوية جديدة بمسافات مهذبة', async () => {
    h.state.result = { data: [{ id: 'c9', code: 'GBS-0009' }], error: null }
    const out = await gbs.save({
      label: '  حاوية جديدة  ',
      latitude: 33.1,
      longitude: 44.2,
      status: 'ok',
      sectorId: 2,
      notes: '  ',
    })
    expect(h.rpc).toHaveBeenCalledWith('gbs_container_save', {
      p_id: null,
      p_label: 'حاوية جديدة',
      p_latitude: 33.1,
      p_longitude: 44.2,
      p_status: 'ok',
      p_sector_id: 2,
      p_image_path: null,
      p_notes: null,
    })
    expect(out).toEqual({ id: 'c9', code: 'GBS-0009' })
  })

  it('يعدل حاوية قائمة بتمرير p_id', async () => {
    h.state.result = { data: [{ id: 'c1', code: 'GBS-0001' }], error: null }
    await gbs.save({
      id: 'c1',
      label: 'تعديل',
      latitude: 33.3,
      longitude: 44.4,
      status: 'replace',
      sectorId: 4,
      imagePath: 'u/x.jpg',
    })
    expect(h.rpc).toHaveBeenCalledWith('gbs_container_save', {
      p_id: 'c1',
      p_label: 'تعديل',
      p_latitude: 33.3,
      p_longitude: 44.4,
      p_status: 'replace',
      p_sector_id: 4,
      p_image_path: 'u/x.jpg',
      p_notes: null,
    })
  })

  it('يحذف عبر RPC مخصص', async () => {
    h.state.result = { data: null, error: null }
    await gbs.remove('c2')
    expect(h.rpc).toHaveBeenCalledWith('gbs_container_delete', { p_id: 'c2' })
  })
})

describe('gbs.sdk — دورة طلبات التحديث', () => {
  it('يرسل طلب تحديث من مسؤول القسم', async () => {
    h.state.result = { data: 'u1', error: null }
    const id = await gbs.requestUpdate({
      containerId: 'c1',
      proposedStatus: 'missing',
      note: '  فقدت الحاوية  ',
      photoPath: 'u/p.jpg',
    })
    expect(id).toBe('u1')
    expect(h.rpc).toHaveBeenCalledWith('gbs_container_request_update', {
      p_container_id: 'c1',
      p_proposed_status: 'missing',
      p_photo_path: 'u/p.jpg',
      p_note: 'فقدت الحاوية',
    })
  })

  it('يجلب طلبات غرفة العمليات ويسجل مسؤول القسم', async () => {
    h.state.result = {
      data: [
        {
          id: 'u1',
          container_id: 'c1',
          code: 'GBS-0001',
          label: 'حاوية',
          proposed_status: 'damaged',
          photo_path: null,
          note: null,
          state: 'pending',
          requested_by: 'm1',
          requester_name: 'مسؤول القسم',
          created_at: '2026-09-21T08:00:00Z',
          reviewed_at: null,
          review_note: null,
        },
      ],
      error: null,
    }
    const rows = await gbs.updates('pending')
    expect(h.rpc).toHaveBeenCalledWith('gbs_updates_list', { p_state: 'pending' })
    expect(rows[0]).toMatchObject({
      id: 'u1',
      containerId: 'c1',
      proposedStatus: 'damaged',
      state: 'pending',
      requesterName: 'مسؤول القسم',
    })
    await gbs.myUpdates()
    expect(h.rpc).toHaveBeenLastCalledWith('gbs_my_update_requests')
  })

  it('يعتمد/يرفض الطلب ويعيد الحالة المطبقة', async () => {
    h.state.result = { data: [{ container_id: 'c1', code: 'GBS-0001', new_status: 'missing' }], error: null }
    const out = await gbs.review('u1', true, '  تم الكشف  ')
    expect(h.rpc).toHaveBeenCalledWith('gbs_update_review', {
      p_update_id: 'u1',
      p_approve: true,
      p_review_note: 'تم الكشف',
    })
    expect(out).toEqual({ containerId: 'c1', code: 'GBS-0001', newStatus: 'missing' })
  })

  it('يترجم خطأ الخادم إلى SDKError', async () => {
    h.state.result = { data: null, error: { message: 'GBS_UPDATE_ALREADY_PENDING', code: 'P0001' } }
    await expect(gbs.requestUpdate({ containerId: 'c1', proposedStatus: 'ok' })).rejects.toBeInstanceOf(
      SDKError,
    )
  })
})

describe('gbs.sdk — الصور', () => {
  it('يرفض ملفاً غير صورة', async () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    const error = await gbs.uploadImage(file).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SDKError)
    expect((error as SDKError).code).toBe('GBS_IMAGE_INVALID')
  })

  it('يرفع الصورة إلى مخزن gbs-containers بمجلد المستخدم', async () => {
    const file = new File(['x'], 'container photo.jpeg', { type: 'image/jpeg' })
    const path = await gbs.uploadImage(file)
    expect(h.storageFrom).toHaveBeenCalledWith('gbs-containers')
    expect(path).toMatch(/^gbs-user\/gbs-\d+-container_photo\.jpeg$/)
    const bucket = h.buckets[0] as Bucket
    expect(bucket.upload).toHaveBeenCalledWith(
      path,
      file,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    )
  })

  it('يجلب زونات GPS للخريطة', async () => {
    h.state.result = {
      data: [{ id: 'z1', name: 'زون الكرادة', source: 'platform', color: '#7c3aed', polygon: [[33.3, 44.4]] }],
      error: null,
    }
    const zones = await gbs.zones()
    expect(h.rpc).toHaveBeenCalledWith('gbs_zones_list')
    expect(zones[0]).toEqual({
      id: 'z1',
      name: 'زون الكرادة',
      source: 'platform',
      color: '#7c3aed',
      polygon: [[33.3, 44.4]],
    })
  })

  it('ينشئ رابط عرض مؤقت', async () => {
    const url = await gbs.imageUrl('u/p.jpg')
    expect(url).toBe('https://signed/u/p.jpg')
    expect((h.buckets[0] as Bucket).createSignedUrl).toHaveBeenCalledWith('u/p.jpg', 1800)
  })
})

describe('gbs.sdk — اختصاص مسؤول القسم (00138)', () => {
  it('يقرأ مناطق المسؤول من manager_profiles بمعرّفه', async () => {
    const jur = await gbs.jurisdiction()
    expect(jur).toEqual([4, 6])
    expect(h.fromCalls[h.fromCalls.length - 1]).toBe('manager_profiles')
    expect(h.eqCalls[h.eqCalls.length - 1]).toEqual(['user_id', 'gbs-user'])
  })

  it('يعيد مصفوفة فارغة بلا مستخدم مصادَق', async () => {
    h.getUser.mockResolvedValueOnce({ data: { user: null as unknown as { id: string } }, error: null })
    expect(await gbs.jurisdiction()).toEqual([])
  })

  it('يعيد مصفوفة فارغة عندما لا يوجد ملف مسؤول (بلا إسناد)', async () => {
    h.profileResult = { data: null, error: null }
    expect(await gbs.jurisdiction()).toEqual([])
  })

  it('يترجم خطأ قراءة الاختصاص إلى SDKError', async () => {
    h.profileResult = { data: null, error: { message: 'db down' } }
    const err = await gbs.jurisdiction().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SDKError)
    expect((err as SDKError).code).toBe('GBS_JURISDICTION_FAILED')
  })
})
