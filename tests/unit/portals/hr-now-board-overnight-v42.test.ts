/**
 * ④-46 / V-42 — انحدار: الشفت الليلي (الممتد بعد منتصف الليل) في «من في الدوام الآن».
 *
 * العيب الذي كان: دالة `hr_now_board` كانت تُثبّت للشفت الممتد القيم:
 *   started = true · ended = false · grace_passed = true   ← «لم يحضر بعد» طوال اليوم لكل صاحب شفت ليلي
 * والنتيجة: إنذار أحمر كاذب قبل بداية الشفت + «المطلوب حضورهم الآن» متضخّم + لا تصنيف «غائب» بعد نهاية الشفت.
 *
 * الإصلاح: الخيار (ب) بقرار المستخدم — قبل البداية «قبل الدوام» · بعد النهاية «غائب» · يوم الحضور = يوم بداية الشفت
 * (تُقرأ بصمات اليوم السابق قبل بداية شفت اليوم فقط).
 *
 * هذا الاختبار يحرس الاستبدالات الخمسة في ملف المهاجرة المُطبَّق على القاعدة، ويحرس أن الأوقات غير المستحقّة
 * (قبل الدوام/إجازة/راحة/بلا شفت) لا تدخل مقام «نسبة الحضور الآن».
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { presenceRatio } from '@portals/hr/pages/Attendance/NowBoardPage'
import type { NowBoardRow } from '@features/hr/types'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
const FILE = '20261110220000_now_board_overnight_shift.sql'
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8')

const nb = (n: string, state: NowBoardRow['state'], extra: Partial<NowBoardRow> = {}): NowBoardRow => ({
  employee_id: n, employee_number: n, full_name: `موظف ${n}`, job_title: null, department_id: 'dep1', department_name: 'قسم النظافة', branch_name: 'الشركة',
  shift_name: 'مسائي', expected_in: '17:00:00', expected_out: '04:00:00', check_in: null, check_out: null, late_minutes: 0, state, leave_type: null, ...extra,
})

describe('V-42 · الشفت الليلي في قاعدة «من في الدوام الآن»', () => {
  it('المهاجرة تُطبَّق بعد التعريف الأصلي للدالة (00335)', () => {
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(all.indexOf(FILE)).toBeGreaterThan(all.indexOf('00335_hr_now_board.sql'))
  })

  it('نافذة الشفت الليلي الفعلية: يبدأ 17:00 حتى 04:00 وينتهي 04:00 حتى 17:00', () => {
    expect(sql).toContain('else (c.lt >= sh.start_time or c.lt < sh.end_time) end as started,')
    expect(sql).toContain('else (c.lt >= sh.end_time and c.lt < sh.start_time) end as ended,')
    expect(sql).toContain('sh.start_time + make_interval(mins => coalesce(sh.grace_minutes, 0)) or c.lt < sh.end_time) end as grace_passed')
  })

  it('يوم الحضور = يوم بداية الشفت: بصمات الأمس تُقرأ قبل بداية شفت اليوم فقط', () => {
    expect(sql).toContain('sh.end_time <= sh.start_time and c.lt < sh.start_time) as use_prev')
    expect(sql).toContain('ap.work_date = c.today - 1 and ow.use_prev')
    expect(sql).toContain('case when ow.use_prev then ap.status else a.status end as att_status')
  })

  it('الحماية: لا كتابة بيانات في هذه المهاجرة (تعديل تعريف دالة فقط)', () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i)
    expect(sql).not.toMatch(/\bupdate\s+public\./i)
    expect(sql).not.toMatch(/\bdelete\s+from\b/i)
    expect(sql).not.toMatch(/\bdrop\s+(table|function)/i)
  })

  it('«قبل الدوام» لا تُحسب في مقام نسبة الحضور الآن (ويتساوى الشفت الليلي مع النهاري)', () => {
    const rows = [nb('N1', 'present', { check_in: '2026-11-10T14:05:00Z' }), nb('N2', 'missing'), nb('N3', 'upcoming'), nb('N4', 'leave'), nb('N5', 'rest'), nb('N6', 'off'), nb('N7', 'absent')]
    expect(presenceRatio(rows)).toEqual({ present: 1, expected: 3, pct: 33 })
  })
})
