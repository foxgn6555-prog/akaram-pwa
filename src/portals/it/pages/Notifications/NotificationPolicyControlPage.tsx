import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock3, Edit3, FileSpreadsheet, Plus, ShieldCheck, Trash2, Zap } from 'lucide-react'
import {
  useDeleteWorkflowPolicy,
  useExportPushDeliveries,
  usePushAdminAction,
  usePushBatchRetry,
  usePushDeliveryOperations,
  usePushMetrics,
  usePushDeliveryPage,
  useSaveWorkflowPolicy,
  useWorkflowPolicies,
} from '@features/notifications/hooks/useNotifications'
import type { PushDeliveryRow, WorkflowPolicy, WorkflowPolicyInput } from '@sdk/notifications.sdk'
import type { GpsAlertNotificationPolicy } from '@sdk/gps-lvn.sdk'
import {
  useGpsAlertNotificationPolicies,
  useGpsAlertNotificationPolicySave,
} from '@features/gps-lvn/hooks'
import { sector } from '@sdk/sector.sdk'
const modes = {
  notify_only: {
    label: 'إشعار فقط',
    text: 'تتحرك الآلية فوراً ويُبلّغ الكراج',
    tone: 'bg-emerald-50 text-emerald-800',
  },
  ack_required: {
    label: 'تأكيد استلام',
    text: 'تتحرك فوراً ويبقى تأكيد الكراج مطلوباً',
    tone: 'bg-cyan-50 text-cyan-800',
  },
  approval_required: {
    label: 'موافقة مسبقة',
    text: 'لا ينشأ مسار الصيانة قبل موافقة الكراج',
    tone: 'bg-violet-50 text-violet-800',
  },
}
const deliveryStatusLabels = {
  pending: 'بانتظار الإرسال',
  processing: 'قيد الإرسال',
  sent: 'تم الإرسال',
  failed: 'فشل',
  cancelled: 'ملغى',
}
const categories = [
  ['compactor_small', 'كابسة صغيرة'],
  ['compactor_large', 'كابسة كبيرة'],
  ['truck', 'كميون'],
  ['shovel', 'شفل'],
  ['tipper', 'قلاب'],
  ['tanker', 'تنكر'],
  ['sweeper', 'كناسة'],
  ['strat', 'استرات'],
  ['other', 'أخرى'],
] as const
const recipients = [
  ['central_garage_officer', 'الكراج المركزي'],
  ['maintenance', 'الصيانة'],
  ['ops_room', 'غرفة العمليات'],
  ['it_admin', 'التطوير المركزي'],
  ['super_admin', 'مدير النظام'],
] as const
const empty: WorkflowPolicyInput = {
  sector_id: null,
  vehicle_category: null,
  mode: 'notify_only',
  emergency_bypass: true,
  enabled: true,
  recipient_roles: ['central_garage_officer'],
  in_app_enabled: true,
  push_enabled: true,
  sound_enabled: true,
  escalation_minutes: 15,
  notes: null,
}
export default function NotificationPolicyControlPage() {
  const q = useWorkflowPolicies(),
    pushOps = usePushDeliveryOperations(),
    pushMetrics = usePushMetrics(24),
    sectors = useQuery({ queryKey: ['sectors', 'policy-options'], queryFn: sector.listSectors }),
    save = useSaveWorkflowPolicy(),
    remove = useDeleteWorkflowPolicy(),
    pushAction = usePushAdminAction(),
    batchRetry = usePushBatchRetry(),
    exportAction = useExportPushDeliveries(),
    [editing, setEditing] = useState<{ id: string | null; data: WorkflowPolicyInput } | null>(null),
    [deliveryStatus, setDeliveryStatus] = useState(''),
    [deliveryPlatform, setDeliveryPlatform] = useState(''),
    [deliveryOffset, setDeliveryOffset] = useState(0),
    [pushTarget, setPushTarget] = useState<{
      row: PushDeliveryRow
      action: 'retry_delivery' | 'cancel_delivery' | 'disable_device'
    } | null>(null),
    [pushReason, setPushReason] = useState(''),
    [batchOpen, setBatchOpen] = useState(false),
    [batchReason, setBatchReason] = useState('إعادة محاولة جماعية بعد مراجعة العمليات المتعثرة'),
    deliveries = usePushDeliveryPage({
      hours: 24,
      status: deliveryStatus
        ? (deliveryStatus as 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled')
        : undefined,
      platform: deliveryPlatform
        ? (deliveryPlatform as 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown')
        : undefined,
      offset: deliveryOffset,
    })
  const open = (row?: WorkflowPolicy) =>
    setEditing(
      row
        ? {
            id: row.id,
            data: {
              sector_id: row.sector_id,
              vehicle_category: row.vehicle_category,
              mode: row.mode,
              emergency_bypass: row.emergency_bypass,
              enabled: row.enabled,
              recipient_roles: row.recipient_roles,
              in_app_enabled: row.in_app_enabled,
              push_enabled: row.push_enabled,
              sound_enabled: row.sound_enabled,
              escalation_minutes: row.escalation_minutes,
              notes: row.notes,
            },
          }
        : { id: null, data: { ...empty, recipient_roles: [...empty.recipient_roles] } },
    )
  return (
    <section className="space-y-5" dir="rtl" data-testid="notification-policy-control">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-violet-800 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-violet-200">محرك سياسات مركزي ومدقق</span>
            <h1 className="mt-2 text-2xl font-black">سياسات الإشعارات والانطلاقات</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-200">
              حدد طريقة تنسيق الصيانة حسب المنطقة أو نوع الآلية، مع إبقاء الوضع الافتراضي دون تعطيل
              الميدان.
            </p>
          </div>
          <button
            onClick={() => open()}
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-indigo-950"
          >
            <Plus size={17} />
            سياسة مخصصة
          </button>
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        <Info icon={<Zap />} title="الإعداد الآمن" text="إشعار فقط هو الافتراضي" />
        <Info icon={<ShieldCheck />} title="الحماية" text="الموافقة تُفرض من الخادم" />
        <Info icon={<Clock3 />} title="التصعيد" text="تنبيه تلقائي عند التأخر" />
      </div>
      {pushOps.data && (
        <section className="rounded-3xl border bg-white p-5 shadow-sm" aria-label="حالة تسليم Push">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-black">مراقبة Web Push</h2>
              <p className="mt-1 text-xs text-slate-500">الحالة التشغيلية خلال آخر 24 ساعة</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${pushOps.data.stale_processing || pushOps.data.degraded_devices ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}
            >
              {pushOps.data.stale_processing || pushOps.data.degraded_devices
                ? 'تحتاج متابعة'
                : 'التسليم مستقر'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
            <Small label="الأجهزة الفعالة" value={String(pushOps.data.active_devices)} />
            <Small label="أجهزة متعثرة" value={String(pushOps.data.degraded_devices)} />
            <Small label="بانتظار الإرسال" value={String(pushOps.data.pending)} />
            <Small label="قيد الإرسال" value={String(pushOps.data.processing)} />
            <Small label="تم الإرسال" value={String(pushOps.data.sent)} />
            <Small label="فشل" value={String(pushOps.data.failed)} />
            <Small label="تفاعل المستخدم" value={String(pushOps.data.clicked)} />
            <Small label="عمليات معلقة" value={String(pushOps.data.stale_processing)} />
          </div>
        </section>
      )}
      {(pushMetrics.data?.length ?? 0) > 0 && (
        <section className="rounded-3xl border bg-white p-5 shadow-sm" aria-label="مؤشرات Push الزمنية">
          <h2 className="font-black">اتجاه نجاح وتفاعل Push</h2>
          <p className="mt-1 text-xs text-slate-500">توزيع آخر 24 ساعة ومتوسط محاولات التسليم.</p>
          <div className="mt-5 flex h-40 items-end gap-1 overflow-hidden" dir="ltr">
            {pushMetrics.data?.map((bucket) => {
              const max = Math.max(1, ...pushMetrics.data.map((item) => item.total))
              return (
                <div key={bucket.bucket_start} className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-1" title={`${new Date(bucket.bucket_start).toLocaleTimeString('ar-IQ')} · نجاح ${bucket.success_rate}% · تفاعل ${bucket.interaction_rate}% · محاولات ${bucket.average_attempts}`}>
                  <div className="relative flex h-28 w-full items-end overflow-hidden rounded-t bg-slate-100">
                    <i className="block w-full bg-indigo-500" style={{ height: `${(bucket.sent / max) * 100}%` }} />
                    {bucket.failed > 0 && <i className="absolute bottom-0 left-0 w-full bg-rose-500/80" style={{ height: `${(bucket.failed / max) * 100}%` }} />}
                  </div>
                  <span className="text-[8px] text-slate-400">{new Date(bucket.bucket_start).getHours()}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[11px]"><span><i className="ml-1 inline-block size-2 rounded bg-indigo-500" />تم الإرسال</span><span><i className="ml-1 inline-block size-2 rounded bg-rose-500" />فشل</span></div>
        </section>
      )}
      <section className="rounded-3xl border bg-white p-5 shadow-sm" aria-label="تفاصيل تسليم Push">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">سجل التسليم الآمن</h2>
            <p className="mt-1 text-xs text-slate-500">
              تفاصيل الحالة والمحاولات والمنصة دون عرض عنوان الاشتراك أو مفاتيح الجهاز.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBatchOpen(true)}
              disabled={!deliveries.data?.some((row) => row.status === 'failed' || row.status === 'cancelled')}
              className="h-10 rounded-xl bg-cyan-700 px-3 text-xs font-black text-white disabled:opacity-40"
            >
              إعادة المتعثرة في الصفحة
            </button>
            <button
              onClick={() =>
                exportAction.mutate({
                  hours: 24,
                  status: deliveryStatus
                    ? (deliveryStatus as PushDeliveryRow['status'])
                    : undefined,
                  platform: deliveryPlatform
                    ? (deliveryPlatform as PushDeliveryRow['platform'])
                    : undefined,
                })
              }
              disabled={!(deliveries.data ?? []).length || exportAction.isPending}
              className="flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-40"
            >
              <FileSpreadsheet size={15} /> تصدير Excel
            </button>
            <select
              aria-label="فلتر حالة Push"
              value={deliveryStatus}
              onChange={(event) => {
                setDeliveryStatus(event.target.value)
                setDeliveryOffset(0)
              }}
              className="h-10 rounded-xl border px-2 text-xs"
            >
              <option value="">كل الحالات</option>
              <option value="pending">بانتظار الإرسال</option>
              <option value="processing">قيد الإرسال</option>
              <option value="sent">تم الإرسال</option>
              <option value="failed">فشل</option>
              <option value="cancelled">ملغى</option>
            </select>
            <select
              aria-label="فلتر منصة Push"
              value={deliveryPlatform}
              onChange={(event) => {
                setDeliveryPlatform(event.target.value)
                setDeliveryOffset(0)
              }}
              className="h-10 rounded-xl border px-2 text-xs"
            >
              <option value="">كل المنصات</option>
              <option value="android">Android</option>
              <option value="ios">iPhone/iPad</option>
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
              <option value="unknown">غير محدد</option>
            </select>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-right text-xs">
            <thead className="bg-slate-950 text-white">
              <tr>
                {[
                  'الإشعار',
                  'الجهاز',
                  'الحالة',
                  'المحاولات',
                  'HTTP',
                  'الإرسال',
                  'التفاعل',
                  'الإجراء',
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(deliveries.data ?? []).map((row) => (
                <tr key={row.delivery_id} className="border-b last:border-0">
                  <td className="max-w-64 p-3 font-bold">{row.title}</td>
                  <td className="p-3">{row.device_name ?? row.platform}</td>
                  <td className="p-3">{deliveryStatusLabels[row.status]}</td>
                  <td className="p-3">{row.attempts}</td>
                  <td className="p-3">{row.last_http_status ?? '—'}</td>
                  <td className="p-3">
                    {row.sent_at ? new Date(row.sent_at).toLocaleString('ar-IQ') : '—'}
                  </td>
                  <td className="p-3">{row.clicked_at ? 'تم الفتح' : 'لم يفتح'}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {(row.status === 'failed' || row.status === 'cancelled') && (
                        <button
                          onClick={() => {
                            setPushTarget({ row, action: 'retry_delivery' })
                            setPushReason('إعادة المحاولة بعد مراجعة سبب الفشل')
                          }}
                          className="rounded-lg bg-cyan-50 px-2 py-1 font-bold text-cyan-800"
                        >
                          إعادة محاولة
                        </button>
                      )}
                      {(row.status === 'pending' || row.status === 'processing') && (
                        <button
                          onClick={() => {
                            setPushTarget({ row, action: 'cancel_delivery' })
                            setPushReason('إلغاء تشغيلي من التطوير المركزي')
                          }}
                          className="rounded-lg bg-amber-50 px-2 py-1 font-bold text-amber-800"
                        >
                          إلغاء
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setPushTarget({ row, action: 'disable_device' })
                          setPushReason('تعطيل الجهاز بعد مراجعة حالة التسليم')
                        }}
                        className="rounded-lg bg-rose-50 px-2 py-1 font-bold text-rose-700"
                      >
                        تعطيل الجهاز
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!deliveries.isLoading && !(deliveries.data ?? []).length && (
          <p className="py-8 text-center text-xs text-slate-500">لا توجد عمليات مطابقة.</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            disabled={deliveryOffset === 0}
            onClick={() => setDeliveryOffset((value) => Math.max(0, value - 25))}
            className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            الأحدث
          </button>
          <span className="text-xs text-slate-500">
            {deliveryOffset + 1} — {deliveryOffset + (deliveries.data?.length ?? 0)} من{' '}
            {deliveries.data?.[0]?.total_count ?? 0}
          </span>
          <button
            disabled={(deliveries.data?.length ?? 0) < 25}
            onClick={() => setDeliveryOffset((value) => value + 25)}
            className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            الأقدم
          </button>
        </div>
      </section>
      <GpsAlertPoliciesPanel />
      {q.isLoading ? (
        <div className="h-56 animate-pulse rounded-3xl bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((row) => {
            const mode = modes[row.mode],
              isDefault = row.sector_id === null && row.vehicle_category === null
            return (
              <article
                key={row.id}
                className={`rounded-3xl border bg-white p-5 shadow-sm ${!row.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${mode.tone}`}>
                        {mode.label}
                      </span>
                      {isDefault && (
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                          السياسة الافتراضية
                        </span>
                      )}
                      {!row.enabled && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">متوقفة</span>
                      )}
                    </div>
                    <h2 className="mt-3 font-black">
                      {row.sector_name ?? 'كل المناطق'} ·{' '}
                      {categories.find((x) => x[0] === row.vehicle_category)?.[1] ??
                        'كل أنواع الآليات'}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">{mode.text}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => open(row)}
                      aria-label="تعديل السياسة"
                      className="rounded-xl border p-2 text-indigo-700"
                    >
                      <Edit3 size={17} />
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => confirm('حذف السياسة المخصصة؟') && remove.mutate(row.id)}
                        aria-label="حذف السياسة"
                        className="rounded-xl border p-2 text-rose-700"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
                  <Small label="التصعيد" value={`بعد ${row.escalation_minutes} دقيقة`} />
                  <Small
                    label="الطوارئ"
                    value={row.emergency_bypass ? 'تتحرك فوراً' : 'تتبع السياسة'}
                  />
                  <Small
                    label="القنوات"
                    value={[
                      row.in_app_enabled && 'داخل التطبيق',
                      row.push_enabled && 'Push',
                      row.sound_enabled && 'صوت',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                  <Small label="المستلمون" value={row.recipient_roles.length.toString()} />
                </div>
                {row.notes && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {row.notes}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}
      {batchOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4">
          <form onSubmit={(event) => { event.preventDefault(); const deliveryIds=(deliveries.data??[]).filter((row)=>row.status==='failed'||row.status==='cancelled').map((row)=>row.delivery_id); batchRetry.mutate({deliveryIds,reason:batchReason},{onSuccess:()=>setBatchOpen(false)}) }} className="w-full max-w-md rounded-3xl bg-white p-6">
            <h2 className="text-xl font-black">إعادة المحاولة الجماعية</h2>
            <p className="mt-2 text-xs text-slate-500">بحد أقصى 25 عملية ظاهرة، مع تسجيل سبب مستقل لكل عملية.</p>
            <textarea required minLength={3} maxLength={500} value={batchReason} onChange={(event)=>setBatchReason(event.target.value)} className="mt-4 w-full rounded-xl border p-3 text-sm" rows={4} />
            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setBatchOpen(false)} className="h-11 rounded-xl border">رجوع</button><button disabled={batchRetry.isPending} className="h-11 rounded-xl bg-cyan-700 font-black text-white">تأكيد إعادة المحاولة</button></div>
          </form>
        </div>
      )}
      {pushTarget && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              pushAction.mutate(
                {
                  action: pushTarget.action,
                  deliveryId:
                    pushTarget.action === 'disable_device' ? undefined : pushTarget.row.delivery_id,
                  subscriptionId:
                    pushTarget.action === 'disable_device'
                      ? pushTarget.row.subscription_id
                      : undefined,
                  reason: pushReason,
                },
                { onSuccess: () => setPushTarget(null) },
              )
            }}
            className="w-full max-w-md rounded-3xl bg-white p-6"
          >
            <h2 className="text-xl font-black">
              {pushTarget.action === 'retry_delivery'
                ? 'إعادة محاولة التسليم'
                : pushTarget.action === 'cancel_delivery'
                  ? 'إلغاء عملية التسليم'
                  : 'تعطيل جهاز Push'}
            </h2>
            <p className="mt-2 text-xs text-slate-500">
              الإجراء محصور بالتطوير المركزي وسيُسجل مع المستخدم والسبب.
            </p>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={pushReason}
              onChange={(event) => setPushReason(event.target.value)}
              className="mt-4 w-full rounded-xl border p-3 text-sm"
              rows={4}
              placeholder="سبب الإجراء"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPushTarget(null)}
                className="h-11 rounded-xl border"
              >
                رجوع
              </button>
              <button
                disabled={pushAction.isPending}
                className="h-11 rounded-xl bg-slate-950 font-black text-white disabled:opacity-50"
              >
                تأكيد الإجراء
              </button>
            </div>
          </form>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(
                { id: editing.id, input: editing.data },
                { onSuccess: () => setEditing(null) },
              )
            }}
            className="mx-auto my-6 w-full max-w-2xl rounded-3xl bg-white p-6"
          >
            <h2 className="text-xl font-black">
              {editing.id ? 'تعديل سياسة' : 'إضافة سياسة مخصصة'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              السياسة الأكثر تخصيصاً للمنطقة ونوع الآلية تتقدم على الافتراضية.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="المنطقة">
                <select
                  value={editing.data.sector_id ?? ''}
                  onChange={(e) =>
                    setEditing(
                      (x) =>
                        x && {
                          ...x,
                          data: {
                            ...x.data,
                            sector_id: e.target.value ? Number(e.target.value) : null,
                          },
                        },
                    )
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="">كل المناطق</option>
                  {sectors.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="نوع الآلية">
                <select
                  value={editing.data.vehicle_category ?? ''}
                  onChange={(e) =>
                    setEditing(
                      (x) =>
                        x && {
                          ...x,
                          data: { ...x.data, vehicle_category: e.target.value || null },
                        },
                    )
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="">كل الأنواع</option>
                  {categories.map((x) => (
                    <option key={x[0]} value={x[0]}>
                      {x[1]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Object.entries(modes).map(([key, value]) => (
                <label
                  key={key}
                  className={`cursor-pointer rounded-2xl border p-4 ${editing.data.mode === key ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : ''}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={key}
                    checked={editing.data.mode === key}
                    onChange={() =>
                      setEditing(
                        (x) =>
                          x && {
                            ...x,
                            data: { ...x.data, mode: key as WorkflowPolicyInput['mode'] },
                          },
                      )
                    }
                  />
                  <b className="mr-2 text-sm">{value.label}</b>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">{value.text}</p>
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
              <Toggle
                label="السماح للطوارئ بالحركة فوراً"
                checked={editing.data.emergency_bypass}
                onChange={(v) =>
                  setEditing((x) => x && { ...x, data: { ...x.data, emergency_bypass: v } })
                }
              />
              <Toggle
                label="السياسة فعالة"
                checked={editing.data.enabled}
                onChange={(v) => setEditing((x) => x && { ...x, data: { ...x.data, enabled: v } })}
              />
              <Toggle
                label="داخل التطبيق"
                checked={editing.data.in_app_enabled}
                onChange={(v) =>
                  setEditing((x) => x && { ...x, data: { ...x.data, in_app_enabled: v } })
                }
              />
              <Toggle
                label="Push"
                checked={editing.data.push_enabled}
                onChange={(v) =>
                  setEditing((x) => x && { ...x, data: { ...x.data, push_enabled: v } })
                }
              />
              <Toggle
                label="صوت"
                checked={editing.data.sound_enabled}
                onChange={(v) =>
                  setEditing((x) => x && { ...x, data: { ...x.data, sound_enabled: v } })
                }
              />
              <Field label="التصعيد بعد (دقيقة)">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={editing.data.escalation_minutes}
                  onChange={(e) =>
                    setEditing(
                      (x) =>
                        x && {
                          ...x,
                          data: { ...x.data, escalation_minutes: Number(e.target.value) },
                        },
                    )
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                />
              </Field>
            </div>
            <fieldset className="mt-4 rounded-2xl border p-4">
              <legend className="px-2 text-sm font-black">الجهات المستلمة</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {recipients.map(([role, label]) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.data.recipient_roles.includes(role)}
                      onChange={(e) =>
                        setEditing((x) => {
                          if (!x) return x
                          const roles = e.target.checked
                            ? [...x.data.recipient_roles, role]
                            : x.data.recipient_roles.filter((r) => r !== role)
                          return { ...x, data: { ...x.data, recipient_roles: roles } }
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <textarea
              maxLength={500}
              value={editing.data.notes ?? ''}
              onChange={(e) =>
                setEditing((x) => x && { ...x, data: { ...x.data, notes: e.target.value || null } })
              }
              className="mt-4 w-full rounded-xl border p-3 text-sm"
              rows={3}
              placeholder="ملاحظات توضح سبب السياسة"
            />
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-11 rounded-xl border font-bold"
              >
                إلغاء
              </button>
              <button
                disabled={save.isPending || !editing.data.recipient_roles.length}
                className="h-11 rounded-xl bg-indigo-700 font-black text-white disabled:opacity-40"
              >
                حفظ السياسة
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
function GpsAlertPoliciesPanel() {
  const policies = useGpsAlertNotificationPolicies()
  return (
    <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-white to-cyan-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="text-[10px] font-black tracking-widest text-cyan-700">
            GPS ALERT ROUTING
          </span>
          <h2 className="mt-1 text-lg font-black">سياسات تنبيهات غرفة GPS</h2>
          <p className="text-xs text-slate-500">
            تحكم مستقل بقناة وأولوية كل حالة دون تعطيل الانطلاقية.
          </p>
        </div>
        <span className="rounded-full bg-cyan-100 px-3 py-1 text-[10px] font-black text-cyan-900">
          {policies.data?.length ?? 0} سياسات
        </span>
      </div>
      {policies.isLoading ? (
        <div className="mt-4 h-32 animate-pulse rounded-2xl bg-white" />
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {policies.data?.map((policy) => (
            <GpsPolicyCard key={policy.alert_type} policy={policy} />
          ))}
        </div>
      )}
    </section>
  )
}
const gpsAlertLabels: Record<GpsAlertNotificationPolicy['alert_type'], string> = {
  gps_offline: 'انقطاع GPS',
  gps_stale: 'تأخر القراءة',
  outside_zone: 'خارج الزون',
  engine_idle: 'توقف المحرك',
}
function GpsPolicyCard({ policy }: { policy: GpsAlertNotificationPolicy }) {
  const [draft, setDraft] = useState(policy)
  const save = useGpsAlertNotificationPolicySave()
  const patch = (value: Partial<GpsAlertNotificationPolicy>) =>
    setDraft((current) => ({ ...current, ...value }))
  return (
    <article className={`rounded-2xl border bg-white p-4 ${draft.enabled ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <b className="text-sm">{gpsAlertLabels[draft.alert_type]}</b>
          <small className="block font-mono text-[9px] text-slate-400">{draft.alert_type}</small>
        </div>
        <Toggle label="مفعلة" checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="الأولوية">
          <select
            aria-label={`أولوية ${gpsAlertLabels[draft.alert_type]}`}
            value={draft.priority}
            onChange={(e) =>
              patch({ priority: e.target.value as GpsAlertNotificationPolicy['priority'] })
            }
            className="mt-1 h-10 w-full rounded-xl border px-2 text-xs"
          >
            <option value="low">منخفضة</option>
            <option value="normal">اعتيادية</option>
            <option value="high">عالية</option>
            <option value="critical">حرجة</option>
          </select>
        </Field>
        <div className="space-y-2 rounded-xl bg-slate-50 p-2">
          <Toggle
            label="داخل التطبيق"
            checked={draft.in_app_enabled}
            onChange={(in_app_enabled) => patch({ in_app_enabled })}
          />
          <Toggle
            label="Web Push"
            checked={draft.push_enabled}
            onChange={(push_enabled) => patch({ push_enabled })}
          />
          <Toggle
            label="صوت"
            checked={draft.sound_enabled}
            onChange={(sound_enabled) => patch({ sound_enabled })}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 items-end gap-3">
        <Toggle
          label="أثناء الانطلاقية فقط"
          checked={draft.only_during_departure}
          onChange={(only_during_departure) => patch({ only_during_departure })}
        />
        <Field label="التصعيد بعد (دقيقة)">
          <input
            aria-label={`دقائق تصعيد ${gpsAlertLabels[draft.alert_type]}`}
            type="number"
            min={1}
            max={1440}
            value={draft.escalation_minutes}
            onChange={(e) => patch({ escalation_minutes: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-xl border px-2 text-xs"
          />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="الفاصل بين التصعيدات (دقيقة)">
          <input
            aria-label={`فاصل تصعيد ${gpsAlertLabels[draft.alert_type]}`}
            type="number"
            min={1}
            max={1440}
            value={draft.escalation_repeat_minutes}
            onChange={(e) => patch({ escalation_repeat_minutes: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-xl border px-2 text-xs"
          />
        </Field>
        <Field label="عدد مستويات التصعيد">
          <input
            aria-label={`مستويات تصعيد ${gpsAlertLabels[draft.alert_type]}`}
            type="number"
            min={1}
            max={5}
            value={draft.escalation_levels}
            onChange={(e) => patch({ escalation_levels: Number(e.target.value) })}
            className="mt-1 h-9 w-full rounded-xl border px-2 text-xs"
          />
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="text-[10px] font-bold text-slate-500">المستلمون</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {recipients
            .filter(([role]) => ['ops_room', 'it_admin', 'super_admin'].includes(role))
            .map(([role, label]) => (
              <label
                key={role}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px]"
              >
                <input
                  type="checkbox"
                  checked={draft.recipient_roles.includes(role)}
                  onChange={(e) =>
                    patch({
                      recipient_roles: e.target.checked
                        ? [...draft.recipient_roles, role]
                        : draft.recipient_roles.filter((item) => item !== role),
                    })
                  }
                />
                {label}
              </label>
            ))}
        </div>
      </fieldset>
      <button
        disabled={save.isPending || !draft.recipient_roles.length}
        onClick={() =>
          save.mutate({
            alert_type: draft.alert_type,
            enabled: draft.enabled,
            priority: draft.priority,
            recipient_roles: draft.recipient_roles,
            in_app_enabled: draft.in_app_enabled,
            push_enabled: draft.push_enabled,
            sound_enabled: draft.sound_enabled,
            only_during_departure: draft.only_during_departure,
            escalation_minutes: draft.escalation_minutes,
            escalation_repeat_minutes: draft.escalation_repeat_minutes,
            escalation_levels: draft.escalation_levels,
          })
        }
        className="mt-3 h-10 w-full rounded-xl bg-cyan-800 text-xs font-black text-white disabled:opacity-40"
      >
        {save.isPending ? 'جارٍ الحفظ…' : 'حفظ سياسة GPS'}
      </button>
    </article>
  )
}
function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border bg-white p-4">
      <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700 [&>svg]:size-5">
        {icon}
      </span>
      <div>
        <b className="text-sm">{title}</b>
        <p className="text-xs text-slate-500">{text}</p>
      </div>
    </article>
  )
}
function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <span className="text-[10px] text-slate-400">{label}</span>
      <b className="mt-1 block">{value}</b>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-bold text-slate-600">
      {label}
      {children}
    </label>
  )
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-xs font-bold">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-indigo-700"
      />
    </label>
  )
}
