/**
 * Query Keys — الإشعارات
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const notificationsKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...notificationsKeys.lists(), filters] as const,
  details: () => [...notificationsKeys.all, 'detail'] as const,
  detail: (id: string) => [...notificationsKeys.details(), id] as const,
}
