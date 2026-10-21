/**
 * بوابة المتعهد — إثبات التواجد والعدد (00258).
 * الخطوات بالترتيب: (1) موقعي تلقائياً (2) صورة سلفي (3) صورة العمال (4) العدد (يشمل المتعهد نفسه) → «إثبات التواجد وتسجيل العدد».
 * بعدها يمكن تعديل العدد حتى نهاية اليوم نفسه (بغداد). لا قائمة عمال ولا حاضر/غائب.
 * إثبات التواجد ليس حضوراً وظيفياً (حضور المتعهد الرسمي بالبصمة) — هو دليل أنه في موقعه وزونه، ويُقيَّم داخل/خارج النطاق لغرفة العمليات.
 */
import { useEffect, useMemo, useState } from 'react'
import { requestGeolocation } from '@lib/device-permissions'
import { PermissionPanel } from '@components/ui/PermissionPanel/PermissionPanel'
import { Camera, CheckCircle2, Info, MapPin, RefreshCw, Users } from 'lucide-react'
import { ArchiveAwarePhoto } from '@features/cold-archive/ArchivedFile'
import { useContractorCheckin, useContractorMe, useContractorPhotoUrl, useSetHeadcount } from '@features/contractors/hooks'
import { timeAr, zoneLabel } from '@features/contractors/format'
import { CameraCapture } from '@features/contractors/components/CameraCapture'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

type Geo = { latitude: number; longitude: number; accuracy: number | null }
function useGeolocation() {
  const [geo, setGeo] = useState<Geo | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [permError, setPermError] = useState<unknown>(null)
  const locate = () => {
    setBusy(true); setError(null)
    requestGeolocation({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
      .then((fix) => { setGeo(fix); setPermError(null) })
      .catch((e: unknown) => { setGeo(null); setError(e instanceof Error ? e.message : 'تعذّر تحديد الموقع، حاول مجدداً'); setPermError(e) })
      .finally(() => setBusy(false))
  }
  useEffect(() => { locate() }, [])
  return { geo, error, busy, locate, permError }
}

function PhotoStep({ n, title, hint, file, onFile, facing, testId }: { n: number; title: string; hint: string; file: File | null; onFile: (f: File | null) => void; facing: 'user' | 'environment'; testId: string }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border p-3 ${file ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`} data-testid={`${testId}-step`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-black"><span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">{n}</span>{title}</div>
        {file && <CheckCircle2 size={18} className="text-emerald-600" />}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      <button type="button" onClick={() => setOpen(true)} data-testid={`${testId}-open`} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700">
        <Camera size={16} />{file ? 'إعادة التقاط' : 'التقاط الصورة'}
      </button>
      {open && <CameraCapture facing={facing} title={title} testId={testId} onCapture={onFile} onClose={() => setOpen(false)} />}
      {preview && <img src={preview} alt={title} className="mt-2 max-h-40 w-full rounded-xl object-cover" />}
    </div>
  )
}

function Photo({ path, label }: { path: string | null; label: string }) {
  const url = useContractorPhotoUrl(path)
  if (!path) return null
  return <ArchiveAwarePhoto bucket="contractor-photos" path={path} url={url.data} missing={url.isError} alt={label} className="h-24 w-24 overflow-hidden rounded-xl object-cover" compact
    fallback={<div className="h-24 w-24 animate-pulse rounded-xl bg-slate-100" />} />
}

/** ملاحظة ثابتة: العدد يشمل المتعهد؛ إثبات التواجد ليس البصمة */
export function HeadcountNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[12px] leading-5 text-sky-900" data-testid="headcount-note">
      <Info size={16} className="mt-0.5 shrink-0" />
      <div>
        <b>العدد الذي تكتبه يشملك أنت.</b> مثال: أنت و14 عاملاً ⇒ اكتب <b>15</b>. يمكنك تعديل العدد حتى نهاية اليوم فقط، وبعدها يُقفل ولا يُصحَّح إلا من غرفة العمليات بسبب مسجّل.
        <br />إثبات التواجد (الموقع والصور) <b>ليس حضورك الوظيفي</b> — حضورك الرسمي يُحتسب بالبصمة؛ هو دليل وجودك في منطقتك وتُقيَّم به داخل/خارج النطاق لغرفة العمليات.
      </div>
    </div>
  )
}

const parseCount = (v: string) => (/^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : null)

export default function ContractorAttendancePage() {
  const me = useContractorMe(), checkin = useContractorCheckin(), setCount = useSetHeadcount()
  const { geo, error: geoError, busy, locate, permError } = useGeolocation()
  const [selfie, setSelfie] = useState<File | null>(null), [team, setTeam] = useState<File | null>(null)
  const [count, setCountInput] = useState(''), [edit, setEdit] = useState('')
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="راجع التطوير المركزية" />
  const m = me.data
  const n = parseCount(count)
  const canSubmit = Boolean(geo && selfie && team) && n !== null && n >= 1 && !checkin.isPending && !m.month_locked
  const submit = () => {
    if (!geo || !selfie || !team || n === null || n < 1) return
    checkin.mutate({ latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy, selfie, teamPhoto: team, headcount: n }, { onSuccess: () => { setSelfie(null); setTeam(null); setCountInput('') } })
  }
  const editN = parseCount(edit)
  return (
    <div className="space-y-4" data-testid="contractor-attendance">
      <ExecPageHeader icon="check-square" title="إثبات التواجد والعدد" subtitle={`منطقة ${m.area_name} · اليوم ${m.today}`} />
      <HeadcountNote />
      {m.month_locked && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800" data-testid="month-locked">اعتمدت غرفة العمليات هذا الشهر — لا يمكن تسجيل أو تعديل الأعداد.</p>}

      {!m.checked_in_today ? (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="checkin-form">
          <h2 className="font-black text-amber-900">أثبِت تواجدك في موقع عملك وسجّل العدد</h2>
          <div className={`rounded-2xl border p-3 ${geo ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`} data-testid="geo-step">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black"><span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">1</span><MapPin size={16} />موقعك الحالي</div>
              {geo && <CheckCircle2 size={18} className="text-emerald-600" />}
            </div>
            <p className="mt-1 text-[11px] text-slate-600" data-testid="geo-text">
              {busy ? 'جارٍ تحديد الموقع…' : geo ? `تم التقاط الموقع (دقة ≈ ${Math.round(geo.accuracy ?? 0)} م)` : geoError ?? 'لم يُحدَّد بعد'}
            </p>
            <button type="button" onClick={locate} className="mt-2 inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1 text-xs font-bold" data-testid="geo-retry"><RefreshCw size={12} />إعادة تحديد الموقع</button>
            {!geo && !busy && <PermissionPanel kind="geolocation" lastError={permError} onGranted={locate} className="mt-2" />}
          </div>
          <PhotoStep n={2} title="صورتك (سلفي)" hint="بالكاميرا الأمامية — تُرسل إلى غرفة العمليات" file={selfie} onFile={setSelfie} facing="user" testId="selfie-input" />
          <PhotoStep n={3} title="صورة العمال" hint="صورة جماعية للعمال الحاضرين في الموقع الآن" file={team} onFile={setTeam} facing="environment" testId="team-input" />
          <div className={`rounded-2xl border p-3 ${n !== null && n >= 1 ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`} data-testid="count-step">
            <div className="flex items-center gap-2 text-sm font-black"><span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">4</span><Users size={16} />العدد اليوم (أنت + العمال)</div>
            <input inputMode="numeric" value={count} onChange={(e) => setCountInput(e.target.value)} placeholder="مثال: 15" data-testid="headcount-input"
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-xl font-black outline-none focus:border-emerald-500" />
            {n !== null && n >= 1 && <p className="mt-1 text-center text-[11px] font-bold text-emerald-800" data-testid="count-hint">= أنت + {n - 1} عاملاً</p>}
          </div>
          <button type="button" disabled={!canSubmit} onClick={submit} data-testid="checkin-submit" className="h-12 w-full rounded-xl bg-emerald-600 text-base font-black text-white disabled:opacity-40">
            {checkin.isPending ? 'جارٍ الإرسال…' : 'إثبات التواجد وتسجيل العدد'}
          </button>
          {!canSubmit && !checkin.isPending && !m.month_locked && (
            <p className="text-center text-[11px] font-bold text-amber-800" data-testid="checkin-missing">
              يلزم: {[!geo && 'الموقع', !selfie && 'صورتك', !team && 'صورة العمال', !(n !== null && n >= 1) && 'العدد (1 فأكثر)'].filter(Boolean).join('، ')}
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" data-testid="checkin-done">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 text-sm">
              <div className="font-black text-emerald-800">✓ أثبتَّ تواجدك في الموقع الساعة {timeAr(m.checkin_at)}</div>
              <div className="mt-1 inline-flex items-center gap-1 text-emerald-900"><MapPin size={14} /><span data-testid="zone-label">{zoneLabel(m.in_zone, m.zone_defined)}</span></div>
            </div>
            <div className="flex gap-2"><Photo path={m.selfie_path} label="سلفي" /><Photo path={m.team_photo_path} label="العمال" /></div>
          </div>
          <div className="rounded-2xl border bg-white p-3" data-testid="today-count">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black">العدد المسجّل اليوم</span>
              <b className="text-2xl text-emerald-800" data-testid="today-headcount">{m.today_headcount ?? '—'}</b>
            </div>
            <p className="text-[11px] text-slate-500">يشملك أنت · عمال: {Math.max(0, (m.today_headcount ?? 0) - 1)}</p>
            {!m.month_locked && (
              <div className="mt-2 flex gap-2">
                <input inputMode="numeric" value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="عدد جديد" data-testid="headcount-edit"
                  className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-center font-black outline-none focus:border-emerald-500" />
                <button type="button" disabled={editN === null || editN < 1 || setCount.isPending} onClick={() => setCount.mutate({ headcount: editN as number }, { onSuccess: () => setEdit('') })} data-testid="headcount-save"
                  className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-40">تعديل العدد</button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
