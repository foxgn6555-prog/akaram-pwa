/**
 * عقد: قيم بارامترات `date` في نداءات RPC للآليات المؤجرة.
 *
 * الجذر (عطل إنتاج 2026-11-27): الواجهة تحمل الشهر بصيغة `YYYY-MM` من
 * `<input type="month">` و`baghdadYm()`، والبارامتر `p_month` نوعه `date` في القاعدة.
 * تمرير `2026-11` يُرفض في طبقة PostgREST برمز 22007
 * (invalid input syntax for type date) **قبل** دخول الدالة، فيعيد 400
 * ولا تظهر رسالة عربية — الأبواب الثلاثة (العمليات، المعاون، المالية) كانت معطّلة.
 *
 * ⚠ نطاق الفحص مقصود: نداءات `p_month` في `rented-vehicles.sdk.ts` فقط.
 * محاولة فحص كل الـSDK آلياً أنتجت 92 نتيجة كاذبة (متغيّرات لا يُعرف محتواها وقت الفحص)،
 * واختبار يصرخ كذباً لا يُحرس شيئاً. الأنواع هنا مستخرجة من الترحيلات لا من قائمة يدوية،
 * حتى لا يصبح الاختبار قديماً بصمت.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migrationDir = join(root, 'supabase/migrations')
const sdkPath = join(root, 'src/services/rented-vehicles.sdk.ts')
const sdk = readFileSync(sdkPath, 'utf8')

/** كل دوال المخطط public ونوع كل بارامتر فيها، مستخرجة من الترحيلات */
const paramTypes = new Map<string, Map<string, string>>()
for (const f of readdirSync(migrationDir).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(migrationDir, f), 'utf8')
  for (const fn of sql.matchAll(/create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/gi)) {
    const params = new Map<string, string>()
    // كل سطر بارامتر: p_name type [default ...]
    for (const line of fn[2]!.split(',')) {
      const m = line.trim().match(/^(\w+)\s+([a-z]+)/i)
      if (m) params.set(m[1]!, m[2]!.toLowerCase())
    }
    paramTypes.set(fn[1]!, params)
  }
}

/** البارامترات من نوع تاريخ في هذا الملف، مشتقة من القاعدة */
const dateParamsOf = (fn: string) =>
  [...(paramTypes.get(fn) ?? new Map<string, string>())]
    .filter(([, t]) => t === 'date' || t === 'timestamp' || t.startsWith('timestamp'))
    .map(([name]) => name)

describe('بارامترات date في الآليات المؤجرة', () => {
  it('الأنواع مستخرجة من الترحيلات وتطابق الواقع', () => {
    expect(paramTypes.get('rented_attendance_month')?.get('p_month')).toBe('date')
    expect(paramTypes.get('rented_payroll_sheet')?.get('p_month')).toBe('date')
    expect(paramTypes.get('rented_attendance_set_day')?.get('p_day')).toBe('date')
    expect(paramTypes.get('rented_month_submit')?.get('p_month')).toBe('date')
    expect(paramTypes.get('rented_month_pay')?.get('p_month')).toBe('date')
    expect(paramTypes.get('rented_month_decide_deputy')?.get('p_month')).toBe('date')
    expect(paramTypes.get('rented_salary_save')?.get('p_month')).toBe('date')
  })

  it('كل نداء لبارامتر date في SDK الآليات يمرّ عبر مُطبِّع (لا قيمة YYYY-MM خام)', () => {
    const offenders: string[] = []
    const calls = [...sdk.matchAll(/rpc<[^>]*>\(\s*'(\w+)'\s*,\s*\{([\s\S]*?)\}\s*\)/g)]
    expect(calls.length).toBeGreaterThan(10)

    for (const call of calls) {
      const fn = call[1]!
      const args = call[2]!
      for (const param of dateParamsOf(fn)) {
        const hit = args.match(new RegExp(`\\b${param}\\s*:\\s*([^,\\n}]+)`))
        if (!hit) continue
        const expr = hit[1]!.trim()
        if (!/^asMonthStart\(|^asDay\(/.test(expr)) offenders.push(`${fn}(${param}: ${expr})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('كل `p_month:` و`p_day:` داخل مُطبِّع، لا متغيّر خام', () => {
    // الحارس المباشر على العطل الأصلي. المطابقة على بداية الوسيط فقط:
    // القيمة المقبولة هي استدعاء asMonthStart/asDay، وما عداها مرفوض.
    const offenders: string[] = []
    for (const m of sdk.matchAll(/(p_month|p_day):\s*([^,\n}]+)/g)) {
      const value = m[2]!.trim()
      if (!/^(asMonthStart|asDay)\(/.test(value)) offenders.push(`${m[1]}: ${value}`)
    }
    expect(offenders).toEqual([])
    // ولا بدّ أن يكون هناك فعلًا مواضع مفحوصة، وإلا فالاختبار يمرّ على ملف فارغ
    expect([...sdk.matchAll(/(p_month|p_day):/g)].length).toBeGreaterThanOrEqual(6)
  })

  it('asMonthStart/asDay يطبّعان فعلياً (نداء الدالة الحقيقية لا نسخة يدوية)', async () => {
    const { asMonthStart, asDay } = await import('@sdk/rented-vehicles.sdk')
    expect(asMonthStart('2026-11')).toBe('2026-11-01')
    expect(asMonthStart('2026-11-01')).toBe('2026-11-01')
    expect(asMonthStart(null)).toBeNull()
    expect(asDay('2026-11-05')).toBe('2026-11-05')
    expect(asDay('2026-11')).toBe('2026-11-01')
    expect(asDay(null)).toBeNull()

    // كل ناتج من مدخلات الشهر يجب أن يكون تاريخاً كاملاً (يقبله PostgreSQL)
    for (const ym of ['2026-01', '2026-02', '2026-12']) {
      expect(asMonthStart(ym)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
