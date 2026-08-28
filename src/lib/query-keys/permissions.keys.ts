export const permissionsKeys = {
  all: ['permissions'] as const,
  roleMatrix: () => [...permissionsKeys.all, 'role-matrix'] as const,
  userOverrides: () => [...permissionsKeys.all, 'user-overrides'] as const,
  canSee: (pageKey: string) => [...permissionsKeys.all, 'can-see', pageKey] as const,
}
