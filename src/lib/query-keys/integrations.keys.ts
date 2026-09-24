export const integrationsKeys = {
  all: ['integrations'] as const,
  devices: () => [...integrationsKeys.all, 'devices'] as const,
  providers: () => [...integrationsKeys.all, 'providers'] as const,
  vehicles: () => [...integrationsKeys.all, 'vehicles'] as const,
  positions: () => [...integrationsKeys.all, 'positions'] as const,
  logs: (provider?: string) => [...integrationsKeys.all, 'logs', provider ?? 'all'] as const,
  // 00139 البصمة
  punches: (filters?: unknown) => [...integrationsKeys.all, 'bio-punches', filters ?? {}] as const,
  pulls: (deviceId?: string | null) => [...integrationsKeys.all, 'bio-pulls', deviceId ?? 'all'] as const,
}
