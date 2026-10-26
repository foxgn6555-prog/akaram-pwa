/**
 * 00350-C — قوالب الصلاحيات (التطوير المركزية): إنشاء/تعديل/تعطيل/حذف قالب وقواعده.
 *  · القاعدة تحجب أو تضيف فوق افتراضي الدور؛ بلا قاعدة = يبقى الافتراضي. إسناد القالب لمستخدم من صفحة المستخدم.
 *  · حفظ القواعد يسري فوراً على كل المستخدمين المسنَدين (الخادم يحكم).
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDeletePermissionTemplate, usePermissionAudit, usePermissionTemplateRules, usePermissionTemplates, useSavePermissionTemplate, useSetPermissionTemplateRules } from '@features/permissions'
import type { PermissionEffect } from '@features/permissions'
import { PORTAL_ROLE, type PermissionAction } from '@config/permission-catalog'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import { formatDate } from '@lib/utils/date.utils'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { GridLegend, PermissionGrid, portalLabel } from './PermissionGrid'

type RuleMap = Record<string, PermissionEffect> // `${unit}|${action}` → effect
const k = (u: string, a: string): string => `${u}|${a}`

export default function PermissionTemplates() {
  const templates = usePermissionTemplates()
  const save = useSavePermissionTemplate(), del = useDeletePermissionTemplate(), setRules = useSetPermissionTemplateRules()
  const [selected, setSelected] = useState<string | null>(null)
  const [portal, setPortal] = useState<string>('hr')
  const [draft, setDraft] = useState<{ name: string; description: string } | null>(null)
  const current = templates.data?.find((t) => t.id === selected) ?? null
  const rules = usePermissionTemplateRules(selected)
  const [map, setMap] = useState<RuleMap>({})
  useEffect(() => { if (rules.data) setMap(Object.fromEntries(rules.data.map((r) => [k(r.unit_key, r.action), r.effect]))) }, [rules.data])
  const saved = useMemo<RuleMap>(() => Object.fromEntries((rules.data ?? []).map((r) => [k(r.unit_key, r.action), r.effect])), [rules.data])
  const dirty = JSON.stringify(Object.entries(map).sort()) !== JSON.stringify(Object.entries(saved).sort())
  const audit = usePermissionAudit(null, selected, !!selected)
  const portals = Object.keys(PORTAL_ROLE)
  const countFor = (p: string): number => Object.keys(map).filter((key) => key.split('|')[0] === p || key.startsWith(p + '.')).length

  const cycle = (unit: string, action: PermissionAction): void => {
    setMap((m) => {
      const cur = m[k(unit, action)] ?? null
      const next: PermissionEffect | null = cur === null ? 'deny' : cur === 'deny' ? 'allow' : null
      const copy = { ...m }
      if (next === null) delete copy[k(unit, action)]; else copy[k(unit, action)] = next
      return copy
    })
  }
  const persistRules = (): void => {
    if (!selected) return
    setRules.mutate({ templateId: selected, rules: Object.entries(map).map(([key, effect]) => { const [unit_key, action] = key.split('|') as [string, PermissionAction]; return { unit_key, action, effect } }) })
  }

  if (templates.isLoading) return <LoadingSpinner />
  return (
    <div className="space-y-6" data-testid="permission-templates-page">
      <header>
        <h1 className="text-xl font-black">قوالب الصلاحيات</h1>
        <p className="mt-1 text-sm text-slate-600">
          كل مستخدم يملك افتراضياً كامل وحدات بوابته. القالب يحجب إجراءات محددة أو يضيف وحدات من بوابات أخرى، ويُسنَد لمستخدم من <b>صفحة المستخدم</b>. مدير النظام الأعلى لا تنطبق عليه القوالب.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* قائمة القوالب */}
        <aside className="space-y-2">
          <button type="button" data-testid="tpl-new" onClick={() => { setDraft({ name: '', description: '' }); setSelected(null) }} className="h-11 w-full rounded-xl bg-cyan-700 text-sm font-black text-white">+ قالب جديد</button>
          {(templates.data ?? []).length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">لا قوالب بعد — بلا قالب يبقى كل مستخدم على افتراضي دوره.</p>}
          {(templates.data ?? []).map((t) => (
            <button key={t.id} type="button" data-testid={`tpl-${t.id}`} onClick={() => { setSelected(t.id); setDraft(null) }}
              className={clsx('w-full rounded-xl border px-3 py-2 text-right', selected === t.id ? 'border-cyan-600 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50', !t.is_active && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black">{t.name}</span>
                <span className="text-[11px] text-slate-500">{t.users_count ?? 0} مستخدم</span>
              </div>
              {!t.is_active && <span className="text-[10px] font-bold text-rose-700">معطّل — بلا أثر</span>}
              {t.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{t.description}</p>}
            </button>
          ))}
        </aside>

        <section className="space-y-4">
          {draft && (
            <form className="rounded-2xl border border-cyan-200 bg-white p-5" data-testid="tpl-form" onSubmit={(e) => { e.preventDefault(); save.mutate({ name: draft.name, description: draft.description }, { onSuccess: (id) => { setDraft(null); setSelected(id) } }) }}>
              <h2 className="text-sm font-black">قالب جديد</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">الاسم<input data-testid="tpl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="مثال: موارد بشرية — قراءة فقط" /></label>
                <label className="text-xs font-bold">الوصف (اختياري)<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></label>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" data-testid="tpl-create" disabled={draft.name.trim().length < 2 || save.isPending} className="h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white disabled:opacity-40">إنشاء</button>
                <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">إلغاء</button>
              </div>
            </form>
          )}

          {!draft && !current && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">اختر قالباً من القائمة أو أنشئ قالباً جديداً.</p>}

          {current && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black" data-testid="tpl-title">{current.name}</h2>
                    <p className="text-xs text-slate-500">{current.description ?? 'بلا وصف'} · أُنشئ {formatDate(current.created_at)} · {current.users_count ?? 0} مستخدم مسنَد</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-testid="tpl-toggle-active" disabled={save.isPending} onClick={() => save.mutate({ id: current.id, name: current.name, description: current.description, is_active: !current.is_active })} className={clsx('h-10 rounded-xl border px-3 text-xs font-black', current.is_active ? 'border-amber-300 text-amber-800' : 'border-emerald-300 text-emerald-800')}>
                      {current.is_active ? 'تعطيل القالب' : 'تفعيل القالب'}
                    </button>
                    <button type="button" data-testid="tpl-rename" disabled={save.isPending} onClick={() => { const name = window.prompt('اسم القالب', current.name); if (name && name.trim().length >= 2) save.mutate({ id: current.id, name: name.trim(), description: current.description }) }} className="h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold">إعادة تسمية</button>
                    <button type="button" data-testid="tpl-delete" disabled={(current.users_count ?? 0) > 0 || del.isPending} title={(current.users_count ?? 0) > 0 ? 'أزل إسناده من المستخدمين أولاً' : ''} onClick={() => { if (window.confirm(`حذف القالب «${current.name}» نهائياً؟`)) del.mutate(current.id, { onSuccess: () => setSelected(null) }) }} className="h-10 rounded-xl border border-rose-300 px-3 text-xs font-black text-rose-700 disabled:opacity-40">حذف</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black">قواعد القالب <span className="text-xs font-bold text-slate-500">({Object.keys(map).length} قاعدة)</span></h3>
                  <GridLegend mode="template" />
                </div>
                <p className="mt-1 text-xs text-slate-500">انقر الإجراء للتبديل: بلا قاعدة ← ممنوع ← مسموح. «عرض» رئيسية البوابة لا يُحجب عن صاحب دورها.</p>
                <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
                  {portals.map((p) => (
                    <button key={p} type="button" role="tab" aria-selected={portal === p} data-testid={`tpl-portal-${p}`} onClick={() => setPortal(p)}
                      className={clsx('h-9 rounded-lg border px-2.5 text-[11px] font-bold', portal === p ? 'border-cyan-600 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-600')}>
                      {portalLabel(p)}{countFor(p) > 0 && <span className="ms-1 rounded-md bg-slate-900 px-1 text-[9px] text-white">{countFor(p)}</span>}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">دور هذه البوابة: <b>{ROLE_LABELS[PORTAL_ROLE[portal as keyof typeof PORTAL_ROLE]]}</b> — يملك كل إجراءاتها افتراضياً؛ لمنح مستخدم من دور آخر وحدةً منها ضع «مسموح».</p>
                <div className="mt-3">
                  {rules.isLoading ? <LoadingSpinner /> : (
                    <PermissionGrid portal={portal} cell={(u, a) => ({ effect: map[k(u.key, a)] ?? null })} onCell={(u, a) => cycle(u.key, a)} disabled={setRules.isPending} />
                  )}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button type="button" data-testid="tpl-rules-save" disabled={!dirty || setRules.isPending} onClick={persistRules} className="h-11 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white disabled:opacity-40">حفظ القواعد</button>
                  {dirty && <button type="button" onClick={() => setMap(saved)} className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">تراجع</button>}
                  {!dirty && <span className="text-xs text-emerald-700">لا تغييرات غير محفوظة</span>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-black">سجل التغييرات على هذا القالب</h3>
                <ul className="mt-2 divide-y divide-slate-100 text-xs" data-testid="tpl-audit">
                  {(audit.data ?? []).length === 0 && <li className="py-2 text-slate-500">لا سجل بعد.</li>}
                  {(audit.data ?? []).map((a) => (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span><b>{a.actor_name ?? '—'}</b> · {AUDIT_KIND[a.kind] ?? a.kind}{a.kind === 'template_rules' && typeof a.detail.count === 'number' ? ` (${a.detail.count} قاعدة)` : ''}</span>
                      <span className="text-slate-500">{formatDate(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export const AUDIT_KIND: Record<string, string> = {
  template_create: 'أنشأ القالب', template_update: 'عدّل بيانات القالب', template_rules: 'حفظ القواعد', template_delete: 'حذف القالب',
  user_template_set: 'أسند قالباً', user_template_clear: 'أزال القالب', override_set: 'أضاف استثناءً', override_clear: 'أزال استثناءً',
}
