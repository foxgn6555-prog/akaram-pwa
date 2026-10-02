/**
 * صفحة المواطن العامة — /citizen (بلا تسجيل دخول) · شركة جزيرة الأكارم
 *   · دخول مبسّط: الاسم + رقم الهاتف (يُحفظ على الجهاز).
 *   · تقديم شكوى: اسم ثلاثي، تفاصيل، الموقع (GPS)، صور اختيارية (حتى 5، تُضغط قبل الرفع).
 *   · شكاواي: الحالة (جديدة/قيد المعالجة/معلقة/تمت المعالجة) + خط زمني + تقييم بعد المعالجة.
 *   · الدعم الفني: طلب محادثة → انتظار → محادثة حيّة → إغلاق → تقييم بالنجوم (اختياري).
 *   · نبذة وأرقام التواصل (تُحرَّر من غرفة العمليات).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera, CheckCircle2, ChevronRight, Clock, Headset, Info, Loader2, LocateFixed, LogOut, MapPin, MessageSquareText, Phone, Send, Star, Trash2, X,
} from 'lucide-react'
import {
  CITIZEN_STATUS_LABEL, citizen, citizenErrorMessage, citizenKeys, compressImage, useCitizenChat, useCitizenInfo, useCitizenSession, useMyComplaints,
  type CitizenComplaint, type CitizenStatus,
} from '@features/citizen'

type View = 'home' | 'complaint' | 'mine' | 'support' | 'about'
const VIEWS: View[] = ['home', 'complaint', 'mine', 'support', 'about']
const STATUS_TONE: Record<CitizenStatus, string> = {
  new: 'bg-sky-100 text-sky-800 ring-sky-200', in_progress: 'bg-amber-100 text-amber-900 ring-amber-200', on_hold: 'bg-slate-200 text-slate-800 ring-slate-300', resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '')

export default function CitizenPortalPage() {
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('v') as View) ? params.get('v') : 'home') as View
  const go = (v: View) => setParams(v === 'home' ? {} : { v }, { replace: false })
  const { session, save } = useCitizenSession()
  const { data: info } = useCitizenInfo()
  useEffect(() => { document.title = `${info?.org_name ?? 'شركة جزيرة الأكارم'} — خدمة المواطنين` }, [info?.org_name])

  return (
    <div dir="rtl" className="min-h-screen bg-[radial-gradient(1200px_600px_at_80%_-10%,#fef3c7_0%,transparent_60%),radial-gradient(900px_500px_at_-10%_20%,#dbeafe_0%,transparent_55%),linear-gradient(#f8fafc,#f1f5f9)] font-sans text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => go('home')} className="flex items-center gap-3 text-right">
            <img src="/icons/logo.png" alt="شعار شركة جزيرة الأكارم" className="h-12 w-12 rounded-2xl bg-white object-contain p-1 shadow ring-1 ring-slate-200" />
            <span>
              <span className="block text-base font-black leading-tight text-[#0b4f8a]">{info?.org_name ?? 'شركة جزيرة الأكارم'}</span>
              <span className="block text-[11px] font-bold text-slate-500">خدمة المواطنين · الشكاوى والدعم الفني</span>
            </span>
          </button>
          {session && (
            <button type="button" onClick={() => { void citizen.chatClose(session.token).catch(() => undefined); save(null); go('home') }} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100" data-testid="citizen-logout">
              <LogOut size={14} /> خروج
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-5">
        {!session ? <SignIn onDone={save} /> : (
          <>
            {view !== 'home' && (
              <button type="button" onClick={() => go('home')} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-[#0b4f8a]"><ChevronRight size={16} /> الرئيسية</button>
            )}
            {view === 'home' && <Home name={session.full_name} supportOnline={!!info?.support_online} onGo={go} />}
            {view === 'complaint' && <ComplaintForm token={session.token} defaultName={session.full_name} onDone={() => go('mine')} />}
            {view === 'mine' && <MyComplaints token={session.token} onNew={() => go('complaint')} />}
            {view === 'support' && <Support token={session.token} />}
            {view === 'about' && <About />}
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <nav className="mx-auto grid max-w-3xl grid-cols-5 text-[11px] font-bold text-slate-500" aria-label="التنقل">
          {([['home', 'الرئيسية', Info], ['complaint', 'شكوى', Send], ['mine', 'شكاواي', CheckCircle2], ['support', 'الدعم', Headset], ['about', 'تواصل', Phone]] as const).map(([v, label, I]) => (
            <button key={v} type="button" onClick={() => go(v)} disabled={!session} className={`flex flex-col items-center gap-1 py-2 disabled:opacity-40 ${view === v ? 'text-[#0b4f8a]' : ''}`} aria-current={view === v ? 'page' : undefined}>
              <I size={18} />{label}
            </button>
          ))}
        </nav>
      </footer>
    </div>
  )
}

// ─────────── الدخول ───────────
function SignIn({ onDone }: { onDone: (s: { token: string; full_name: string; phone: string }) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [error, setError] = useState('')
  const m = useMutation({ mutationFn: () => citizen.signIn(name, phone), onSuccess: onDone, onError: (e) => setError(citizenErrorMessage(e)) })
  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-3xl bg-gradient-to-l from-[#0b4f8a] to-[#0e6ab3] p-6 text-white shadow-xl">
        <img src="/icons/logo.png" alt="" className="mx-auto h-20 w-20 rounded-3xl bg-white object-contain p-2 shadow-lg" />
        <h1 className="mt-4 text-center text-2xl font-black">أهلاً بك في خدمة المواطنين</h1>
        <p className="mt-2 text-center text-sm leading-7 text-blue-100">قدّم شكواك أو تحدّث مع فريق الدعم الفني مباشرة. نحتاج اسمك ورقم هاتفك فقط لمتابعة طلباتك.</p>
      </div>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setError(''); m.mutate() }} className="-mt-4 mx-3 space-y-4 rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200" data-testid="citizen-signin">
        <label className="block text-sm font-bold">الاسم
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={80} autoComplete="name" placeholder="مثال: علي حسين كاظم" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-[#0e6ab3] focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="block text-sm font-bold">رقم الهاتف
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" dir="ltr" autoComplete="tel" placeholder="07XX XXX XXXX" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-left text-base tracking-widest outline-none focus:border-[#0e6ab3] focus:ring-2 focus:ring-blue-100" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <button type="submit" disabled={m.isPending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f5b301] py-3 text-base font-black text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60">
          {m.isPending ? <Loader2 className="animate-spin" size={18} /> : null} متابعة
        </button>
        <p className="text-center text-[11px] leading-5 text-slate-500">بياناتك تُستخدم فقط لمتابعة شكواك والتواصل معك بخصوصها.</p>
      </form>
    </section>
  )
}

// ─────────── الرئيسية ───────────
function Home({ name, supportOnline, onGo }: { name: string; supportOnline: boolean; onGo: (v: View) => void }) {
  const cards: Array<{ v: View; title: string; desc: string; icon: typeof Send; tone: string }> = [
    { v: 'complaint', title: 'تقديم شكوى', desc: 'نفايات متراكمة، حاوية تالفة، تأخر رفع، أو أي ملاحظة على الخدمة — مع الموقع والصور.', icon: Send, tone: 'from-[#0b4f8a] to-[#0e6ab3] text-white' },
    { v: 'support', title: 'الدعم الفني المباشر', desc: supportOnline ? 'فريق الدعم متصل الآن — ابدأ محادثة فورية.' : 'اطلب محادثة وسيرد عليك أحد أعضاء الفريق.', icon: Headset, tone: 'from-[#f5b301] to-amber-400 text-slate-900' },
    { v: 'mine', title: 'متابعة شكاواي', desc: 'اعرف حالة كل شكوى: جديدة، قيد المعالجة، معلقة، أو تمت المعالجة.', icon: CheckCircle2, tone: 'from-emerald-600 to-emerald-500 text-white' },
    { v: 'about', title: 'عن الشركة والتواصل', desc: 'نبذة عن شركة جزيرة الأكارم وأرقام التواصل الرسمية وساعات العمل.', icon: Phone, tone: 'from-slate-700 to-slate-600 text-white' },
  ]
  return (
    <section className="space-y-5" data-testid="citizen-home">
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-500">مرحباً</p>
        <h1 className="text-2xl font-black text-[#0b4f8a]">{name}</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">كيف نستطيع خدمتك اليوم؟</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ v, title, desc, icon: I, tone }) => (
          <button key={v} type="button" onClick={() => onGo(v)} className={`group rounded-3xl bg-gradient-to-l ${tone} p-5 text-right shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl`} data-testid={`citizen-card-${v}`}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/40"><I size={24} /></span>
            <span className="mt-4 block text-lg font-black">{title}</span>
            <span className="mt-1 block text-xs leading-6 opacity-90">{desc}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ─────────── تقديم شكوى ───────────
function ComplaintForm({ token, defaultName, onDone }: { token: string; defaultName: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [fullName, setFullName] = useState(defaultName); const [details, setDetails] = useState(''); const [address, setAddress] = useState('')
  const [pos, setPos] = useState<{ lat: number; lng: number; acc?: number } | null>(null); const [locating, setLocating] = useState(false); const [locError, setLocError] = useState('')
  const [files, setFiles] = useState<Array<{ file: File; url: string }>>([]); const [error, setError] = useState(''); const [done, setDone] = useState<CitizenComplaint | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files])

  function locate() {
    if (!navigator.geolocation) { setLocError('المتصفح لا يدعم تحديد الموقع'); return }
    setLocating(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }); setLocating(false) },
      (e) => { setLocError(e.code === 1 ? 'رُفض إذن الموقع — فعّله من إعدادات المتصفح أو اكتب العنوان يدوياً' : 'تعذر تحديد الموقع — حاول مجدداً أو اكتب العنوان'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }
  const m = useMutation({
    mutationFn: async () => {
      const photos: string[] = []
      for (const [i, f] of files.entries()) photos.push(await citizen.uploadPhoto(token, await compressImage(f.file), i))
      return citizen.submitComplaint(token, { fullName, details, lat: pos?.lat ?? null, lng: pos?.lng ?? null, address: address || null, photos })
    },
    onSuccess: (c) => { setDone(c); void qc.invalidateQueries({ queryKey: citizenKeys.mine(token) }) },
    onError: (e) => setError(citizenErrorMessage(e)),
  })
  const tripleOk = fullName.trim().split(/\s+/).filter(Boolean).length >= 3

  if (done) {
    return (
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200" data-testid="citizen-complaint-done">
        <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
        <h2 className="mt-3 text-xl font-black">تم استلام شكواك</h2>
        <p className="mt-1 text-sm text-slate-600">رقم المتابعة</p>
        <p className="text-2xl font-black tracking-wider text-[#0b4f8a]" dir="ltr">{done.ref_no}</p>
        <p className="mt-3 text-xs leading-6 text-slate-500">سيراجعها فريق غرفة العمليات ويُسندها للجهة المختصة، ويمكنك متابعة حالتها من «شكاواي».</p>
        <button type="button" onClick={onDone} className="mt-4 rounded-2xl bg-[#0b4f8a] px-5 py-3 text-sm font-black text-white">متابعة شكاواي</button>
      </section>
    )
  }
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); setError(''); m.mutate() }} className="space-y-4" data-testid="citizen-complaint-form">
      <h1 className="text-xl font-black text-[#0b4f8a]">تقديم شكوى</h1>
      <Field label="الاسم الثلاثي" hint={tripleOk ? undefined : 'الاسم واسم الأب واسم الجد'}>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input" placeholder="علي حسين كاظم" data-testid="cc-name" />
      </Field>
      <Field label="تفاصيل الشكوى">
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} required minLength={10} maxLength={4000} rows={5} className="input resize-y" placeholder="اشرح المشكلة: ما هي؟ أين بالضبط؟ منذ متى؟" data-testid="cc-details" />
      </Field>
      <Field label="الموقع" hint="يساعدنا الوصول بسرعة — اضغط لتحديد موقعك الحالي أو اكتب العنوان">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-2 rounded-xl bg-[#0b4f8a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" data-testid="cc-locate">
            {locating ? <Loader2 className="animate-spin" size={16} /> : <LocateFixed size={16} />} {pos ? 'تحديث الموقع' : 'تحديد موقعي'}
          </button>
          {pos && <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200" dir="ltr"><MapPin size={14} />{pos.lat}, {pos.lng}{pos.acc ? ` (±${pos.acc}م)` : ''}</span>}
          {pos && <button type="button" onClick={() => setPos(null)} className="text-xs font-bold text-slate-500 underline">إزالة</button>}
        </div>
        {locError && <p className="mt-2 text-xs font-bold text-red-700">{locError}</p>}
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className="input mt-2" placeholder="العنوان أو أقرب نقطة دالة (اختياري)" data-testid="cc-address" />
      </Field>
      <Field label="صور (اختياري — حتى 5)">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).slice(0, 5 - files.length)
          setFiles((old) => [...old, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]); e.target.value = ''
        }} data-testid="cc-files" />
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={f.url} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-slate-200">
              <img src={f.url} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setFiles((old) => old.filter((_, j) => j !== i))} className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white" aria-label="حذف الصورة"><Trash2 size={12} /></button>
            </div>
          ))}
          {files.length < 5 && (
            <button type="button" onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-[#0e6ab3] hover:text-[#0e6ab3]"><Camera size={22} /></button>
          )}
        </div>
      </Field>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
      <button type="submit" disabled={m.isPending || !tripleOk || details.trim().length < 10} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f5b301] py-3.5 text-base font-black text-slate-900 shadow disabled:opacity-50" data-testid="cc-submit">
        {m.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} إرسال الشكوى
      </button>
      <style>{`.input{width:100%;border-radius:.75rem;border:1px solid #cbd5e1;padding:.75rem;font-size:1rem;outline:none;background:#fff}.input:focus{border-color:#0e6ab3;box-shadow:0 0 0 3px #dbeafe}`}</style>
    </form>
  )
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="mb-2 text-sm font-black">{label}</p>{children}{hint && <p className="mt-2 text-[11px] text-slate-500">{hint}</p>}</div>
}

// ─────────── شكاواي ───────────
function MyComplaints({ token, onNew }: { token: string; onNew: () => void }) {
  const { data = [], isLoading } = useMyComplaints(token)
  const qc = useQueryClient()
  const rate = useMutation({ mutationFn: (v: { id: string; stars: number }) => citizen.rateComplaint(token, v.id, v.stars), onSuccess: () => void qc.invalidateQueries({ queryKey: citizenKeys.mine(token) }) })
  return (
    <section className="space-y-4" data-testid="citizen-mine">
      <div className="flex items-center justify-between"><h1 className="text-xl font-black text-[#0b4f8a]">شكاواي</h1><button type="button" onClick={onNew} className="rounded-xl bg-[#0b4f8a] px-3 py-2 text-xs font-bold text-white">+ شكوى جديدة</button></div>
      {isLoading && <div className="h-32 animate-pulse rounded-3xl bg-white" />}
      {!isLoading && !data.length && <div className="rounded-3xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">لا توجد شكاوى بعد.</div>}
      {data.map((c) => (
        <article key={c.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="citizen-complaint-card">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-black tracking-wider text-[#0b4f8a]" dir="ltr">{c.ref_no}</p><p className="text-[11px] text-slate-500">{fmt(c.created_at)}</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${STATUS_TONE[c.status]}`}>{c.status_label}</span>
          </div>
          <StatusTrack status={c.status} />
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{c.details}</p>
          {c.status === 'on_hold' && c.hold_reason && <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs"><b>سبب التعليق:</b> {c.hold_reason}</p>}
          {c.status === 'resolved' && c.resolution_note && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><b>نتيجة المعالجة:</b> {c.resolution_note}</p>}
          {c.status === 'resolved' && (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600">{c.citizen_rating ? 'تقييمك:' : 'قيّم المعالجة:'}
              <Stars value={c.citizen_rating ?? 0} onChange={c.citizen_rating ? undefined : (s) => rate.mutate({ id: c.id, stars: s })} />
            </div>
          )}
          <details className="mt-3 text-xs"><summary className="cursor-pointer font-bold text-slate-500">سجل المتابعة ({c.events.length})</summary>
            <ol className="mt-2 space-y-1 border-r-2 border-slate-200 pr-3">{c.events.map((e, i) => <li key={i} className="text-slate-600"><span className="text-slate-400">{fmt(e.at)}</span> — {e.kind === 'created' ? 'تم استلام الشكوى' : e.kind === 'assigned' ? 'أُحيلت إلى الجهة المختصة' : e.kind === 'status' ? `الحالة: ${e.to_label}` : e.kind === 'rated' ? `تقييمك ${e.note}` : 'متابعة'}{e.kind === 'status' && e.note ? ` — ${e.note}` : ''}</li>)}</ol>
          </details>
        </article>
      ))}
    </section>
  )
}
function StatusTrack({ status }: { status: CitizenStatus }) {
  const steps: CitizenStatus[] = ['new', 'in_progress', 'resolved']
  const idx = status === 'on_hold' ? 1 : steps.indexOf(status)
  return (
    <ol className="mt-3 flex items-center gap-1 text-[10px] font-bold">
      {steps.map((s, i) => <li key={s} className="flex flex-1 items-center gap-1"><span className={`h-2 flex-1 rounded-full ${i <= idx ? (status === 'on_hold' && i === 1 ? 'bg-slate-400' : 'bg-[#0e6ab3]') : 'bg-slate-200'}`} /><span className={i <= idx ? 'text-slate-800' : 'text-slate-400'}>{CITIZEN_STATUS_LABEL[s]}</span></li>)}
    </ol>
  )
}
function Stars({ value, onChange }: { value: number; onChange?: (s: number) => void }) {
  return <span className="inline-flex gap-0.5" data-testid="stars">{[1, 2, 3, 4, 5].map((s) => <button key={s} type="button" disabled={!onChange} onClick={() => onChange?.(s)} aria-label={`${s} نجوم`} className="disabled:cursor-default"><Star size={20} className={s <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} /></button>)}</span>
}

// ─────────── الدعم الفني ───────────
function Support({ token }: { token: string }) {
  const qc = useQueryClient()
  const { data: chat, isLoading } = useCitizenChat(token, true)
  const [text, setText] = useState(''); const [note, setNote] = useState(''); const [rated, setRated] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)
  const inv = () => void qc.invalidateQueries({ queryKey: citizenKeys.chat(token) })
  const request = useMutation({ mutationFn: () => citizen.chatRequest(token), onSuccess: inv })
  const send = useMutation({ mutationFn: (b: string) => citizen.chatSend(token, b), onSuccess: () => { setText(''); inv() } })
  const close = useMutation({ mutationFn: () => citizen.chatClose(token), onSuccess: inv })
  const rate = useMutation({ mutationFn: (v: { stars: number; note: string }) => citizen.chatRate(token, chat!.id, v.stars, v.note), onSuccess: inv })
  const msgCount = chat?.messages.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [msgCount])
  const open = chat && chat.status !== 'closed'

  return (
    <section className="space-y-4" data-testid="citizen-support">
      <h1 className="text-xl font-black text-[#0b4f8a]">الدعم الفني المباشر</h1>
      {isLoading && <div className="h-32 animate-pulse rounded-3xl bg-white" />}
      {!isLoading && !open && (
        <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <Headset className="mx-auto text-[#0b4f8a]" size={44} />
          <p className="mt-3 text-sm leading-7 text-slate-600">اضغط لطلب محادثة مع فريق الدعم الفني، وسيرد عليك أحد الأعضاء المتاحين.</p>
          <button type="button" onClick={() => request.mutate()} disabled={request.isPending} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#f5b301] px-6 py-3 text-base font-black text-slate-900 shadow disabled:opacity-60" data-testid="chat-request">
            {request.isPending ? <Loader2 className="animate-spin" size={18} /> : <MessageSquareText size={18} />} طلب المحادثة مع فريق الدعم الفني
          </button>
          {request.isError && <p role="alert" className="mt-2 text-xs font-bold text-red-700">{citizenErrorMessage(request.error)}</p>}
          {chat?.status === 'closed' && !chat.rating && (
            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-right ring-1 ring-slate-200" data-testid="chat-rate">
              <p className="text-sm font-black">كيف كانت المحادثة الأخيرة؟ <span className="text-xs font-normal text-slate-500">(اختياري)</span></p>
              <div className="mt-2"><Stars value={rated} onChange={setRated} /></div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="ملاحظة (اختياري)" className="mt-2 w-full rounded-xl border border-slate-300 p-2 text-sm" />
              <button type="button" disabled={!rated || rate.isPending} onClick={() => rate.mutate({ stars: rated, note })} className="mt-2 rounded-xl bg-[#0b4f8a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">إرسال التقييم</button>
            </div>
          )}
          {chat?.status === 'closed' && chat.rating && <p className="mt-4 text-xs font-bold text-emerald-700">شكراً لتقييمك ({chat.rating}/5)</p>}
        </div>
      )}
      {open && chat && (
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200" data-testid="chat-window">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-black">
              <span className={`h-2.5 w-2.5 rounded-full ${chat.status === 'active' ? 'bg-emerald-500' : 'animate-pulse bg-amber-400'}`} />
              {chat.status === 'active' ? `${chat.agent_name ?? 'الدعم الفني'} — متصل` : `بانتظار الرد${chat.queue_position ? ` · دورك ${chat.queue_position}` : ''}`}
            </div>
            <button type="button" onClick={() => close.mutate()} className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50" data-testid="chat-close"><X size={14} /> إنهاء</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
            {chat.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'citizen' ? 'justify-start' : msg.sender === 'agent' ? 'justify-end' : 'justify-center'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm ${msg.sender === 'citizen' ? 'bg-[#0b4f8a] text-white' : msg.sender === 'agent' ? 'bg-white ring-1 ring-slate-200' : 'bg-amber-50 text-[11px] text-amber-900 ring-1 ring-amber-200'}`}>
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p className={`mt-1 text-[10px] ${msg.sender === 'citizen' ? 'text-blue-100' : 'text-slate-400'}`}>{new Date(msg.at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()) }} className="flex items-center gap-2 border-t border-slate-100 p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="اكتب رسالتك…" className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0e6ab3]" data-testid="chat-input" />
            <button type="submit" disabled={!text.trim() || send.isPending} className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b4f8a] text-white disabled:opacity-50" aria-label="إرسال" data-testid="chat-send"><Send size={18} /></button>
          </form>
          {send.isError && <p role="alert" className="px-4 pb-2 text-xs font-bold text-red-700">{citizenErrorMessage(send.error)}</p>}
        </div>
      )}
    </section>
  )
}

// ─────────── نبذة وتواصل ───────────
function About() {
  const { data: info } = useCitizenInfo()
  return (
    <section className="space-y-4" data-testid="citizen-about">
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="bg-gradient-to-l from-[#0b4f8a] to-[#0e6ab3] p-6 text-white">
          <img src="/icons/logo.png" alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5" />
          <h1 className="mt-3 text-2xl font-black">{info?.org_name ?? 'شركة جزيرة الأكارم'}</h1>
        </div>
        <p className="whitespace-pre-wrap p-5 text-sm leading-8 text-slate-700">{info?.about}</p>
      </div>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-2 text-base font-black"><Phone size={18} className="text-[#0b4f8a]" /> أرقام التواصل</h2>
        {!info?.phones?.length && <p className="mt-2 text-sm text-slate-500">ستُضاف أرقام التواصل قريباً — يمكنك استخدام الدعم الفني المباشر.</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {info?.phones?.map((p, i) => <li key={i} className="flex items-center justify-between py-2 text-sm"><span className="font-bold">{p.label}</span><a href={`tel:${p.number}`} dir="ltr" className="font-black text-[#0b4f8a]">{p.number}</a></li>)}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Clock size={14} /> {info?.hours}</p>
        {info?.address && <p className="mt-1 flex items-center gap-2 text-xs text-slate-600"><MapPin size={14} /> {info.address}</p>}
      </div>
    </section>
  )
}
