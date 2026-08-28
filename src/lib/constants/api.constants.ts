/** إعدادات الشبكة/الكاش المركزية — يستهلكها query-client.config و hooks */
export const API = {
  /** مدة "طزاجة" البيانات قبل إعادة الجلب (ms) */
  STALE_TIME: {
    DEFAULT: 30_000,
    /** بيانات مرجعية قليلة التغير (أقسام، أدوار) */
    REFERENCE: 5 * 60_000,
    /** إشعارات — تُحدَّث عبر realtime أصلاً */
    NOTIFICATIONS: 10_000,
  },
  GC_TIME: 5 * 60_000,
  RETRY: {
    /** لا إعادة محاولة لأخطاء العميل (4xx) */
    isRetryable: (status: number | undefined): boolean =>
      status === undefined || status >= 500,
    MAX_RETRIES: 2,
    BASE_DELAY_MS: 1_000,
  },
  /** مهلة Realtime */
  REALTIME_RECONNECT_MS: 5_000,
} as const
