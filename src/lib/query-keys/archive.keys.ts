export const archiveKeys = {
  all: ['archive'] as const,
  counts: () => [...archiveKeys.all, 'counts'] as const,
  table: (table: string) => [...archiveKeys.all, 'table', table] as const,
}
