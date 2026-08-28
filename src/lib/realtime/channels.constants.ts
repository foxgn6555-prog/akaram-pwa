/** مصنع أسماء القنوات — أسماء inline في الكود ممنوعة */
export const CHANNELS = {
  notifications: (userId: string) => `notifications:${userId}`,
  requestsTeam: (departmentId: string) => `requests:department:${departmentId}`,
} as const
