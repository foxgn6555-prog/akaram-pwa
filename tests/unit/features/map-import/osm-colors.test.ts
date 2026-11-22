/**
 * ألوان OSM القياسية — مطابقة بصرية لـOverpass Turbo.
 *
 * السبب المقيس (docs/plans/map-import-shape-mismatch-diagnosis.md، السبب ②):
 * المسارات متطابقة تقريباً لكن الألوان والسماكات مختلفة تماماً، فتظنّ العين
 * أن الخريطتين مختلفتان. هذه الاختبارات تُثبّت كل قيمة مقابل مرجع osm-carto
 * كي لا تنحرف لاحقاً بلا أن يلاحظ أحد.
 */
import { describe, expect, it } from 'vitest'
import {
  BRAND_PALETTE,
  brandStrokeFor,
  hasOsmMatch,
  leafletPath,
  osmStrokeFor,
  strokeFor,
} from '@features/map-import/lib/osm-colors'

describe('① لوحة osm-carto — القيم المرجعية', () => {
  it('motorway وردي عميق · trunk خوخي', () => {
    expect(osmStrokeFor({ osmHighway: 'motorway' }).color).toBe('#e892a2')
    expect(osmStrokeFor({ osmHighway: 'trunk' }).color).toBe('#f9b29c')
  })

  it('primary خوخي فاتح (لا أحمر)', () => {
    const s = osmStrokeFor({ osmHighway: 'primary' })
    expect(s.color).toBe('#fcd6a4')
    expect(s.color).not.toBe('#dc2626') // لوننا القديم
  })

  it('secondary أصفر فاتح', () => {
    expect(osmStrokeFor({ osmHighway: 'secondary' }).color).toBe('#f7fabf')
  })

  it('tertiary وresidential وunclassified بيضاء', () => {
    for (const hw of ['tertiary', 'residential', 'unclassified']) {
      expect(osmStrokeFor({ osmHighway: hw }).color, hw).toBe('#ffffff')
    }
  })

  it('living_street رمادية فاتحة (#ededed) لا بيضاء — قيمة osm-carto الرسمية', () => {
    // roads.mss: @living-street-fill: #ededed — نميّزها كي لا تختلط بالشوارع
    expect(osmStrokeFor({ osmHighway: 'living_street' }).color).toBe('#ededed')
  })

  it('track بنّي (#996600) وقاعدته بيضاء — قيمة osm-carto الرسمية', () => {
    // roads.mss: @track-fill: #996600 · @track-casing: @default-casing (أبيض)
    const t = osmStrokeFor({ osmHighway: 'track' })
    expect(t.color).toBe('#996600')
    expect(t.casing?.color).toBe('#ffffff')
  })

  it('pedestrian بنفسجي-رمادي (#dddde8) — قيمة osm-carto الرسمية', () => {
    expect(osmStrokeFor({ osmHighway: 'pedestrian' }).color).toBe('#dddde8')
  })

  it('casing الشوارع البيضاء رمادي كما في roads.mss', () => {
    // @residential-casing: #bbb · @tertiary-casing: #8f8f8f
    expect(osmStrokeFor({ osmHighway: 'residential' }).casing?.color).toBe('#bbb')
    expect(osmStrokeFor({ osmHighway: 'service' }).casing?.color).toBe('#bbb')
    expect(osmStrokeFor({ osmHighway: 'tertiary' }).casing?.color).toBe('#8f8f8f')
  })

  it('casing الطرق السريعة من road-colors-generated.mss', () => {
    expect(osmStrokeFor({ osmHighway: 'motorway' }).casing?.color).toBe('#dc2a67')
    expect(osmStrokeFor({ osmHighway: 'trunk' }).casing?.color).toBe('#c84e2f')
    expect(osmStrokeFor({ osmHighway: 'primary' }).casing?.color).toBe('#a06b00')
    expect(osmStrokeFor({ osmHighway: 'secondary' }).casing?.color).toBe('#707d05')
  })

  it('footway وpath وsteps وردية متقطّعة', () => {
    for (const hw of ['footway', 'path', 'steps', 'corridor']) {
      const s = osmStrokeFor({ osmHighway: hw })
      expect(s.color, hw).toBe('#fa8072')
      expect(s.dashArray, hw).toBeTruthy()
    }
  })

  it('service أبيض رفيع بلا تقطيع', () => {
    const s = osmStrokeFor({ osmHighway: 'service' })
    expect(s.color).toBe('#ffffff')
    expect(s.weight).toBeLessThan(1.5)
    expect(s.dashArray).toBeUndefined()
  })
})

describe('② التسلسل الهرمي للسماكة', () => {
  it('motorway أسمك من primary أسمك من residential', () => {
    const w = (hw: string) => osmStrokeFor({ osmHighway: hw }).weight
    expect(w('motorway')).toBeGreaterThan(w('primary'))
    expect(w('primary')).toBeGreaterThan(w('residential'))
    expect(w('residential')).toBeGreaterThan(w('service'))
  })

  it('footway أرفع من residential (ممر لا طريق)', () => {
    expect(osmStrokeFor({ osmHighway: 'footway' }).weight).toBeLessThan(
      osmStrokeFor({ osmHighway: 'residential' }).weight,
    )
  })

  it('كل السماكات موجبة ومعقولة (≤ 5px)', () => {
    const all = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'steps', 'path']
    for (const hw of all) {
      const w = osmStrokeFor({ osmHighway: hw }).weight
      expect(w, hw).toBeGreaterThan(0)
      expect(w, hw).toBeLessThanOrEqual(5)
    }
  })
})

describe('③ تصنيفنا يجمع أنواعاً كثيرة — الوسم الأصلي هو الفاصل', () => {
  it('residential وservice وfootway كلها alley عندنا، لكن ألوانها مختلفة في OSM', () => {
    // هذا جوهر العيب: بلا osmHighway تُرسم كلها بلون واحد
    const res = osmStrokeFor({ osmHighway: 'residential', kind: 'alley' })
    const serv = osmStrokeFor({ osmHighway: 'service', kind: 'alley' })
    const foot = osmStrokeFor({ osmHighway: 'footway', kind: 'alley' })
    expect(res.color).toBe('#ffffff')
    expect(serv.weight).toBeLessThan(res.weight)
    expect(foot.color).toBe('#fa8072')
    expect(foot.dashArray).toBeTruthy()
    // ثلاثة أشكال مختلفة لثلاثة صفوف «alley» عندنا
    expect(new Set([`${res.color}/${res.weight}`, `${serv.color}/${serv.weight}`, `${foot.color}/${foot.dashArray}`]).size).toBe(3)
  })

  it('osmHighway له الأولوية على kind دائماً', () => {
    const s = osmStrokeFor({ osmHighway: 'primary', kind: 'alley' })
    expect(s.color).toBe('#fcd6a4') // ليس لون الزقاق
  })
})

describe('④ التراجع الآمن — صفوف قديمة بلا osmHighway', () => {
  it('kind=primary ⇒ خوخي', () => {
    expect(osmStrokeFor({ kind: 'primary' }).color).toBe('#fcd6a4')
  })

  it('kind=local ⇒ أبيض (مقابل residential)', () => {
    expect(osmStrokeFor({ kind: 'local' }).color).toBe('#ffffff')
  })

  it('kind=alley بلا وسم ⇒ service الأفتح (لا نفترض footway)', () => {
    expect(osmStrokeFor({ kind: 'alley' }).color).toBe('#ffffff')
    expect(osmStrokeFor({ kind: 'alley' }).dashArray).toBeUndefined()
  })

  it('وسم غير معروف (construction) ⇒ يتراجع إلى kind لا إلى محايد', () => {
    expect(osmStrokeFor({ osmHighway: 'construction', kind: 'primary' }).color).toBe('#fcd6a4')
  })

  it('لا شيء إطلاقاً ⇒ محايد رمادي لا انفجار', () => {
    const s = osmStrokeFor({})
    expect(s.color).toBe('#bfbfbf')
    expect(s.weight).toBeGreaterThan(0)
  })

  it('osmHighway فاضٍ أو مسافات يُعامل كغائب', () => {
    expect(osmStrokeFor({ osmHighway: '   ', kind: 'secondary' }).color).toBe('#f7fabf')
  })
})

describe('⑤ hasOsmMatch — للتقرير في الواجهة', () => {
  it('صحيح للوسوم المعروفة', () => {
    for (const hw of ['primary', 'residential', 'footway', 'motorway_link']) {
      expect(hasOsmMatch({ osmHighway: hw }), hw).toBe(true)
    }
  })

  it('خطأ للوسوم غير المعروفة والغائبة', () => {
    expect(hasOsmMatch({ osmHighway: 'construction' })).toBe(false)
    expect(hasOsmMatch({})).toBe(false)
    expect(hasOsmMatch({ osmHighway: '' })).toBe(false)
  })
})

describe('⑥ نمط المنصة يبقى بلا تغيير (لا كسر لمن يفضّله)', () => {
  it('يطابق الألوان القديمة حرفياً', () => {
    expect(BRAND_PALETTE.primary).toBe('#dc2626')
    expect(BRAND_PALETTE.secondary).toBe('#ea580c')
    expect(BRAND_PALETTE.tertiary).toBe('#ca8a04')
    expect(BRAND_PALETTE.local).toBe('#0d9488')
    expect(BRAND_PALETTE.alley).toBe('#7c3aed')
  })

  it('السماكة القديمة: ٣ للشوارع و٢ للأزقة', () => {
    expect(brandStrokeFor({ kind: 'primary' }).weight).toBe(3)
    expect(brandStrokeFor({ kind: 'alley' }).weight).toBe(2)
  })

  it('الشكل القديم لا يتأثر بـosmHighway', () => {
    expect(brandStrokeFor({ kind: 'alley' }).color).toBe('#7c3aed')
  })
})

describe('⑦ strokeFor — نقطة تحكم واحدة', () => {
  it('overpass ⇒ لوحة OSM', () => {
    expect(strokeFor('overpass', { osmHighway: 'primary', kind: 'local' }).color).toBe('#fcd6a4')
  })

  it('brand ⇒ لوحة المنصة', () => {
    expect(strokeFor('brand', { osmHighway: 'primary', kind: 'primary' }).color).toBe('#dc2626')
  })

  it('النمطان مختلفان دائماً على نفس الصف', () => {
    const row = { osmHighway: 'residential', kind: 'local' as const }
    expect(strokeFor('overpass', row).color).not.toBe(strokeFor('brand', row).color)
  })
})

describe('⑧ الوضع الليلي — نفس اللوحة بإضاءة معكوسة', () => {
  /*
   * لوحة osm-carto مُعايَرة على أرضية #f2efe9 فاتحة: الشوارع المحلية بيضاء.
   * على البلاطات الداكنة تختفي تماماً — وظهر هذا فعلياً في أول رسم.
   * فحين تكون الخلفية داكنة نُبدّل الأطراف: خطوط فاتحة وأُطر داكنة.
   */
  it('الافتراضي (بلا سمة) = النمط النهاري حرفياً', () => {
    const a = strokeFor('overpass', { osmHighway: 'residential' })
    const b = strokeFor('overpass', { osmHighway: 'residential' }, 'light')
    expect(a).toEqual(b)
  })

  it('ليلي: الشارع المحلي لم يبقَ أبيض', () => {
    expect(strokeFor('overpass', { osmHighway: 'residential' }, 'dark').color).not.toBe('#ffffff')
  })

  it('ليلي: التباين مع الخلفية الداكنة كافٍ (لمعان > 40%)', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255
    }
    for (const hw of ['residential', 'service', 'tertiary', 'footway', 'primary']) {
      const s = strokeFor('overpass', { osmHighway: hw }, 'dark')
      expect(lum(s.color), `${hw} ${s.color}`).toBeGreaterThan(0.4)
    }
  })

  it('ليلي: casing أغمق من الخط (وإلا فقد وظيفته)', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114
    }
    for (const hw of ['residential', 'primary', 'service']) {
      const s = strokeFor('overpass', { osmHighway: hw }, 'dark')
      expect(s.casing, hw).toBeDefined()
      expect(lum(s.casing!.color), hw).toBeLessThan(lum(s.color))
    }
  })

  it('ليلي: الأصناف ما زالت متمايزة (لا لون واحد للكل)', () => {
    const colors = ['motorway', 'primary', 'secondary', 'residential', 'footway'].map(
      (hw) => strokeFor('overpass', { osmHighway: hw }, 'dark').color,
    )
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('ليلي: الروابط أنحف من أصلها', () => {
    const base = strokeFor('overpass', { osmHighway: 'primary' }, 'dark')
    const link = strokeFor('overpass', { osmHighway: 'primary_link' }, 'dark')
    expect(link.weight).toBeLessThan(base.weight)
  })

  it('نمط المنصة لا يتأثر بالسمة إطلاقاً', () => {
    const a = strokeFor('brand', { kind: 'primary' }, 'light')
    const b = strokeFor('brand', { kind: 'primary' }, 'dark')
    expect(a).toEqual(b)
  })

  it('ليلي: وسم مجهول لا يختفي (يفتّح بدل الأبيض)', () => {
    const s = strokeFor('overpass', { osmHighway: 'weird_tag' }, 'dark')
    expect(s.color).toBe('#9a9a9a')
  })
})

describe('⑨ leafletPath — ما يراه Leaflet فقط', () => {
  it('يُسقط casing', () => {
    const p = leafletPath(osmStrokeFor({ osmHighway: 'primary' }))
    expect(p).not.toHaveProperty('casing')
  })

  it('يحفظ اللون والسماكة والشفافية', () => {
    const s = osmStrokeFor({ osmHighway: 'primary' })
    const p = leafletPath(s)
    expect(p.color).toBe(s.color)
    expect(p.weight).toBe(s.weight)
    expect(p.opacity).toBe(s.opacity)
  })

  it('dashArray يمرّ حين يوجد ويغيب حين لا يوجد', () => {
    expect(leafletPath(osmStrokeFor({ osmHighway: 'footway' })).dashArray).toBeTruthy()
    expect(leafletPath(osmStrokeFor({ osmHighway: 'primary' }))).not.toHaveProperty('dashArray')
  })

  it('لا مفاتيح زائدة', () => {
    expect(Object.keys(leafletPath(osmStrokeFor({ osmHighway: 'service' })))).toEqual([
      'color',
      'weight',
      'opacity',
    ])
  })
})
