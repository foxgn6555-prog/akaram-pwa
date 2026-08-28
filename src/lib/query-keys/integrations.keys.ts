export const integrationsKeys = {
  all: ['integrations'] as const,
  devices: () => [...integrationsKeys.all, 'devices'] as const,
  providers: () => [...integrationsKeys.all, 'providers'] as const,
  vehicles: () => [...integrationsKeys.all, 'vehicles'] as const,
  positions: () => [...integrationsKeys.all, 'positions'] as const,
  logs: (provider?: string) => [...integrationsKeys.all, 'logs', provider ?? 'all'] as const,
}
