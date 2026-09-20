import { describe, expect, it, vi } from 'vitest'

vi.mock('@lib/monitoring/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { handleAppError } from '@lib/errors/error.handler'
import { SDKError } from '@lib/errors/SDKError'

describe('ترجمة أكواد أخطاء الخادم إلى رسائل عربية (00135)', () => {
  it('يترجم GARAGE_SITE_DEPARTURE_NOT_ALLOWED لرسالة مفهومة', () => {
    const e = new SDKError('GARAGE_SITE_DEPARTURE_NOT_ALLOWED', 'P0001')
    expect(handleAppError(e).message).toContain('لا يمكن إنهاء الوردية للكراج')
  })

  it('يترجم أكواد حالة الرحلة الأخرى', () => {
    expect(handleAppError(new SDKError('TRIP_LEG_ALREADY_OPEN', 'P0001')).message).toContain(
      'توجد حركة مفتوحة',
    )
    expect(handleAppError(new SDKError('TRIP_NOT_AT_MANAGER_SITE', 'P0001')).message).toContain(
      'ليست في موقع العمل',
    )
    expect(handleAppError(new SDKError('SITE_RETURN_NOT_ALLOWED', 'P0001')).message).toContain(
      'لا يمكن تأكيد عودة الآلية',
    )
    expect(handleAppError(new SDKError('GARAGE_ARRIVAL_NOT_CONFIRMED', 'P0001')).message).toContain(
      'أكّد وصول الآلية',
    )
  })

  it('يترجم الكود المضمّن داخل رسالة PostgREST الأطول', () => {
    const e = new SDKError(
      '{"code":"P0001","message":"sector_send_vehicle_to_garage: TRIP_LEG_ALREADY_OPEN"}',
      'P0001',
    )
    expect(handleAppError(e).message).toContain('توجد حركة مفتوحة')
  })

  it('يمرر الأكواد غير المدرجة كما هي (لا كسر للسلوك السابق)', () => {
    const e = new SDKError('SOME_FUTURE_CODE', 'P0001')
    expect(handleAppError(e).message).toBe('SOME_FUTURE_CODE')
  })

  it('يترجم أكواد الكراج المركزي المتبقية', () => {
    expect(
      handleAppError(new SDKError('GARAGE_VEHICLE_IN_MAINTENANCE', 'P0001')).message,
    ).toContain('في الصيانة')
    expect(
      handleAppError(new SDKError('GARAGE_DEPARTURE_ALREADY_OPEN', 'P0001')).message,
    ).toContain('انطلاقية مفتوحة')
  })
})
