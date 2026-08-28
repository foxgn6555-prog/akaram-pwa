import { useUiStore } from '@stores/ui.store'
import clsx from 'clsx'

const typeStyles = {
  info: 'bg-slate-800',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  error: 'bg-red-600',
} as const

/** حاوية التوستات — ركّبها مرة واحدة في AppShell */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div aria-live="polite" className="fixed bottom-4 start-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx('rounded-lg px-4 py-3 text-sm text-white shadow-lg', typeStyles[t.type])}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
