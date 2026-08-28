export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
    </div>
  )
}
