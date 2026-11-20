/** الجولة ٣ — وصف الجهاز من User-Agent (عرض فقط، لا قرار أمني) */
import { describe, expect, it } from 'vitest'
import { describeDevice } from '@lib/utils/device.utils'

const UA = {
  winChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Edg/131.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
}

describe('🖥️ describeDevice', () => {
  it('Windows + Chrome', () => {
    expect(describeDevice(UA.winChrome)).toEqual({ device: 'حاسوب', os: 'Windows', browser: 'Chrome' })
  })

  it('iPhone + Safari', () => {
    expect(describeDevice(UA.iphoneSafari)).toEqual({ device: 'آيفون', os: 'iOS', browser: 'Safari' })
  })

  it('أندرويد + Chrome', () => {
    const d = describeDevice(UA.androidChrome)
    expect(d.device).toBe('هاتف أندرويد')
    expect(d.os).toBe('Android')
    expect(d.browser).toBe('Chrome')
  })

  it('macOS + Edge (يُقدَّم على Chrome)', () => {
    expect(describeDevice(UA.macEdge)).toEqual({ device: 'حاسوب', os: 'macOS', browser: 'Edge' })
  })

  it('Linux + Firefox', () => {
    expect(describeDevice(UA.firefox)).toEqual({ device: 'حاسوب', os: 'Linux', browser: 'Firefox' })
  })

  it('بلا User-Agent: قيم غير مضلّلة', () => {
    expect(describeDevice(null)).toEqual({ device: 'جهاز غير معروف', os: 'نظام غير معروف', browser: 'متصفح غير معروف' })
    expect(describeDevice('')).toEqual({ device: 'جهاز غير معروف', os: 'نظام غير معروف', browser: 'متصفح غير معروف' })
  })
})
