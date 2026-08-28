export const metricsKeys = {
  all: ['metrics'] as const,
  connectionHistory: () => [...metricsKeys.all, 'connection'] as const,
}
