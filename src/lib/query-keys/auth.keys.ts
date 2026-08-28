/**
 * Query Keys — المصادقة والجلسة
 */
export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
  myRoles: () => [...authKeys.all, 'roles'] as const,
  portalAccess: () => [...authKeys.all, 'portal-access'] as const,
}
