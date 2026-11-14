import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLoginSourceId } from '@features/auth/security/login-source'

const STORAGE_KEY = 'akram:login-source:v1'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('معرّف مصدر جهاز الدخول', () => {
  it('يحفظ UUID واحداً ثابتاً للمتصفح', () => {
    const first = getLoginSourceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/i)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(first)
    expect(getLoginSourceId()).toBe(first)
  })

  it('يعيد استخدام معرّف مؤقت إذا كان التخزين محظوراً', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
    const first = getLoginSourceId()
    expect(getLoginSourceId()).toBe(first)
    expect(first).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
