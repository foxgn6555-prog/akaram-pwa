/**
 * ⚑ Portal Hygiene (نمط Kyvzon) — نظافة البوابات
 */
import { describe, it, expect } from 'vitest'
import { PORTAL_UNITS, portalThemes } from '@config/portals.config'

describe('⚓ نظافة البوابات', () => {
  it('كل بوابة لها ثيم معرف', () => {
    for (const portalId of Object.keys(PORTAL_UNITS)) {
      expect(portalThemes[portalId as keyof typeof portalThemes], `بوابة ${portalId}`).toBeDefined()
    }
  })

  it('لا وحدات بلا أيقونة', () => {
    for (const [, units] of Object.entries(PORTAL_UNITS)) {
      for (const unit of units) {
        expect(unit.icon, `وحدة ${unit.path}`).toBeTruthy()
        for (const child of unit.children ?? []) {
          expect(child.icon).toBeTruthy()
        }
      }
    }
  })

  it('لا مسارات مكرلة بين الوحدات', () => {
    const allPaths: string[] = []
    for (const [, units] of Object.entries(PORTAL_UNITS)) {
      for (const unit of units) {
        allPaths.push(unit.path)
        for (const child of unit.children ?? []) {
          allPaths.push(child.path)
        }
      }
    }
    expect(new Set(allPaths).size).toBe(allPaths.length)
  })

  it('كل مسار يبدأ بـ /', () => {
    for (const [, units] of Object.entries(PORTAL_UNITS)) {
      for (const unit of units) {
        expect(unit.path).toMatch(/^\//)
        for (const child of unit.children ?? []) {
          expect(child.path).toMatch(/^\//)
        }
      }
    }
  })
})
