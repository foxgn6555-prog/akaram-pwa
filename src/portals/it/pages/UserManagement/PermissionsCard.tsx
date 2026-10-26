/**
 * 00350-C — بطاقة صلاحيات المستخدم (صفحة المستخدم، التطوير المركزية):
 *  · القالب (واحد لكل مستخدم) · المعاينة «كما يراه» بمصدر كل إجراء · الاستثناءات الفردية (تغلب القالب) · سجل التدقيق.
 *  · الترتيب في الخادم: مدير النظام الأعلى ← استثناء ← قالب ← افتراضي الدور ← ممنوع.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { usePermissionAudit, usePermissionTemplates, useSetUserPermissionOverride, useSetUserPermissionTemplate, useUserEffectivePermissions, useUserPermissionTemplate } from '@features/permissions'
import type { EffectivePermissionRow } from '@features/permissions'
import { PERMISSION_ACTION_LABELS, PORTAL_ROLE, type PermissionAction, type PermissionUnit } from '@config/permission-catalog'
import type { Role } from '@lib/constants/roles.constants'
import { formatDate } from '@lib/utils/date.utils'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { GridLegend, PermissionGrid, portalLabel, type CellState } from '../Permissions/PermissionGrid'
import { AUDIT_KIND } from '../Permissions/PermissionTemplates'

export function PermissionsCard({ userId, roles, isSelf }: { userId: string; roles: readonly Role[]; isSelf: boolean }) {
  const isSuperAdmin = roles.includes('super_admin')
  const templates = usePermissionTemplates()
  const userTpl = useUserPermissionTemplate(userId)
  const effective = useUserEffectivePermissions(userId)
  const audit = usePermissionAudit(userId, null)
  const setTpl = useSetUserPermissionTemplate(), setOv = useSetUserPermissionOverride()
  const [showAll, setShowAll] = useState(false)
  const [reason, setReason] = useState('')
  const ownPortals = useMemo(() => Object.entries(PORTAL_ROLE).filter(([, r]) => roles.includes(r)).map(([p]) => p), [roles])
  const allPortals = Object.keys(PORTAL_ROLE)
  const visiblePortals = showAll ? allPortals : ownPortals
  const [portal, setPortal] = useState<string>(ownPortals[0] ?? 'hr')
  const activePortal = visiblePortals.includes(portal) ? portal : (visiblePortals[0] ?? portal)

  const byCell = useMemo(() => {
    const m = new Map<string, EffectivePermissionRow>()
    for (const r of effective.data ?? []) m.set(`${r.unit_key}|${r.action}`, r)
    return m
  }, [effective.data])
  const overrides = (effective.data ?? []).filter((r) => r.source === 'override')
  const cell = (u: PermissionUnit, a: PermissionAction): CellState => {
    const r = byCell.get(`${u.key}|${a}`)
    if (!r) return { effect: null }
    return { effect: r.allowed ? 'allow' : 'deny', source: r.source, reason: r.reason }
  }
  /** نقرة: استثناء فردي يدور: (كما هو) ← ممنوع ← مسموح ← إزالة الاستثناء */
  const onCell = (u: PermissionUnit, a: PermissionAction, c: CellState): void => {
    const isHomeView = a === 'view' && u.parentKey === null && u.path === `/${u.portal}`
    if (isHomeView && roles.includes(PORTAL_ROLE[u.portal as keyof typeof PORTAL_ROLE])) return
    let next: 'allow' | 'deny' | null
    if (c.source === 'override') next = c.effect === 'deny' ? 'allow' : null
    else next = c.effect === 'allow' ? 'deny' : 'allow'
    setOv.mutate({ userId, unit: u.key, action: a, effect: next, reason: reason.trim() || null })
  }

  const locked = isSelf || isSuperAdmin
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm" aria-label="الصلاحيات" data-testid="permissions-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black">الصلاحيات</h2>
          <p className="mt-1 text-xs text-slate-500">افتراضياً يملك المستخدم كل وحدات بوابته. القالب يحجب/يضيف، والاستثناء الفردي يغلب القالب. التغيير يسري في الخادم فوراً وفي قوائمه عند تحديث صفحته.</p>
        </div>
        {isSuperAdmin && <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white">مدير النظام الأعلى — كل الصلاحيات دائماً</span>}
        {isSelf && !isSuperAdmin && <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">لا يمكنك تعديل صلاحيات حسابك</span>}
      </div>

      {!isSuperAdmin && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-xs font-bold">القالب
            <select data-testid="perm-template-select" disabled={locked || setTpl.isPending || !templates.data} value={userTpl.data?.template_id ?? ''} onChange={(e) => setTpl.mutate({ userId, templateId: e.target.value || null })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              <option value="">بلا قالب — افتراضي الدور</option>
              {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (معطّل)'}</option>)}
            </select>
          </label>
          <a href="/it/permissions" className="h-11 rounded-xl border border-slate-300 px-4 text-center text-sm font-bold leading-[2.75rem] text-slate-700">إدارة القوالب</a>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-black">المعاينة — كما يراه المستخدم</h3>
        <GridLegend mode="user" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="tablist">
        {visiblePortals.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={activePortal === p} data-testid={`perm-portal-${p}`} onClick={() => setPortal(p)}
            className={clsx('h-9 rounded-lg border px-2.5 text-[11px] font-bold', activePortal === p ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-200 bg-white text-slate-600')}>
            {portalLabel(p)}
          </button>
        ))}
        {!isSuperAdmin && (
          <button type="button" data-testid="perm-show-all" onClick={() => setShowAll((v) => !v)} className="h-9 rounded-lg px-2 text-[11px] font-bold text-violet-700 underline">
            {showAll ? 'بوابات دوره فقط' : 'كل البوابات (لمنح وحدة من بوابة أخرى)'}
          </button>
        )}
      </div>
      {!locked && (
        <label className="mt-3 block text-xs font-bold">سبب الاستثناء (اختياري — يُسجَّل مع النقرة التالية)
          <input data-testid="perm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="مثال: بديل مؤقت أثناء إجازة الزميل" className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-normal" />
        </label>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{locked ? 'عرض فقط.' : 'انقر الإجراء لإضافة استثناء فردي: مسموح ⇄ ممنوع، ثم نقرة ثالثة تزيل الاستثناء ويعود حكم القالب/الدور.'}</p>
      <div className="mt-3">
        {effective.isLoading ? <LoadingSpinner /> : effective.isError ? <p className="text-xs text-rose-700">تعذّر تحميل المعاينة.</p> : (
          <PermissionGrid portal={activePortal} cell={cell} onCell={locked ? undefined : onCell} disabled={setOv.isPending} testId="perm-user-grid" />
        )}
      </div>

      {overrides.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-black">الاستثناءات الفردية ({overrides.length})</h3>
          <ul className="mt-2 divide-y divide-slate-100 text-xs" data-testid="perm-overrides">
            {overrides.map((o) => (
              <li key={`${o.unit_key}|${o.action}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{portalLabel(o.portal)}</b> › {o.label} · {PERMISSION_ACTION_LABELS[o.action]} — <span className={o.allowed ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{o.allowed ? 'مسموح' : 'ممنوع'}</span>{o.reason && <span className="text-slate-500"> · {o.reason}</span>}</span>
                {!locked && <button type="button" data-testid={`perm-override-clear-${o.unit_key}-${o.action}`} disabled={setOv.isPending} onClick={() => setOv.mutate({ userId, unit: o.unit_key, action: o.action, effect: null })} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold">إزالة</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-black">سجل التغييرات ({audit.data?.length ?? 0})</summary>
        <ul className="mt-2 divide-y divide-slate-100 text-xs" data-testid="perm-audit">
          {(audit.data ?? []).length === 0 && <li className="py-2 text-slate-500">لا تغييرات بعد.</li>}
          {(audit.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span><b>{a.actor_name ?? '—'}</b> · {AUDIT_KIND[a.kind] ?? a.kind}{auditDetail(a.detail)}</span>
              <span className="text-slate-500">{formatDate(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function auditDetail(d: Record<string, unknown>): string {
  const unit = typeof d.unit === 'string' ? d.unit : null
  const action = typeof d.action === 'string' ? PERMISSION_ACTION_LABELS[d.action as PermissionAction] ?? d.action : null
  const effect = d.effect === 'allow' ? 'مسموح' : d.effect === 'deny' ? 'ممنوع' : null
  const parts = [unit, action, effect].filter(Boolean)
  return parts.length ? ` — ${parts.join(' · ')}` : ''
}
