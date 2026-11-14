/**
 * 00416 — تقليص إسنادات anon_exec في مخطط public (البند ⑨-ب).
 * قبل: 354 دالة في public ينفّذها anon، منها 3 دوال تطبيق خاصة غير SECURITY DEFINER
 * (set_limit, ts_vehicle_kinds_list, vehicle_categories_list).
 * بعد: 0 دوال تطبيق خاصة غير secdef ينفذها anon، مع بقاء citizen_* للزوار (13)
 * وauthenticated كاملاً (912).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261115120000_revoke_anon_execute_public_schema.sql'),
  'utf8',
)
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase()

describe('00416 — سحب anon من مخطط public', () => {
  it('يسحب من public وanon معًا في مخطط public', () => {
    expect(sql).toMatch(/revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from\s+public\s*,\s*anon/)
  })

  it('يمنح authenticated وservice_role بديلًا — لبقاء كل البوابات الداخلية', () => {
    expect(sql).toMatch(/grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+to\s+authenticated/)
    expect(sql).toMatch(/grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+to\s+service_role/)
  })

  it('يُبقي القائمة البيضاء للزوار: كل دوال citizen_* (13 دالة)', () => {
    const citizen = [
      'citizen_portal_info()',
      'citizen_sign_in(text, text)',
      'citizen_complaint_submit(uuid, text, text, double precision, double precision, text, text[])',
      'citizen_my_complaints(uuid)',
      'citizen_complaint_rate(uuid, uuid, integer)',
      'citizen_complaint_add_note(uuid, text)',
      'citizen_complaint_set_status(uuid, text, text)',
      'citizen_chat_request(uuid)',
      'citizen_chat_state(uuid, bigint)',
      'citizen_chat_send(uuid, text, text)',
      'citizen_chat_close(uuid)',
      'citizen_chat_rate(uuid, uuid, integer, text)',
      'citizen_complaints_report(date, date)',
    ]
    for (const fn of citizen) {
      const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(sql).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${esc}\\s+to\\s+anon`))
    }
  })

  it('لا يمنح anon أي دالة غير citizen_*', () => {
    const anonGrants = [...sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.([^\s(]+)\s*\([^)]*\)\s+to\s+anon/g)].map((m) => m[1])
    for (const g of anonGrants) {
      expect(g).toMatch(/^citizen_/)
    }
  })

  it('يضبط الامتيازات الافتراضية للدوال المستقبلية في public', () => {
    expect(sql).toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+execute\s+on\s+functions\s+from\s+public/)
    expect(sql).toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+public\s+grant\s+execute\s+on\s+functions\s+to\s+authenticated/)
    expect(sql).toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+public\s+grant\s+execute\s+on\s+functions\s+to\s+service_role/)
  })

  it('لا يغيّر أي تعريف دالة ولا سياسة ولا بيانات', () => {
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function/)
    expect(sql).not.toMatch(/drop\s+function/)
    expect(sql).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy/)
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b/)
  })
})
