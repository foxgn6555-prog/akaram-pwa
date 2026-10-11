import { ExecHome } from '@components/executive/ExecHome'
import { useAuth } from '@features/auth/hooks/useAuth'
/** بوابة المدير المفوض — الرئيسية: ملخص كل وحدات الشركة (نتائج صافية محلّلة) */
export default function AdminHome() {
  const { data: user } = useAuth()
  return <ExecHome kind="admin" basePath="/admin" userName={user?.fullName} />
}
