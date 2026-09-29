/**
 * بوابة المتعهد — حضورية العمال.
 * الخطوات بالترتيب: (1) موقعي تلقائياً (2) صورة سلفي (3) صورة العمال → «تسجيل الحضور» → ثم حاضر/غائب أمام كل عامل.
 * الموقع لا يمنع التسجيل لكنه يُقيَّم داخل/خارج نطاق المنطقة لغرفة العمليات.
 */
import { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, MapPin, RefreshCw, UserCheck, UserX, Users } from 'lucide-react'
import { useContractorCheckin, useContractorMe, useContractorPhotoUrl, useContractorWorkers, useMarkAll, useMarkAttendance } from '@features/contractors/hooks'
import { timeAr, zoneLabel } from '@features/contractors/format'
import { CameraCapture, cameraSupported } from '@features/contractors/components/CameraCapture'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

type Geo = { latitude: number; longitude: number; accuracy: number | null }
function useGeolocation() {
  const [geo, setGeo] = useState<Geo | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setError('المتصفح لا يدعم تحديد الموقع'); return }
    setBusy(true); setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setGeo({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? null }); setBusy(false) },
      (e) => { setError(e.code === 1 ? 'رفضت إذن الموقع — فعّله من إعدادات المتصفح' : 'تعذّر تحديد الموقع، حاول مجدداً'); setBusy(false) },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }
  useEffect(() => { locate() }, [])
  return { geo, error, busy, locate }
}

function PhotoStep({ n, title, hint, file, onFile, facing, testId }: { n: number; title: string; hint: string; file: File | null; onFile: (f: File | null) => void; facing: 'user' | 'environment'; testId: string }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const [open, setOpen] = useState(false)
  const live = cameraSupported()
  return (
    <div className={`rounded-2xl border p-3 ${file ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`} data-testid={`${testId}-step`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-black"><span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">{n}</span>{title}</div>
        {file && <CheckCircle2 size={18} className="text-emerald-600" />}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      {live ? (
        <button type="button" onClick={() => setOpen(true)} data-testid={`${testId}-open`} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700">
          <Camera size={16} />{file ? 'إعادة التقاط' : 'التقاط الصورة'}
        </button>
      ) : (
        <label className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-700">
          <Camera size={16} />{file ? 'إعادة التقاط' : 'التقاط الصورة'}
          <input data-testid={testId} type="file" accept="image/*" capture={facing} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {open && <CameraCapture facing={facing} title={title} testId={testId} onCapture={onFile} onClose={() => setOpen(false)} />}
      {preview && <img src={preview} alt={title} className="mt-2 max-h-40 w-full rounded-xl object-cover" />}
    </div>
  )
}

function Photo({ path, label }: { path: string | null; label: string }) {
  const url = useContractorPhotoUrl(path)
  if (!path) return null
  return url.data ? <img src={url.data} alt={label} className="h-24 w-24 rounded-xl object-cover" /> : <div className="h-24 w-24 animate-pulse rounded-xl bg-slate-100" />
}

export default function ContractorAttendancePage() {
  const me = useContractorMe(), workers = useContractorWorkers(), checkin = useContractorCheckin(), mark = useMarkAttendance(), markAll = useMarkAll()
  const { geo, error: geoError, busy, locate } = useGeolocation()
  const [selfie, setSelfie] = useState<File | null>(null), [team, setTeam] = useState<File | null>(null)
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="راجع التطوير المركزية" />
  const m = me.data
  const canSubmit = Boolean(geo && selfie && team) && !checkin.isPending
  const submit = () => {
    if (!geo || !selfie || !team) return
    checkin.mutate({ latitude: geo.latitude, longitude: geo.longitude, accuracy: geo.accuracy, selfie, teamPhoto: team }, { onSuccess: () => { setSelfie(null); setTeam(null) } })
  }
  const list = workers.data ?? []
  const unmarked = list.filter((w) => !w.status).length
  return (
    <div className="space-y-4" data-testid="contractor-attendance">
      <header className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-black">حضورية العمال</h1>
        <p className="text-xs text-slate-500">منطقة {m.area_name} · اليوم {m.today}</p>
      </header>

      {!m.checked_in_today ? (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="checkin-form">
          <h2 className="font-black text-amber-900">أولاً: سجّل حضورك أنت</h2>
          <div className={`rounded-2xl border p-3 ${geo ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`} data-testid="geo-step">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black"><span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">1</span><MapPin size={16} />موقعك الحالي</div>
              {geo && <CheckCircle2 size={18} className="text-emerald-600" />}
            </div>
            <p className="mt-1 text-[11px] text-slate-600" data-testid="geo-text">
              {busy ? 'جارٍ تحديد الموقع…' : geo ? `تم التقاط الموقع (دقة ≈ ${Math.round(geo.accuracy ?? 0)} م)` : geoError ?? 'لم يُحدَّد بعد'}
            </p>
            <button type="button" onClick={locate} className="mt-2 inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1 text-xs font-bold" data-testid="geo-retry"><RefreshCw size={12} />إعادة تحديد الموقع</button>
          </div>
          <PhotoStep n={2} title="صورتك (سلفي)" hint="بالكاميرا الأمامية — تُرسل إلى غرفة العمليات" file={selfie} onFile={setSelfie} facing="user" testId="selfie-input" />
          <PhotoStep n={3} title="صورة العمال" hint="صورة جماعية للعمال الحاضرين في الموقع الآن" file={team} onFile={setTeam} facing="environment" testId="team-input" />
          <button type="button" disabled={!canSubmit} onClick={submit} data-testid="checkin-submit" className="h-12 w-full rounded-xl bg-emerald-600 text-base font-black text-white disabled:opacity-40">
            {checkin.isPending ? 'جارٍ الإرسال…' : 'تسجيل الحضور'}
          </button>
          {!canSubmit && !checkin.isPending && (
            <p className="text-center text-[11px] font-bold text-amber-800" data-testid="checkin-missing">
              يلزم: {[!geo && 'الموقع', !selfie && 'صورتك', !team && 'صورة العمال'].filter(Boolean).join('، ')}
            </p>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" data-testid="checkin-done">
          <div className="flex-1 text-sm">
            <div className="font-black text-emerald-800">✓ سجّلت حضورك الساعة {timeAr(m.checkin_at)}</div>
            <div className="mt-1 inline-flex items-center gap-1 text-emerald-900"><MapPin size={14} /><span data-testid="zone-label">{zoneLabel(m.in_zone, m.zone_defined)}</span></div>
          </div>
          <div className="flex gap-2"><Photo path={m.selfie_path} label="سلفي" /><Photo path={m.team_photo_path} label="العمال" /></div>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="workers-attendance">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-black"><Users size={18} />العمال ({list.length})
            {unmarked > 0 && m.checked_in_today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800" data-testid="unmarked-badge">{unmarked} بلا تسجيل</span>}
          </h2>
          {m.checked_in_today && list.length > 0 && (
            <button type="button" onClick={() => markAll.mutate({ status: 'present' })} data-testid="mark-all-present" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">تعليم الجميع حاضرين</button>
          )}
        </div>
        {!m.checked_in_today && <p className="mb-2 rounded-xl bg-slate-50 p-2 text-[11px] font-bold text-slate-600" data-testid="locked-note">تسجيل حضور العمال يُفتح بعد تسجيل حضورك أعلاه.</p>}
        {workers.isLoading ? <LoadingSpinner /> : !list.length ? <p className="text-sm text-slate-500">لا عمال في فريقك — أضفهم من «فريقي».</p> : (
          <ul className="divide-y">
            {list.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-2" data-testid={`att-${w.id}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{i + 1}. {w.full_name}</div>
                  <div className="text-[11px] text-slate-500">{w.status === 'present' ? `حاضر · ${timeAr(w.marked_at)}` : w.status === 'absent' ? `غائب · ${timeAr(w.marked_at)}` : 'لم يُسجَّل بعد'}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" disabled={!m.checked_in_today || mark.isPending} onClick={() => mark.mutate({ workerId: w.id, status: 'present' })} data-testid={`present-${w.id}`}
                    className={`inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-black disabled:opacity-40 ${w.status === 'present' ? 'bg-emerald-600 text-white' : 'border border-emerald-300 text-emerald-800'}`}><UserCheck size={14} />حاضر</button>
                  <button type="button" disabled={!m.checked_in_today || mark.isPending} onClick={() => mark.mutate({ workerId: w.id, status: 'absent' })} data-testid={`absent-${w.id}`}
                    className={`inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-black disabled:opacity-40 ${w.status === 'absent' ? 'bg-rose-600 text-white' : 'border border-rose-300 text-rose-800'}`}><UserX size={14} />غائب</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
