/**
 * اختبارات القارئ التدفّقي — البوّابة للإدخال.
 * الملفات هنا صغيرة ومصمّمة لتُظهر كل حالة حدّية، ومعها فحص أن القطع
 * الاعتباطي لا يغيّر النتيجة (وسم مقطوع بين قطعتين).
 */
import { describe, expect, it } from 'vitest'
import {
  decodeXmlEntities,
  MAX_SKIP_SAMPLES,
  parseOsmStream,
  textToStream,
  type OsmWay,
} from '@features/map-import/lib/osm-stream'

const OSM = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="Overpass API">
  <note>لقطة تجريبية</note>
  <meta osm_base="2026-11-21T20:00:00Z"/>
  <node id="1" lat="33.3000" lon="44.4000"/>
  <node id="2" lat="33.3010" lon="44.4010"/>
  <node id="3" lat="33.3020" lon="44.4020"/>
  <node id="4" lat="33.3030" lon="44.4030"/>
  <way id="100">
    <nd ref="1"/>
    <nd ref="2"/>
    <nd ref="3"/>
    <tag k="highway" v="primary"/>
    <tag k="name" v="شارع السعدون"/>
  </way>
  <way id="200">
    <nd ref="2"/>
    <nd ref="3"/>
    <nd ref="4"/>
    <tag k="highway" v="footway"/>
    <tag k="name" v="905-16"/>
  </way>
  <way id="300">
    <nd ref="3"/>
    <nd ref="4"/>
    <tag k="highway" v="motorway"/>
    <tag k="name" v="طريق محمد القاسم"/>
  </way>
  <way id="400">
    <nd ref="1"/>
    <nd ref="2"/>
    <tag k="building" v="yes"/>
  </way>
  <way id="500">
    <nd ref="3"/>
    <nd ref="4"/>
    <tag k="highway" v="primary"/>
    <tag k="name" v="ساحة الفتح"/>
  </way>
</osm>`

async function collect(xml: string, chunk = 64 * 1024): Promise<{ ways: OsmWay[]; nodes: Map<number, [number, number]>; stats: Awaited<ReturnType<typeof parseOsmStream>>['stats'] }> {
  const ways: OsmWay[] = []
  const nodes = new Map<number, [number, number]>()
  const { stats } = await parseOsmStream(textToStream(xml, chunk), {
    onNode: (id, lat, lng) => nodes.set(id, [lat, lng]),
    onWay: (w) => ways.push(w),
  })
  return { ways, nodes, stats }
}

describe('① القراءة الأساسية', () => {
  it('يقرأ كل العُقد بموقعها', async () => {
    const { nodes } = await collect(OSM)
    expect(nodes.size).toBe(4)
    expect(nodes.get(1)).toEqual([33.3, 44.4])
    expect(nodes.get(4)).toEqual([33.303, 44.403])
  })

  it('يمرّر الأشواط ذات highway المقبول فقط', async () => {
    const { ways } = await collect(OSM)
    // 100 (primary) · 200 (footway) · 300 (motorway) · 500 (primary ساحة)
    expect(ways.map((w) => w.id)).toEqual([100, 200, 300, 500])
  })

  it('يتجاهل مبنى بلا highway', async () => {
    const { ways } = await collect(OSM)
    expect(ways.find((w) => w.id === 400)).toBeUndefined()
  })

  it('يحفظ الوسوم والمراجع بترتيبها', async () => {
    const { ways } = await collect(OSM)
    const w100 = ways.find((w) => w.id === 100)!
    expect(w100.nodes).toEqual([1, 2, 3])
    expect(w100.tags.highway).toBe('primary')
    expect(w100.tags.name).toBe('شارع السعدون')
  })
})

describe('② الإحصاءات', () => {
  it('يعدّ العُقد والأشواط والمرفوضة', async () => {
    const { stats } = await collect(OSM)
    expect(stats.nodesRead).toBe(4)
    expect(stats.waysRead).toBe(5)
    expect(stats.routeWays).toBe(4)
    expect(stats.waysSkippedNoHighway).toBe(1)
  })
  it('يسجّل البايتات المقروءة', async () => {
    const { stats } = await collect(OSM)
    expect(stats.bytesRead).toBe(new TextEncoder().encode(OSM).byteLength)
  })
})

describe('③ القطع الاعتباطي — الوسم المقطوع بين قطعتين', () => {
  it('نفس النتيجة بقطع ٧ بايت (أقسى حالة)', async () => {
    const a = await collect(OSM, 7)
    const b = await collect(OSM, 1024 * 1024)
    expect(a.ways).toEqual(b.ways)
    expect(a.nodes).toEqual(b.nodes)
    expect(a.stats.nodesRead).toBe(b.stats.nodesRead)
  })
  it('القطع داخل قيمة سمة عربية (بايت متعدد) لا يكسر الاسم', async () => {
    // «شارع» = ٨ بايت؛ القطع عند ١٠ يضعه في منتصف القيمة غالباً
    const { ways } = await collect(OSM, 10)
    expect(ways.find((w) => w.id === 100)?.tags.name).toBe('شارع السعدون')
  })
  it('ملف كامل في قطعة واحدة', async () => {
    const one = await collect(OSM, OSM.length * 4)
    expect(one.ways).toHaveLength(4)
  })
})

describe('④ الحالات الحدّية', () => {
  it('ملف فارغ ⇒ صفر بلا انفجار', async () => {
    const { stats } = await collect('<osm></osm>')
    expect(stats.nodesRead).toBe(0)
    expect(stats.waysRead).toBe(0)
  })
  it('نص ليس XML ⇒ لا نتائج، لا رمي', async () => {
    const { stats } = await collect('هذا ليس XML إطلاقاً')
    expect(stats.nodesRead).toBe(0)
    expect(stats.waysRead).toBe(0)
  })
  it('عقدة بإحدايثات مفقودة تُسقط نفسها لا الملف', async () => {
    const { stats } = await collect('<osm><node id="9" lat="33.3"/><node id="8" lat="33.3" lon="44.4"/></osm>')
    expect(stats.nodesRead).toBe(1)
  })
  it('maxBytes يوقف القراءة ويكشف truncated', async () => {
    const ways: OsmWay[] = []
    const { truncated, stats } = await parseOsmStream(textToStream(OSM, 100), {
      onWay: (w) => ways.push(w),
      maxBytes: 200,
    })
    expect(truncated).toBe(true)
    expect(stats.bytesRead).toBeGreaterThan(200)
  })
  it('الإلغاء يُطلق AbortError', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      parseOsmStream(textToStream(OSM, 10), { onWay: () => undefined, signal: ac.signal }),
    ).rejects.toThrow(/أُلغيت/)
  })
})

describe('⑤ فكّ كيانات XML', () => {
  it('الكيانات الأساسية', () => {
    expect(decodeXmlEntities('a &amp; b')).toBe('a & b')
    expect(decodeXmlEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeXmlEntities('&quot;x&quot;')).toBe('"x"')
  })
  it('المرقّمة — شائعة في أسماء الشوارع العربية', () => {
    expect(decodeXmlEntities('&#1588;')).toBe('ش')
    expect(decodeXmlEntities('&#x645;')).toBe('م')
  })
  it('نص بلا & يُعاد كما هو بلا نسخ', () => {
    const s = 'شارع بلا كيانات'
    expect(decodeXmlEntities(s)).toBe(s)
  })
  it('&amp;lt; لا ينفكّ مرتين', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;')
  })
})

describe('⑥ الأداء — ١٠ آلاف شوط', () => {
  it('يحلّل ١٠ آلاف شوط في زمن معقول', async () => {
    const parts: string[] = ['<osm>']
    for (let i = 0; i < 10000; i++) {
      parts.push(`<node id="${i * 2}" lat="${33.3 + i * 1e-6}" lon="44.4"/>`)
      parts.push(`<node id="${i * 2 + 1}" lat="${33.3 + i * 1e-6}" lon="44.401"/>`)
      parts.push(`<way id="${i}"><nd ref="${i * 2}"/><nd ref="${i * 2 + 1}"/><tag k="highway" v="residential"/></way>`)
    }
    parts.push('</osm>')
    const xml = parts.join('')
    const t0 = performance.now()
    const { stats } = await collect(xml, 64 * 1024)
    const ms = performance.now() - t0
    expect(stats.waysRead).toBe(10000)
    expect(stats.routeWays).toBe(10000)
    // الحاجز فضفاض (مساحة CI متغيّرة) لكنه يمسك انحداراً هائلاً
    expect(ms).toBeLessThan(3000)
  })
})

/**
 * ⑦ التقرير المسقَط — كان اختفاءً صامتاً.
 *
 * `waysSkippedNoHighway` عدّاد لا يُعرض في الواجهة إطلاقاً. فمشغّل يرى
 * «٢٩٧ صفاً» ولا يعلم أن ٣٥ شوطاً في ملفه لم تُقرأ أصلاً. والنوع وحده
 * («غير مقبول») لا يُفيد: المشغّل يحتاج **أي وسم** منع الدخول.
 */
describe('⑦ تقرير ما أُسقط عند القراءة', () => {
  const MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="1" lat="33.30" lon="44.40"/>
  <node id="2" lat="33.31" lon="44.41"/>
  <node id="3" lat="33.32" lon="44.42"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/></way>
  <way id="20"><nd ref="1"/><nd ref="2"/><tag k="highway" v="construction"/></way>
  <way id="30"><nd ref="1"/><nd ref="2"/><tag k="highway" v="construction"/><tag k="name" v="نفق احمد عرابي"/></way>
  <way id="40"><nd ref="1"/><nd ref="2"/><tag k="highway" v="raceway"/></way>
  <way id="50"><nd ref="1"/><nd ref="2"/><tag k="railway" v="rail"/></way>
</osm>`

  it('يجمع بشريط الوسم مرتّباً بالأكثر أولاً', async () => {
    const { stats } = await collect(MIXED)
    expect(stats.waysSkippedNoHighway).toBe(4)
    expect(stats.skippedByTag).toEqual([
      { highway: 'construction', ways: 2 },
      { highway: 'raceway', ways: 1 },
      { highway: null, ways: 1 }, // شوط بلا highway إطلاقاً
    ])
  })

  it('مجموع الملخّص يساوي المسقَط بالضبط', async () => {
    const { stats } = await collect(MIXED)
    expect(stats.skippedByTag.reduce((s, t) => s + t.ways, 0)).toBe(stats.waysSkippedNoHighway)
  })

  it('يحفظ العيّنة بمعرّف الشوط واسمه', async () => {
    const { stats } = await collect(MIXED)
    expect(stats.skippedSamples).toHaveLength(4)
    const named = stats.skippedSamples.find((s) => s.osmWayId === 30)
    // الاسم يُحفظ — هذا ما يجعل التقرير مقنعاً لا مجرّد رقم
    expect(named?.name).toBe('نفق احمد عرابي')
    expect(named?.highway).toBe('construction')
    expect(named?.nodes).toBe(2)
  })

  it('الحدّ الأعلى للعيّنة محترم — والباقي يُعدّ', async () => {
    const parts: string[] = ['<osm>']
    const total = MAX_SKIP_SAMPLES + 7
    for (let i = 0; i < total; i++) {
      parts.push(`<way id="${i}"><nd ref="1"/><tag k="highway" v="proposed"/></way>`)
    }
    parts.push('</osm>')
    const { stats } = await collect(parts.join(''))
    expect(stats.skippedSamples).toHaveLength(MAX_SKIP_SAMPLES)
    expect(stats.skippedSamplesOverflow).toBe(7)
    // العدّ الدقيق لا يتأثر بالحدّ
    expect(stats.waysSkippedNoHighway).toBe(total)
    expect(stats.skippedByTag[0]).toEqual({ highway: 'proposed', ways: total })
  })

  it('لا سقوط ⇒ تقرير فارغ لا undefined', async () => {
    const clean = `<?xml version="1.0"?><osm><way id="1"><nd ref="1"/><tag k="highway" v="primary"/></way></osm>`
    const { stats } = await collect(clean)
    expect(stats.waysSkippedNoHighway).toBe(0)
    expect(stats.skippedByTag).toEqual([])
    expect(stats.skippedSamples).toEqual([])
    expect(stats.skippedSamplesOverflow).toBe(0)
  })
})
