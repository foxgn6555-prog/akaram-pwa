/**
 * 00415 — تقليص إسنادات anon_exec على مخطط app.
 * قبل: 664 دالة ينفّذها anon (310 منها في app عبر الامتياز الافتراضي لـPUBLIC).
 * بعد: 1 فقط في app (app.citizen_token_valid لسياسة تخزين صور الشكاوى) وبقاء 354 في public للجولة التالية.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261113160000_revoke_anon_execute_app_schema.sql'),
  'utf8',
)
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase()

describe('00415 — سحب anon من مخطط app', () => {
  it('يسحب من public وanon معًا (سحب anon وحده لا يكفي لأن PUBLIC هو مصدر الامتياز)', () => {
    expect(sql).toMatch(/revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+app\s+from\s+public\s*,\s*anon/)
  })

  it('يمنح authenticated وservice_role بديلًا — وإلا كسرت 313 سياسة RLS', () => {
    expect(sql).toMatch(/grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+app\s+to\s+authenticated/)
    expect(sql).toMatch(/grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+app\s+to\s+service_role/)
  })

  it('يُبقي الاستثناء الوحيد للزائر: app.citizen_token_valid', () => {
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+app\.citizen_token_valid\(text\)\s+to\s+anon/)
  })

  it('يضبط الامتيازات الافتراضية للدوال المستقبلية', () => {
    expect(sql).toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+app\s+revoke\s+execute\s+on\s+functions\s+from\s+public/)
    expect(sql).toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+app\s+grant\s+execute\s+on\s+functions\s+to\s+authenticated/)
  })

  it('لا يغيّر أي تعريف دالة ولا سياسة ولا بيانات', () => {
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function/)
    expect(sql).not.toMatch(/drop\s+function/)
    expect(sql).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/)
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b/)
    // لا منح لـanon إلا الدالة الواحدة المستثناة
    const anonGrants = [...sql.matchAll(/grant\s+execute\s+on\s+([^;]+?)\s+to\s+anon/g)].map((m) => m[1])
    expect(anonGrants).toEqual(['function app.citizen_token_valid(text)'])
  })

  it('محصور في مخطط app — لا يمسّ public', () => {
    expect(sql).not.toMatch(/in\s+schema\s+public/)
  })
})
