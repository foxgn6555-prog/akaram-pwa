/**
 * 00350-A — عقد كتالوج الصلاحيات: المصدر الواحد هو الشريط الجانبي (PORTAL_UNITS).
 * - كل مسار في الشريط له وحدة بمفتاح فريد، وكل بوابة لها وحدة رئيسية.
 * - الإجراءات الإضافية (UNIT_ACTIONS) تشير إلى وحدات موجودة فقط.
 * - دور كل بوابة (PORTAL_ROLE) يطابق allowedRoles في routes.config.
 * - بذرة الهجرة (00294) مطابقة حرفياً لمخرجات المولّد — أي تغيير في الشريط يُلزم تحديث الهجرة.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PERMISSION_CATALOG, PERMISSION_UNIT_KEYS, PORTAL_ROLE, UNIT_ACTIONS, WRITE_BINDINGS, WRITE_BINDINGS_EXEMPT, unitKeyForRoute, unitKeyFromPath } from '@/config/permission-catalog'
import { PORTAL_UNITS } from '@/config/portals.config'
import { permissionBindingsSql, permissionSeedSql } from '../../scripts/gen-permission-catalog'

const ROOT = process.cwd()

describe('⚓ عقد كتالوج الصلاحيات', () => {
  it('كل مسار في الشريط الجانبي له وحدة، والمفاتيح فريدة', () => {
    const keys = PERMISSION_CATALOG.map((u) => u.key)
    expect(new Set(keys).size).toBe(keys.length)
    const walk = (units: readonly { path: string; children?: readonly { path: string }[] }[]): string[] =>
      units.flatMap((u) => [u.path, ...walk((u.children ?? []) as never)])
    for (const [portal, units] of Object.entries(PORTAL_UNITS)) {
      for (const p of walk(units as never)) expect(PERMISSION_UNIT_KEYS.has(unitKeyFromPath(p)), `${portal}: ${p}`).toBe(true)
    }
    expect(keys.length).toBeGreaterThanOrEqual(150)
  })

  it('لكل بوابة وحدة رئيسية مسارها /portal وكل وحدة تملك «عرض»', () => {
    for (const portal of Object.keys(PORTAL_ROLE)) {
      expect(PERMISSION_CATALOG.find((u) => u.portal === portal && u.path === `/${portal}` && u.parentKey === null), portal).toBeTruthy()
    }
    for (const u of PERMISSION_CATALOG) expect(u.actions[0], u.key).toBe('view')
  })

  it('UNIT_ACTIONS تشير إلى وحدات موجودة فقط', () => {
    const orphan = Object.keys(UNIT_ACTIONS).filter((k) => !PERMISSION_UNIT_KEYS.has(k))
    expect(orphan).toEqual([])
  })

  it('PORTAL_ROLE يطابق allowedRoles في routes.config لكل بوابة', () => {
    const src = readFileSync(join(ROOT, 'src/router/routes.config.ts'), 'utf8')
    const re = /path:\s*'\/([a-z-]+)'[\s\S]*?allowedRoles:\s*\[([^\]]+)\]/g
    const seen: Record<string, string[]> = {}
    for (let m = re.exec(src); m; m = re.exec(src)) seen[m[1]!] = [...m[2]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)
    for (const [portal, role] of Object.entries(PORTAL_ROLE)) {
      expect(seen[portal], `route for ${portal}`).toBeTruthy()
      const own = seen[portal]!.filter((r) => r !== 'super_admin')
      expect(role === 'super_admin' ? [...own, 'super_admin'] : own, portal).toEqual([role])
    }
  })

  it('unitKeyForRoute يعيد أقرب وحدة للمسارات الفرعية', () => {
    expect(unitKeyForRoute('/hr/employees/123/edit', PERMISSION_UNIT_KEYS)).toBe('hr.employees')
    expect(unitKeyForRoute('/hr', PERMISSION_UNIT_KEYS)).toBe('hr')
    expect(unitKeyForRoute('/nope/x', PERMISSION_UNIT_KEYS)).toBeNull()
  })

  it('بذرة الهجرة الأحدث مطابقة لمخرجات المولّد (npx vite-node scripts/gen-permission-catalog.ts)', () => {
    const dir = join(ROOT, 'supabase/migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const withBlock = files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('-- <<catalog>>'))
    expect(withBlock.length).toBeGreaterThan(0)
    const sql = readFileSync(join(dir, withBlock[withBlock.length - 1]!), 'utf8')
    const start = sql.indexOf('-- <<catalog>>')
    const end = sql.indexOf('-- <<catalog/>>') + '-- <<catalog/>>'.length
    expect(start).toBeGreaterThan(0)
    expect(sql.slice(start, end)).toBe(permissionSeedSql().trim())
  })

  // ── 00350-B: ربط دوال الكتابة ──
  const guardedFns = (): string[] => {
    const src = readFileSync(join(ROOT, 'supabase/migrations/00291_write_guards_dedup_locks.sql'), 'utf8')
    const body = src.split('app.guarded_write_functions() returns text[]')[1]!.split('$$;')[0]!
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
  }

  it('كل دالة كتابة محمية (00291) إمّا مربوطة بوحدة+إجراء أو معفاة بسبب موثّق — لا كلاهما ولا لا شيء', () => {
    const fns = guardedFns()
    expect(fns.length).toBeGreaterThanOrEqual(60)
    const bound = new Set(Object.keys(WRITE_BINDINGS))
    const exempt = new Set(Object.keys(WRITE_BINDINGS_EXEMPT))
    expect(fns.filter((f) => !bound.has(f) && !exempt.has(f)), 'غير مربوطة وغير معفاة').toEqual([])
    expect(fns.filter((f) => bound.has(f) && exempt.has(f)), 'مربوطة ومعفاة معاً').toEqual([])
    expect([...bound, ...exempt].filter((f) => !fns.includes(f)), 'تشير إلى دالة غير محمية').toEqual([])
    for (const reason of Object.values(WRITE_BINDINGS_EXEMPT)) expect(reason.trim().length).toBeGreaterThan(3)
  })

  it('كل ربط يشير إلى وحدة موجودة وإجراء ينطبق عليها', () => {
    const byKey = new Map(PERMISSION_CATALOG.map((u) => [u.key, u]))
    for (const [fn, [unit, action]] of Object.entries(WRITE_BINDINGS)) {
      expect(byKey.get(unit), `${fn}: ${unit}`).toBeTruthy()
      expect(byKey.get(unit)!.actions, `${fn}: ${unit}:${action}`).toContain(action)
    }
  })

  it('بذرة الربط في الهجرة الأحدث مطابقة لمخرجات المولّد', () => {
    const dir = join(ROOT, 'supabase/migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const withBlock = files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('-- <<bindings>>'))
    expect(withBlock.length).toBeGreaterThan(0)
    const sql = readFileSync(join(dir, withBlock[withBlock.length - 1]!), 'utf8')
    const start = sql.indexOf('-- <<bindings>>')
    const end = sql.indexOf('-- <<bindings/>>') + '-- <<bindings/>>'.length
    expect(sql.slice(start, end)).toBe(permissionBindingsSql().trim())
  })
})
