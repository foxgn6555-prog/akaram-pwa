/** بطاقة «مشاركة الموقع المباشر» (00286) — مشتركة بين بوابتي مسؤول القسم والمتعهد */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useLiveShare } from './useLiveShare'
import { DENY_TEXT, agoText, minutesLeft } from './live-share.logic'
import { PermissionPanel } from '@components/ui/PermissionPanel/PermissionPanel'

const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' }) : '—')

export function LiveShareCard({ compact = false }: { compact?: boolean }) {
  const { status, enabled, busy, lastPing, lastError, permError, start } = useLiveShare()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const s = status.data
  if (status.isLoading || !s) return <section className="rounded-2xl border bg-white p-4" data-testid="live-share-card"><LoadingSpinner label="جارٍ التحقق من حالة الشفت…" /></section>

  const deny = !s.allowed && s.reason ? DENY_TEXT[s.reason] : null
  const inZone = lastPing?.in_zone ?? s.last_in_zone
  const left = minutesLeft(s.shift_end, now)
  return (
    <section className={clsx('rounded-2xl border p-4 shadow-sm', enabled ? 'border-emerald-300 bg-emerald-50' : deny ? 'border-slate-200 bg-slate-50' : 'border-sky-200 bg-sky-50')} data-testid="live-share-card" data-state={enabled ? 'on' : deny ? 'denied' : 'ready'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={clsx('relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm', enabled && 'text-emerald-700')}>
            <Icon name="map-pin" size={22} />
            {enabled && <span className="absolute -end-0.5 -top-0.5 size-3 animate-pulse rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden />}
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-900">مشاركة الموقع المباشر</h2>
            {enabled ? (
              <p className="text-[11px] text-emerald-900" data-testid="live-share-on-text">
                تم مشاركة موقعك بنجاح ✅ · آخر تحديث {agoText(lastPing?.recorded_at ?? s.last_seen_at, now)} · {inZone == null ? 'لا زون معرّف لمنطقتك' : inZone ? 'داخل زون عملك' : 'خارج زون عملك'} · يتحدث تلقائياً كل {s.interval_minutes} دقيقة وعند فتح المنصة، ويتوقف بنهاية الشفت
              </p>
            ) : deny ? (
              <p className="text-[11px] text-slate-600" data-testid="live-share-deny"><b>{deny.title}</b> — {deny.hint}</p>
            ) : (
              <p className="text-[11px] text-sky-900">جاهز: شفتك {s.shift_name ?? ''} من {fmtTime(s.shift_start)} إلى {fmtTime(s.shift_end)} · يُرسل موقعك كل {s.interval_minutes} دقيقة والتطبيق مفتوح، ويتوقف تلقائياً بنهاية الشفت.</p>
            )}
            {!compact && s.shift_end && s.allowed && <p className="mt-1 text-[10px] text-slate-500">ينتهي الشفت خلال {left} دقيقة · {s.area_names || '—'}{s.zone_defined ? '' : ' · لا زون معرّف'}</p>}
            {s.reason === 'LIVE_OUTSIDE_SHIFT' && s.shift_start && <p className="mt-1 text-[10px] text-slate-500">شفتك {s.shift_name ?? ''}: {fmtTime(s.shift_start)} – {fmtTime(s.shift_end)}</p>}
            {lastError && <p className="mt-1 text-[11px] font-bold text-rose-700" data-testid="live-share-error">{lastError}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {/* زر واحد ظاهر دائماً: ضغطة واحدة يومياً تكفي، والتحديث بعدها تلقائي (عند فتح المنصة وكل N دقيقة) حتى نهاية الشفت */}
          <button type="button" className={clsx('h-10 rounded-xl px-4 text-xs font-black text-white disabled:opacity-40', enabled ? 'bg-emerald-700' : 'bg-emerald-600')} onClick={() => void start()} disabled={busy || !s.allowed} data-testid="live-share-start">
            {busy ? 'جارٍ تحديد موقعك…' : enabled ? '✓ مشاركة موقعي المباشر' : 'مشاركة موقعي المباشر'}
          </button>
        </div>
      </div>
      {s.allowed && (permError || !enabled) && <PermissionPanel kind="geolocation" lastError={permError} grantedHint="تم السماح — اضغط «مشاركة موقعي المباشر» لبدء المشاركة" className="mt-3" />}
      {!compact && <p className="mt-3 text-[10px] text-slate-500">الخصوصية: ضغطة واحدة يومياً تكفي — لا يُرسل موقعك إلا أثناء شفتك الرسمي وأثناء فتح التطبيق، ويتحدث تلقائياً عند فتح المنصة وكل فترة، ويتوقف نهائياً بانتهاء ساعات شفتك.</p>}
    </section>
  )
}
