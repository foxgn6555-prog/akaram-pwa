import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Headphones, Phone, Send, X } from 'lucide-react'
import './login.css'
import { loginSupport, type SupportMessage, type SupportSettings, type SupportTicket } from '@sdk/login-support.sdk'

const STORAGE_KEY = 'akram:login-support-session:v1'
type SavedSession = { ticketId: string; token: string; reference: string }

function readSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as SavedSession : null
  } catch { return null }
}

export default function PublicLoginSupport({ open, onClose, emailPrefill = '' }: { open: boolean; onClose: () => void; emailPrefill?: string }) {
  const [settings, setSettings] = useState<SupportSettings | null>(null)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [saved, setSaved] = useState<SavedSession | null>(null)
  const [email, setEmail] = useState(emailPrefill)
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [draft, setDraft] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    setEmail((v) => v || emailPrefill)
    return () => { previousFocus?.focus() }
  }, [open, emailPrefill])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousScrollbarGutter = document.documentElement.style.scrollbarGutter
    document.body.style.overflow = 'hidden'
    document.documentElement.style.scrollbarGutter = 'auto'
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.scrollbarGutter = previousScrollbarGutter
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setSaved(readSavedSession())
    void loginSupport.getPublicSettings().then((r) => setSettings(r.settings)).catch(() => setSettings(null))
  }, [open, emailPrefill])

  useEffect(() => {
    if (!open || !saved) return
    let active = true
    const poll = async () => {
      try {
        const result = await loginSupport.loadThread(saved.ticketId, saved.token)
        if (active) { setTicket(result.ticket); setMessages(result.messages) }
      } catch { /* offline: keep the last displayed conversation */ }
    }
    void poll()
    const timer = window.setInterval(poll, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, saved])

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled])')
      ;(first ?? emailRef.current)?.focus()
    }, 0)
  }, [open, saved])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((item) => item.offsetParent !== null)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const start = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      const result = await loginSupport.startRequest({ email: email.trim(), employee_number: employeeNumber.trim(), employee_name: employeeName.trim(), message: firstMessage.trim() })
      const next = { ticketId: result.ticket.id, token: result.token, reference: result.ticket.reference }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSaved(next); setTicket(result.ticket); setMessages([]); setFirstMessage('')
      setNotice(settings?.is_online ? 'تم فتح محادثة مع الدعم. إذا غاب الفريق فسيبقى طلبك محفوظاً للمتابعة.' : 'تم تسجيل طلب متابعة محفوظ. سيتواصل معك الفريق بعد التحقق من بياناتك.')
      const thread = await loginSupport.loadThread(next.ticketId, next.token)
      setMessages(thread.messages)
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر فتح طلب الدعم') }
    finally { setBusy(false) }
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!saved || !draft.trim()) return
    setBusy(true); setError('')
    const text = draft.trim()
    try {
      await loginSupport.sendMessage(saved.ticketId, saved.token, text)
      setDraft('')
      const thread = await loginSupport.loadThread(saved.ticketId, saved.token)
      setTicket(thread.ticket); setMessages(thread.messages)
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة') }
    finally { setBusy(false) }
  }

  const newRequest = () => {
    sessionStorage.removeItem(STORAGE_KEY); setSaved(null); setTicket(null); setMessages([]); setNotice(''); setError('')
  }

  return createPortal(
    <div className="login-support-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section ref={dialogRef} className="login-support-dialog" role="dialog" aria-modal="true" aria-labelledby="login-support-title" dir="rtl">
        <header className="login-support-header">
          <div className="login-support-icon"><Headphones aria-hidden="true" size={21} /></div>
          <div><h2 id="login-support-title">مساعدة تسجيل الدخول</h2><p>{settings?.is_online ? 'فريق الدعم متاح للمحادثة' : 'اترك طلب متابعة وسيعود إليك الفريق'}</p></div>
          <button type="button" className="login-support-close" onClick={onClose} aria-label="إغلاق نافذة الدعم"><X size={20} /></button>
        </header>

        {settings?.support_phone && <a className="login-support-phone" href={`tel:${settings.support_phone.replace(/[^+\d]/g, '')}`}><Phone size={17} aria-hidden="true" /><span>اتصال هاتفي بالدعم</span><b dir="ltr">{settings.support_phone}</b></a>}
        {settings?.business_hours && <p className="login-support-hours">ساعات التواصل: {settings.business_hours}</p>}
        {notice && <p className="login-support-notice" role="status">{notice}</p>}
        {error && <p className="login-support-error" role="alert">{error}</p>}

        {saved ? (
          <>
            <div className="login-support-ticket-meta"><span>رقم المتابعة</span><b dir="ltr">{ticket?.reference ?? saved.reference}</b><span className={`login-support-status status-${ticket?.status ?? 'open'}`}>{ticket?.status === 'resolved' ? 'مغلق' : ticket?.status === 'waiting' ? 'بانتظار ردك' : 'مفتوح'}</span></div>
            <div className="login-support-messages" ref={listRef} aria-label="رسائل المحادثة" aria-live="polite">
              {messages.map((message) => <article key={message.id} className={`login-support-message ${message.sender === 'employee' ? 'mine' : 'theirs'}`}><span>{message.sender === 'employee' ? 'أنت' : 'فريق الدعم'}</span><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString('ar-IQ-u-nu-latn', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Baghdad',
              })}</time></article>)}
              {messages.length === 0 && <p className="login-support-empty">تم فتح الطلب. ستظهر الردود هنا.</p>}
            </div>
            {ticket?.status === 'resolved' ? <button type="button" className="login-support-secondary" onClick={newRequest}>فتح طلب جديد</button> : (
              <form className="login-support-send" onSubmit={send}>
                <label htmlFor="login-support-reply">اكتب رسالتك</label>
                <textarea id="login-support-reply" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000} required placeholder="اكتب المشكلة باختصار — لا ترسل أي كلمة مرور هنا." />
                <button type="submit" disabled={busy || !draft.trim()}><Send size={16} aria-hidden="true" /> إرسال</button>
              </form>
            )}
          </>
        ) : (
          <form className="login-support-form" onSubmit={start}>
            <p className="login-support-intro">للمساعدة أو نسيان كلمة المرور، أرسل طلباً. سيجري الدعم التحقق عبر رقم الهاتف المسجل قبل أي إعادة ضبط.</p>
            <label htmlFor="login-support-email">البريد الإلكتروني الوظيفي</label><input ref={emailRef} id="login-support-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="login-support-number">الرقم الوظيفي</label><input id="login-support-number" required maxLength={40} value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} />
            <label htmlFor="login-support-name">الاسم</label><input id="login-support-name" required minLength={2} maxLength={120} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
            <label htmlFor="login-support-message">كيف يمكننا مساعدتك؟</label><textarea id="login-support-message" rows={3} required maxLength={2000} value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} placeholder="صف المشكلة دون كتابة كلمات مرور أو رموز سرية." />
            <button type="submit" disabled={busy}><Send size={16} aria-hidden="true" /> {busy ? 'جارٍ الإرسال…' : settings?.is_online ? 'بدء المحادثة' : 'إرسال طلب متابعة'}</button>
          </form>
        )}
        <p className="login-support-privacy">لا تكتب كلمة مرورك أو رمزاً سرياً في المحادثة. لا يمكن استرجاع كلمة المرور القديمة؛ الدعم يستطيع ضبط كلمة جديدة بعد التحقق.</p>
      </section>
    </div>,
    document.body,
  )
}
