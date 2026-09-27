export const executiveKeys = {
  all: ['executive'] as const,
  overview: (f: unknown) => [...executiveKeys.all, 'overview', f] as const,
  filterOptions: () => [...executiveKeys.all, 'filter-options'] as const,
  feed: (scope: string, archived: boolean) => [...executiveKeys.all, 'announcements', scope, archived] as const,
  announcement: (id: string) => [...executiveKeys.all, 'announcement', id] as const,
  recipients: (id: string) => [...executiveKeys.all, 'recipients', id] as const,
  unread: () => [...executiveKeys.all, 'unread'] as const,
  targets: () => [...executiveKeys.all, 'targets'] as const,
}
