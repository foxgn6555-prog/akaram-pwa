 
import SystemDashboard from '@components/dashboard/SystemDashboard'

/**
 * لوحة الإدارة العليا — تعرض لوحة النظام الحية مباشرة (رسوم Recharts حقيقية).
 * المسار /admin محمي بـ super_admin حصرياً في loader — أي واصل هنا مخوّل.
 */
export default function AdminDashboard() {
  return <SystemDashboard />
}
