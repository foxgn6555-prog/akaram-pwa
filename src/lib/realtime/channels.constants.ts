/** مصنع أسماء القنوات — أسماء inline في الكود ممنوعة */
export const CHANNELS = {
  notifications: (userId: string) => `notifications:${userId}`,
  requestsTeam: (departmentId: string) => `requests:department:${departmentId}`,
  /** بث حي لمصمم التدفقات: عمليات حقيقية (audit_logs) + سجل تكاملات (integration_logs) */
  flowbridgeLive: () => 'flowbridge:live',
} as const
