/**
 * ⚓ العقد الصارم: كل دور يفتح بوابته فقط
 *  · it_admin → /it حصراً (أي بوابة أخرى → إعادة توجيه إلى /it)
 *  · hr_officer → /hr حصراً … وهكذا
 *  · super_admin → إشراف على كل البوابات
 *  · متعدد الأدوار → بوابة الدور ذي الأولوية العليا + السماح لبواباته فقط
 */
import { describe, it, expect } from 'vitest'
import { resolvePortal } from '@router/portal.router'
import { portalGuard } from '@router/guards/portal.guard'
import { PORTAL_ROUTES } from '@router/routes.config'
import type { SessionUser } from '@sdk/auth.sdk'
import type { Role } from '@lib/constants/roles.constants'

function sessionWith(...roles: Role[]): SessionUser {
  return {
    id: 'u1',
    email: 'x@akram.iq',
    fullName: 'مستخدم',
    roles,
    primaryRole: roles[0] ?? 'employee',
  }
}

const PORTALS = {
  employee: '/employee',
  hr: '/hr',
  manager: '/manager',
  finance: '/finance',
  it: '/it',
  admin: '/admin',
  'field-ops': '/field-ops',
  'admin-ops': '/admin-ops',
  maintenance: '/maintenance',
  'transfer-station': '/transfer-station',
  executive: '/executive',
  deputy: '/deputy',
  'ops-room': '/ops-room',
  disclosures: '/disclosures',
  complaints: '/complaints',
} as const

/** هل يسمح الحارس بالدخول لهذه البوابة بهذا الدور؟ */
function canEnter(roles: Role[], portal: keyof typeof PORTALS): boolean {
  const decision = portalGuard(sessionWith(...roles), portal)
  return decision.decision === 'allow'
}

describe('⚓ العقد الصارم: دور → بوابة واحدة فقط', () => {
  it('it_admin: يفتح /it فقط — وكل بوابة أخرى ترجعه إلى /it', () => {
    const roles: Role[] = ['it_admin']
    expect(resolvePortal(roles)).toEqual({ type: 'single', portal: 'it', path: '/it' })

    expect(canEnter(roles, 'it')).toBe(true)
    expect(canEnter(roles, 'hr')).toBe(false)
    expect(canEnter(roles, 'finance')).toBe(false)
    expect(canEnter(roles, 'employee')).toBe(false)
    expect(canEnter(roles, 'manager')).toBe(false)
    expect(canEnter(roles, 'admin')).toBe(false)

    // سلوك التحويل: محاولة /hr بأدوار IT → redirect إلى /it
    const decision = portalGuard(sessionWith(...roles), 'hr')
    expect(decision.decision).toBe('redirect')
    expect(decision.redirectTo).toBe('/it')
  })

  it('hr_officer: يفتح /hr فقط', () => {
    expect(canEnter(['hr_officer'], 'hr')).toBe(true)
    expect(canEnter(['hr_officer'], 'it')).toBe(false)
    expect(canEnter(['hr_officer'], 'finance')).toBe(false)
    expect(canEnter(['hr_officer'], 'admin')).toBe(false)
  })

  it('finance_officer: يفتح /finance فقط', () => {
    expect(canEnter(['finance_officer'], 'finance')).toBe(true)
    expect(canEnter(['finance_officer'], 'it')).toBe(false)
    expect(canEnter(['finance_officer'], 'hr')).toBe(false)
  })

  it('department_manager: يفتح /manager فقط', () => {
    expect(canEnter(['department_manager'], 'manager')).toBe(true)
    expect(canEnter(['department_manager'], 'hr')).toBe(false)
  })

  it('employee: يفتح /employee فقط', () => {
    expect(canEnter(['employee'], 'employee')).toBe(true)
    expect(canEnter(['employee'], 'it')).toBe(false)
    expect(canEnter(['employee'], 'manager')).toBe(false)
  })

  it('super_admin: إشراف على كل البوابات — والافتراضية «التطوير المركزية» /it', () => {
    expect(resolvePortal(['super_admin'])).toEqual({ type: 'single', portal: 'it', path: '/it' })
    for (const p of Object.keys(PORTALS) as Array<keyof typeof PORTALS>) {
      expect(canEnter(['super_admin'], p), `super_admin → ${p}`).toBe(true)
    }
  })

  it('super_admin + it_admin معاً: الافتراضية تبقى «التطوير المركزية»', () => {
    expect(resolvePortal(['it_admin', 'super_admin'])).toEqual({
      type: 'single',
      portal: 'it',
      path: '/it',
    })
  })

  it('البوابات السبع الجديدة: كل دور يفتح بوابته فقط', () => {
    const pairs: Array<[Role, keyof typeof PORTALS]> = [
      ['field_ops', 'field-ops'],
      ['admin_ops', 'admin-ops'],
      ['maintenance', 'maintenance'],
      ['transfer_station', 'transfer-station'],
      ['executive_director', 'executive'],
      ['deputy_director', 'deputy'],
      ['ops_room', 'ops-room'],
      ['disclosures_officer', 'disclosures'],
      ['complaints_officer', 'complaints'],
    ]
    for (const [role, portal] of pairs) {
      expect(resolvePortal([role]), `${role} → /${portal}`).toEqual({
        type: 'single',
        portal,
        path: `/${portal}`,
      })
      expect(canEnter([role], portal), `${role} → ${portal}`).toBe(true)
      // بوابات أخرى مغلقة عنه
      expect(canEnter([role], 'admin'), `${role} ↛ admin`).toBe(false)
      expect(canEnter([role], 'it'), `${role} ↛ it`).toBe(false)
    }
  })

  it('مستخدم بأدوار مركبة: يدخل بواباته ولا يدخل غيرها', () => {
    const roles: Role[] = ['employee', 'department_manager']
    expect(canEnter(roles, 'manager')).toBe(true)
    expect(canEnter(roles, 'employee')).toBe(true)
    expect(canEnter(roles, 'it')).toBe(false)
    // توجيه مباشر بلا شاشة اختيار: بوابة الدور ذي الأولوية العليا (manager قبل employee)
    expect(resolvePortal(roles)).toEqual({ type: 'single', portal: 'manager', path: '/manager' })
  })

  it('مصادر الـ routes نفسها صارمة (لا تكرار متساهل)', () => {
    const byPath = new Map(PORTAL_ROUTES.map((r) => [r.path, r.allowedRoles]))
    expect(byPath.get('/employee')).toEqual(['employee', 'super_admin'])
    expect(byPath.get('/hr')).toEqual(['hr_officer', 'super_admin'])
    expect(byPath.get('/manager')).toEqual(['department_manager', 'super_admin'])
    expect(byPath.get('/finance')).toEqual(['finance_officer', 'super_admin'])
    expect(byPath.get('/it')).toEqual(['it_admin', 'super_admin'])
    expect(byPath.get('/admin')).toEqual(['super_admin'])
    expect(byPath.get('/complaints')).toEqual(['complaints_officer', 'super_admin'])
  })

  it('بلا جلسة → تحويل إلى /login', () => {
    const decision = portalGuard(null, 'it')
    expect(decision.decision).toBe('redirect')
    expect(decision.redirectTo).toBe('/login')
  })
})
