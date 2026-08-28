/**
 * Query Keys — التذاكر
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const ticketsKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...ticketsKeys.lists(), filters] as const,
  details: () => [...ticketsKeys.all, 'detail'] as const,
  detail: (id: string) => [...ticketsKeys.details(), id] as const,
}
