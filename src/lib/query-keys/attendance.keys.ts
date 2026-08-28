/**
 * Query Keys — الحضور
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const attendanceKeys = {
  all: ['attendance'] as const,
  lists: () => [...attendanceKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...attendanceKeys.lists(), filters] as const,
  details: () => [...attendanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...attendanceKeys.details(), id] as const,
}
