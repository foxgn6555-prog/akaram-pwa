/**
 * Query Keys — التقارير
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const reportsKeys = {
  all: ['reports'] as const,
  lists: () => [...reportsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...reportsKeys.lists(), filters] as const,
  details: () => [...reportsKeys.all, 'detail'] as const,
  detail: (id: string) => [...reportsKeys.details(), id] as const,
}
