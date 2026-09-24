/**
 * لوحة «وكيل الشبكة الداخلية» (zk_bridge) لمصدر بصمة — بوابة التطوير المركزية.
 *   · توليد/تدوير مفتاح الجهاز (يُعرض مرة واحدة فقط ثم يُحفظ مجزأً).
 *   · مقتطف config.json جاهز للنسخ + خطوات التشغيل.
 *   · حالة الوكيل: آخر اتصال وآخر خطأ أبلغ عنه.
 */
import { useState } from 'react'
import { useRotateBridgeKey } from '@features/integrations'
import type { BiometricDevice } from '@features/integrations'
import { BIOMETRIC_ERROR_MESSAGES } from '@sdk/biometric.sdk'
import { formatRelative } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { bridgeConfigSnippet } from './source-config.utils'

export function BridgePanel({ device, supabaseUrl }: { device: BiometricDevice; supabaseUrl: string }) {
  const rotate = useRotateBridgeKey()
  const [key, setKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<'key' | 'config' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const copy = async (what: 'key' | 'config', text: string) => {
    try { await navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500) } catch { /* بيئة بلا حافظة */ }
  }
  const generate = () => {
    setErr(null)
    rotate.mutate(device.id, {
      onSuccess: setKey,
      onError: (e) => { const m = e instanceof Error ? e.message : String(e); setErr(BIOMETRIC_ERROR_MESSAGES[m] ?? m) },
    })
  }
  const agentSeen = device.bridge_last_seen_at
  const agentOk = agentSeen && !device.bridge_last_error && Date.now() - new Date(agentSeen).getTime() < 30 * 60_000

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3" data-testid={`bridge-panel-${device.serial_number}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
          <Icon name="activity" size={14} /> وكيل الشبكة الداخلية
        </p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600" data-testid="bridge-status">
          {agentSeen
            ? (agentOk ? `✓ الوكيل متصل · ${formatRelative(agentSeen)}` : `الوكيل آخر مرة ${formatRelative(agentSeen)}`)
            : 'الوكيل لم يتصل بعد'}
        </span>
      </div>
      {device.bridge_last_error && (
        <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700" dir="ltr" data-testid="bridge-last-error">
          {device.bridge_last_error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={device.bridge_key_prefix ? 'secondary' : 'primary'} isLoading={rotate.isPending}
          onClick={generate} data-testid="bridge-rotate-key">
          <Icon name="lock" size={14} />
          {device.bridge_key_prefix && !key ? 'تدوير المفتاح' : 'توليد مفتاح الجهاز'}
        </Button>
        {device.bridge_key_prefix && !key && (
          <span className="text-[11px] text-slate-600" dir="ltr" data-testid="bridge-key-prefix">{device.bridge_key_prefix}…</span>
        )}
        {err && <p role="alert" className="text-[11px] font-semibold text-red-600" data-testid="bridge-error">{err}</p>}
      </div>

      {key && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5" data-testid="bridge-key-reveal">
          <p className="text-[11px] font-bold text-amber-800">انسخ المفتاح الآن — لن يُعرض مرة أخرى (يُحفظ مجزأً). التدوير يُبطل المفتاح القديم فوراً.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-[11px]" dir="ltr" data-testid="bridge-key-value">{key}</code>
            <Button size="sm" variant="ghost" onClick={() => void copy('key', key)} data-testid="bridge-copy-key">{copied === 'key' ? 'نُسخ ✓' : 'نسخ'}</Button>
          </div>
        </div>
      )}

      <details className="rounded-lg bg-white p-2.5 text-[11px] leading-5 text-slate-700">
        <summary className="cursor-pointer font-bold text-indigo-800">خطوات التشغيل داخل شبكة الجهة</summary>
        <ol className="mt-1.5 list-decimal space-y-1 ps-4">
          <li>على أي حاسوب يرى الجهاز (نفس الشبكة، منفذ 4370) ثبّت Node.js 18+، وانسخ مجلد <code dir="ltr">tools/zk-bridge</code> من المستودع ثم <code dir="ltr">npm install</code>.</li>
          <li>أنشئ <code dir="ltr">config.json</code> بالمقتطف أدناه (عدّل IP الجهاز وComm Key إن كان مضبوطاً).</li>
          <li>اختبر: <code dir="ltr">npm run test-device</code> — يجب أن يطبع عدد السجلات في ذاكرة الجهاز.</li>
          <li>شغّله دائماً: <code dir="ltr">npm start</code> (أو <code dir="ltr">npm run once</code> من مجدول ويندوز/cron كل 5 دقائق).</li>
          <li>النتائج تظهر في «سجل العمليات» هنا بنمط zk_bridge، والبصمات في دفتر الموارد البشرية.</li>
        </ol>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold">config.json</span>
          <Button size="sm" variant="ghost" onClick={() => void copy('config', bridgeConfigSnippet(device, key, supabaseUrl))} data-testid="bridge-copy-config">
            {copied === 'config' ? 'نُسخ ✓' : 'نسخ المقتطف'}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[10px] leading-4 text-slate-100" dir="ltr" data-testid="bridge-config-snippet">
          {bridgeConfigSnippet(device, key, supabaseUrl)}
        </pre>
      </details>
    </div>
  )
}
