/**
 * معلومات البناء — تُحقن عبر define في vite.config.ts.
 * الغرض: (1) ربط أخطاء Sentry ببناء محدّد، (2) إجابة «أي نسخة عندك؟» في الدعم،
 * (3) تمييز إصدار المستخدم داخل شريط التحديث.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
