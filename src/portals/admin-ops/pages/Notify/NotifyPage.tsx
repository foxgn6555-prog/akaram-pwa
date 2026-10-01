/** بوابة مسؤول القاطع — التبليغ: رسالة تصل كإشعار داخل التطبيق لمسؤولي أقسامه فقط (الكل أو مختارون) + سجل ما أُرسل. */
import { useState } from 'react'
import clsx from 'clsx'
import { Send } from 'lucide-react'
import { useNotifyTargets, useSectorNotices, useSendSectorNotice } from '@features/sector-manager/hooks'
import { PARENT_AR, SHIFT_AR, dateAr, timeAr } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

export default function NotifyPage() {
  const targets = useNotifyTargets(), notices = useSectorNotices(), send = useSendSectorNotice()
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [sel, setSel] = useState<string[]>([])
  const all = targets.data ?? []
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const can = title.trim().length >= 3 && body.trim().length >= 3 && all.length > 0 && !send.isPending
  return (
    <div className="space-y-4 pb-4" data-testid="sm-notify">
      <header>
        <h1 className="text-lg font-black">التبليغ</h1>
        <p className="text-xs text-slate-600">يصل التبليغ كإشعار داخل التطبيق إلى مسؤولي الأقسام في قواطعك فقط.</p>
      </header>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <label className="text-xs font-bold">العنوان
          <input data-testid="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal" placeholder="مثال: اجتماع طارئ غداً" />
        </label>
        <label className="mt-3 block text-xs font-bold">نص التبليغ
          <textarea data-testid="notice-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal" placeholder="التفاصيل…" />
        </label>
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">المستلمون {sel.length === 0 ? '(الكل)' : `(${sel.length} مختار)`}</span>
            {sel.length > 0 && <button type="button" onClick={() => setSel([])} className="text-[11px] font-bold text-indigo-700 underline">إرسال للكل</button>}
          </div>
          {targets.isLoading ? <LoadingSpinner /> : all.length === 0 ? <p className="mt-2 text-xs text-amber-700" data-testid="notice-no-targets">لا مسؤولي أقسام في قواطعك بعد.</p> : (
            <div className="mt-2 flex flex-wrap gap-2" data-testid="notice-targets">
              {all.map((t) => (
                <button key={t.user_id} type="button" data-testid={`target-${t.user_id}`} aria-pressed={sel.includes(t.user_id)} onClick={() => toggle(t.user_id)}
                  className={clsx('rounded-xl border px-3 py-1.5 text-right text-xs font-bold', sel.includes(t.user_id) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white')}>
                  <div>{t.full_name}</div><div className={clsx('text-[10px] font-normal', sel.includes(t.user_id) ? 'text-indigo-100' : 'text-slate-500')}>{PARENT_AR[t.parent_sector]} · {SHIFT_AR[t.shift] ?? t.shift} · {t.areas}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" data-testid="notice-send" disabled={!can} onClick={() => send.mutate({ title: title.trim(), body: body.trim(), targets: sel }, { onSuccess: () => { setTitle(''); setBody(''); setSel([]) } })}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white disabled:opacity-40"><Send size={16} /> إرسال التبليغ</button>
      </section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">تبليغاتي السابقة</h2>
        {notices.isLoading ? <LoadingSpinner /> : (notices.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500" data-testid="notices-empty">لم تُرسل تبليغات بعد.</p> : (
          <ul className="mt-2 divide-y" data-testid="notices-list">
            {(notices.data ?? []).map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <div className="font-black">{n.title}</div>
                <div className="text-xs text-slate-700">{n.body}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">إلى {n.recipients_count}: {n.recipient_names} · {dateAr(n.created_at)} {timeAr(n.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
