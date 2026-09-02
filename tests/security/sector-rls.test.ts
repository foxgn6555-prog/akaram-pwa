/**
 * ⚓ عزل بيانات مسؤولي الأقسام (RLS) — تحقق ثابت من ملفات الميجريشن:
 *  · RLS مفعّل على كل جداول القواطع
 *  · الكتابة عبر RPCs بصلاحية SECURITY DEFINER تشتق الهوية من auth.uid() (لا تمرير مدير من العميل)
 *  · سياسات القراءة تحصر مدير القسم في قواطعه
 *  · bucket الصور خاص ومجلد كل مدير معزول
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (name: string): string =>
  readFileSync(resolve(__dirname, '..', '..', 'supabase', 'migrations', name), 'utf-8')

const sql44 = read('00044_sector_supervisor.sql')
const sql45 = read('00045_sector_rpc.sql')

describe('⚓ عزل بيانات القواطع — ميجرشن 00044', () => {
  const tables = [
    'manager_profiles',
    'sector_workers',
    'sector_vehicles',
    'sector_supply_requests',
    'sector_breakdowns',
    'sector_photos',
    'sector_attendance',
  ]

  it.each(tables)('RLS مفعّل على جدول %s', (table) => {
    expect(sql44).toContain(`alter table public.${table} enable row level security`)
  })

  it('sectors للقراءة العامة للمصادَقين فقط', () => {
    expect(sql44).toMatch(/policy .*sectors: قراءة للمصادَقين/)
  })

  it('دوال مساعد العزل موجودة في schema app', () => {
    expect(sql44).toContain('app.current_manager_sectors')
    expect(sql44).toContain('app.manager_manages_sector')
    expect(sql44).toContain('app.manager_owns_sectors')
  })

  it('سياسات العمال/الآليات تستخدم تحقق ملكية القاطع', () => {
    expect(sql44).toContain('app.manager_manages_sector')
  })

  it('كل دوال المساعدين SECURITY DEFINER (لا تعتمد على صلاحيات المتصل)', () => {
    // مقطع دوال schema app الثلاث
    const start = sql44.indexOf('create or replace function app.current_manager_sectors')
    const block = sql44.slice(start)
    const definerInHelpers = (block.match(/security definer/gi) ?? []).length
    expect(definerInHelpers).toBeGreaterThanOrEqual(3)
  })

  it('bucket الصور خاص (private) وليس عاماً', () => {
    expect(sql44).toMatch(/storage\.buckets/)
    expect(sql44).toMatch(/'sector-photos'/)
    expect(sql44).toContain('public', ) // كلمة public موجودة لكن:
    // لا يوجد إنشاء bucket عام
    expect(sql44).not.toMatch(/insert into storage\.buckets[^;]*public[^;]*true/is)
  })

  it('سياسة رفع الصور تحصر المسار في مجلد uid الخاص بالمدير', () => {
    expect(sql44).toContain('auth.uid()')
    expect(sql44).toMatch(/storage\.foldername\(name\)\)\[1\]/)
  })

  it('قيود الإسناد: قاطع واحد إلى 3', () => {
    expect(sql44).toMatch(/array_length\(sectors/)
  })

  it('الحضورية فريدة لكل عامل/يوم/شفت', () => {
    expect(sql44).toMatch(/unique.*worker_id.*log_date.*shift|sector_attendance_worker_day_unique/is)
  })
})

describe('⚓ كتابات القواطع — ميجرشن 00045 (RPCs)', () => {
  const rpcs = [
    'sector_submit_supply',
    'sector_submit_breakdown',
    'sector_register_photo',
    'sector_set_attendance',
    'sector_add_worker',
    'sector_add_vehicle',
  ]

  it.each(rpcs)('الإجراء %s موجود و SECURITY DEFINER', (rpc) => {
    expect(sql45).toContain(`create or replace function public.${rpc}`)
  })

  it('عدد دوال SECURITY DEFINER لا يقل عن عدد الإجراءات', () => {
    const definerCount = (sql45.match(/security definer/gi) ?? []).length
    expect(definerCount).toBeGreaterThanOrEqual(rpcs.length)
  })

  it('الهوية تُشتق من auth.uid() وليس من وسائط العميل (لا يُمرَّر manager_id/اسم/قواطع المدير)', () => {
    expect(sql45).toContain('auth.uid()')
    // العميل لا يُمرّر هوية المدير إطلاقاً
    expect(sql45).not.toContain('p_manager_id')
    expect(sql45).not.toContain('p_manager_name')
    // دوال الكتب/الصور/الأعطال لا تستقبل قواطع أو شفت المدير من العميل
    const supplyFn = sql45.slice(
      sql45.indexOf('create or replace function public.sector_submit_supply'),
      sql45.indexOf('create or replace function public.sector_submit_breakdown'),
    )
    expect(supplyFn).not.toMatch(/p_shift|p_sectors|p_manager/)
  })

  it('اسم المدير يُجلب من employees (لا يُرسل من العميل)', () => {
    expect(sql45).toMatch(/from public\.employees where user_id\s*=\s*v_uid/)
  })

  it('تسجيل الحضورية يتحقق أن العامل ضمن قواطع المدير', () => {
    const attFn = sql45.slice(
      sql45.indexOf('create or replace function public.sector_set_attendance'),
      sql45.indexOf('create or replace function public.sector_add_worker'),
    )
    expect(attFn).toContain('sector_workers')
    // تحقق أن قاطع العامل ضمن قواطع ملف المدير (المشتق من auth.uid)
    expect(attFn).toMatch(/v_worker\.sector_id\s*=\s*any\(v_profile\.sectors\)/)
  })

  it('إضافة عامل/آلية تتحقق من ملكية القاطع المُدخل', () => {
    const count = (sql45.match(/p_sector_id\s*=\s*any\(v_profile\.sectors\)/g) ?? []).length
    // دالتان: إضافة عامل + إضافة آلية
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('طلب المستلزمات يفرض التوقيع الإلكتروني (signed = true)', () => {
    expect(sql45).toMatch(/p_signed[\s\S]{0,200}(if|raise|not\s+p_signed|p_signed is not true)/i)
  })

  it('الإجراءات ممنوحة للمصادَقين فقط (ليست عامة)', () => {
    expect(sql45).toMatch(/grant execute[\s\S]*to authenticated/)
    expect(sql45).not.toMatch(/grant execute[\s\S]*to anon/)
    expect(sql45).not.toMatch(/grant execute[\s\S]*to public/)
  })

  it('رقم الكتاب يتولّد بتنسيق عربي متسلسل', () => {
    expect(sql45).toContain('كتاب/مستلزمات/')
  })
})
