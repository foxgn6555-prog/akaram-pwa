/**
 * خدمة عداد بناء الزيارات — تقرأ من عروض قاعدة البيانات التي أُنشئت في المرحلة الثانية
 * تستخدم في بوابة تقنية المعلومات لعرض حالة بناء الزيارات (العداد)
 */
import { supabase, sdkGuard } from './client'

export interface VisitBuildSummary {
  status: string
  count: number
  status_arabic: string
}

export interface VisitBuildDashboardRow {
  zone_code: string
  zone_name: string
  target_date: string
  shift_type: string
  status: string
  visits_created: number
  points_processed: number
  started_at: string | null
  finished_at: string | null
  error_message: string | null
  attempts: number
  status_arabic: string
}

/**
 * جلب ملخص العداد: عدد الوظائف حسب الحالة
 */
export async function getVisitBuildSummary(): Promise<VisitBuildSummary[]> {
  const data = await sdkGuard(
    supabase.from('visit_build_summary').select('*')
  )
  return data
}

/**
 * جلب التفاصيل لكل منطقة وشفت
 */
export async function getVisitBuildDashboard(): Promise<VisitBuildDashboardRow[]> {
  const data = await sdkGuard(
    supabase.from('visit_build_dashboard').select('*').order('target_date', { ascending: false })
  )
  return data
}

/**
 * جلب عدد الوظائف المعلقة (pending) — للعداد السريع
 */
export async function getPendingVisitBuildCount(): Promise<number> {
  const { count, error } = await supabase
    .from('visit_build_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) return 0
  return count ?? 0
}

/**
 * جلب عدد الوظائف الجارية (processing)
 */
export async function getProcessingVisitBuildCount(): Promise<number> {
  const { count, error } = await supabase
    .from('visit_build_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  if (error) return 0
  return count ?? 0
}

/**
 * جلب عدد الوظائف المكتملة اليوم (done)
 */
export async function getTodayDoneVisitBuildCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  const { count, error } = await supabase
    .from('visit_build_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'done')
    .eq('target_date', today)

  if (error) return 0
  return count ?? 0
}
