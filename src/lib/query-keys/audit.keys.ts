/**
 * Query Keys — التدقيق
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const auditKeys = {
  all: ['audit'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...auditKeys.lists(), filters] as const,
  details: () => [...auditKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditKeys.details(), id] as const,
}
