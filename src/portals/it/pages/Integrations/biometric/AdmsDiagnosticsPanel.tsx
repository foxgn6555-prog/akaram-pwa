/**
 * تشخيص اتصال جهاز ADMS (00173) — يجيب خلال ثوانٍ عن: أين يتوقف الاتصال؟
 *   ① اختبار من المتصفح: هل تستقبل المنصة (رابط الدالة)؟ هل يوصل الوسيط/العنوان المُدخل في الجهاز؟
 *      (طلب تسجيل وهمي بـ SN=PLATFORM-TEST — لا يُنشئ شيئاً في قاعدة البيانات)
 *   ② من قاعدة البيانات: تسجيل الجهاز، النبض الدوري، البصمات الواصلة، الأسماء، غير المطابَق — مع أوقات وتلميحات
 *   ③ آخر الأحداث المسجّلة لهذا الجهاز
 * يُحدَّث كل 10 ثوانٍ تلقائياً ما دامت اللوحة مفتوحة.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useBiometricDiagnostics, useUpdateBiometricDevice } from '@features/integrations'
import type { BiometricDevice, DiagStatus } from '@features/integrations'
import { formatDateTime, formatRelative } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { normalizeProbeBase, probeAdmsEndpoint, type ProbeResult } from './adms-probe'

const TONE: Record<DiagStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  fail: 'bg-rose-50 text-rose-700 border-rose-200',
}
const ICON: Record<DiagStatus, string> = { ok: '✓', warn: '!', fail: '✕' }

function Row({ status, label, detail, at, testId }: { status: DiagStatus; label: string; detail?: string | null; at?: string | null; testId: string }) {
  return (
    <li className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', TONE[status])} data-testid={testId} data-status={status}>
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-black">{ICON[status]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}{at ? <span className="ms-2 font-normal opacity-80">· {formatRelative(at)}</span> : null}</p>
        {detail && <p className="mt-0.5 leading-5 opacity-90">{detail}</p>}
      </div>
    </li>
  )
}

export function AdmsDiagnosticsPanel({ device, functionUrl }: { device: BiometricDevice; functionUrl: string }) {
  const { data, isLoading, error, refetch, isFetching } = useBiometricDiagnostics(device.id)
  const update = useUpdateBiometricDevice()
  const [publicUrl, setPublicUrl] = useState(device.public_url ?? '')
  const [platform, setPlatform] = useState<ProbeResult | null>(null)
  const [proxy, setProxy] = useState<ProbeResult | null>(null)
  const [probing, setProbing] = useState(false)

  const runProbes = async () => {
    setProbing(true)
    setPlatform(null); setProxy(null)
    const p1 = await probeAdmsEndpoint(functionUrl)
    setPlatform(p1)
    const base = normalizeProbeBase(publicUrl)
    if (base && base !== functionUrl.replace(/\/+$/, '')) setProxy(await probeAdmsEndpoint(base))
    else setProxy(null)
    setProbing(false)
    void refetch()
  }

  const savePublicUrl = async () => {
    const v = publicUrl.trim() || null
    await update.mutateAsync({ id: device.id, public_url: v })
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid={`adms-diag-${device.serial_number}`}>
      {/* ① اختبار المسار من المتصفح */}
      <div className="rounded-lg bg-white p-3">
        <p className="text-xs font-bold text-slate-700">① اختبار المسار من هذا المتصفح</p>
        <p className="mt-0.5 text-[11px] text-slate-500">يرسل طلب تسجيل وهمياً (SN=PLATFORM-TEST) إلى المنصة وإلى العنوان المُدخل في الجهاز — لا يُنشئ أي بيانات.</p>
        <label className="mt-2 block text-[11px] text-slate-600">العنوان المُدخل في الجهاز (مضيف الوسيط أو الرابط الكامل) — اختياري
          <div className="mt-1 flex gap-2">
            <input className="h-9 flex-1 rounded-lg border border-slate-300 px-2 text-xs" dir="ltr" placeholder="akaram-bio.example.workers.dev" value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)} data-testid="diag-public-url" />
            <Button size="sm" variant="secondary" isLoading={update.isPending} onClick={() => void savePublicUrl()} data-testid="diag-save-url"
              disabled={(device.public_url ?? '') === publicUrl.trim()}>حفظ</Button>
          </div>
        </label>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" isLoading={probing} onClick={() => void runProbes()} data-testid="diag-run-probes">اختبر الآن</Button>
          <span className="text-[10px] text-slate-400" dir="ltr">{functionUrl}</span>
        </div>
        {(platform || proxy) && (
          <ul className="mt-2 space-y-1.5">
            {platform && <Row status={platform.status} label="المنصة تستقبل بروتوكول ADMS (رابط الدالة)" detail={platform.detail} testId="probe-platform" />}
            {proxy && <Row status={proxy.status} label="العنوان المُدخل في الجهاز يوصل إلى المنصة" detail={proxy.detail} testId="probe-proxy" />}
          </ul>
        )}
      </div>

      {/* ② حالة الجهاز من قاعدة البيانات */}
      <div className="rounded-lg bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700">② ما وصل من الجهاز فعلاً</p>
          <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => void refetch()} data-testid="diag-refresh">
            {isFetching ? 'يُحدَّث…' : 'تحديث'}
          </button>
        </div>
        {isLoading ? <LoadingSpinner /> : error ? (
          <p className="mt-2 text-xs text-rose-700" data-testid="diag-error">تعذّر تحميل التشخيص: {(error as Error).message}</p>
        ) : data ? (
          <>
            <ul className="mt-2 space-y-1.5" data-testid="diag-checks">
              {data.checks.map((c) => (
                <Row key={c.key} status={c.status} testId={`diag-check-${c.key}`}
                  label={`${c.label}${typeof c.count === 'number' ? ` — ${c.count}` : ''}${typeof c.count_24h === 'number' ? ` (آخر 24 ساعة: ${c.count_24h})` : ''}`}
                  at={c.at ?? null} detail={c.hint ?? (c.last_punch_at ? `آخر بصمة بتوقيت الجهاز: ${formatDateTime(c.last_punch_at)}` : null)} />
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-400" dir="ltr">
              SN {data.serial_number} · UTC{data.timezone_offset ?? '+03:00'} · heartbeats {data.heartbeat_count} · server {formatDateTime(data.server_time)}
            </p>
          </>
        ) : null}
      </div>

      {/* ③ آخر الأحداث */}
      {data && data.events.length > 0 && (
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs font-bold text-slate-700">③ آخر الأحداث المسجّلة لهذا الجهاز</p>
          <ul className="mt-2 divide-y divide-slate-100 text-[11px]" data-testid="diag-events">
            {data.events.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate" dir="ltr">
                  <span className={clsx('me-1 font-bold', ev.status === 'success' ? 'text-emerald-600' : 'text-rose-600')}>{ev.status === 'success' ? '✓' : '✕'}</span>
                  {ev.endpoint}
                  {typeof ev.payload.cmd === 'string' ? ` · ${ev.payload.cmd}` : ''}
                  {typeof ev.payload.users === 'number' ? ` · users=${ev.payload.users}` : ''}
                  {typeof ev.payload.converted === 'number' ? ` · punches=${ev.payload.converted}` : ''}
                  {ev.payload.known === false ? ' · SN غير مسجّل' : ''}
                  {ev.error ? ` · ${ev.error}` : ''}
                </span>
                <span className="shrink-0 text-slate-400">{formatRelative(ev.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
