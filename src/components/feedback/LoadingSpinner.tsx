
export function LoadingSpinner({ fullScreen = false, label = 'جارٍ التحميل…' }: { fullScreen?: boolean; label?: string }) {
  const spinner = (
    <div role="status" aria-label={label} className="flex items-center justify-center gap-3">
      <span className="size-6 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  )

  if (!fullScreen) return spinner
  return <div className="flex min-h-screen items-center justify-center">{spinner}</div>
}
