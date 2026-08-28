/**
 * Query Keys — الميزانية
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const budgetKeys = {
  all: ['budget'] as const,
  lists: () => [...budgetKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...budgetKeys.lists(), filters] as const,
  details: () => [...budgetKeys.all, 'detail'] as const,
  detail: (id: string) => [...budgetKeys.details(), id] as const,
}
