/**
 * وصف الجهاز من User-Agent — عرض فقط (لا قرار أمني، ولا ادّعاء دقة).
 * يُستخدم في شاشة «أجهزتي» وفي تحذير الجلسة النشطة.
 */
export interface DeviceLabel {
  device: string
  os: string
  browser: string
}

export function describeDevice(userAgent: string | null | undefined): DeviceLabel {
  const ua = userAgent ?? ''
  const has = (re: RegExp): boolean => re.test(ua)

  const device = has(/iPad|Tablet/i)
    ? 'تابلت'
    : has(/iPhone/i)
      ? 'آيفون'
      : has(/Android/i)
        ? has(/Mobile/i) ? 'هاتف أندرويد' : 'تابلت أندرويد'
        : has(/Mobile/i)
          ? 'هاتف'
          : ua
            ? 'حاسوب'
            : 'جهاز غير معروف'

  const os = has(/Windows NT/i)
    ? 'Windows'
    : has(/Android/i)
      ? 'Android'
      : has(/iPhone|iPad|iOS/i)
        ? 'iOS'
        : has(/Mac OS X|Macintosh/i)
          ? 'macOS'
          : has(/Linux/i)
            ? 'Linux'
            : 'نظام غير معروف'

  const browser = has(/Edg\//i)
    ? 'Edge'
    : has(/OPR\/|Opera/i)
      ? 'Opera'
      : has(/Chrome\/|CriOS/i)
        ? 'Chrome'
        : has(/Firefox\/|FxiOS/i)
          ? 'Firefox'
          : has(/Safari\//i)
            ? 'Safari'
            : 'متصفح غير معروف'

  return { device, os, browser }
}
