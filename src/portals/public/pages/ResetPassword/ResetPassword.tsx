import { useState } from 'react'
import { useNavigate } from 'react-router'
import { auth } from '@sdk/auth.sdk'
import { resetPasswordSchema } from '@features/auth'
import { Button } from '@components/ui'
import { toUserMessage } from '@lib/errors/error.handler'

/** تعيين كلمة مرور جديدة — يصل إليه المستخدم من رابط البريد */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة')
      return
    }
    try {
      await auth.updatePassword(password)
      void navigate('/login', { replace: true })
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-center text-xl font-bold">كلمة مرور جديدة</h1>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password" dir="ltr" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور الجديدة"
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
          <input
            type="password" dir="ltr" required value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="تأكيد كلمة المرور"
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <Button type="submit" fullWidth>حفظ كلمة المرور</Button>
        </form>
      </div>
    </main>
  )
}
