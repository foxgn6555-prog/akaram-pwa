/**
 * لوحة أوامر جهاز ADMS (00174) — تعمل على مبدأ «الجهاز يسأل والمنصة تجيب»:
 * الجهاز يتصل كل ثانية (getrequest) فنسلّمه الأمر التالي من الطابور، ويؤكد التنفيذ عبر devicecmd.
 *  • سحب بصمات فترة من ذاكرة الجهاز (DATA QUERY ATTLOG) — لأجهزة الفروع التي تتصل متأخرة أو لإعادة السحب
 *  • مزامنة الموظفين (PIN + الاسم) إلى الجهاز (DATA UPDATE USERINFO)
 *  • سجل الأوامر وحالتها
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { formatRelative } from '@lib/utils/date.utils'
import { BIOMETRIC_COMMAND_LABELS, BIOMETRIC_COMMAND_STATUS_LABELS, useBiometricCommands, usePushAllEmployees, useQueryAttlog } from '@features/integrations'
import type { BiometricCommandStatus, BiometricDevice } from '@features/integrations'
import { BIOMETRIC_ERROR_MESSAGES } from '@sdk/biometric.sdk'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const STATUS_CLS: Record<BiometricCommandStatus, string> = {
  queued: 'bg-amber-50 text-amber-700', sent: 'bg-sky-50 text-sky-700', done: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700',
}

function monthRange(offset: number): [string, string] {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))
  return [isoDay(first), isoDay(last)]
}

function errorText(e: unknown): string {
  const code = (e as { code?: string; message?: string })?.code ?? (e as { message?: string })?.message ?? ''
  return BIOMETRIC_ERROR_MESSAGES[code] ?? ({
    BIO_RANGE_INVALID: 'الفترة غير صالحة — «إلى» يجب أن يكون بعد «من»',
    BIO_RANGE_TOO_WIDE: 'الفترة أوسع من 92 يوماً — قسّمها على طلبات',
    BIO_DEVICE_INACTIVE: 'الجهاز معطّل',
    BIO_MODE_NOT_ADMS: 'هذا الأمر لأجهزة ADMS فقط',
    BIO_FORBIDDEN: 'غير مصرّح',
  } as Record<string, string>)[code] ?? (code || 'تعذر تنفيذ الطلب')
}

export function AdmsCommandsPanel({ device: d, online }: { device: BiometricDevice; online: boolean }) {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(isoDay(new Date()))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showLog, setShowLog] = useState(false)
  const query = useQueryAttlog()
  const pushAll = usePushAllEmployees()
  const cmds = useBiometricCommands(d.id, showLog)

  const run = (kind: 'pull' | 'push') => {
    setMsg(null)
    const onError = (e: unknown) => setMsg({ ok: false, text: errorText(e) })
    if (kind === 'pull') {
      query.mutate({ deviceId: d.id, from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` }, {
        onSuccess: () => setMsg({ ok: true, text: online ? 'أُرسل طلب السحب — ستصل البصمات خلال دقيقة وتظهر في دفتر البصمة' : 'حُفظ طلب السحب — سيُنفَّذ تلقائياً عند أول اتصال للجهاز (مناسب لجهاز الشركة الذي يتصل آخر الشهر)' }),
        onError,
      })
    } else {
      pushAll.mutate(d.id, {
        onSuccess: (n) => setMsg({ ok: true, text: n === 0 ? 'لا موظفين نشطين لديهم رقم بصمة رقمي — حدّد «رقم البصمة» في ملف الموظف أولاً' : `أُدرج ${n} موظفاً — سيستلمهم الجهاز ${online ? 'خلال دقيقة' : 'عند أول اتصال'} (الوجه/البصمة تُسجَّل على الجهاز نفسه)` }),
        onError,
      })
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3" data-testid={`adms-commands-${d.serial_number}`}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-brand-800">
        <Icon name="refresh" size={13} /> سحب البيانات من الجهاز وإرسال الموظفين إليه
        <span className="font-normal text-brand-700">— الأوامر تُنفَّذ عند اتصال الجهاز؛ لا تُفقد إن كان غير متصل الآن</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-[11px] text-slate-600">من
          <input type="date" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs" value={from}
            onChange={(e) => setFrom(e.target.value)} data-testid="adms-pull-from" />
        </label>
        <label className="text-[11px] text-slate-600">إلى
          <input type="date" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs" value={to}
            onChange={(e) => setTo(e.target.value)} data-testid="adms-pull-to" />
        </label>
        <Button size="sm" className="self-end" isLoading={query.isPending} data-testid={`adms-pull-${d.serial_number}`} onClick={() => run('pull')}>
          <Icon name="refresh" size={14} /> سحب بصمات الفترة
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
        {([['آخر 7 أيام', [isoDay(new Date(Date.now() - 6 * 86400000)), isoDay(new Date())]], ['الشهر الحالي', monthRange(0)], ['الشهر السابق', monthRange(-1)]] as [string, [string, string]][]).map(([l, [f, t]]) => (
          <button key={l} type="button" className="rounded-full border border-brand-200 bg-white px-2 py-0.5 text-brand-700 hover:bg-brand-50"
            onClick={() => { setFrom(f); setTo(t) }} data-testid={`adms-range-${l}`}>{l}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-brand-100 pt-2.5">
        <Button variant="secondary" size="sm" isLoading={pushAll.isPending} data-testid={`adms-push-all-${d.serial_number}`} onClick={() => run('push')}
          title="يرسل كل الموظفين النشطين الذين لهم رقم بصمة (PIN + الاسم) إلى هذا الجهاز — ثم يُسجَّل الوجه/الإصبع على الجهاز نفسه">
          <Icon name="users" size={14} /> مزامنة الموظفين إلى الجهاز
        </Button>
        <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => setShowLog((v) => !v)} data-testid={`adms-cmd-log-${d.serial_number}`}>
          {showLog ? 'إخفاء سجل الأوامر' : 'سجل الأوامر'}
        </button>
      </div>
      {msg && (
        <p role="status" data-testid="adms-cmd-msg" className={clsx('mt-2 rounded-lg px-3 py-2 text-[11px]', msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
          {msg.text}
        </p>
      )}
      {showLog && (
        <ul className="mt-2 divide-y divide-brand-100 rounded-lg bg-white" data-testid="adms-cmd-list">
          {(cmds.data ?? []).length === 0 && <li className="px-3 py-2 text-[11px] text-slate-400">لا أوامر بعد</li>}
          {(cmds.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
              <span className="font-semibold text-slate-700">
                {BIOMETRIC_COMMAND_LABELS[c.kind]}
                {c.kind === 'update_user' && <span className="ms-1 font-normal text-slate-500" dir="ltr">{/PIN=(\d+)\tName=([^\t]*)/.exec(c.command)?.slice(1).join(' · ')}</span>}
                {c.kind === 'query_attlog' && <span className="ms-1 font-normal text-slate-500" dir="ltr">{/StartTime=(\S+) \S+\tEndTime=(\S+)/.exec(c.command)?.slice(1).join(' → ')}</span>}
              </span>
              <span className="flex items-center gap-2 text-slate-400">
                {c.created_by_name && <span>{c.created_by_name}</span>}
                <span>{formatRelative(c.acked_at ?? c.sent_at ?? c.created_at)}</span>
                <span className={clsx('rounded-full px-2 py-0.5 font-bold', STATUS_CLS[c.status])} title={c.note ?? undefined}>{BIOMETRIC_COMMAND_STATUS_LABELS[c.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
