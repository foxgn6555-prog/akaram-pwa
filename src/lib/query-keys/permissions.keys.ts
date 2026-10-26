export const permissionsKeys = {
  all: ['permissions'] as const,
  templates: () => [...permissionsKeys.all, 'templates'] as const,
  templateRules: (id: string) => [...permissionsKeys.all, 'template-rules', id] as const,
  userTemplate: (userId: string) => [...permissionsKeys.all, 'user-template', userId] as const,
  userOverrides: (userId: string) => [...permissionsKeys.all, 'user-overrides', userId] as const,
  userEffective: (userId: string) => [...permissionsKeys.all, 'user-effective', userId] as const,
  audit: (userId: string | null, templateId: string | null) => [...permissionsKeys.all, 'audit', userId ?? '', templateId ?? ''] as const,
}
