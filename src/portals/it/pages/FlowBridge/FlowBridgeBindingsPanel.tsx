/**
 * لوحة «ربط الأحداث الحقيقية» — يحدد فيها IT أي عملية DB حقيقية (جدول+عملية
 * أو مزوّد تكامل+حالة) تُحرِّك أي تدفق (flowId) في مخطط FlowBridge. بلا هذا
 * الربط لا تُبَث أي نبضة حية على الرسم (انظر useFlowBridgeLive + mapEventToPulses).
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import {
  useFlowBridgeBindings,
  useCreateFlowBridgeBinding,
  useDeleteFlowBridgeBinding,
} from '@features/flowbridge'
import type { CreateEventBindingInput } from '@features/flowbridge'

const AUDIT_TABLES = [
  'employees', 'departments', 'requests', 'payrolls', 'payslips',
  'budget_allocations', 'it_assets', 'user_roles', 'branches', 'dynamic_portals', 'biometric_devices',
]
const AUDIT_OPS = ['INSERT', 'UPDATE', 'DELETE'] as const
const INTEGRATION_PROVIDERS = ['biometric', 'gps']
const INTEGRATION_STATUSES = ['success', 'error', 'rejected'] as const

interface FormValues {
  flow_id: string
  source: 'audit' | 'integration'
  match_table: string
  match_operation: string
  match_provider: string
  match_status: string
}

export function FlowBridgeBindingsPanel() {
  const { data: bindings, isLoading } = useFlowBridgeBindings()
  const create = useCreateFlowBridgeBinding()
  const del = useDeleteFlowBridgeBinding()
  const [formOpen, setFormOpen] = useState(false)

  const { register, handleSubmit, watch, reset } = useForm<FormValues>({
    defaultValues: { source: 'audit', match_table: AUDIT_TABLES[0], match_operation: '', match_provider: INTEGRATION_PROVIDERS[0], match_status: '' },
  })
  const source = watch('source')

  const onSubmit = async (v: FormValues): Promise<void> => {
    const input: CreateEventBindingInput =
      v.source === 'audit'
        ? {
            flow_id: v.flow_id.trim(),
            source: 'audit',
            match_table: v.match_table,
            ...(v.match_operation ? { match_operation: v.match_operation as (typeof AUDIT_OPS)[number] } : {}),
          }
        : {
            flow_id: v.flow_id.trim(),
            source: 'integration',
            match_provider: v.match_provider,
            ...(v.match_status ? { match_status: v.match_status as (typeof INTEGRATION_STATUSES)[number] } : {}),
          }
    await create.mutateAsync(input)
    reset({ ...v, flow_id: '' })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Icon name="activity" size={15} className="text-brand-600" />
            ربط الأحداث الحقيقية بالتدفقات
          </h2>
          <p className="text-xs text-slate-500">
            حدد أي عملية DB حقيقية تُحرِّك أي تدفق في المخطط — بلا محاكاة
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setFormOpen((v) => !v)} data-testid="fb-toggle-binding-form">
          <Icon name={formOpen ? 'x' : 'flow'} size={14} />
          {formOpen ? 'إغلاق' : 'ربط جديد'}
        </Button>
      </div>

      {formOpen && (
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate data-testid="fb-binding-form"
              className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="fb-flow-id" className="mb-1 block text-xs font-medium text-slate-600">معرّف التدفق (flowId)</label>
            <input id="fb-flow-id" dir="ltr" required data-testid="fb-binding-flowid"
              placeholder="f-1"
              className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-sm"
              {...register('flow_id')} />
          </div>
          <div>
            <label htmlFor="fb-source" className="mb-1 block text-xs font-medium text-slate-600">المصدر</label>
            <select id="fb-source" data-testid="fb-binding-source"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
              {...register('source')}>
              <option value="audit">عملية حقيقية على جدول (audit)</option>
              <option value="integration">سجل تكامل (integration)</option>
            </select>
          </div>

          {source === 'audit' ? (
            <>
              <div>
                <label htmlFor="fb-table" className="mb-1 block text-xs font-medium text-slate-600">الجدول</label>
                <select id="fb-table" data-testid="fb-binding-table"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" dir="ltr"
                  {...register('match_table')}>
                  {AUDIT_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fb-op" className="mb-1 block text-xs font-medium text-slate-600">العملية (اختياري)</label>
                <select id="fb-op" data-testid="fb-binding-operation"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" dir="ltr"
                  {...register('match_operation')}>
                  <option value="">أي عملية</option>
                  {AUDIT_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="fb-provider" className="mb-1 block text-xs font-medium text-slate-600">المزوّد</label>
                <select id="fb-provider" data-testid="fb-binding-provider"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" dir="ltr"
                  {...register('match_provider')}>
                  {INTEGRATION_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fb-status" className="mb-1 block text-xs font-medium text-slate-600">الحالة (اختياري)</label>
                <select id="fb-status" data-testid="fb-binding-status"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm" dir="ltr"
                  {...register('match_status')}>
                  <option value="">أي حالة</option>
                  {INTEGRATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm" isLoading={create.isPending} data-testid="fb-binding-submit">
              إنشاء الربط
            </Button>
          </div>
        </form>
      )}

      <div className="max-h-64 overflow-y-auto p-3">
        {isLoading && <LoadingSpinner label="جارٍ جلب الروابط…" />}
        {!isLoading && bindings && bindings.length === 0 && (
          <EmptyState title="لا روابط بعد" hint="أنشئ رابطاً لتحريك تدفق عند وقوع حدث حقيقي" />
        )}
        {bindings && bindings.length > 0 && (
          <ul className="space-y-1.5" data-testid="fb-bindings-list">
            {bindings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span dir="ltr" className="font-mono text-slate-700">
                  {b.flow_id} ← {b.source === 'audit'
                    ? `${b.match_table}${b.match_operation ? `:${b.match_operation}` : ''}`
                    : `${b.match_provider}${b.match_status ? `:${b.match_status}` : ''}`}
                </span>
                <button
                  onClick={() => del.mutate(b.id)}
                  data-testid={`fb-binding-delete-${b.id}`}
                  className="text-red-600 hover:underline"
                >
                  حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
