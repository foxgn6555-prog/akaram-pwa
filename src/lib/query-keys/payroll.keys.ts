/**
 * Query Keys — الرواتب
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const payrollKeys = {
  all: ['payroll'] as const,
  lists: () => [...payrollKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...payrollKeys.lists(), filters] as const,
  details: () => [...payrollKeys.all, 'detail'] as const,
  detail: (id: string) => [...payrollKeys.details(), id] as const,
}
