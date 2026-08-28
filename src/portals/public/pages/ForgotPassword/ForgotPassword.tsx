import { useState } from 'react'
import { auth } from '@sdk/auth.sdk'
import { Button } from '@components/ui'
import { toUserMessage } from '@lib/errors/error.handler'

/** استعادة كلمة المرور — إرسال رابط الإعادة */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      await auth.sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-center text-xl font-bold">استعادة كلمة المرور</h1>
        {sent ? (
          <p className="text-center text-sm text-emerald-700">
            أرسلنا رابط الإعادة إلى بريدك — تحقق من صندوق الوارد.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@municipal.example.iq"
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <Button type="submit" fullWidth>إرسال الرابط</Button>
          </form>
        )}
      </div>
    </main>
  )
}
