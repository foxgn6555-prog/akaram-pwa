import { useCallback, useEffect, useMemo, useState } from 'react'
import { Headphones, MessageCircle, Phone, ShieldCheck, Unlock, Settings, RefreshCw, Send, KeyRound, Search, CheckCircle2 } from 'lucide-react'
import { loginSupport, type LoginLock, type SupportEmployee, type SupportMessage, type SupportSettings, type SupportTicket } from '@sdk/login-support.sdk'
import { users } from '@sdk/users.sdk'
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_HINT, checkPasswordPolicy } from '@features/auth/password-policy'

type Tab = 'inbox' | 'locks' | 'reset' | 'settings'
const labelStatus = (status: string) => status === 'resolved' ? 'مغلق' : status === 'waiting' ? 'بانتظار الموظف' : 'مفتوح'
const timeLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleString('ar-IQ-u-nu-latn', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      })
    : '—'

export default function LoginSupportPage() {
  const [tab, setTab] = useState<Tab>('inbox')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [locks, setLocks] = useState<LoginLock[]>([])
  const [settings, setSettings] = useState<SupportSettings>({ support_phone: null, business_hours: null, is_online: false })
  const [selectedId, setSelectedId] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [reply, setReply] = useState('')
  const [lockEmail, setLockEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [employee, setEmployee] = useState<SupportEmployee | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [hoursDraft, setHoursDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loadInbox = useCallback(async () => {
    const [inbox, activeLocks, currentSettings] = await Promise.all([
      loginSupport.listRequests(), loginSupport.listLocks(), loginSupport.getSettings(),
    ])
    setTickets(inbox.requests); setLocks(activeLocks.locks); setSettings(currentSettings.settings)
    setPhoneDraft(currentSettings.settings.support_phone ?? '')
    setHoursDraft(currentSettings.settings.business_hours ?? '')
    if (selectedId) {
      const detail = await loginSupport.getRequest(selectedId)
      setSelectedTicket(detail.ticket); setMessages(detail.messages)
    }
  }, [selectedId])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const [inbox, activeLocks, currentSettings] = await Promise.all([
          loginSupport.listRequests(), loginSupport.listLocks(), loginSupport.getSettings(),
        ])
        if (!active) return
        setTickets(inbox.requests); setLocks(activeLocks.locks); setSettings(currentSettings.settings)
        setPhoneDraft(currentSettings.settings.support_phone ?? '')
        setHoursDraft(currentSettings.settings.business_hours ?? '')
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل وحدة الدعم') }
    }
    void refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!selectedId) { setSelectedTicket(null); setMessages([]); return }
    let active = true
    const refresh = async () => {
      try {
        const detail = await loginSupport.getRequest(selectedId)
        if (active) { setSelectedTicket(detail.ticket); setMessages(detail.messages) }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثة') }
    }
    void refresh()
    const timer = window.setInterval(refresh, 7000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedId])

  const openCount = useMemo(() => tickets.filter((ticket) => ticket.status !== 'resolved').length, [tickets])

  const refreshNow = async () => {
    setRefreshing(true); setError('')
    try { await loadInbox(); setNotice('تم تحديث بيانات الدعم.') }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر التحديث') }
    finally { setRefreshing(false) }
  }

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedId || !reply.trim()) return
    setBusy(true); setError(''); setNotice('')
    try {
      await loginSupport.reply(selectedId, reply.trim()); setReply('')
      const detail = await loginSupport.getRequest(selectedId)
      setSelectedTicket(detail.ticket); setMessages(detail.messages)
      setNotice('أُرسلت الرسالة. لا تطلب من الموظف إرسال كلمة مروره عبر المحادثة.')
      const inbox = await loginSupport.listRequests(); setTickets(inbox.requests)
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إرسال الرد') }
    finally { setBusy(false) }
  }

  const changeStatus = async (status: 'open' | 'waiting' | 'resolved') => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      await loginSupport.setStatus(selectedId, status)
      const detail = await loginSupport.getRequest(selectedId)
      setSelectedTicket(detail.ticket); setMessages(detail.messages)
      setTickets((old) => old.map((t) => t.id === selectedId ? detail.ticket : t))
      setNotice(`حُدّثت حالة الطلب إلى «${labelStatus(status)}».`)
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث الحالة') }
    finally { setBusy(false) }
  }

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!lockEmail.trim()) return
    if (!window.confirm('سيُفك القفل عن كل مصادر هذا البريد. أكّد أولاً أن الموظف تحقّق منه فريق الدعم عبر رقم الهاتف المسجل. هل تريد المتابعة؟')) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await loginSupport.unlockEmail(lockEmail.trim())
      setNotice(`تم فك القفل عن ${result.affected_sources} مصدر لهذا البريد.`)
      setLockEmail(''); setLocks((old) => old.filter((item) => item.normalized_email !== lockEmail.trim().toLowerCase()))
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر فك القفل') }
    finally { setBusy(false) }
  }

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setEmployee(null); setPhoneVerified(false); setNewPassword('')
    try { const result = await loginSupport.lookupEmployee(resetEmail.trim()); setEmployee(result.employee) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر العثور على الموظف') }
    finally { setBusy(false) }
  }

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!employee || !phoneVerified || !employee.registered_phone) return
    const policy = checkPasswordPolicy(newPassword)
    if (!policy.ok) { setError(`${policy.error}.`); return }
    if (!window.confirm('تأكد أن المكالمة تمت إلى الرقم المسجل وأن الموظف تحقق. سيتم ضبط كلمة جديدة دون حفظها في سجل التدقيق.')) return
    setBusy(true); setError(''); setNotice('')
    const password = newPassword
    try {
      await users.resetPassword(employee.user_id, password)
      setNotice('تم تعيين كلمة مرور جديدة. أبلغ الموظف بها هاتفياً عبر الرقم المسجل فقط؛ لا ترسلها في المحادثة أو البريد.')
      setNewPassword(''); setPhoneVerified(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تعيين كلمة المرور') }
    finally { setNewPassword(''); setBusy(false) }
  }

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = await loginSupport.setSettings({ support_phone: phoneDraft.trim() || null, business_hours: hoursDraft.trim() || null, is_online: settings.is_online })
      setSettings(result.settings); setNotice('حُفظت إعدادات التواصل والتوفر.')
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الإعدادات') }
    finally { setBusy(false) }
  }

  const toggleOnline = async (isOnline: boolean) => {
    setBusy(true); setError('')
    try {
      const result = await loginSupport.setSettings({ support_phone: settings.support_phone, business_hours: settings.business_hours, is_online: isOnline })
      setSettings(result.settings); setNotice(isOnline ? 'أصبحت المحادثة المباشرة متاحة.' : 'تحولت الطلبات الجديدة إلى طلبات متابعة محفوظة.')
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحديث حالة التوفر') }
    finally { setBusy(false) }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'inbox', label: `المحادثات (${openCount})`, icon: <MessageCircle size={17} /> },
    { id: 'locks', label: `الأقفال (${locks.length})`, icon: <Unlock size={17} /> },
    { id: 'reset', label: 'إعادة ضبط كلمة المرور', icon: <KeyRound size={17} /> },
    { id: 'settings', label: 'التواصل والإعدادات', icon: <Settings size={17} /> },
  ]

  return (
    <section className="space-y-5" dir="rtl" aria-labelledby="login-support-page-title">
      <header className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-cyan-300/15 text-cyan-200"><Headphones /></span><div><h1 id="login-support-page-title" className="text-lg font-black">دعم دخول الموظفين</h1><p className="mt-1 text-xs text-slate-300">المحادثات، متابعة الأقفال، وتعيين كلمة مرور جديدة بعد التحقق الهاتفي.</p></div></div>
        <button type="button" onClick={() => void refreshNow()} disabled={refreshing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/15"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> تحديث</button>
      </header>

      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}

      <nav className="flex flex-wrap gap-2" aria-label="أقسام وحدة الدعم">
        {tabs.map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); setError(''); setNotice('') }} aria-current={tab === item.id ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${tab === item.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item.icon}{item.label}</button>)}
      </nav>

      {tab === 'inbox' && <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="قائمة طلبات الدعم">
          <div className="border-b bg-slate-50 px-4 py-3"><h2 className="text-sm font-black">طلبات المحادثة والمتابعة</h2><p className="mt-1 text-xs text-slate-500">تظهر الرسائل الواردة هنا دون بيانات كلمات مرور.</p></div>
          <div className="max-h-[68vh] overflow-y-auto">
            {tickets.length === 0 ? <p className="p-5 text-sm text-slate-500">لا توجد طلبات دعم حالياً.</p> : tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedId(ticket.id)} className={`block w-full border-b p-4 text-right hover:bg-slate-50 ${selectedId === ticket.id ? 'bg-sky-50' : ''}`}><span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{ticket.employee_name}</b><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${ticket.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : ticket.status === 'waiting' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>{labelStatus(ticket.status)}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{ticket.employee_email} · {ticket.employee_number}</span><span className="mt-2 block text-[10px] text-slate-400">{ticket.reference} · {timeLabel(ticket.last_message_at)}</span></button>)}
          </div>
        </section>
        <section className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="تفاصيل المحادثة">
          {!selectedTicket ? <div className="grid h-full min-h-[360px] place-items-center text-center text-slate-500"><div><MessageCircle className="mx-auto mb-3 text-slate-300" size={36} /><p className="text-sm">اختر طلباً لعرض المحادثة والرد.</p></div></div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"><div><h2 className="text-base font-black">{selectedTicket.employee_name}</h2><p className="mt-1 text-xs text-slate-500">{selectedTicket.employee_email} · رقم وظيفي {selectedTicket.employee_number}</p><p className="mt-1 text-[11px] text-slate-400">{selectedTicket.reference} · آخر نشاط {timeLabel(selectedTicket.last_message_at)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void changeStatus('open')} disabled={busy || selectedTicket.status === 'open'} className="rounded-lg border px-3 py-2 text-xs font-bold">مفتوح</button><button type="button" onClick={() => void changeStatus('waiting')} disabled={busy || selectedTicket.status === 'waiting'} className="rounded-lg border px-3 py-2 text-xs font-bold">بانتظار الموظف</button><button type="button" onClick={() => void changeStatus('resolved')} disabled={busy || selectedTicket.status === 'resolved'} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">إغلاق الطلب</button></div></div>
            <div className="my-4 max-h-[44vh] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3" aria-live="polite">{messages.map((message) => <article key={message.id} className={`max-w-[88%] rounded-xl p-3 ${message.sender === 'support' ? 'ms-auto bg-sky-100' : 'me-auto bg-white shadow-sm'}`}><p className="text-[10px] font-bold text-slate-500">{message.sender === 'support' ? 'فريق الدعم' : message.sender === 'employee' ? selectedTicket.employee_name : 'النظام'} · {timeLabel(message.created_at)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{message.body}</p></article>)}</div>
            {selectedTicket.status !== 'resolved' && <form onSubmit={sendReply} className="space-y-2"><label htmlFor="support-reply" className="text-xs font-bold text-slate-700">الرد على الموظف</label><textarea id="support-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} rows={3} required className="w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder="لا تطلب كلمة المرور أو ترسلها عبر المحادثة." /><button type="submit" disabled={busy || !reply.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-bold text-white"><Send size={15} /> إرسال الرد</button></form>}
          </>}
        </section>
      </div>}

      {tab === 'locks' && <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b bg-slate-50 px-4 py-3"><h2 className="text-sm font-black">الأقفال النشطة</h2><p className="mt-1 text-xs text-slate-500">القفل مرتبط بالبريد والجهاز الذي أخفق؛ لا يكشف عنوان IP.</p></div>{locks.length === 0 ? <p className="p-5 text-sm text-slate-500">لا توجد أقفال نشطة.</p> : <div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead className="bg-white text-slate-500"><tr><th className="p-3">البريد</th><th className="p-3">الإخفاقات</th><th className="p-3">انتهاء القفل</th><th className="p-3">آخر تحديث</th></tr></thead><tbody>{locks.map((item) => <tr key={`${item.normalized_email}-${item.locked_until}`} className="border-t"><td className="p-3" dir="ltr">{item.normalized_email}</td><td className="p-3">{item.failure_count}/10</td><td className="p-3">{timeLabel(item.locked_until)}</td><td className="p-3">{timeLabel(item.updated_at)}</td></tr>)}</tbody></table></div>}</section>
        <form onSubmit={unlock} className="h-fit space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-900"><Unlock size={18} /><h2 className="text-sm font-black">فك القفل بعد التحقق</h2></div><p className="text-xs leading-5 text-amber-900/80">أدخل البريد الوظيفي. سيُفك القفل عن مصادره كلها. يجب أن يتحقق الدعم من الموظف عبر رقم الهاتف المسجل أولاً.</p><label className="sr-only" htmlFor="unlock-email">البريد الوظيفي لفك القفل</label><input id="unlock-email" type="email" required value={lockEmail} onChange={(e) => setLockEmail(e.target.value)} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm" dir="ltr" placeholder="employee@akram.iq" /><button type="submit" disabled={busy} className="min-h-10 w-full rounded-xl bg-amber-700 px-3 text-sm font-bold text-white">فك قفل هذا البريد</button></form>
      </div>}

      {tab === 'reset' && <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <form onSubmit={lookup} className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Search size={18} className="text-brand-700" /><h2 className="text-sm font-black">البحث عن الموظف</h2></div><p className="text-xs leading-5 text-slate-500">تظهر بيانات التواصل المسجلة اللازمة للتحقق الهاتفي فقط داخل هذه الوحدة.</p><label htmlFor="reset-email" className="text-xs font-bold">البريد الوظيفي</label><input id="reset-email" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" dir="ltr" /><button type="submit" disabled={busy} className="min-h-10 w-full rounded-xl bg-brand-700 text-sm font-bold text-white">بحث</button></form>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!employee ? <div className="grid min-h-[200px] place-items-center text-center text-sm text-slate-500"><p>ابحث بالبريد الوظيفي لعرض سجل الموظف ورقم الهاتف المسجل.</p></div> : <>
            <div className="rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 size={18} /><h2 className="font-black">{employee.full_name}</h2></div><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">البريد</dt><dd dir="ltr" className="font-semibold">{employee.email}</dd></div><div><dt className="text-xs text-slate-500">الرقم الوظيفي</dt><dd>{employee.employee_number ?? 'غير مسجل'}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">الهاتف المسجل</dt><dd dir="ltr" className="font-bold text-brand-800">{employee.registered_phone || 'لا يوجد رقم مسجل — لا يمكن إجراء إعادة الضبط بهذه الآلية'}</dd></div></dl></div>
            <form onSubmit={resetPassword} className="mt-4 space-y-3">
              <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${employee.registered_phone ? 'cursor-pointer border-slate-200' : 'border-rose-200 bg-rose-50 text-rose-800'}`}><input type="checkbox" checked={phoneVerified} disabled={!employee.registered_phone} onChange={(e) => setPhoneVerified(e.target.checked)} className="mt-1 size-4" /><span><b>تم الاتصال والتحقق من هوية الموظف عبر الرقم المسجل أعلاه.</b><small className="mt-1 block text-xs text-slate-500">لا تتابع إن لم تتم المكالمة أو كان الرقم غير محدّث.</small></span></label>
              <label htmlFor="support-new-password" className="text-xs font-bold">كلمة المرور الجديدة (لا تُحفظ في السجل)</label>
              <input id="support-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" dir="ltr" minLength={PASSWORD_MIN_LENGTH} />
              <p className="text-xs text-slate-500">{PASSWORD_RULE_HINT}. أبلغ الموظف بها هاتفياً؛ لا تكتبها في المحادثة أو في ملاحظات التدقيق.</p>
              <button type="submit" disabled={busy || !phoneVerified || !employee.registered_phone || !newPassword} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck size={16} /> تعيين بعد التحقق</button>
            </form>
          </>}
        </section>
      </div>}

      {tab === 'settings' && <div className="grid gap-4 lg:grid-cols-[minmax(300px,560px)_1fr]">
        <form onSubmit={saveSettings} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Settings size={18} className="text-brand-700" /><h2 className="text-sm font-black">إعدادات التواصل</h2></div><label htmlFor="support-phone" className="block text-xs font-bold">رقم الهاتف</label><input id="support-phone" type="tel" value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" dir="ltr" placeholder="0770…" /><label htmlFor="support-hours" className="block text-xs font-bold">ساعات التواصل (اختياري)</label><input id="support-hours" value={hoursDraft} onChange={(e) => setHoursDraft(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="مثال: الأحد–الخميس، 8 ص–3 م" maxLength={120} /><button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-brand-700 px-5 text-sm font-bold text-white">حفظ الإعدادات</button></form>
        <section className="h-fit space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Headphones size={18} className="text-brand-700" /><h2 className="text-sm font-black">توفّر المحادثة</h2></div><p className="text-xs leading-5 text-slate-500">عند التفعيل، تبدأ الطلبات الجديدة كمحادثة مباشرة. عند إيقافها، تتحول إلى طلبات متابعة محفوظة؛ يستطيع الفريق الرد لاحقاً في صندوق الوارد.</p><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${settings.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{settings.is_online ? 'الفريق متاح' : 'الفريق غير متاح'}</span><button type="button" disabled={busy} onClick={() => void toggleOnline(!settings.is_online)} className={`min-h-10 rounded-xl px-4 text-sm font-bold text-white ${settings.is_online ? 'bg-slate-700' : 'bg-emerald-700'}`}>{settings.is_online ? 'إيقاف المحادثة المباشرة' : 'إتاحة المحادثة المباشرة'}</button></div>{settings.support_phone && <a href={`tel:${settings.support_phone}`} className="inline-flex items-center gap-2 text-sm font-bold text-brand-800"><Phone size={16} /> اتصال هاتفي</a>}</section>
      </div>}
    </section>
  )
}
