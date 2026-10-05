/**
 * 00174 — ① عناوين خوادم ADMS التي يديرها IT (الدالة مباشرة أو وسطاء) تُعرض للفنيين داخل الإرشادات
 *         ② أجهزة اتصلت بعنواننا ولم تُسجَّل — تسجيل بنقرة واحدة (SN مُعبّأ مسبقاً)
 */
import { useState } from 'react'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { formatRelative } from '@lib/utils/date.utils'
import { useAddAdmsEndpoint, useAdmsEndpoints, useRemoveAdmsEndpoint, useUnregisteredDevices } from '@features/integrations'

export function AdmsEndpointsList({ functionUrl }: { functionUrl: string }) {
  const { data } = useAdmsEndpoints()
  const add = useAddAdmsEndpoint()
  const remove = useRemoveAdmsEndpoint()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [host, setHost] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const list = data ?? []

  const submit = async () => {
    setErr(null)
    const h = host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    if (!label.trim() || !/^[a-z0-9.-]+(:\d+)?$/i.test(h)) { setErr('أدخل تسمية ونطاقاً صالحاً مثل akaram-bio.example.workers.dev'); return }
    try { await add.mutateAsync({ label, host: h }); setLabel(''); setHost(''); setOpen(false) }
    catch (e) { setErr((e as { message?: string })?.message?.includes('duplicate') ? 'العنوان مسجّل مسبقاً' : 'تعذر الحفظ') }
  }

  return (
    <div className="mt-2" data-testid="adms-endpoints">
      <p className="text-[11px] font-bold text-brand-800">العناوين المعتمدة (أيٌّ منها يعمل — Cloud Server Address في الجهاز بدون https:// والمنفذ 443 وتفعيل HTTPS):</p>
      <ul className="mt-1 space-y-1">
        <li className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-[11px]">
          <span className="text-slate-600">الدالة مباشرة (Supabase)</span>
          <code dir="ltr" className="truncate text-brand-700" data-testid="adms-url">{functionUrl}</code>
        </li>
        {list.map((ep) => (
          <li key={ep.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-[11px]" data-testid={`adms-endpoint-${ep.host}`}>
            <span className="text-slate-600">{ep.label}</span>
            <span className="flex items-center gap-2">
              <code dir="ltr" className="text-brand-700">{ep.host}</code>
              <button type="button" className="text-red-500 hover:underline" onClick={() => remove.mutate(ep.id)} aria-label={`حذف ${ep.label}`} data-testid={`adms-endpoint-remove-${ep.host}`}>حذف</button>
            </span>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]" data-testid="adms-endpoint-form">
          <input className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs" placeholder="التسمية (مثل: وسيط Deno)" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="adms-endpoint-label" />
          <input dir="ltr" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs" placeholder="akaram-bio.example.workers.dev" value={host} onChange={(e) => setHost(e.target.value)} data-testid="adms-endpoint-host" />
          <div className="flex gap-2">
            <Button size="sm" isLoading={add.isPending} onClick={() => void submit()} data-testid="adms-endpoint-save">حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
          {err && <p role="alert" className="text-[11px] text-red-600 sm:col-span-3">{err}</p>}
        </div>
      ) : (
        <button type="button" className="mt-1.5 text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => setOpen(true)} data-testid="adms-endpoint-add">
          + إضافة عنوان وسيط (Cloudflare / Deno …)
        </button>
      )}
    </div>
  )
}

export function UnregisteredDevicesPanel({ onRegister }: { onRegister: (sn: string) => void }) {
  const { data } = useUnregisteredDevices()
  const list = data ?? []
  if (list.length === 0) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" data-testid="unregistered-devices">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-amber-900">
        <Icon name="alert-triangle" size={16} /> أجهزة اتصلت بالمنصة ولم تُسجَّل ({list.length})
      </h2>
      <p className="mb-2 text-[11px] text-amber-800">
        هذه الأرقام التسلسلية تطرق عنواننا (غالباً أجهزة فروع أخرى موجّهة إلى الخادم نفسه). سجّلها لتبدأ بصماتها بالوصول — وحتى ذلك الحين تُرفض طلباتها ولا تُفقد البيانات لأنها تبقى في ذاكرة الجهاز.
      </p>
      <ul className="divide-y divide-amber-100 rounded-xl bg-white">
        {list.map((u) => (
          <li key={u.serial_number} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs" data-testid={`unregistered-${u.serial_number}`}>
            <span className="flex items-center gap-3">
              <code dir="ltr" className="font-bold text-slate-800">{u.serial_number}</code>
              <span className="text-[11px] text-slate-500">آخر محاولة {formatRelative(u.last_seen)} · {u.attempts} محاولة</span>
            </span>
            <Button size="sm" onClick={() => onRegister(u.serial_number)} data-testid={`register-unregistered-${u.serial_number}`}>تسجيل الجهاز</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
