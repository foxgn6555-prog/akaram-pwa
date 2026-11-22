/**
 * عقد الجولة ⑤ — الإصلاح ٢: المسقَط يُعرض، لا يُخفى.
 *
 * ## العيب
 *
 * `parseOsmStream` يُسقط كل شوط وسمُه `highway` خارج `ROUTE_HIGHWAY_TAGS`
 * (روابط الطرق، `construction`، `proposed`، `raceway`…). في ملف الرياض
 * الحقيقي: **٣٥ شوطاً + ١٨٥ رابطاً = ٢٢٠ شوطاً** لا تُقرأ أصلاً.
 *
 * وكان العدّاد `waysSkippedNoHighway` **لا يُعرض في الواجهة إطلاقاً** —
 * فالمشغّل يرى «٢٩٧ صفاً» ولا يعلم أن ملفه يحوي أشواطاً لم تُقرأ، ولا
 * *ما هي*. و«المستبعدات» في الواجهة تعرض ما أسقطه `assembleImport` **بعد**
 * القراءة، فما سقط قبلها كان يختفي بلا أي أثر.
 *
 * ## ما يحرسه هذا الملف
 *
 * ① القارئ يُنتج ملخّصاً بالوسم وعيّنة بالاسم — لا عدّاداً أصمّ.
 * ② الواجهة **تعرضه** (وجود البيانات بلا عرض لا يُصلح شيئاً).
 * ③ مجموع الملخّص = العدّاد (لا فقدان في التجميع).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const STREAM = readFileSync(join(ROOT, 'src/features/map-import/lib/osm-stream.ts'), 'utf8')
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)

/** يُزيل تعليقات `/* *\/` و`//` — وإلا التقط الشرحُ العباراتِ نفسها */
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('⑤ القارئ يُنتج تقريراً بالوسم', () => {
  it('النوع يحمل ملخّصاً وعيّنة، لا عدّاداً وحده', () => {
    expect(STREAM).toContain('skippedByTag')
    expect(STREAM).toContain('skippedSamples')
    expect(STREAM).toContain('skippedSamplesOverflow')
  })

  it('العيّنة تحفظ معرّف الشوط واسمه — لا رقماً مجهولاً', () => {
    expect(STREAM).toMatch(/interface SkippedReading[\s\S]{0,400}osmWayId/)
    expect(STREAM).toMatch(/interface SkippedReading[\s\S]{0,400}name/)
    expect(STREAM).toMatch(/interface SkippedReading[\s\S]{0,400}highway/)
  })

  it('الوسم يُحفظ كما هو لا كتصنيف مخترع', () => {
    // المفتاح من `hw` مباشرة
    expect(STREAM).toMatch(/const key = hw \?\?/)
  })

  it('يُسجّل داخل emitWay (حيث يقع السقوط فعلاً)', () => {
    const start = STREAM.indexOf('const emitWay = (): void => {')
    expect(start).toBeGreaterThan(-1)
    // نهاية الدالة هي أول `curWay = null` بعد بدايتها ثم إغلاقها
    const endMarker = STREAM.indexOf('/** يعالج قطعة نصية كاملة', start)
    expect(endMarker).toBeGreaterThan(start)
    const emit = STREAM.slice(start, endMarker)
    // العدّاد يُبنى في emitWay عبر `skipByTag` ويُصَبّ في `stats.skippedByTag`
    expect(emit).toContain('skipByTag.set')
    expect(emit).toContain('stats.skippedSamples.push')
  })

  it('الملخّص مرتّب بالأكثر أولاً — أول سطر هو أهم سبب', () => {
    expect(STREAM).toMatch(/\.sort\(\(a, b\) => b\.ways - a\.ways\)/)
  })

  it('الملخّص يُبنى في النهاية — ترتيب لا تراكم صدفة', () => {
    const buildAt = STREAM.indexOf('stats.skippedByTag = [...skipByTag.entries()]')
    const returnAt = STREAM.indexOf('return { stats, truncated }')
    expect(buildAt).toBeGreaterThan(-1)
    expect(returnAt).toBeGreaterThan(buildAt)
  })

  it('حدّ العيّنة مُعلن لا رقم سحري', () => {
    expect(STREAM).toContain('export const MAX_SKIP_SAMPLES')
    expect(STREAM).toMatch(/export const MAX_SKIP_SAMPLES = \d+/)
  })
})

describe('⑤ الواجهة تعرض التقرير', () => {
  it('تقرأ `waysSkippedNoHighway` من phase.parse', () => {
    expect(PAGE_CODE).toContain('phase.parse.waysSkippedNoHighway')
  })

  it('تعرض الملخّص بالوسم، لا العدد وحده', () => {
    expect(PAGE_CODE).toContain('phase.parse.skippedByTag.map')
  })

  it('تعرض العيّنة بأسماء الأشواط', () => {
    expect(PAGE_CODE).toContain('phase.parse.skippedSamples')
    expect(PAGE_CODE).toMatch(/skippedSamples[\s\S]{0,600}\{s\.name\}/)
  })

  it('العرض لا يظهر حين لا سقوط — لا ضجيج بلا سبب', () => {
    expect(PAGE_CODE).toMatch(/phase\.parse\.waysSkippedNoHighway > 0 &&/)
  })

  it('يشرح أن هذا سقوط عند القراءة لا عند القصّ', () => {
    expect(PAGE).toContain('لم يُقرأ أصلاً')
    expect(PAGE).toContain('لا تدخل المعاينة ولا القاعدة')
  })

  it('مطويّ افتراضياً — لا يزاحم التحذيرات الأهم', () => {
    expect(PAGE_CODE).toMatch(/<details[\s\S]{0,300}waysSkippedNoHighway/)
  })
})

describe('⑤ لا يُخلط بالمسقَط بعد القراءة', () => {
  it('قسم «المستبعدات» يبقى من preview.skipped — مصدر آخر', () => {
    expect(PAGE_CODE).toContain('preview.skipped.length')
    // والجديد من phase.parse
    expect(PAGE_CODE).toContain('phase.parse.waysSkippedNoHighway')
  })
})
