/**
 * أنواع قاعدة البيانات — تُولَّد آلياً، ممنوع التعديل اليدوي:
 *   npm run db:types   →  supabase gen types typescript --local
 * هذا الملف placeholder يعمل قبل أول توليد — سيُستبدل كلياً.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      employees: { Row: { id: string; full_name: string; [key: string]: unknown } }
      departments: { Row: { id: string; name: string; code: string; [key: string]: unknown } }
      requests: { Row: { id: string; status: string; version: number; [key: string]: unknown } }
      [key: string]: unknown
    }
  }
}
