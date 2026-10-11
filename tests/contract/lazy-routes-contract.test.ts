/**
 * 00209 — عقد الأداء: لا صفحة بوابة تُحمَّل بشكل مبكر (eager) من ملفات routes.tsx.
 * السبب الجذري للبطء: الاستيراد المباشر للصفحات يضعها كلها في الحزمة الأولى
 * فتُحمَّل صفحات 17 بوابة عند فتح أي بوابة. كل صفحة يجب أن تمرّ عبر lazy().
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PORTALS_DIR = join(process.cwd(), 'src', 'portals')

describe('⚓ عقد التحميل الكسول لصفحات البوابات', () => {
  const files = readdirSync(PORTALS_DIR).map((d) => join(PORTALS_DIR, d, 'routes.tsx')).filter((f) => existsSync(f))
  it('يوجد ملفات مسارات للبوابات', () => expect(files.length).toBeGreaterThan(10))
  for (const f of files) {
    it(`${f.split('/portals/')[1]} — لا استيراد مباشر لصفحات`, () => {
      const src = readFileSync(f, 'utf8')
      const eager = src.split('\n').filter((l) => /^import\s+\w+\s+from\s+'(\.\/pages|@portals\/[^']*\/pages)/.test(l))
      expect(eager, eager.join('\n')).toEqual([])
      if (/element:/.test(src)) expect(src).toMatch(/lazy\(\(\) => import\(/)
    })
  }
})
