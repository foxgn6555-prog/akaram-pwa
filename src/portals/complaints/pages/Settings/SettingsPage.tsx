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
      <IssueTypesCard setting={settings.find((value) => value.key === 'complaints.issue_types')} />
      <div className="grid gap-3 md:grid-cols-2">
        {settings.filter((setting) => setting.key !== 'complaints.issue_types').map((setting) => <VisualSettingCard key={setting.key} setting={setting} />)}
      </div>
    </section>
  )
}
function IssueTypesCard({setting}:{setting?:ComplaintSetting}){
  const save=useSaveComplaintSetting();const initial=((setting?.value.items??['تراكم نفايات','أنقاض','مخلفات زراعية'])as unknown[]).filter((value):value is string=>typeof value==='string');const[types,setTypes]=useState(initial);const[newType,setNewType]=useState('');const[feedback,setFeedback]=useState<Feedback|null>(null)
  useEffect(()=>{if(setting){setTypes(((setting.value.items??[])as unknown[]).filter((value):value is string=>typeof value==='string'))}},[setting])
  const add=()=>{const value=newType.trim();if(!value||types.includes(value))return;setTypes(old=>[...old,value]);setNewType('')}
  const persist=()=>save.mutate({key:'complaints.issue_types',value:{items:types},description:'أنواع التلكؤ المتاحة أثناء فرز صور البريد'},{onSuccess:()=>setFeedback({kind:'ok',text:'تم حفظ أنواع التلكؤ.'}),onError:()=>setFeedback({kind:'err',text:'تعذر حفظ الأنواع.'})})
  return <article className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5"><div><h2 className="font-black text-slate-900">أنواع التلكؤ والشكاوى</h2><p className="mt-1 text-xs text-slate-500">تظهر هذه القائمة لموظف الشكاوى أثناء كتابة بيانات كل صورة.</p></div><div className="mt-4 flex flex-wrap gap-2">{types.map(type=><span key={type} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold shadow-sm">{type}<button type="button" onClick={()=>setTypes(old=>old.filter(value=>value!==type))} aria-label={`حذف ${type}`} className="text-red-600">×</button></span>)}</div><div className="mt-4 flex flex-wrap gap-2"><input value={newType} onChange={event=>setNewType(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add()}}} placeholder="اكتب نوعاً جديداً" className="min-w-56 flex-1 rounded-xl border bg-white p-3"/><button type="button" onClick={add} className="rounded-xl border border-blue-200 bg-white px-4 py-2 font-bold text-blue-800">إضافة للقائمة</button><button type="button" onClick={persist} disabled={!types.length||save.isPending} className="rounded-xl bg-blue-700 px-5 py-2 font-bold text-white disabled:opacity-50">{save.isPending?'جارٍ الحفظ…':'حفظ الأنواع'}</button></div>{feedback&&<p className={`mt-3 rounded p-2 text-xs font-bold ${feedbackClass(feedback.kind)}`}>{feedback.text}</p>}</article>
}
const SETTING_LABELS: Record<string,{title:string;description:string;fields:Record<string,string>}>={
  mailgun:{title:'حدود البريد والمرفقات',description:'إعدادات تشغيلية عامة فقط؛ المفتاح السري والنطاق يبقيان في أسرار الخادم.',fields:{provider:'مزود البريد',maxAttachmentMb:'الحد الأقصى للمرفقات (MB)'}},
  report:{title:'سياسة التقارير والأرشفة',description:'حدد محتوى التقرير اليومي ووقت أرشفة التقرير بعد الإرسال.',fields:{includeAllDailyItems:'تضمين جميع عناصر اليوم',archiveAfterDelivery:'الأرشفة تلقائياً بعد تأكيد التسليم'}},
  'reports.cc':{title:'نسخ التقارير الإضافية',description:'التحكم في إرسال نسخة إضافية مع التقارير.',fields:{enabled:'تفعيل النسخة الإضافية'}},
}
function titleFor(key:string){return SETTING_LABELS[key]?.title??key.replaceAll(/[._-]+/g,' ')}
function fieldLabel(settingKey:string,field:string){return SETTING_LABELS[settingKey]?.fields[field]??field.replaceAll(/[._-]+/g,' ')}
function VisualSettingCard({setting}:{setting:ComplaintSetting}){
  const save=useSaveComplaintSetting();const[values,setValues]=useState<Record<string,unknown>>(setting.value);const[feedback,setFeedback]=useState<Feedback|null>(null)
  useEffect(()=>{setValues(setting.value);setFeedback(null)},[setting])
  const patch=(key:string,value:unknown)=>setValues(old=>({...old,[key]:value}))
  const persist=()=>save.mutate({...setting,value:values},{onSuccess:()=>setFeedback({kind:'ok',text:'تم حفظ الإعداد.'}),onError:()=>setFeedback({kind:'err',text:'تعذر حفظ الإعداد؛ تحقق من الصلاحية ثم أعد المحاولة.'})})
  const meta=SETTING_LABELS[setting.key]
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{titleFor(setting.key)}</h2><p className="mt-1 text-xs leading-6 text-slate-500">{meta?.description||setting.description||'إعداد تشغيلي لبوابة الشكاوى.'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-[10px] text-slate-500">{setting.key}</span></div><div className="mt-4 space-y-3">{Object.entries(values).map(([key,value])=><SettingField key={key} settingKey={setting.key} fieldKey={key} value={value} onChange={next=>patch(key,next)}/>)}</div>{feedback&&<p aria-live="polite" className={`mt-3 rounded-lg p-2 text-xs font-bold ${feedbackClass(feedback.kind)}`}>{feedback.text}</p>}<button type="button" onClick={persist} disabled={save.isPending} className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{save.isPending?'جارٍ الحفظ…':'حفظ الإعداد'}</button></article>
}
function SettingField({settingKey,fieldKey,value,onChange}:{settingKey:string;fieldKey:string;value:unknown;onChange:(value:unknown)=>void}){
  const label=fieldLabel(settingKey,fieldKey)
  if(typeof value==='boolean')return <label className="flex items-center justify-between rounded-xl border bg-slate-50 p-3 text-sm font-bold"><span>{label}</span><input type="checkbox" checked={value} onChange={event=>onChange(event.target.checked)} aria-label={label} className="size-5 accent-blue-700"/></label>
  if(typeof value==='number')return <label className="block text-sm font-bold">{label}<input type="number" min={1} max={fieldKey==='maxAttachmentMb'?24:undefined} value={value} onChange={event=>onChange(Number(event.target.value))} aria-label={label} className="mt-2 w-full rounded-xl border p-3"/></label>
  if(Array.isArray(value))return <label className="block text-sm font-bold">{label}<textarea value={value.filter(item=>typeof item==='string').join('\n')} onChange={event=>onChange(event.target.value.split('\n').map(item=>item.trim()).filter(Boolean))} aria-label={label} className="mt-2 min-h-24 w-full rounded-xl border p-3"/><span className="mt-1 block text-xs font-normal text-slate-500">عنصر واحد في كل سطر.</span></label>
  return <label className="block text-sm font-bold">{label}<input value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)} aria-label={label} disabled={settingKey==='mailgun'&&fieldKey==='provider'} className="mt-2 w-full rounded-xl border p-3 disabled:bg-slate-100 disabled:text-slate-500"/></label>
}
