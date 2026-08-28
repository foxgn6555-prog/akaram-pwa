/** تعريفات عامة للمشروع */

/** نتيجة عملية ترقيم صفحات موحّدة */
export interface Paginated<T> {
  rows: T[]
  total: number
}

/** أي جدول يحمل version (Optimistic Concurrency — ADR 006) */
export interface Versioned {
  version: number
}
