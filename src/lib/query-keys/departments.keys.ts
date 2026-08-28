/**
 * Query Keys — الأقسام
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const departmentsKeys = {
  all: ['departments'] as const,
  lists: () => [...departmentsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...departmentsKeys.lists(), filters] as const,
  details: () => [...departmentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...departmentsKeys.details(), id] as const,
}
