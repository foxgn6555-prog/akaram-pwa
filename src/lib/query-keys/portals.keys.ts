export const portalsKeys = {
  all: ['portals'] as const,
  lists: () => [...portalsKeys.all, 'list'] as const,
  units: (portalId?: string) => [...portalsKeys.all, 'units', portalId ?? 'all'] as const,
}
