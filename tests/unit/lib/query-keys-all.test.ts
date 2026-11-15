/** عقد شامل لمصانع Query Keys: كل مصنع يعيد مصفوفة تبدأ بنطاق الوحدة، ويقبل الوسائط الاختيارية. */
import { describe, expect, it } from 'vitest'

const modules = import.meta.glob('/src/lib/query-keys/*.keys.ts', { eager: true }) as Record<string, Record<string, unknown>>

describe('query keys — كل الوحدات', () => {
  for (const [path, mod] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(mod)) {
      if (!value || typeof value !== 'object' || !Array.isArray((value as { all?: unknown }).all)) continue
      const factory = value as Record<string, unknown> & { all: readonly unknown[] }
      it(`${path.split('/').pop()} · ${name}`, () => {
        expect(factory.all.length).toBeGreaterThan(0)
        for (const [key, fn] of Object.entries(factory)) {
          if (typeof fn !== 'function') continue
          const args = Array.from({ length: fn.length }, (_, i) => (i === 0 ? {} : 'x'))
          for (const callArgs of [[], args]) {
            const result = (fn as (...a: unknown[]) => unknown)(...callArgs)
            expect(Array.isArray(result)).toBe(true)
            expect((result as unknown[]).slice(0, factory.all.length)).toEqual(factory.all)
            expect(key.length).toBeGreaterThan(0)
          }
        }
      })
    }
  }
})
