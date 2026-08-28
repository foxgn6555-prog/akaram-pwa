/** Public API لوحدة قاعدة البيانات — الحدود (قانون 3) */
export { useDbStats, useDbOverview, useTableDetails } from './hooks/useDatabase'
export { useErrorLogs, useResolveError } from './hooks/useErrorLogs'
export type { DbStat, DbOverview, DbTableDetails, AppErrorRow, ErrorLogFilters } from './types'
