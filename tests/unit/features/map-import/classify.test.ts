/**
 * تصنيف OSM — القيم المتوقعة مُقتبسة من `scripts/import-map-planning.py`
 * ومن قواعد الجولة ٢ الموثقة (مساحات/جسور ليست شوارع).
 */
import { describe, expect, it } from 'vitest'
import { classify, isMahallaNumbered, kindOf, mahallaOf, round1, round7 } from '@features/map-import/lib/classify'

describe('① isMahallaNumbered — النمط الوحيد الموثوق للمحلة', () => {
  it.each([
    ['905-16', true],
    ['101-3', true],
    ['1234-56', true],
    ['شارع 905-16', false], // ليس من البداية
    ['905', false],
    ['905-', false],
    ['-16', false],
    ['abc-16', false],
    ['1-2', false], // رقم محلة قصير جداً
    ['', false],
  ])('%s ⇒ %s', (input, expected) => {
    expect(isMahallaNumbered(input)).toBe(expected)
  })
  it('null / undefined لا تنفجر', () => {
    expect(isMahallaNumbered(null)).toBe(false)
    expect(isMahallaNumbered(undefined)).toBe(false)
  })
})

describe('② mahallaOf — أنواع الأسماء الثلاثة الموجودة فعلاً في OSM', () => {
  it.each([
    ['905-16', '905'],
    ['زقاق 905-16', '905'],
    ['حارة 905-16', '905'],
    ['101-3', '101'],
  ])('%s ⇒ %s', (input, expected) => {
    expect(mahallaOf(input)).toBe(expected)
  })
  it('اسم بلا نمط ⇒ null لا تخمين', () => {
    expect(mahallaOf('شارع السعدون')).toBeNull()
    expect(mahallaOf('')).toBeNull()
    expect(mahallaOf(null)).toBeNull()
  })
  it('اسم فيه رقمان ⇒ يأخذ الأول بالكلمة المطابقة', () => {
    expect(mahallaOf('زقاق 949-12 قرب 977')).toBe('949')
  })
})

describe('③ classify — الوسوم', () => {
  it.each([
    ['motorway', 'STR'],
    ['trunk', 'STR'],
    ['primary', 'STR'],
    ['secondary', 'SEC'],
    ['tertiary', 'TRC'],
    ['residential', 'LOC'],
    ['unclassified', 'LOC'],
    ['service', 'LOC'],
    ['living_street', 'LOC'],
    ['pedestrian', 'LOC'],
    ['footway', 'ALY'],
    ['path', 'ALY'],
    ['steps', 'ALY'],
  ] as const)('%s ⇒ %s', (hw, expected) => {
    expect(classify({ highway: hw, name: null })).toBe(expected)
  })

  it('روابط الطرق تُسقط (ليست مسارات مستقلة)', () => {
    expect(classify({ highway: 'primary_link', name: null })).toBeNull()
    expect(classify({ highway: 'secondary_link', name: null })).toBeNull()
    expect(classify({ highway: 'tertiary_link', name: null })).toBeNull()
  })

  it('بلا وسم highway ⇒ null', () => {
    expect(classify({ highway: undefined, name: 'شارع' })).toBeNull()
  })

  it('وسوم غير مرورية ⇒ null (سكة، ممر مائي)', () => {
    expect(classify({ highway: 'railway', name: null })).toBeNull()
    expect(classify({ highway: 'cycleway', name: null })).toBeNull()
  })
})

describe('④ classify — القاعدة التي منعت تضخيم الكثافة', () => {
  it.each([
    'ساحة الفتح',
    'الساحة الكبيرة',
    'مجسر الطالبية',
    'المجسر',
    'جسر الأحرار',
    'الجسر ذو الطابقين',
    'نفق الشرطة',
    'النفق',
  ])('«%s» ليست شارعاً حتى لو وُسمت primary', (name) => {
    expect(classify({ highway: 'primary', name })).toBeNull()
  })

  it('شارع اسمه يحتوي «جسر» في وسطه يبقى شارعاً', () => {
    expect(classify({ highway: 'primary', name: 'شارع جسر ديالى' })).toBe('STR')
  })

  it('الوسم secondary مع ساحة ⇒ null أيضاً (لا يقتصر على primary)', () => {
    expect(classify({ highway: 'secondary', name: 'ساحة الأندلس' })).toBeNull()
  })

  it('زقاق اسمه «ساحة …» يبقى زقاقاً — القاعدة للشوارع المرورية لا الأزقة', () => {
    // footway لا يمرّ بفحص البادئة، فـ«ساحة» هنا مجرد اسم زقاق
    expect(classify({ highway: 'footway', name: 'ساحة 905-3' })).toBe('ALY')
  })
})

describe('⑤ classify — أزقة سكنية تُوسم residential', () => {
  it('اسم بصيغة محلة ⇒ زقاق رغم وسم residential', () => {
    expect(classify({ highway: 'residential', name: '905-16' })).toBe('ALY')
  })
  it('اسم عادي ⇒ شارع محلي', () => {
    expect(classify({ highway: 'residential', name: 'شارع 60' })).toBe('LOC')
  })
  it('بلا اسم ⇒ شارع محلي', () => {
    expect(classify({ highway: 'residential', name: null })).toBe('LOC')
  })
})

describe('⑥ kindOf — وسم يُخزَّن في map_streets.kind', () => {
  it.each([
    ['STR', 'primary'],
    ['SEC', 'secondary'],
    ['TRC', 'tertiary'],
    ['LOC', 'local'],
    ['ALY', 'alley'],
  ] as const)('%s ⇒ %s', (cls, kind) => {
    expect(kindOf(cls)).toBe(kind)
  })
})

describe('⑦ التقريب', () => {
  it('round1 لعرض/طول numeric(10,1)', () => {
    expect(round1(123.456)).toBe(123.5)
    expect(round1(0.04)).toBe(0)
    expect(round1(9.95)).toBe(10)
  })
  it('round7 لإحداثيات ~١سم', () => {
    expect(round7(33.29836812345)).toBe(33.2983681)
    expect(round7(44.41523829999)).toBe(44.4152383)
  })
})
