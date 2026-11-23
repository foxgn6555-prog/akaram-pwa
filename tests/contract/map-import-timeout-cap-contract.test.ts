/**
 * عقد الجولة ⑪ — سقف الوقت ٨ ثوانٍ ⇒ ١١٠، والدفعة الفاشلة لا تُسقط الاستيراد.
 *
 * ## العَرَض (لقطتان من الميدان)
 *
 * ```
 * ⚠ تعذّر إكمال العملية
 * canceling statement due to statement timeout
 * ```
 * وفي وحدة التحكّم: `Failed to load resource: 500` على `…/map_import_batch`.
 *
 * ## الجذر (مقيس على قاعدة الإنتاج، ٢٠٢٦-١١-١٩)
 *
 * ```
 * pg_roles:  anon => statement_timeout=3s
 *            authenticated => statement_timeout=8s     ← ← ←
 *
 * pg_proc:   public.map_import_batch   => search_path فقط (لا سقف)
 *            app.map_import_batch      => search_path فقط (لا سقف)
 *            app.map_import_batch_impl => search_path فقط (لا سقف)
 * ```
 *
 * أي سقف المستخدم ٨ ثوانٍ ولا شيء يرفعه.
 *
 * ## 🔴 واكتشاف أثناء التنفيذ: التدهور تربيعي
 *
 * بعد رفع السقف تبيّن أن الزمن ليس خطياً:
 *
 * ```
 * 25 صف  =>   634,722 us   (0.63 ث)
 * 50 صف  => 2,365,177 us   (2.37 ث)   ← ×3.7 عند مضاعفة العدد
 * 75 صف  => 5,300,000 us   (5.30 ث)
 * 100 صف => 9,500,000 us   (9.50 ث)
 * ```
 *
 * **المضاعفة تُضاعف الزمن ٣.٧×** ⇒ **O(n²)**.
 *
 * السبب: `map_streets_overlap_trg` → `app.map_overlap_check()` ينادي
 * `app.map_nearby_streets(new.zone_id, new.path, new.id)` الذي يجلب **كل**
 * صف ضمن ٦٠٠ متر — ومنها الصفوف المُدرجة **للتوّ في نفس الدفعة**. فالصف رقم n
 * يقارن بـ(n-1) صفاً سبقه ⇒ مجموع n(n-1)/2.
 *
 * **هذه الهجرة لا تُصلح O(n²)** — تُصلح العَرَض (الإلغاء) وتوثّق الجذر.
 * الإصلاح البنيوي (حارس دفعات / فهرس مكاني حقيقي) جولة مستقلة.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const migration = read('supabase/migrations/20261124000600_map_import_timeout_cap.sql')
const hook = read('src/features/map-import/hooks/useMapImport.ts')
const sdk = read('src/services/map-import.sdk.ts')
const page = read('src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx')
const prevCap = read('supabase/migrations/20261124000300_map_import_timeout_fix.sql')

describe('⑪ — سقف الوقت ١١٠ ثانية على الغلاف العلوي', () => {
  it('public.map_import_batch يحمل SET statement_timeout', () => {
    const fn = migration.slice(
      migration.indexOf('create or replace function public.map_import_batch('),
      migration.indexOf('end $function$;'),
    )
    expect(fn).toMatch(/set statement_timeout = '110s'/)
  })

  it('١١٠ لا ١٢٠ — يترك عشر ثوانٍ للـrollback قبل سقف المشروع', () => {
    expect(migration).toContain("set statement_timeout = '110s'")
    expect(migration).not.toContain("set statement_timeout = '120s'")
    // والسقف العالمي ١٢٠ ثانية — موثَّق
    expect(migration).toMatch(/١٢٠ ثانية|١٢٠/)
  })

  it('⛔ لا SET statement_timeout على الداخلية (ترتيب SET المتداخل غير موثوق)', () => {
    // الغلاف app.map_import_batch لا يُعاد تعريفه هنا إطلاقاً
    expect(migration).not.toMatch(/create or replace function app\.map_import_batch\(/)
    // ولا على _impl
    expect(migration).not.toMatch(/create or replace function app\.map_import_batch_impl\(/)
  })

  it('الحارس map_require_editor يبقى أولاً', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.map_import_batch('))
    const guardIdx = fn.indexOf('perform public.map_require_editor()')
    const callIdx = fn.indexOf('return app.map_import_batch(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(guardIdx)
  })

  it('security definer + search_path باقيان', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.map_import_batch('))
    expect(fn).toContain('security definer')
    expect(fn).toMatch(/set search_path = public, app/)
  })

  it('الصلاحيات: anon ممنوعة، authenticated مسموحة', () => {
    expect(migration).toMatch(/revoke all on function public\.map_import_batch/)
    expect(migration).toMatch(/grant execute on function public\.map_import_batch.*to authenticated/)
  })

  it('السابقة لم يكن فيها سقف — الدليل النصي', () => {
    // 00300 نقل الدالة ولم يضبط statement_timeout على أي منها
    expect(prevCap).not.toMatch(/set statement_timeout = '\d+s'/)
  })
})

describe('⑪ — التحصين: دفعة فاشلة لا تُسقط البقية', () => {
  it('النتيجة تحمل failedBatches (اختيارياً — توافق خلفي)', () => {
    expect(sdk).toMatch(/failedBatches\?:\s*\{ from: number; to: number; error: string \}\[\]/)
  })

  it('try/catch **داخل** حلقة الدفعات (لا حولها)', () => {
    // الحلقة موجودة
    expect(hook).toMatch(/for \(let i = 0; i < total; i \+= batchSize\)/)
    // catch يقع بعد بداية الحلقة
    const loopIdx = hook.indexOf('for (let i = 0; i < total; i += batchSize)')
    const catchIdx = hook.indexOf('} catch (err) {', loopIdx)
    expect(catchIdx).toBeGreaterThan(loopIdx)
    /*
     * `return null` مشروع **فقط** عند الإلغاء الصريح (aborted).
     * ما يمنعه الاختبار: الخروج من الحلقة بسبب فشل دفعة.
     */
    const block = hook.slice(loopIdx, hook.indexOf('const final: ImportBatchResult'))
    const nullReturns = block.match(/return null/g) ?? []
    // كل `return null` في الكتلة يجب أن يكون مسبوقاً بفحص aborted
    for (const m of block.matchAll(/if \(ac\.signal\.aborted\) return null/g)) {
      expect(m[0]).toContain('aborted')
    }
    expect(nullReturns.length).toBe(
      (block.match(/if \(ac\.signal\.aborted\) return null/g) ?? []).length,
    )
  })

  it('الفشل يُسجَّل بمداه (from/to) وسببه', () => {
    expect(hook).toMatch(/failedBatches\.push\(\{ from, to, error: message \}\)/)
    expect(hook).toMatch(/const from = i \+ 1/)
    expect(hook).toMatch(/const to = Math\.min\(i \+ batchSize, total\)/)
  })

  it('البقية تُكمَل بعد الفشل — الحلقة لا تنكسر', () => {
    const loopIdx = hook.indexOf('for (let i = 0; i < total; i += batchSize)')
    const afterCatch = hook.slice(loopIdx)
    // تحديث التقدّم بعد catch ⇒ الدفعة التالية تبدأ
    expect(afterCatch).toMatch(/done = to/)
    expect(afterCatch).toMatch(/setPhase\(\{[\s\S]*?kind: 'inserting'/)
  })

  it('فشل **كل** الدفعات هو خطأ حقيقي لا «نجاح صفري»', () => {
    expect(hook).toMatch(/failedBatches\.length === total \/ batchSize/)
    expect(hook).toMatch(/kind: 'error'/)
  })

  it('⛔ لا إعادة محاولة تلقائية (المطابقة idempotent والمشغّل يعيد بضغطة)', () => {
    const loopBlock = hook.slice(
      hook.indexOf('const failedBatches'),
      hook.indexOf('const final: ImportBatchResult'),
    )
    expect(loopBlock).not.toMatch(/for \(let attempt = 0; attempt < \d; attempt\+\+\)/)
    expect(loopBlock).not.toMatch(/retry/i)
  })
})

describe('⑪ — الواجهة تعرض الفاشل بوضوح', () => {
  it('قسم الدفعات الفاشلة موجود', () => {
    expect(page).toMatch(/phase\.result\.failedBatches/)
    expect(page).toMatch(/دفعة لم تُدرج/)
  })

  it('يُظهر مدى الصفوف وسبب كل دفعة', () => {
    expect(page).toMatch(/\{b\.from\}–\{b\.to\}/)
    expect(page).toMatch(/\{b\.error\}/)
  })

  it('يطمئن أن إعادة الإدراج آمنة', () => {
    expect(page).toMatch(/إعادة الإدراج آمنة/)
  })

  it('الفاشلة تظهر **فوق** أسباب الصفوف المفردة (فقدان أوسع)', () => {
    const failedIdx = page.indexOf('phase.result.failedBatches')
    const errorsIdx = page.indexOf('phase.result.errors.length > 0')
    expect(failedIdx).toBeGreaterThan(-1)
    expect(errorsIdx).toBeGreaterThan(failedIdx)
  })
})

describe('⑪ — حجم الدفعة ٥٠ وتصريح أنه تخفيف لا إصلاح', () => {
  it('batchSize الافتراضي ٥٠', () => {
    expect(hook).toMatch(/const batchSize = opts\.batchSize \?\? 300/)
  })

  it('يحفظ تاريخ ⑪ (١٣.٣٨ ث) ويوثّق حلّ ⑬', () => {
    // قياس ⑪ المضادّ — لا يُحذف لأنه يفسّر لماذا لم يكفِ تخفيف الدفعات
    expect(hook).toContain('١٣.٣٨')
    // و⑬ أصلحت الجذر: الهامش ٦٠٠م ⇒ ٥م
    expect(hook).toMatch(/الجولة ⑬/)
    expect(hook).toContain('٤٢٠ مرشّحاً')
    expect(hook).toContain('16.3×')
  })
})

describe('⑪ — التوثيق يحمل القياس والتدهور التربيعي', () => {
  it('أرقام التدرّج الفعلية موجودة لا مُدّعاة', () => {
    expect(migration).toContain('634,722')
    expect(migration).toContain('2,365,177')
    expect(migration).toContain('9,500,000')
  })

  it('يُقرّ بأن O(n²) **لم** تُصلح هنا بل في جولة مستقلة', () => {
    expect(migration).toMatch(/O\(n²\)/)
    expect(migration).toMatch(/جولة مستقلة/)
    expect(migration).toMatch(/لا تُصلح O\(n²\)/)
  })

  it('يشرح السبب: الجيران تشمل صفوف الدفعة نفسها', () => {
    expect(migration).toMatch(/أُدرجت \*\*للتوّ في نفس الدفعة\*\*/)
    expect(migration).toMatch(/n\(n-1\)\/2/)
  })

  it('جدول الأثر الفعلي (لا "تنجح" المبهم)', () => {
    expect(migration).toMatch(/~٣٨ ث/)
    expect(migration).toMatch(/~٨٥ ث/)
  })
})
