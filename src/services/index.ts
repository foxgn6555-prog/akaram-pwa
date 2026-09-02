/**
 * Barrel طبقة SDK — نقطة الاستيراد الوحيدة للواجهات العليا.
 * قانون: features و portals يستوردون من '@sdk' أو '@sdk/x.sdk' فقط.
 */
export { supabase, sdkGuard, sdkVoid, isNetworkError } from './client'
export { auth } from './auth.sdk'
export { employees } from './employees.sdk'
export { departments } from './departments.sdk'
export { users, type PlatformUser, type CreateUserInput } from './users.sdk'
export { system, type DbStat, type DbOverview, type AppErrorRow } from './system.sdk'
export { branches, type Branch } from './branches.sdk'
export { permissions } from './permissions.sdk'
export { portals } from './portals.sdk'
export { integrations } from './integrations.sdk'
export { archive } from './archive.sdk'
export { metrics } from './metrics.sdk'
export {
  sector,
  sectorTeam,
  sectorSupplies,
  sectorBreakdowns,
  sectorPhotos,
  sectorAttendance,
  sectorSummary,
} from './sector.sdk'
