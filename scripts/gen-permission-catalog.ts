/**
 * 00350 — يولّد جزء الزرع (seed) لجدول permission_units من كتالوج الصلاحيات (src/config/permission-catalog.ts).
 *   npx vite-node scripts/gen-permission-catalog.ts > /tmp/permission-seed.sql
 * يُلصق الناتج داخل الترحيل بين العلامتين -- <<catalog>> و -- <<catalog/>>. اختبار عقد يضمن تطابق آخر ترحيل مع هذا الملف.
 */
import { readFileSync } from 'node:fs'
import { PERMISSION_CATALOG, PORTAL_ROLE, UNIT_ACTIONS } from '../src/config/permission-catalog'

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
    'delete from public.permission_units;',
    'insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values',
    rows.join(',\n') + ';',
    'delete from public.permission_portal_roles;',
    'insert into public.permission_portal_roles (portal, role) values',
    roles.join(',\n') + ';',
    '-- <<catalog/>>',
  ].join('\n')
}

if (process.env.VITEST === undefined) process.stdout.write(permissionSeedSql() + '\n')
