/**
 * 00350 — يولّد جزء الزرع (seed) لجدول permission_units من كتالوج الصلاحيات (src/config/permission-catalog.ts).
 *   npx vite-node scripts/gen-permission-catalog.ts > /tmp/permission-seed.sql
 * يُلصق الناتج داخل الترحيل بين العلامتين -- <<catalog>> و -- <<catalog/>>. اختبار عقد يضمن تطابق آخر ترحيل مع هذا الملف.
 */
import { readFileSync } from 'node:fs'
import { PERMISSION_CATALOG, PORTAL_ROLE, UNIT_ACTIONS, WRITE_BINDINGS } from '../src/config/permission-catalog'

const nav = (JSON.parse(readFileSync('src/i18n/ar/sidebar.json', 'utf8')) as { nav: Record<string, string> }).nav
const q = (s: string | null): string => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`)

export function permissionSeedSql(): string {
  const keys = new Set(PERMISSION_CATALOG.map((u) => u.key))
  const orphans = Object.keys(UNIT_ACTIONS).filter((k) => !keys.has(k))
  if (orphans.length) throw new Error('UNIT_ACTIONS has keys not in PORTAL_UNITS: ' + orphans.join(', '))
  const rows = PERMISSION_CATALOG.map((u) => {
    const label = nav[u.labelKey.replace(/^nav\./, '')] ?? u.labelKey
    return `  (${q(u.key)}, ${q(u.portal)}, ${q(u.path)}, ${q(label)}, ${q(u.parentKey)}, '{${u.actions.join(',')}}', ${u.sort})`
  })
  const roles = Object.entries(PORTAL_ROLE).map(([p, r]) => `  (${q(p)}, ${q(r)})`)
  return [
    '-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)',
    '-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية',
    'insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values',
    rows.join(',\n') + '\non conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;',
    `delete from public.permission_units where key not in (${PERMISSION_CATALOG.map((u) => q(u.key)).join(', ')});`,
    'insert into public.permission_portal_roles (portal, role) values',
    roles.join(',\n') + '\non conflict (portal) do update set role = excluded.role;',
    `delete from public.permission_portal_roles where portal not in (${Object.keys(PORTAL_ROLE).map((p) => q(p)).join(', ')});`,
    '-- <<catalog/>>',
  ].join('\n')
}

/** 00350-B — بذرة ربط دوال الكتابة (بين -- <<bindings>> و -- <<bindings/>>) */
export function permissionBindingsSql(): string {
  const byKey = new Map(PERMISSION_CATALOG.map((u) => [u.key, u]))
  const rows = Object.entries(WRITE_BINDINGS).map(([fn, [unit, action]]) => {
    const u = byKey.get(unit)
    if (!u) throw new Error(`binding ${fn}: unknown unit ${unit}`)
    if (!u.actions.includes(action)) throw new Error(`binding ${fn}: ${unit} lacks action ${action}`)
    return `  (${q(fn)}, ${q(unit)}, ${q(action)})`
  })
  return [
    '-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)',
    'delete from public.permission_write_bindings;',
    'insert into public.permission_write_bindings (fn, unit_key, action) values',
    rows.join(',\n') + ';',
    '-- <<bindings/>>',
  ].join('\n')
}

if (process.env.VITEST === undefined) process.stdout.write(permissionSeedSql() + '\n\n' + permissionBindingsSql() + '\n')
