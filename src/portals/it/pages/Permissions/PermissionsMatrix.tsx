import { useMemo, useState } from 'react'
import { useRolePermissions, useUserOverrides, useSetRoleEffect, useSetUserOverride } from '@features/permissions'
import { ROLE_LABELS, type Role } from '@lib/constants/roles.constants'
import { portalThemes } from '@config/portals.config'
import type { PermissionEffect, OverrideEffect } from '@features/permissions'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import clsx from 'clsx'

/**
 * ⚑ مصفوفة الصلاحيات — الصفحة الأهم في البوابة التقنية:
 * كل صفحة × كل دور: ✓ منح · ✗ إخفاء · (فارغ) افتراضي
 * + قسم القيود الفردية (قفل/فتح لشخص محدد)
 * كل تعديل ينعكس فوراً على الشريط الجانبي لكل المستخدمين.
 */

/** سجل الصفحات المرجعي — مرآة لـ page_registry في system_settings */
const PAGE_CATALOG: Array<{ key: string; label: string; portal: string }> = [
  // IT
  { key: 'it.dashboard',       label: 'لوحة البوابة',        portal: 'it' },
  { key: 'it.users.list',      label: 'المستخدمون',          portal: 'it' },
  { key: 'it.users.create',    label: 'إنشاء مستخدم',        portal: 'it' },
  { key: 'it.users.departments', label: 'الهيكل التنظيمي',   portal: 'it' },
  { key: 'it.db.tables',       label: 'الجداول',             portal: 'it' },
  { key: 'it.db.errors',       label: 'أخطاء التطبيق',       portal: 'it' },
  { key: 'it.branches',        label: 'فروع الشركة',         portal: 'it' },
  { key: 'it.permissions',     label: 'مصفوفة الصلاحيات',    portal: 'it' },
  { key: 'it.integrations.biometric', label: 'أجهزة البصمة', portal: 'it' },
  { key: 'it.integrations.gps',       label: 'تتبع الشاحنات', portal: 'it' },
  // Employee
  { key: 'employee.dashboard', label: 'لوحة الموظف',         portal: 'employee' },
  { key: 'employee.requests',  label: 'طلباتي',              portal: 'employee' },
  { key: 'employee.payslips',  label: 'رواتبي',              portal: 'employee' },
  // HR
  { key: 'hr.employees',       label: 'الموظفون',            portal: 'hr' },
  { key: 'hr.requests',        label: 'الطلبات',             portal: 'hr' },
  { key: 'hr.payroll',         label: 'الرواتب',             portal: 'hr' },
  // Manager
  { key: 'manager.approvals',  label: 'الاعتمادات',          portal: 'manager' },
  // Finance
  { key: 'finance.budget',     label: 'الميزانية',           portal: 'finance' },
  // Admin
  { key: 'admin.audit',        label: 'سجل التدقيق',         portal: 'admin' },
]

const ASSIGNABLE_ROLES: readonly Role[] = [
  'employee', 'hr_officer', 'department_manager', 'finance_officer', 'it_admin',
] as const

export default function PermissionsMatrix() {
  const { data: rolePerms, isLoading: rLoading } = useRolePermissions()
  const { data: overrides, isLoading: oLoading } = useUserOverrides()
  const setRole = useSetRoleEffect()
  const setOverride = useSetUserOverride()
  const [confirmLock, setConfirmLock] = useState<{ userId: string; pageKey: string } | null>(null)

  // خريطة سريعة: page_key+role → effect
  const matrix = useMemo(() => {
    const map = new Map<string, PermissionEffect>()
    for (const perm of rolePerms ?? []) {
      map.set(`${perm.page_key}::${perm.role}`, perm.effect)
    }
    return map
  }, [rolePerms])

  const getEffect = (pageKey: string, role: Role): PermissionEffect | undefined =>
    matrix.get(`${pageKey}::${role}`)

  const toggleEffect = (pageKey: string, role: Role): void => {
    const current = getEffect(pageKey, role)
    // الدورة: فارغ → grant → hide → فارغ
    const next: PermissionEffect | null =
      current === undefined ? 'grant' : current === 'grant' ? 'hide' : null
    setRole.mutate({ role, pageKey, effect: next })
  }

  if (rLoading || oLoading) return <LoadingSpinner label="جارٍ تحميل المصفوفة…" />

  return (
    <section aria-labelledby="perm-title" className="space-y-4">
      <div>
        <h1 id="perm-title" className="text-lg font-bold">مصفوفة صلاحيات الصفحات</h1>
        <p className="text-sm text-slate-500">
          اضغط على الخلية للدورة: فارغ (افتراضي) → ✓ منح → ✗ إخفاء — ينعكس فوراً على الشريط الجانبي للجميع
        </p>
      </div>

      {/* ── مصفوفة الأدوار ── */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm" data-testid="perm-matrix">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
              <th className="min-w-52 px-4 py-3 text-start font-semibold">الصفحة</th>
              {ASSIGNABLE_ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-semibold">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAGE_CATALOG.map((page) => (
              <tr key={page.key} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: portalThemes[page.portal as keyof typeof portalThemes]?.colorVar ? `var(--portal-color)` : '#94a3b8' }}
                      title={page.portal}
                    />
                    <span className="font-medium">{page.label}</span>
                    <span className="text-[10px] text-slate-400" dir="ltr">{page.key}</span>
                  </span>
                </td>
                {ASSIGNABLE_ROLES.map((role) => {
                  const effect = getEffect(page.key, role)
                  return (
                    <td key={role} className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => toggleEffect(page.key, role)}
                        disabled={setRole.isPending}
                        data-testid={`cell-${page.key.replace(/\./g, '-')}-${role}`}
                        aria-label={`${page.label} — ${ROLE_LABELS[role]}: ${
                          effect === 'grant' ? 'ممنوح' : effect === 'hide' ? 'مخفي' : 'افتراضي'
                        }`}
                        className={clsx(
                          'flex size-7 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                          effect === 'grant' && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                          effect === 'hide' && 'bg-red-100 text-red-700 hover:bg-red-200',
                          !effect && 'bg-slate-50 text-slate-300 hover:bg-slate-100',
                        )}
                        title={effect === 'grant' ? 'ممنوح — اضغط للإخفاء' : effect === 'hide' ? 'مخفي — اضغط للإلغاء' : 'افتراضي — اضغط للمنح'}
                      >
                        {effect === 'grant' ? '✓' : effect === 'hide' ? '✗' : '·'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── القيود الفردية ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-bold">القيود الفردية (قفل/فتح لشخص معين)</h2>
        <p className="mb-4 text-xs text-slate-500">
          تتجاوز أدوار المستخدم — القفل يمنع حتى لو الصفحة ممنوحة لدوره، والفتح يسمح حتى لو مخفية
        </p>
        {overrides && overrides.length > 0 ? (
          <ul className="space-y-2" data-testid="overrides-list">
            {overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold" dir="ltr">
                    {o.page_key}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    مستخدم: {o.user_id.slice(0, 8)}… {o.reason && `· ${o.reason}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={clsx(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                    o.effect === 'lock' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
                  )}>
                    {o.effect === 'lock' ? '🔒 مقفول' : '🔓 مفتوح فردياً'}
                  </span>
                  <button
                    onClick={() =>
                      setOverride.mutate({ userId: o.user_id, pageKey: o.page_key, effect: null })
                    }
                    data-testid={`remove-override-${o.id}`}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    إزالة
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-xs text-slate-400">لا قيود فردية — كل المستخدمين يتبعون أدوارهم</p>
        )}

        {/* إضافة قيد جديد */}
        <AddOverrideForm onSubmit={(v) => setOverride.mutate(v)} />
      </div>

      {/* تأكيد القفل */}
      {confirmLock && (
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-bold">تأكيد قفل الصفحة</h3>
            <p className="mb-4 text-sm text-slate-500">
              سيُمنع هذا المستخدم من الصفحة حتى لو ممنوحة لدوره — يُسجَّل باسمك.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setOverride.mutate({ userId: confirmLock.userId, pageKey: confirmLock.pageKey, effect: 'lock' })
                  setConfirmLock(null)
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
              >
                تأكيد القفل
              </button>
              <button onClick={() => setConfirmLock(null)} className="rounded-lg border px-4 py-2 text-sm">
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function AddOverrideForm(props: {
  onSubmit: (v: { userId: string; pageKey: string; effect: OverrideEffect; reason?: string }) => void
}) {
  const [userId, setUserId] = useState('')
  const [pageKey, setPageKey] = useState('')
  const [effect, setEffect] = useState<OverrideEffect>('lock')
  const [reason, setReason] = useState('')

  const submit = (): void => {
    if (!userId.trim() || !pageKey.trim()) return
    props.onSubmit({ userId: userId.trim(), pageKey: pageKey.trim(), effect, reason: reason || undefined })
    setUserId(''); setPageKey(''); setReason('')
  }

  return (
    <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4" data-testid="add-override">
      <input value={userId} onChange={(e) => setUserId(e.target.value)} dir="ltr"
        placeholder="UUID المستخدم" className="h-10 rounded-xl border border-slate-300 px-3 text-xs" />
      <input value={pageKey} onChange={(e) => setPageKey(e.target.value)} dir="ltr"
        placeholder="it.users.list" className="h-10 rounded-xl border border-slate-300 px-3 text-xs" />
      <select value={effect} onChange={(e) => setEffect(e.target.value as OverrideEffect)}
        className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs">
        <option value="lock">🔒 قفل</option>
        <option value="allow">🔓 فتح</option>
      </select>
      <button onClick={submit} data-testid="add-override-btn"
        className="h-10 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white hover:bg-brand-700">
        إضافة قيد
      </button>
    </div>
  )
}
