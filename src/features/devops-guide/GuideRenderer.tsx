/** 00275 — عارض الدليل: أقسام قابلة للطي، مفاهيم، خطوات، أوامر مع زر نسخ وشارة خطورة، أسئلة شائعة */
import { useState } from 'react'
import clsx from 'clsx'
import type { Guide, GuideCommand } from './types'

const DANGER: Record<NonNullable<GuideCommand['danger']>, { label: string; cls: string }> = {
  safe: { label: 'آمن', cls: 'bg-emerald-100 text-emerald-800' },
  care: { label: 'انتبه', cls: 'bg-amber-100 text-amber-800' },
  danger: { label: 'خطر — يمسح تعديلات', cls: 'bg-rose-100 text-rose-800' },
}

export function CopyButton({ text, testId }: { text: string; testId?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" data-testid={testId} onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}
      className="h-8 shrink-0 rounded-lg border bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
      {done ? 'نُسخ ✓' : 'نسخ'}
    </button>
  )
}

export function Cmd({ cmd, testId }: { cmd: string; testId?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2">
      <code dir="ltr" className="flex-1 overflow-x-auto whitespace-pre text-left text-[13px] text-emerald-200">{cmd}</code>
      <CopyButton text={cmd} testId={testId} />
    </div>
  )
}

export function GuideRenderer({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(guide.sections.map((s, i) => [s.id, i < 2])))
  return (
    <article className="space-y-4" data-testid={`guide-${guide.slug}`}>
      <header>
        <h1 className="text-lg font-black text-slate-800">{guide.title}</h1>
        <p className="text-xs text-slate-500">{guide.subtitle}</p>
        {guide.notice && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900" data-testid="guide-notice">{guide.notice}</p>}
      </header>
      <nav className="flex flex-wrap gap-2 text-[11px]">
        {guide.sections.map((s) => (
          <button key={s.id} type="button" onClick={() => { setOpen((o) => ({ ...o, [s.id]: true })); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="rounded-full border bg-white px-3 py-1 font-bold text-slate-700">{s.title}</button>
        ))}
      </nav>
      {guide.sections.map((s) => (
        <section key={s.id} id={`sec-${s.id}`} className="rounded-2xl border bg-white shadow-sm" data-testid={`section-${s.id}`}>
          <button type="button" aria-expanded={open[s.id] ?? false} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} className="flex w-full items-center justify-between px-4 py-3 text-right">
            <span className="text-sm font-black text-slate-800">{s.title}</span>
            <span className="text-xs text-slate-400">{open[s.id] ? 'إخفاء' : 'عرض'}</span>
          </button>
          {open[s.id] && (
            <div className="space-y-4 border-t px-4 py-4">
              {s.intro && <p className="text-xs text-slate-600">{s.intro}</p>}
              {s.concepts && (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {s.concepts.map((c) => (
                    <div key={c.term} className="rounded-xl bg-slate-50 p-3 text-xs">
                      <dt className="font-black text-slate-800">{c.term}</dt>
                      <dd className="mt-1 text-slate-700">{c.meaning}</dd>
                      <dd className="mt-1 text-[11px] text-slate-500">مثال: {c.example}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {s.steps && (
                <ol className="space-y-3">
                  {s.steps.map((st, i) => (
                    <li key={st.title} className="rounded-xl border border-slate-200 p-3 text-xs">
                      <div className="flex items-start gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-black text-white">{i + 1}</span><div><b className="text-slate-800">{st.title}</b><p className="mt-1 text-slate-700">{st.body}</p></div></div>
                      {st.cmd && <div className="mt-2"><Cmd cmd={st.cmd} /></div>}
                    </li>
                  ))}
                </ol>
              )}
              {s.commands && (
                <div className="space-y-3">
                  {s.commands.map((c, i) => {
                    const d = DANGER[c.danger ?? 'safe']
                    return (
                      <div key={c.cmd} className={clsx('rounded-xl border p-3 text-xs', c.danger === 'danger' ? 'border-rose-200' : c.danger === 'care' ? 'border-amber-200' : 'border-slate-200')} data-testid={`cmd-${s.id}-${i}`}>
                        <div className="mb-2 flex items-center gap-2"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', d.cls)}>{d.label}</span>{c.where && <span className="text-[10px] text-slate-500">{c.where}</span>}</div>
                        <Cmd cmd={c.cmd} testId={`copy-${s.id}-${i}`} />
                        <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[6rem_1fr]">
                          <dt className="font-bold text-slate-500">ماذا يفعل</dt><dd className="text-slate-800">{c.what}</dd>
                          <dt className="font-bold text-slate-500">متى</dt><dd className="text-slate-800">{c.when}</dd>
                          <dt className="font-bold text-slate-500">مثال</dt><dd className="text-slate-700">{c.example}</dd>
                          <dt className="font-bold text-slate-500">إن فشل</dt><dd className="text-slate-700">{c.ifFails}</dd>
                        </dl>
                      </div>
                    )
                  })}
                </div>
              )}
              {s.faq && (
                <div className="space-y-2">
                  {s.faq.map((f) => (
                    <details key={f.q} className="rounded-xl border border-slate-200 p-3 text-xs">
                      <summary className="cursor-pointer font-black text-slate-800" dir="auto">{f.q}</summary>
                      <p className="mt-2 text-slate-700">{f.a}</p>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      ))}
    </article>
  )
}
