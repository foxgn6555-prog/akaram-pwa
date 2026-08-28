/**
 * Query Keys — الأصول
 * قانون: مفاتيح inline في hooks ممنوعة — كل المفاتيح من هنا فقط (قانون 2).
 * النمط: all → lists → list(filters) / details → detail(id)
 */

export const assetsKeys = {
  all: ['assets'] as const,
  lists: () => [...assetsKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown> = {}) => [...assetsKeys.lists(), filters] as const,
  details: () => [...assetsKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetsKeys.details(), id] as const,
}
