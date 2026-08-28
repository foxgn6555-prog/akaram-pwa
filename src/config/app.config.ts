export const appConfig = {
  name: 'جزيرة الأكرام — النظام الإلكتروني',
  shortName: 'الأكرام',
  version: '4.0.0',
  supportEmail: 'support@municipal.example.iq',
  /** مدة خمول الجلسة قبل قفل الشاشة (ms) — يراقبها SessionTimeout */
  sessionIdleTimeoutMs: 30 * 60_000,
} as const
