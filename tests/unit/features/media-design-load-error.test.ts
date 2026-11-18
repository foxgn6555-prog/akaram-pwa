/** تصنيف فشل تحميل التصميم: التحذير الأصفر «غير موجود» لخطأ الخادم الحقيقي فقط */
import { describe, expect, it, vi } from 'vitest'
import {
  DESIGN_GONE_MESSAGE,
  DESIGN_LOAD_MESSAGE,
  classifyDesignLoadError,
  isDesignLoadPermanent,
} from '@features/media/lib/design-load-error'
import { SDKError } from '@lib/errors/SDKError'

describe('classifyDesignLoadError', () => {
  it('MEDIA_DESIGN_NOT_FOUND بأي صيغة وصل بها (نص خام / مسبوق بكود P0001 / SDKError بكود NOT_FOUND) = غير موجود', () => {
    expect(classifyDesignLoadError(new Error('MEDIA_DESIGN_NOT_FOUND'))).toBe('not-found')
    expect(classifyDesignLoadError(new Error('P0001: MEDIA_DESIGN_NOT_FOUND'))).toBe('not-found')
    expect(classifyDesignLoadError(new SDKError('MEDIA_DESIGN_NOT_FOUND', 'P0001'))).toBe('not-found')
    expect(classifyDesignLoadError(new SDKError('أي نص', 'NOT_FOUND'))).toBe('not-found')
    expect(classifyDesignLoadError({ message: 'MEDIA_DESIGN_NOT_FOUND' })).toBe('not-found')
  })
  it('انقطاع الشبكة/503/أي خطأ آخر ليس «غير موجود» (كان يُعامَل كذلك فيُغلق الرابط بتحذير كاذب)', () => {
    expect(classifyDesignLoadError(new SDKError('تعذر الاتصال بالخادم — تحقق من الشبكة', 'NETWORK'))).toBe('network')
    expect(classifyDesignLoadError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyDesignLoadError(new SDKError('upstream request timeout (503)', 'UNKNOWN'))).toBe('other')
    expect(classifyDesignLoadError(new Error('MEDIA_DESIGN_EMPTY'))).toBe('other')
    expect(classifyDesignLoadError(undefined)).toBe('other')
    expect(classifyDesignLoadError(null)).toBe('other')
    expect(classifyDesignLoadError('نص')).toBe('other')
  })
  it('انقطاع الشبكة كما يصل فعلاً من supabase-js: كائن خطأ برسالة الجلب وكود فارغ (لا TypeError ولا NETWORK) — Chrome/Firefox/Safari', () => {
    expect(classifyDesignLoadError(new SDKError('TypeError: Failed to fetch', ''))).toBe('network')
    expect(classifyDesignLoadError(new SDKError('TypeError: NetworkError when attempting to fetch resource.', ''))).toBe('network')
    expect(classifyDesignLoadError(new SDKError('TypeError: Load failed', ''))).toBe('network')
    expect(classifyDesignLoadError({ message: 'TypeError: fetch failed', code: '' })).toBe('network')
  })
  it('المتصفح غير متصل (navigator.onLine=false) فأي فشل تحميل = شبكة، لكن «غير موجود» يبقى غير موجود', () => {
    const spy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      expect(classifyDesignLoadError(new Error('boom'))).toBe('network')
      expect(classifyDesignLoadError(new Error('MEDIA_DESIGN_NOT_FOUND'))).toBe('not-found')
      expect(classifyDesignLoadError(new Error('MEDIA_FORBIDDEN'))).toBe('forbidden')
    } finally { spy.mockRestore() }
    expect(classifyDesignLoadError(new Error('boom'))).toBe('other')
  })
  it('عدم الصلاحية: MEDIA_FORBIDDEN أو 42501 أو PGRST301', () => {
    expect(classifyDesignLoadError(new Error('MEDIA_FORBIDDEN'))).toBe('forbidden')
    expect(classifyDesignLoadError(new SDKError('x', '42501'))).toBe('forbidden')
    expect(classifyDesignLoadError(new SDKError('x', 'PGRST301'))).toBe('forbidden')
  })
  it('لا إعادة محاولة آلية إلا للعابر؛ ولكل سبب غير «غير موجود» رسالة عربية مختلفة', () => {
    expect(isDesignLoadPermanent(new Error('MEDIA_DESIGN_NOT_FOUND'))).toBe(true)
    expect(isDesignLoadPermanent(new Error('MEDIA_FORBIDDEN'))).toBe(true)
    expect(isDesignLoadPermanent(new SDKError('x', 'NETWORK'))).toBe(false)
    expect(isDesignLoadPermanent(new Error('boom'))).toBe(false)
    expect(new Set(Object.values(DESIGN_LOAD_MESSAGE)).size).toBe(3)
    for (const m of Object.values(DESIGN_LOAD_MESSAGE)) expect(m).not.toMatch(/غير موجود|حُذف/)
    expect(DESIGN_GONE_MESSAGE).toMatch(/غير موجود/)
  })
})
