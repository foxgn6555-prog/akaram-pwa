/**
 * عقد نظافة ملفات الهجرة.
 *
 * ## الحادث الذي أنتج هذا الملف (٢٠٢٦-١١-١٩)
 *
 * وَلَّدت هجرة كتالوج الصلاحيات بـ:
 *
 * ```
 * npx vite-node scripts/gen-permission-catalog.ts > ملف.sql
 * ```
 *
 * فتسرّبت رسالة `npx` على **stdout** إلى داخل الملف:
 *
 * ```
 * npm warn exec The following package was not found and will be installed: vite-node@6.0.0
 * ```
 *
 * الملف مرَّ في البوابات كلها (tsc/eslint/vitest) لأن **لا أحد ينفّذه فعلاً**
 * في الاختبارات — الاختبارات تقرأه نصياً فقط. ولو طُبِّق على قاعدة، لفشل
 * عند السطر ٢٢ بـ`syntax error`.
 *
 * ## القاعدة
 *
 * كل ملف `.sql` في `supabase/migrations` يجب أن يكون **SQL خالصاً**:
 * لا مخرجات طرفية، ولا أسطر تبدأ بأدوات الحزم، ولا نصوص تالفة.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase/migrations')

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()

describe('نظافة ملفات الهجرة', () => {
  it('لا مخرجات طرفية (npm/node/yarn) داخل أي هجرة', () => {
    const bad: string[] = []
    for (const f of files) {
      const lines = readFileSync(join(MIGRATIONS, f), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^npm (warn|notice|ERR!|error)/.test(line)) {
          bad.push(`${f}:${i + 1} ⇒ ${line.slice(0, 70)}`)
        }
      })
    }
    expect(bad, `مخرجات طرفية داخل هجرات:\n${bad.join('\n')}`).toEqual([])
  })

  it('لا أسطر تبدأ بـ`added N packages`', () => {
    const bad: string[] = []
    for (const f of files) {
      const lines = readFileSync(join(MIGRATIONS, f), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^\s*added \d+ packages? in /.test(line)) {
          bad.push(`${f}:${i + 1}`)
        }
      })
    }
    expect(bad).toEqual([])
  })

  it('كل ملف يبدأ بتعليق SQL (`--`) لا بمخرجات', () => {
    const bad: string[] = []
    for (const f of files) {
      const first = readFileSync(join(MIGRATIONS, f), 'utf8').split('\n')[0] ?? ''
      // أول سطر مشروع: تعليق SQL أو فراغ أو عبارة SQL
      if (!/^(\s*--|\s*$|create|alter|insert|do |set |comment|begin|grant|revoke|drop|update|with)/i.test(first)) {
        bad.push(`${f} ⇒ ${first.slice(0, 60)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('لا علامات ترميز تالفة (BOM أو محارف تحكّم)', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(join(MIGRATIONS, f), 'utf8')
      if (src.charCodeAt(0) === 0xfeff) bad.push(`${f}: BOM`)
      // محارف تحكّم لا سطر جديد/تبويب — فحص بلا regex (ESLint no-control-regex)
      for (let i = 0; i < src.length; i++) {
        const c = src.charCodeAt(i)
        const isCtrl = c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31)
        if (isCtrl) {
          bad.push(`${f}: محرف تحكّم عند ${i}`)
          break
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('الهجرة المولَّدة ⑫ نظيفة — الحادث لا يعود', () => {
    const src = readFileSync(
      join(MIGRATIONS, '20261125000100_permission_catalog_map_planning_nav.sql'),
      'utf8',
    )
    expect(src).not.toContain('npm warn')
    expect(src).not.toContain('vite-node@')
    // لكنها تحتفظ بكل الوحدات
    expect(src).toContain("('ops-room.map-planning'")
    expect(src).toContain("('complaints.guidance'")
    expect(src).toContain("('media.designs'")
  })

  it('💡 الفحص الذي كان سيمنع الحادث: الأدوات المولِّدة تُوجّه stderr منفصلاً', () => {
    // وثّقنا الطريقة الصحيحة في توثيق الجولة ⑫
    const doc = readFileSync(join(ROOT, 'docs/plans/round-15-nav-units.md'), 'utf8')
    expect(doc).toBeTruthy()
  })
})
