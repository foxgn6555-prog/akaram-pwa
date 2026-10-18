/**
 * لوحة إذن الجهاز (00289) — تُظهر حالة إذن الموقع/الكاميرا وتطلبه صراحةً،
 * وعند الرفض تعرض خطوات التفعيل حسب المنصة وزر «تحقق مجدداً». مشتركة بين البوابات.
 */
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { KIND_LABEL, detectPlatform, permErrorCode, permMessage, permissionHelp, queryPermissionState, requestCameraPermission, requestGeolocation, watchPermission, type PermErrorCode, type PermKind, type PermState } from '@lib/device-permissions'

export function useDevicePermission(kind: PermKind) {
  const [state, setState] = useState<PermState>('unknown')
  const refresh = useCallback(async () => { const s = await queryPermissionState(kind); setState(s); return s }, [kind])
  useEffect(() => { void refresh(); return watchPermission(kind, setState) }, [kind, refresh])
  return { state, refresh, setState }
}

const STATE_META: Record<PermState, { label: string; cls: string }> = {
  granted: { label: 'مسموح', cls: 'bg-emerald-100 text-emerald-800' },
  prompt: { label: 'بانتظار إذنك', cls: 'bg-amber-100 text-amber-800' },
  denied: { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800' },
  insecure: { label: 'اتصال غير آمن', cls: 'bg-rose-100 text-rose-800' },
  unsupported: { label: 'غير مدعوم', cls: 'bg-slate-200 text-slate-700' },
  unknown: { label: 'غير معروف', cls: 'bg-slate-100 text-slate-600' },
}

export interface PermissionPanelProps {
  kind: PermKind
  /** خطأ آخر محاولة (إن وُجد) — يُستخرج منه السبب */
  lastError?: unknown
  /** يُستدعى بعد منح الإذن بنجاح */
  onGranted?: () => void
  facing?: 'user' | 'environment'
  className?: string
}

/** يظهر فقط عندما لا يكون الإذن ممنوحاً (أو عند وجود خطأ إذن) */
export function PermissionPanel({ kind, lastError, onGranted, facing = 'environment', className }: PermissionPanelProps) {
  const { state, refresh, setState } = useDevicePermission(kind)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const errCode: PermErrorCode | null = permErrorCode(lastError)
  const effective: PermState = errCode === 'INSECURE' ? 'insecure' : errCode === 'DENIED' && state !== 'granted' ? 'denied' : errCode === 'UNSUPPORTED' ? 'unsupported' : state
  if (effective === 'granted' && !errCode) return null
  const platform = detectPlatform()
  const label = KIND_LABEL[kind]

  const request = async () => {
    setBusy(true); setMsg(null)
    try {
      if (kind === 'geolocation') await requestGeolocation(); else await requestCameraPermission(facing)
      setState('granted'); setMsg(`تم السماح بـ${label} ✅`); onGranted?.()
    } catch (e) {
      const code = permErrorCode(e) ?? 'UNKNOWN'
      setMsg(permMessage(kind, code))
      if (code === 'DENIED') setState('denied'); else if (code === 'INSECURE') setState('insecure')
    } finally { setBusy(false) }
  }
  const recheck = async () => { const s = await refresh(); setMsg(s === 'granted' ? `تم السماح بـ${label} ✅` : s === 'denied' ? `ما زال إذن ${label} مرفوضاً — أكمل الخطوات ثم أعد التحقق` : null); if (s === 'granted') onGranted?.() }
  const meta = STATE_META[effective]
  const showHelp = effective === 'denied' || (errCode !== null && errCode !== 'INSECURE' && errCode !== 'UNSUPPORTED' && effective !== 'granted' && effective !== 'prompt')

  return (
    <div dir="rtl" className={clsx('rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-right', className)} data-testid={`perm-panel-${kind}`} data-state={effective}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black text-slate-900">إذن {label}: <span className={clsx('rounded-full px-2 py-0.5 text-[10px]', meta.cls)} data-testid={`perm-state-${kind}`}>{meta.label}</span></div>
        <div className="flex gap-1.5">
          {(effective === 'prompt' || effective === 'unknown' || effective === 'granted') && (
            <button type="button" onClick={() => void request()} disabled={busy} data-testid={`perm-request-${kind}`} className="h-9 rounded-xl bg-[#0b3d6b] px-3 text-xs font-black text-white disabled:opacity-50">{busy ? 'جارٍ الطلب…' : `السماح بالوصول إلى ${label}`}</button>
          )}
          {(effective === 'denied' || effective === 'unknown') && (
            <button type="button" onClick={() => void recheck()} data-testid={`perm-recheck-${kind}`} className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700">تحقق مجدداً</button>
          )}
        </div>
      </div>
      {effective === 'prompt' && <p className="mt-1 text-[11px] text-slate-700">اضغط الزر ثم اختر «السماح» في نافذة المتصفح التي ستظهر.</p>}
      {effective === 'insecure' && (
        <div className="mt-1 text-[11px] text-rose-800" data-testid="perm-insecure">
          <b>{permMessage(kind, 'INSECURE')}</b>
          <p className="mt-0.5 text-slate-700">المتصفحات تمنع الموقع والكاميرا على أي رابط يبدأ بـ http:// (مثل عنوان شبكة محلية). استخدم الرابط الرسمي https:// للتطبيق.</p>
        </div>
      )}
      {effective === 'unsupported' && <p className="mt-1 text-[11px] text-rose-800">{permMessage(kind, 'UNSUPPORTED')}</p>}
      {showHelp && (
        <ol className="mt-2 list-decimal space-y-0.5 pr-5 text-[11px] text-slate-800" data-testid={`perm-help-${kind}`} data-platform={platform}>
          {permissionHelp(kind, platform).map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      {msg && <p className="mt-2 text-[11px] font-bold text-slate-800" role="status" data-testid={`perm-msg-${kind}`}>{msg}</p>}
    </div>
  )
}
