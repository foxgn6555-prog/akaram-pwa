import { ExecHome } from '@components/executive/ExecHome'
import { useAuth } from '@features/auth/hooks/useAuth'
/** بوابة المدير التنفيذي — الرئيسية: نفس صورة الشركة الكاملة التي يراها المدير المفوض (00219) */
export default function ExecutiveHome() {
  const { data: user } = useAuth()
  return <ExecHome kind="executive" basePath="/executive" userName={user?.fullName} />
}
