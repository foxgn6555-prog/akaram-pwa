/**
 * 00201 — عقد: دوال RPC التي تُعيد void يجب أن تُستدعى عبر sdkVoid لا sdkGuard.
 * الجذر: sdkGuard يرمي «لم تُعد العملية أي بيانات» عند data=null، وهذا بالضبط ما يعيده PostgREST لدالة void
 * ⇒ حفظ التقرير/إعادة الترتيب/الحذف كانت تنجح في القاعدة لكن الواجهة تُظهر خطأ (صورة المستخدم).
 * يفحص الاختبار كل ملفات الترحيلات وكل ملفات SDK آلياً، ويختبر الغلافين على نتيجة void حقيقية.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'


const root = join(__dirname, '../../..')
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
const sql = migrations.map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n')
const returnType = new Map<string, string>()
for (const m of sql.matchAll(/create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(\w+)/g)) returnType.set(m[1]!, m[3]!.toLowerCase())

const sdkFiles = readdirSync(join(root, 'src/services')).filter((f) => f.endsWith('.ts'))

describe('void RPC ↔ sdkVoid', () => {
  it('لا يوجد أي استدعاء sdkGuard(supabase.rpc(<دالة void>)) في أي SDK', () => {
    const offenders: string[] = []
    for (const f of sdkFiles) {
      const src = readFileSync(join(root, 'src/services', f), 'utf8')
      for (const m of src.matchAll(/sdkGuard\(\s*supabase\.rpc\('(\w+)'/g)) {
        if (returnType.get(m[1]!) === 'void') offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
  it('يغطي الدوال المعروفة (حفظ التقرير، إعادة الترتيب، حذف التصميم) كـ void فعلاً', () => {
    expect(returnType.get('media_design_report_save')).toBe('void')
    expect(returnType.get('media_design_photos_reorder')).toBe('void')
    expect(returnType.get('media_design_delete')).toBe('void')
  })
  it('sdkVoid يقبل نتيجة data=null بلا خطأ، و sdkGuard يرفضها (توثيق السلوك)', async () => {
    const { sdkGuard, sdkVoid } = await import('@sdk/client')
    await expect(sdkVoid(Promise.resolve({ data: null, error: null }))).resolves.toBeUndefined()
    await expect(sdkGuard(Promise.resolve({ data: null, error: null }))).rejects.toMatchObject({ code: 'EMPTY_RESULT' })
    await expect(sdkVoid(Promise.resolve({ data: null, error: { message: 'MEDIA_FORBIDDEN', code: 'P0001' } }))).rejects.toMatchObject({ message: 'MEDIA_FORBIDDEN' })
  })
})
