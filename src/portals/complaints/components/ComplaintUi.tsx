import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, ChevronLeft, Circle, Search } from 'lucide-react'
import type { ComplaintItemStatus } from '@features/complaints'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const statusMeta: Record<ComplaintItemStatus, { label: string; className: string }> = {
  under_review: { label: 'بانتظار الإسناد', className: 'bg-slate-100 text-slate-700' },
  assigned: { label: 'مسندة', className: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'قيد التنفيذ', className: 'bg-violet-100 text-violet-800' },
  processed: { label: 'بانتظار التدقيق', className: 'bg-amber-100 text-amber-900' },
  quality_review: { label: 'قيد التدقيق', className: 'bg-orange-100 text-orange-900' },
  approved: { label: 'معتمدة', className: 'bg-emerald-100 text-emerald-800' },
  returned: { label: 'معادة للمسؤول', className: 'bg-rose-100 text-rose-800' },
}

/** 00236: رأس وحدات الشكاوى = الرأس الموحد الكحلي/الذهبي (tone يُحتفظ به للتوافق ولا يغيّر الهوية) */
export function ComplaintPageHeader({ icon: Icon, eyebrow, title, description, action }: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  tone?: 'sky' | 'rose' | 'emerald' | 'slate'
}) {
  return <ExecPageHeader icon="clipboard" iconNode={<Icon size={22} className="text-[#f3d06a]" />} title={title} subtitle={<><span className="font-bold text-[#f3d06a]">{eyebrow}</span> · {description}</>} actions={action} />
}

export function ComplaintStatusBadge({ status }: { status: ComplaintItemStatus }) {
  const meta = statusMeta[status]
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>
}

export function ComplaintEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
    <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon size={23} /></span>
    <h2 className="mt-4 font-black text-slate-800">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
  </div>
}

export function ComplaintSearch({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children?: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <label className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:min-w-64">
      <Search size={18} className="text-slate-400" />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" />
    </label>
    {children}
  </div>
}

export function ComplaintWorkflow({ current }: { current: 'inbox' | 'sort' | 'assign' | 'review' | 'report' | 'archive' }) {
  const steps = [
    ['inbox', 'البريد'], ['sort', 'الفرز'], ['assign', 'الإسناد'], ['review', 'المعالجة والتدقيق'], ['report', 'التقرير'], ['archive', 'الأرشيف'],
  ] as const
  const currentIndex = steps.findIndex(([key]) => key === current)
  return <nav aria-label="مراحل دورة الشكوى" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
    <ol className="flex min-w-max items-center gap-1">
      {steps.map(([key, label], index) => <li key={key} className="flex items-center">
        <span aria-current={index === currentIndex ? 'step' : undefined} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${index === currentIndex ? 'bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white shadow' : index < currentIndex ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
          {index < currentIndex ? <Check size={14} /> : <Circle size={10} fill="currentColor" />}{label}
        </span>
        {index < steps.length - 1 && <ChevronLeft size={15} className="mx-1 text-slate-300" />}
      </li>)}
    </ol>
  </nav>
}
