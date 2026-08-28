/** Query Keys — النظام وقاعدة البيانات (البوابة التقنية) */
export const systemKeys = {
  all: ['system'] as const,
  dbStats: () => [...systemKeys.all, 'db-stats'] as const,
  dbOverview: () => [...systemKeys.all, 'db-overview'] as const,
  errors: (filters: Record<string, unknown> = {}) => [...systemKeys.all, 'errors', filters] as const,
  error: (id: number) => [...systemKeys.all, 'errors', 'detail', id] as const,
  tableDetail: (name: string) => [...systemKeys.all, 'table', name] as const,
}
