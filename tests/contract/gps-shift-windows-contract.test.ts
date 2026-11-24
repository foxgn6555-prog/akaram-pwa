/**
 * عقد نوافذ الشفتات وسحبها من المزوّد (20261128000200).
 *
 * يُثبّت ثلاثة أشياء لا يجوز أن تُنتقض:
 *   ① الشفت العابر لمنتصف الليل يُحسب نافذة واحدة، لا يومين مبتورين.
 *   ② «لا صفر كاذب»: شفت بلا نقاط ليس شفتاً فارغاً — بل «لم يُسحب».
 *   ③ السحب يجري دفعاتٍ لا مصفوفة آلاف، وكل فشل يُبلَّغ بالاسم.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const codeOnly = (p: string) => read(p)
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('--') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .join('\n')

const SQL = 'supabase/migrations/20261128000200_gps_shift_windows_pull.sql'

describe('① نافذة الشفت — العبور لمنتصف الليل', () => {
  it('p_end ≤ p_start يُعلَّم عبوراً ويمتد لليوم التالي', () => {
    const sql = read(SQL)
    expect(sql).toMatch(/crosses_midnight/)
    // النهاية تُزيح يوماً كاملاً عند العبور
    expect(sql).toMatch(/case when p_end <= p_start then 1 else 0 end/)
  })

  it('النافذة تُحسب بتوقيت بغداد لا بـUTC', () => {
    const sql = read(SQL)
    expect(sql).toMatch(/at time zone 'Asia\/Baghdad'/)
    expect(sql).not.toMatch(/T00:00:00Z/)
  })

  it('التعريف يوثّق الشفت الليلي صراحةً', () => {
    expect(read(SQL)).toMatch(/22:00→05:00|22:00.*05:00/)
  })

  it('دالة واحدة تُرجع نافذة اليوم لكل الشفتات النشطة فقط', () => {
    const sql = read(SQL)
    const fn = sql.slice(sql.indexOf('function app.map_shift_windows_for_day'), sql.indexOf('comment on function app.map_shift_windows_for_day'))
    expect(fn).toMatch(/where s\.is_active/)
  })
})

describe('② «لا صفر كاذب» — حالة الشفت صريحة', () => {
  it('ثلاث حالات معرّفة ولا حالة رابعة صامتة', () => {
    const sql = read(SQL)
    expect(sql).toMatch(/'local'/)
    expect(sql).toMatch(/'missing'/)
    expect(sql).toMatch(/'built_points_purged'/)
  })

  it('غياب النقاط يُفسَّر «لم تُسحب» لا «لا عمل»', () => {
    const sql = read(SQL)
    // الحالة missing لا تُمنح إن كانت هناك زيارات مبنية
    expect(sql).toMatch(/when coalesce\(st\.built, 0\) = 0 then 'missing'/)
  })

  it('الشفت الأقدم من احتفاظ المزوّد يُعلَّم كي لا يُطلب عبثاً', () => {
    const sql = read(SQL)
    expect(sql).toMatch(/can_pull/)
    expect(sql).toMatch(/<= 30/)
  })

  it('الواجهة تعرض الحالات الثلاث بأسمائها', () => {
    const ui = read('src/portals/ops-room/pages/MapPlanning/ShiftPanel.tsx')
    expect(ui).toMatch(/النقاط موجودة/)
    expect(ui).toMatch(/لم تُسحب/)
    expect(ui).toMatch(/بُني ثم حُذفت نقاطه/)
  })
})

describe('③ السحب دفعاتٍ لا مصفوفة آلاف', () => {
  it('لا دالة تُرجع كل الأجهزة دفعة واحدة', () => {
    const sql = codeOnly(SQL)
    // lvn_history_target_batch محدودة بـ limit، وغيرها لا يُرجع جهازاً
    expect(sql).toMatch(/limit lim/)
    expect(sql).toMatch(/greatest\(1, least\(coalesce\(p_size, 25\), 50\)\)/)
  })

  it('السحب يمرّ على الدفعات ويتوقف عند الإلغاء', () => {
    const sdk = read('src/services/gps-lvn.sdk.ts')
    const fn = sdk.slice(sdk.indexOf('export async function pullShiftWindow'), sdk.indexOf('export interface ShiftPullResult'))
    expect(fn).toMatch(/historyTargetBatch/)
    expect(fn).toMatch(/signal\?\.aborted/)
    expect(fn).toMatch(/result\.busy|aborted = true/)
  })

  it('كل جهاز فاشل يُسجَّل بالاسم والسبب', () => {
    const sdk = read('src/services/gps-lvn.sdk.ts')
    const fn = sdk.slice(sdk.indexOf('export async function pullShiftWindow'), sdk.indexOf('export interface ShiftPullResult'))
    expect(fn).toMatch(/failed\.push/)
    expect(fn).toMatch(/device:/)
    expect(fn).toMatch(/error:/)
  })

  it('الواجهة تُظهر الفشل لا تُخفيه', () => {
    const ui = read('src/portals/ops-room/pages/MapPlanning/ShiftPanel.tsx')
    expect(ui).toMatch(/data-testid="shift-pull-failed"/)
    expect(ui).toMatch(/pull\.data\.failed/)
  })
})

describe('④ نافذة الساعات تصل إلى المزوّد فعلاً', () => {
  it('Edge Function يقبل fromTime/toTime', () => {
    const fn = read('supabase/functions/lvn-gps-sync/index.ts')
    expect(fn).toMatch(/fromTime\?: string/)
    expect(fn).toMatch(/toTime\?: string/)
  })

  it('الـSDK يمرّر النافذة إلى Edge Function', () => {
    const sdk = read('src/services/gps-lvn.sdk.ts')
    expect(sdk).toMatch(/fromTime: window\.from, toTime: window\.to/)
  })

  it('العبور يزيح النهاية يوماً كاملاً داخل الدالة', () => {
    const fn = read('supabase/functions/lvn-gps-sync/index.ts')
    expect(fn).toMatch(/crosses \? 1440 : 0/)
  })

  it('النافذة الفعلية تُعاد في الردّ (لا تخمين)', () => {
    const fn = read('supabase/functions/lvn-gps-sync/index.ts')
    expect(fn).toMatch(/rangeFrom: rangeFrom\.toISOString\(\)/)
    expect(fn).toMatch(/rangeTo: rangeTo\.toISOString\(\)/)
  })

  it('بلا نافذة يبقى السلوك القديم: اليوم البغدادي كاملاً', () => {
    const fn = read('supabase/functions/lvn-gps-sync/index.ts')
    expect(fn).toMatch(/const hasWindow = Boolean\(body\.fromTime \|\| body\.toTime\)/)
    expect(fn).toMatch(/\$\{body\.day\}T00:00:00\+03:00/)
  })
})

describe('⑤ لا إعادة بناء جزئية للشفت (الخطر الذي تجنّبناه)', () => {
  it('الواجهة لا تستدعي البناء من لوحة الشفتات', () => {
    const ui = codeOnly('src/portals/ops-room/pages/MapPlanning/ShiftPanel.tsx')
    expect(ui).not.toMatch(/useBuildVisits|map_visit_build_logged|map_build_visits/)
  })

  it('اللوحة تشرح سبب عدم البناء الجزئي', () => {
    const ui = read('src/portals/ops-room/pages/MapPlanning/ShiftPanel.tsx')
    expect(ui).toMatch(/لا تعيد بناء الزيارات جزئياً|p_replace|يوم بغدادي كامل/)
  })
})
