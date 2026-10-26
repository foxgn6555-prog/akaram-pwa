/**
 * 00350-C — شبكة الصلاحيات المشتركة: صف لكل وحدة (من الكتالوج = الشريط الجانبي) وشريحة لكل إجراء ينطبق عليها.
 *  · تُستخدم في محرّر القوالب (قاعدة: مسموح/ممنوع/بلا) وفي بطاقة المستخدم (الفعلي + مصدره + استثناء).
 */
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { PERMISSION_ACTION_LABELS, PERMISSION_CATALOG, type PermissionAction, type PermissionUnit } from '@config/permission-catalog'
import { portalThemes } from '@config/portals.config'
import type { PortalId } from '@lib/constants/portals.constants'

export type CellState = {
  /** الحكم المعروض: مسموح/ممنوع/غير محدد (في القالب: غير محدد = يرث الدور) */
  effect: 'allow' | 'deny' | null
  /** مصدر الحكم (لبطاقة المستخدم) */
  source?: 'super_admin' | 'override' | 'template' | 'role' | 'none'
  reason?: string | null
}

export const SOURCE_LABELS: Record<NonNullable<CellState['source']>, string> = {
  super_admin: 'مدير النظام الأعلى', override: 'استثناء فردي', template: 'من القالب', role: 'افتراضي الدور', none: 'خارج بوابته',
}

export function portalLabel(portal: string): string { return portalThemes[portal as PortalId]?.label ?? portal }

export function PermissionGrid({ portal, cell, onCell, disabled, testId = 'permission-grid' }: {
  portal: string
  cell: (unit: PermissionUnit, action: PermissionAction) => CellState
  onCell?: (unit: PermissionUnit, action: PermissionAction, current: CellState) => void
  disabled?: boolean
  testId?: string
}) {
  const { t } = useTranslation('sidebar')
  const units = PERMISSION_CATALOG.filter((u) => u.portal === portal)
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200" data-testid={testId}>
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[11px] text-slate-500">
          <tr><th className="px-3 py-2 text-right font-bold">الوحدة</th><th className="px-3 py-2 text-right font-bold">الإجراءات</th></tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.key} className="border-t border-slate-100 align-top" data-testid={`perm-unit-${u.key}`}>
              <td className={clsx('whitespace-nowrap px-3 py-2 font-bold text-slate-800', u.parentKey && 'ps-7 text-slate-600')}>
                {t(u.labelKey)}
                {u.parentKey === null && u.path === `/${u.portal}` && <span className="ms-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">رئيسية</span>}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {u.actions.map((a) => {
                    const c = cell(u, a)
                    const homeView = a === 'view' && u.parentKey === null && u.path === `/${u.portal}`
                    const title = `${PERMISSION_ACTION_LABELS[a]}${c.source ? ' — ' + SOURCE_LABELS[c.source] : ''}${c.reason ? ' — ' + c.reason : ''}`
                    return (
                      <button key={a} type="button" title={title} disabled={disabled || !onCell} onClick={() => onCell?.(u, a, c)}
                        data-testid={`perm-${u.key}-${a}`} data-effect={c.effect ?? 'none'} data-source={c.source ?? ''}
                        className={clsx('inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-bold transition disabled:cursor-default',
                          c.effect === 'allow' && 'border-emerald-300 bg-emerald-50 text-emerald-800',
                          c.effect === 'deny' && 'border-rose-300 bg-rose-50 text-rose-800 line-through',
                          c.effect === null && 'border-slate-200 bg-white text-slate-500',
                          c.source === 'override' && 'ring-2 ring-amber-400',
                          c.source === 'template' && 'ring-2 ring-violet-300',
                        )}>
                        <span>{PERMISSION_ACTION_LABELS[a]}</span>
                        {homeView && <span className="text-[9px] text-slate-400">ثابت</span>}
                      </button>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function GridLegend({ mode }: { mode: 'template' | 'user' }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
      <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> مسموح</span>
      <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-rose-300 bg-rose-50" /> ممنوع</span>
      {mode === 'template'
        ? <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-slate-200 bg-white" /> بلا قاعدة (يبقى افتراضي الدور)</span>
        : <>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-slate-200 bg-white ring-2 ring-amber-400" /> استثناء فردي</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-slate-200 bg-white ring-2 ring-violet-300" /> من القالب</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded border border-slate-200 bg-white" /> خارج بوابته</span>
          </>}
    </div>
  )
}
