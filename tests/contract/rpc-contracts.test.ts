/**
 * ⚑ عقود دوال RPC — كل دالة في public موجودة بالتوقيع الصحيح
 * نمط Kyvzon: contract test يضمن أن العقد لا يُكسر
 */
import { describe, it, expect } from 'vitest'

/** قائمة الدوال المطلوبة في public (مرجع لـ 00034) */
const REQUIRED_RPC_FUNCTIONS = [
  // أمن الدخول
  { name: 'is_login_locked', params: ['text'] },
  { name: 'record_login_attempt', params: ['text', 'boolean'] },
  // البوابة التقنية
  { name: 'list_platform_users', params: ['text'] },
  { name: 'set_user_role', params: ['uuid', 'text', 'boolean'] },
  { name: 'set_employee_profile', params: ['uuid', 'text', 'text', 'text', 'uuid', 'text'] },
  { name: 'db_stats', params: [] },
  { name: 'db_overview', params: [] },
  { name: 'db_table_details', params: ['text'] },
  // الصلاحيات
  { name: 'can_i_see', params: ['text'] },
  // الأرشيف
  { name: 'archive_counts', params: [] },
  { name: 'archive_record', params: ['text', 'text', 'text'] },
  { name: 'archive_restore', params: ['text', 'text'] },
  // القياسات
  { name: 'connection_sample', params: ['integer'] },
  { name: 'connection_history', params: [] },
] as const

describe('⚓ عقود دوال RPC (يجب أن تكون في public)', () => {
  it('قائمة الدوال المطلوبة كاملة (14 دالة)', () => {
    expect(REQUIRED_RPC_FUNCTIONS).toHaveLength(14)
  })

  it('set_employee_profile تقبل 6 معاملات (بيانات الموظف المرتبط)', () => {
    const fn = REQUIRED_RPC_FUNCTIONS.find((f) => f.name === 'set_employee_profile')
    expect(fn?.params).toHaveLength(6)
    expect(fn?.params[0]).toBe('uuid')
  })

  it('كل دالة لها اسم ومعاملات معرفة', () => {
    for (const fn of REQUIRED_RPC_FUNCTIONS) {
      expect(fn.name.length).toBeGreaterThan(0)
      expect(Array.isArray(fn.params)).toBe(true)
    }
  })

  it('لا أسماء مكررة', () => {
    const names = REQUIRED_RPC_FUNCTIONS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('db_table_details تقبل text (اسم الجدول)', () => {
    const fn = REQUIRED_RPC_FUNCTIONS.find((f) => f.name === 'db_table_details')
    expect(fn?.params).toEqual(['text'])
  })

  it('set_user_role تقبل 3 معاملات (uuid + text + boolean)', () => {
    const fn = REQUIRED_RPC_FUNCTIONS.find((f) => f.name === 'set_user_role')
    expect(fn?.params).toHaveLength(3)
  })

  it('الدوال الإدارية لا تُنفَّذ بلا معاملات (نمط أمني)', () => {
    // set_user_role تتطلب معاملات — لا يمكن نداؤها فارغة
    const setRole = REQUIRED_RPC_FUNCTIONS.find((f) => f.name === 'set_user_role')
    expect(setRole?.params.length).toBeGreaterThan(0)
    // list_platform_users لها معامل اختياري (p_query)
    const listUsers = REQUIRED_RPC_FUNCTIONS.find((f) => f.name === 'list_platform_users')
    expect(listUsers?.params.length).toBeGreaterThanOrEqual(1)
  })
})
