import type { ConflictStrategy, OfflineEntityPolicy } from './types'

/**
 * ━━━ مصفوفة سياسات التعارض (ADR 006) ━━━
 * القاعدة الذهبية: المال لا يُخمَّن — payroll/budget دائماً server-wins.
 */
export const OFFLINE_POLICIES: Readonly<Record<string, OfflineEntityPolicy>> = {
  requests:     { strategy: 'reject',      queueable: true },   // إنشاء جديد فقط يُصفّر؛ التعديلات تحتاج version
  notifications:{ strategy: 'client-wins', queueable: true },   // حالة "قرأته" غير حرجة
  tickets:      { strategy: 'reject',      queueable: true },
  attendance:   { strategy: 'client-wins', queueable: true },   // تسجيل الحضور الحالي مسموح
  payroll:      { strategy: 'server-wins', queueable: false },  // مالي — ممنوع الطفرة دون اتصال
  budget:       { strategy: 'server-wins', queueable: false },  // مالي
  documents:    { strategy: 'reject',      queueable: true },
  employees:    { strategy: 'server-wins', queueable: false },  // HR فقط، ودائماً متصل
}

export function getPolicy(entity: string): OfflineEntityPolicy {
  return OFFLINE_POLICIES[entity] ?? { strategy: 'reject', queueable: false }
}

export interface ConflictOutcome {
  resolved: boolean
  action: 'keep-server' | 'keep-client' | 'notify-user'
}

/** يحسم نزاع (baseVersion != serverVersion) وفق السياسة */
export function resolveConflict(
  strategy: ConflictStrategy,
  local: { version: number },
  server: { version: number },
): ConflictOutcome {
  if (local.version === server.version) return { resolved: true, action: 'keep-client' }

  switch (strategy) {
    case 'server-wins':
    case 'reject':
      return { resolved: true, action: 'keep-server' }
    case 'client-wins':
      return { resolved: true, action: 'keep-client' }
    default: {
      void local
      void server
      return { resolved: false, action: 'notify-user' }
    }
  }
}
