/** SDK البصمة (00139): RPCs + Edge Function + ترجمة رموز الخطأ */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn() }))

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { rpc: h.rpc, from: h.from, functions: { invoke: h.invoke } },
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
      const { data, error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
      if (data === null || data === undefined) throw new SDKError('لا بيانات', 'EMPTY')
      return data
    },
    async sdkVoid(op: PromiseLike<{ error?: { message: string } | null }>) {
      const { error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
    },
  }
})

import { biometric, biometricErrorMessage } from '@sdk/biometric.sdk'

describe('biometric.sdk', () => {
  beforeEach(() => { h.rpc.mockReset(); h.from.mockReset(); h.invoke.mockReset() })

  it('listPunches يمرر الفلاتر إلى RPC بالأسماء الصحيحة وبالقيم الافتراضية', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    await biometric.listPunches({ from: '2026-09-01', to: '2026-09-02', pin: ' 7001 ', unmatchedOnly: true })
    expect(h.rpc).toHaveBeenCalledWith('biometric_punches_list', {
      p_from: '2026-09-01', p_to: '2026-09-02', p_pin: '7001', p_device_id: null, p_unmatched_only: true, p_limit: 300,
    })
    await biometric.listPunches()
    expect(h.rpc).toHaveBeenLastCalledWith('biometric_punches_list', {
      p_from: null, p_to: null, p_pin: null, p_device_id: null, p_unmatched_only: false, p_limit: 300,
    })
  })

  it('linkPin / deriveAttendance / processPushes / listPulls تستدعي RPCs الصحيحة', async () => {
    h.rpc.mockResolvedValue({ data: 0, error: null })
    await biometric.linkPin(' 555 ', 'e1')
    expect(h.rpc).toHaveBeenCalledWith('biometric_link_pin', { p_pin: '555', p_employee_id: 'e1' })
    expect(await biometric.deriveAttendance('2026-09-20')).toBe(0) // الصفر نتيجة صالحة
    expect(h.rpc).toHaveBeenCalledWith('biometric_attendance_derive', { p_date: '2026-09-20' })
    h.rpc.mockResolvedValue({ data: 7, error: null })
    expect(await biometric.processPushes()).toBe(7)
    expect(h.rpc).toHaveBeenCalledWith('biometric_process_pushes', { p_limit: 500 })
    h.rpc.mockResolvedValue({ data: [{ id: 'p' }], error: null })
    expect(await biometric.listPulls('d1', 10)).toEqual([{ id: 'p' }])
    expect(h.rpc).toHaveBeenCalledWith('biometric_pulls_list', { p_device_id: 'd1', p_limit: 10 })
  })

  it('listDeviceUsers يستدعي RPC مستخدمي الأجهزة بالبحث المنظّف', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    await biometric.listDeviceUsers('  ليث ')
    expect(h.rpc).toHaveBeenCalledWith('biometric_device_users_list', { p_search: 'ليث', p_limit: 100 })
    await biometric.listDeviceUsers()
    expect(h.rpc).toHaveBeenLastCalledWith('biometric_device_users_list', { p_search: null, p_limit: 100 })
  })

  it('importPunches يعيد صف العدادات من RPC', async () => {
    h.rpc.mockResolvedValue({ data: [{ received: 3, inserted: 2, duplicates: 1, unmatched: 0 }], error: null })
    const r = await biometric.importPunches('d1', [{ pin: '1', at: '2026-01-01T00:00:00Z' }], 'manual')
    expect(r).toEqual({ ok: true, received: 3, inserted: 2, duplicates: 1, unmatched: 0 })
    expect(h.rpc).toHaveBeenCalledWith('biometric_import_punches', { p_device_id: 'd1', p_logs: [{ pin: '1', at: '2026-01-01T00:00:00Z' }], p_method: 'manual' })
  })

  it('pull/testSource يستدعيان Edge Function biometric-pull بالإجراء الصحيح', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, received: 5, inserted: 5, duplicates: 0, unmatched: 1 }, error: null })
    const r = await biometric.pull('d1', 'A', 'B')
    expect(h.invoke).toHaveBeenCalledWith('biometric-pull', { body: { action: 'pull', device_id: 'd1', from: 'A', to: 'B' } })
    expect(r.inserted).toBe(5)
    h.invoke.mockResolvedValue({ data: { ok: true, available: 2, sample: [] }, error: null })
    await biometric.testSource('d1')
    expect(h.invoke).toHaveBeenLastCalledWith('biometric-pull', { body: { action: 'test', device_id: 'd1', from: undefined, to: undefined } })
  })

  it('خطأ Edge Function بجسم JSON يُترجم إلى رسالة عربية مفهومة', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'BIO_SOURCE_UNAUTHORIZED', detail: 'HTTP 401' }), { status: 502 }),
      }),
    })
    await expect(biometric.pull('d1')).rejects.toThrow('المصدر رفض الاعتماد (مفتاح API/كلمة المرور) (HTTP 401)')
    h.invoke.mockResolvedValue({ data: { error: 'BIO_MODE_NOT_PULLABLE' }, error: null })
    await expect(biometric.pull('d1')).rejects.toThrow('نمط الدفع (ADMS)')
  })

  it('biometricErrorMessage يغطي رموز القاعدة والمزوّدين ويعيد النص الخام لغير المعروف', () => {
    expect(biometricErrorMessage(new Error('P0001: BIO_PIN_TAKEN'))).toBe('رقم البصمة مرتبط بموظف آخر')
    expect(biometricErrorMessage('BIO_FORBIDDEN')).toBe('ليست لديك صلاحية هذا الإجراء')
    expect(biometricErrorMessage('BIO_CONFIG_MAPPING')).toContain('خريطة الحقول')
    expect(biometricErrorMessage('BIO_SOURCE_UNREACHABLE: fetch failed')).toBe('تعذر الوصول إلى المصدر (الشبكة/الرابط/المهلة) (fetch failed)')
    expect(biometricErrorMessage('new row violates check constraint "biometric_devices_tz_check"')).toContain('±HH:MM')
    expect(biometricErrorMessage('something else')).toBe('something else')
  })
})
