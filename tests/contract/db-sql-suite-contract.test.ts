/**
 * عقد سلامة حزمة اختبارات SQL (tests/db) — يمنع عودة العطلين اللذين
 * أوقفا بوابة CI أسابيع وهما لا علاقة لهما بالتطبيق:
 *
 * ① `create table … auth.sessions` داخل اختبار ⇒
 *      ERROR: permission denied for schema auth
 *    مخطط `auth` مملوك لـ`supabase_admin`، والدور `postgres` يملك USAGE
 *    لا CREATE. والجدول **موجود أصلاً** (GoTrue) بصلاحيات كتابة كاملة.
 *
 * ② إشعارات التفعيل اليدوي: الاختبار يثبّت مستلمين محددين (A6) ووظيفة
 *    `manual_att_notify` يجب أن ترسل لهم فعلاً — ومنها مشرف البوابة
 *    بـ`transfer_station` (شرطة سفلية) للبوابة `transfer-station`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const DB = join(ROOT, 'tests/db')

const sqlFiles = readdirSync(DB).filter((f) => f.endsWith('.sql'))

describe('① لا إنشاء جداول في مخطط auth داخل الاختبارات', () => {
  /**
   * استثناء مشروع: `supabase-mock.sql` **تمهيد** يُطبَّق على قاعدة فارغة
   * قبل `00001` (لا على قاعدة Supabase)، فدوره إنشاء مخطط `auth` نفسه.
   * يُصنَّفه `scripts/db-tests.sh` helper فلا يُشغَّل كاختبار.
   */
  const HELPERS = new Set(['supabase-mock.sql', 'local_supabase_prelude.sql'])

  const offenders = sqlFiles.filter((f) => {
    if (HELPERS.has(f)) return false
    const src = read(join('tests/db', f))
    // تجاهل التعليقات: نبحث عن جملة فعلية تبدأ بالإنشاء
    return /^\s*create\s+table[^;]*auth\./im.test(src)
  })

  it('لا ملف يُنشئ جدولاً في auth', () => {
    expect(offenders).toEqual([])
  })

  it('الملفات الثلاثة المعنية تتحقّق من وجود الجدول بدل إنشائه', () => {
    for (const f of ['session-security-core-test.sql', 'session-devices-test.sql',
      'sensitive-device-code-test.sql']) {
      const src = read(join('tests/db', f))
      expect(src, f).toMatch(/to_regclass\('auth\.sessions'\)/)
    }
  })

  it('التحقّق يرفع رسالة مفهومة لا permission denied', () => {
    const src = read('tests/db/session-security-core-test.sql')
    expect(src).toContain('AUTH_SESSIONS_MISSING')
  })

  it('كل ملف SQL محصّن يفتح begin ويُغلق rollback', () => {
    // الملفات المحصّنة فقط — الباقي مصنَّف «تقرير» في db-tests.sh
    for (const f of sqlFiles) {
      const src = read(join('tests/db', f))
      if (!/^\s*begin\s*;/im.test(src)) continue
      expect(/^\s*rollback\s*;/im.test(src), `${f} يفتح begin بلا rollback`).toBe(true)
    }
  })
})

describe('② إشعارات التفعيل اليدوي — المستلمون المعتمدون', () => {
  const MIG = 'supabase/migrations/20261127000500_attendance_manual_notify_recipients.sql'

  it('الترحيل موجود ولا يُعدّل هجرات سابقة', () => {
    const src = read(MIG)
    expect(src).toMatch(/create or replace function app\.manual_att_notify/)
    expect(src).not.toMatch(/drop function app\.manual_att_notify/)
  })

  it('الدوار المطلوبة الأربعة مشمولة', () => {
    const src = read(MIG)
    for (const role of ['ops_room', 'it_admin', 'hr_officer', 'deputy_director']) {
      expect(src, role).toContain(`'${role}'`)
    }
  })

  it('مشرف البوابة يُطابَق بالتطبيع: transfer_station ↔ transfer-station', () => {
    const src = read(MIG)
    // بدون التطبيع لا يستلم المشرف شيئاً (عيب وُجد بالفحص الفعلي)
    expect(src).toMatch(/replace\(ur\.role::text, '_', '-'\) = a\.portal/)
  })

  it('الصيانة والموظف مستثنيان صراحةً', () => {
    expect(read(MIG)).toMatch(/not in \('employee', 'maintenance'\)/)
  })

  it('لا إشعار مكرّر لنفس المستخدم (تجميع على user_id)', () => {
    const src = read(MIG)
    expect(src).toMatch(/group by c\.user_id/)
    expect(src).toMatch(/min\(c\.prio\)/)
  })

  it('رابط غرفة العمليات ورابط البوابة مختلفان ومحدّدان', () => {
    const src = read(MIG)
    expect(src).toContain("'/ops-room/manual-attendance'")
    expect(src).toMatch(/'\/' \|\| a\.portal \|\| '\/manual-attendance'/)
  })

  it('المخوّلون صراحةً مشمولون (لا نُسقط من منحتهم التقنية)', () => {
    expect(read(MIG)).toMatch(/from public\.attendance_manual_recorders/)
  })

  it('الاختبار يثبّت التوقّع نفسه — لا نصرف عن السلوك', () => {
    const t = read('tests/db/attendance-manual-test.sql')
    expect(t).toContain("dedupe_key = 'att_manual_on:' || act::text")
    expect(t).toMatch(/assert n = 5/)
  })
})

describe('③ الترحيلات الجديدة لها رأس تراجع', () => {
  const migs = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter((f) => f.startsWith('20261127'))

  it('كل ترحيل يذكر خطوات التراجع', () => {
    for (const f of migs) {
      const src = read(join('supabase/migrations', f))
      expect(/التراجع|التراجع:/.test(src), f).toBe(true)
    }
  })
})

describe('④ حساب التفويض في اختبارات الكشف — لا اعتماد على الدور وحده', () => {
  /**
   * `20261118150000` نقل صلاحية قراءة/حفظ الكشف من «دور البوابة» إلى
   * **قائمة الحسابات المخوّلة لكل تفعيل** (`attendance_manual_recorders`).
   * غرفة العمليات وحدها مخوّلة تلقائياً؛ التقنية وsuper_admin يُنشئان ويُوقّعان
   * لكنهما **لا يسجّلان** كشفاً.
   *
   * الاختبار القديم كان يستدعي الحفظ بحساب التقنية/المشرف الأعلى، فسقط عند أول
   * وصول لهذه النقطة — ولم يظهر ذلك إلا بعد إصلاح A6 الذي كان يخفيه.
   * هذا العقد يثبّت الشكل الصحيح كي لا يعود.
   */
  const T = read('tests/db/attendance-manual-test.sql')

  it('التفعيلات تمرّر قائمة مخوّلين بدور البوابة', () => {
    // بوابة المحطة: مشرف transfer_station
    expect(T).toMatch(
      /attendance_manual_activate\('transfer-station'[\s\S]{0,200}array\['a7000000-0000-4000-8000-000000000004'\]::uuid\[\]/,
    )
    // الصيانة: حساب maintenance
    expect(T).toMatch(
      /attendance_manual_activate\('maintenance'[\s\S]{0,260}array\['a7000000-0000-4000-8000-000000000005'\]::uuid\[\]/,
    )
  })

  it('الحفظ/القراءة في الكتل D وF بلا حساب مخوّل مسبقاً', () => {
    /** كل استدعاء `manual_att_sheet_save` يجب أن يسبقه `as_user` مخوّل أو غرفة عمليات. */
    const lines = T.split('\n')
    const allowed = new Set([
      'a7000000-0000-4000-8000-000000000002', // غرفة العمليات — مخوّلة تلقائياً
      'a7000000-0000-4000-8000-000000000004', // مشرف البوابة — مخوّل صراحةً
      'a7000000-0000-4000-8000-000000000005', // حساب الصيانة — مخوّل صراحةً
    ])
    let actor: string | null = null
    for (const line of lines) {
      const m = line.match(/pg_temp\.as_user\('([0-9a-f-]{36})'\)/)
      if (m) actor = m[1] ?? null
      if (line.includes('manual_att_sheet_save(') && !line.trim().startsWith('--')) {
        expect(actor !== null && allowed.has(actor), `سطر بلا حساب مخوّل: ${line.slice(0, 90)}`).toBe(true)
      }
    }
  })

  it('التقنية ليست مخوّلة تلقائياً — الاختبار يوثّق الصفر', () => {
    expect(T).toMatch(
      /jsonb_array_length\(public\.manual_att_my_activations\(\)\) = 0, 'C4 تفعيلاتي للتقنية/,
    )
  })

  it('بعد اعتماد الشهر يسقط التفويض قبل حارس الشهر', () => {
    // التفعيل المنتهي بلا أيام معلّقة ⇒ can_record = false ⇒ PERMISSION_DENIED
    expect(T).toMatch(/محاولة بعد الاعتماد[\s\S]{0,200}'PERMISSION_DENIED'/)
  })
})
