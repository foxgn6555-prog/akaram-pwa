/**
 * Query Keys — الوثائق
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const documentsKeys = {
  all: ['documents'] as const,
  lists: () => [...documentsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...documentsKeys.lists(), filters] as const,
  details: () => [...documentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...documentsKeys.details(), id] as const,
}
