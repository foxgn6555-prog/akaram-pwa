/**
 * Query Keys — الطلبات
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const requestsKeys = {
  all: ['requests'] as const,
  lists: () => [...requestsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...requestsKeys.lists(), filters] as const,
  details: () => [...requestsKeys.all, 'detail'] as const,
  detail: (id: string) => [...requestsKeys.details(), id] as const,
}
