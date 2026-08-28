/**
 * Query Keys — الموظفين
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const employeesKeys = {
  all: ['employees'] as const,
  lists: () => [...employeesKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...employeesKeys.lists(), filters] as const,
  details: () => [...employeesKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeesKeys.details(), id] as const,
}
