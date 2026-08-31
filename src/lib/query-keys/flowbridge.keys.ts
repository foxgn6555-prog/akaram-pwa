/** مفاتيح استعلامات FlowBridge (00037/00038) — حالة مصمم التدفقات + الأحداث الحية */
export const flowbridgeKeys = {
  all: ['flowbridge'] as const,
  state: (key: 'portals' | 'graph' | 'settings') => [...flowbridgeKeys.all, 'state', key] as const,
  portals: () => flowbridgeKeys.state('portals'),
  graph: () => flowbridgeKeys.state('graph'),
  settings: () => flowbridgeKeys.state('settings'),
  bindings: () => [...flowbridgeKeys.all, 'bindings'] as const,
  recentEvents: () => [...flowbridgeKeys.all, 'events'] as const,
}
