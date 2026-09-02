/** مفاتيح استعلامات وحدة «مسؤول القسم» */
export const sectorKeys = {
  all: ['sector'] as const,
  sectors: () => [...sectorKeys.all, 'sectors'] as const,
  profile: () => [...sectorKeys.all, 'profile'] as const,
  workers: (scope: 'active' | 'archived' = 'active') =>
    [...sectorKeys.all, 'workers', scope] as const,
  vehicles: (scope: 'active' | 'archived' = 'active') =>
    [...sectorKeys.all, 'vehicles', scope] as const,
  supplies: (scope: 'active' | 'archived' = 'active') =>
    [...sectorKeys.all, 'supplies', scope] as const,
  breakdowns: (scope: 'active' | 'archived' = 'active') =>
    [...sectorKeys.all, 'breakdowns', scope] as const,
  photos: (scope: 'active' | 'archived' = 'active') =>
    [...sectorKeys.all, 'photos', scope] as const,
  attendance: (date: string) => [...sectorKeys.all, 'attendance', date] as const,
  summary: () => [...sectorKeys.all, 'summary'] as const,
}
