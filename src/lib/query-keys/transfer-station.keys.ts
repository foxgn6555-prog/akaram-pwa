/** مفاتيح استعلامات المحطة التحويلية */
export const transferStationKeys = {
  all: ['transfer-station'] as const,
  weights: () => [...transferStationKeys.all, 'weights'] as const,
  weightList: (filter?: { date?: string; shift?: string }) =>
    [...transferStationKeys.weights(), 'list', filter?.date ?? 'all', filter?.shift ?? 'all'] as const,
  archived: () => [...transferStationKeys.all, 'weights', 'archived'] as const,
  summary: () => [...transferStationKeys.all, 'summary'] as const,
  saksatList: (month?: string) =>
    [...transferStationKeys.all, 'saksat', 'list', month ?? 'all'] as const,
  saksatSubmitted: () => [...transferStationKeys.all, 'saksat', 'submitted'] as const,
  tripsList: (month?: string) =>
    [...transferStationKeys.all, 'trips', 'list', month ?? 'all'] as const,
  tripsSubmitted: () => [...transferStationKeys.all, 'trips', 'submitted'] as const,
}
