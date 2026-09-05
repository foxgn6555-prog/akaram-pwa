import { useEffect, useState } from 'react'
import {
  useComplaintContacts, useComplaintSettings, useSaveComplaintContact,
  useSaveComplaintSetting, type ComplaintContact, type ComplaintSetting,
} from '@features/complaints'

type ContactDraft = Omit<ComplaintContact, 'id'> & { id?: string }
type Feedback = { kind: 'ok' | 'err'; text: string }

const emptyDraft: ContactDraft = { name: '', email: '', sector: null, kind: 'recipient', isActive: true }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function feedbackClass(kind: Feedback['kind']): string {
  return kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
}

export default function SettingsPage() {
  const { data: contacts = [], isLoading } = useComplaintContacts()
  const { data: settings = [] } = useComplaintSettings()
  const save = useSaveComplaintContact()
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const submit = () => {
    const name = draft.name.trim()
    const email = draft.email.trim()
    if (!name || !email) { setFeedback({ kind: 'err', text: 'الاسم والبريد مطلوبان.' }); return }
    if (!EMAIL_PATTERN.test(email)) { setFeedback({ kind: 'err', text: 'صيغة البريد غير صحيحة.' }); return }
    save.mutate({ ...draft, name, email }, {
      onSuccess: () => {
        setFeedback({ kind: 'ok', text: draft.id ? 'تم تحديث جهة التواصل.' : 'تمت إضافة جهة التواصل.' })
        setDraft(emptyDraft)
      },
      onError: () => setFeedback({ kind: 'err', text: 'تعذر حفظ الجهة؛ تحقق من البريد والصلاحية ثم أعد المحاولة.' }),
    })
  }

  return (
    <section className="space-y-5" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">إعدادات الصفحات والتواصل</h1>
        <p className="text-sm text-slate-500">إدارة To وCC وقواعد المرسلين. التعطيل يحفظ السجل ولا يحذف الجهة. مفاتيح Mailgun تبقى في أسرار الخادم.</p>
      </header>
      {feedback && <p aria-live="polite" className={`rounded-lg p-3 text-sm font-bold ${feedbackClass(feedback.kind)}`}>{feedback.text}</p>}
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit() }} className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-2 xl:grid-cols-6">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="اسم الجهة" aria-label="اسم الجهة" className="rounded-lg border p-2" />
        <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="البريد" aria-label="بريد الجهة" className="rounded-lg border p-2" />
        <select value={draft.sector ?? ''} onChange={(e) => setDraft({ ...draft, sector: (e.target.value || null) as ContactDraft['sector'] })} aria-label="قاطع الجهة" className="rounded-lg border p-2">
          <option value="">كل القواطع</option>
          <option value="karrada">الكرادة</option>
          <option value="zaafaraniya">الزعفرانية</option>
        </select>
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ContactDraft['kind'] })} aria-label="استخدام الجهة" className="rounded-lg border p-2">
          <option value="recipient">To — مستلم</option>
          <option value="cc">CC — نسخة</option>
          <option value="sender_rule">مرسل مسموح</option>
        </select>
        <button disabled={save.isPending} className="rounded-lg bg-rose-700 p-2 font-bold text-white disabled:opacity-50">{draft.id ? 'حفظ التعديل' : 'إضافة جهة'}</button>
        {draft.id && <button type="button" onClick={() => { setDraft(emptyDraft); setFeedback(null) }} className="rounded-lg border p-2 font-bold">إلغاء</button>}
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        {isLoading
          ? <p className="p-6 text-center">جارٍ التحميل…</p>
          : !contacts.length
            ? <p className="p-6 text-center text-slate-500">لا توجد جهات تواصل بعد.</p>
            : <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-right">الجهة</th>
                    <th className="p-3 text-right">البريد</th>
                    <th className="p-3">القاطع</th>
                    <th className="p-3">الاستخدام</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3 font-bold">{c.name}</td>
                      <td className="p-3" dir="ltr">{c.email}</td>
                      <td className="p-3 text-center">{c.sector === 'karrada' ? 'الكرادة' : c.sector === 'zaafaraniya' ? 'الزعفرانية' : 'عام'}</td>
                      <td className="p-3 text-center">{c.kind === 'recipient' ? 'To' : c.kind === 'cc' ? 'CC' : 'مرسل'}</td>
                      <td className="p-3 text-center">{c.isActive ? 'مفعّل' : 'معطّل'}</td>
                      <td className="p-3 text-center">
                        <button type="button" onClick={() => { setDraft(c); setFeedback(null) }} className="ml-2 font-bold text-blue-700">تعديل</button>
                        <button type="button" onClick={() => save.mutate({ ...c, isActive: !c.isActive }, {
                          onSuccess: () => setFeedback({ kind: 'ok', text: c.isActive ? 'تم تعطيل الجهة دون حذفها.' : 'تم تفعيل الجهة.' }),
                          onError: () => setFeedback({ kind: 'err', text: 'تعذر تحديث حالة الجهة؛ أعد المحاولة.' }),
                        })} className="font-bold text-rose-700">{c.isActive ? 'تعطيل' : 'تفعيل'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {settings.map((setting) => <SettingCard key={setting.key} setting={setting} />)}
      </div>
    </section>
  )
}
function SettingCard({ setting }: { setting: ComplaintSetting }) {
  const save = useSaveComplaintSetting()
  const [text, setText] = useState(() => JSON.stringify(setting.value, null, 2))
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // مزامنة النص عند تحدّث الإعداد من الخارج (بعد الحفظ يعاد الجلب)
  useEffect(() => {
    setText(JSON.stringify(setting.value, null, 2))
    setFeedback(null)
  }, [setting])

  const saveSetting = () => {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { setFeedback({ kind: 'err', text: 'صيغة JSON غير صحيحة.' }); return }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setFeedback({ kind: 'err', text: 'يجب أن تكون قيمة الإعداد كائن JSON.' })
      return
    }
    save.mutate({ ...setting, value: parsed as Record<string, unknown> }, {
      onSuccess: () => setFeedback({ kind: 'ok', text: 'تم حفظ الإعداد.' }),
      onError: () => setFeedback({ kind: 'err', text: 'تعذر حفظ الإعداد؛ تحقق من الصلاحية ثم أعد المحاولة.' }),
    })
  }

  return (
    <article className="rounded-xl border bg-white p-4">
      <strong>{setting.key}</strong>
      <p className="text-xs text-slate-500">{setting.description}</p>
      <textarea dir="ltr" value={text} onChange={(e) => setText(e.target.value)} aria-label={`قيمة الإعداد ${setting.key}`} className="mt-3 min-h-32 w-full rounded border p-2 font-mono text-xs" />
      {feedback && <p aria-live="polite" className={`mt-2 rounded p-2 text-xs font-bold ${feedbackClass(feedback.kind)}`}>{feedback.text}</p>}
      <button type="button" onClick={saveSetting} className="mt-2 rounded bg-slate-800 px-3 py-2 text-sm font-bold text-white">حفظ الإعداد</button>
    </article>
  )
}
