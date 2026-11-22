/**
 * عقد الجولة ⑤ — الإصلاح ٣: الفروق العرضية الثلاثة بين الليلي والنهاري.
 *
 * ## العيوب الثلاثة (كلها مؤكَّدة بالكود والقياس)
 *
 * ① **سقف التكبير:** `MapTiles` كان يضبط `maxNativeZoom = maxZoom`، فـEsri
 *    (16) تُوقف التكبير عند ١٦ بينما النهاري يذهب إلى ١٩. وأسوأ: `MapContainer`
 *    لا يضبط `maxZoom` أصلاً، وLeaflet الافتراضي **١٨** — فلا الوضع النهاري
 *    يبلغ ١٩ الذي يعلنه `LIGHT_TILES`.
 *
 * ② **لون حدّ الزون:** `#0b3d6b` ثابت. تباينه مع أرضية osm-carto الفاتحة
 *    (`#f2efe9`) **9.66:1** ومع خلفية الوضع الليلي (`#060b18`) **1.77:1**
 *    فقط — أي أن المرجع البصري الذي يقيس عليه المشغّل يكاد يختفي بالليل.
 *
 * ③ **النص المضلّل:** «ألوان OSM القياسية — نفس ما تراه في overpass-turbo»
 *    صحيحة بالنهاري فقط. بالليلي يُستبدل كل لون (انظر `NIGHT` في
 *    `osm-colors.ts`) فالمقارنة البصرية غير صالحة.
 *
 * هذا الملف يحرس الثلاثة، ويقيس التباين رقمياً حتى لا يُكسَر بصرياً لاحقاً.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DARK_TILES,
  LIGHT_TILES,
  MAP_MAX_ZOOM,
  MAP_ZONE_BORDER,
  zoneBorderColor,
} from '@features/map-theme/map-theme'

const ROOT = process.cwd()
const TILES_SRC = readFileSync(join(ROOT, 'src/features/map-theme/MapTiles.tsx'), 'utf8')
const THEME_SRC = readFileSync(join(ROOT, 'src/features/map-theme/map-theme.ts'), 'utf8')
const IMPORT_PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)
const EDITOR_PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapPlanningEditorPage.tsx'),
  'utf8',
)

/** تباين WCAG 2.1 بين لونين سداسيين */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16) / 255)
    const f = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * f[0]! + 0.7152 * f[1]! + 0.0722 * f[2]!
  }
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** أرضية osm-carto و`MAP_THEME_CSS` — من الكود لا من التخمين */
const DAY_GROUND = '#f2efe9'
const NIGHT_GROUND = '#060b18'

describe('① سقف التكبير موحّد', () => {
  it('كل مزوّد يعلن maxNativeZoom صريحاً', () => {
    for (const p of [...DARK_TILES, LIGHT_TILES]) {
      expect(typeof p.maxNativeZoom, p.id).toBe('number')
      expect(p.maxNativeZoom).toBeGreaterThan(0)
    }
  })

  it('سقف maxZoom واحد في الوضعين — الفرق كان 16 مقابل 19', () => {
    expect(LIGHT_TILES.maxZoom).toBe(MAP_MAX_ZOOM)
    for (const p of DARK_TILES) expect(p.maxZoom, p.id).toBe(MAP_MAX_ZOOM)
  })

  it('Esri تعلن ١٦ أصلياً — الصدق في الحدّ لا إخفاؤه', () => {
    const esri = DARK_TILES.find((p) => p.id === 'esri-dark')!
    expect(esri.maxNativeZoom).toBe(16)
    // لكن سقف الخريطة يبقى ١٩ فيُكبّر Leaflet بدل أن يمنع
    expect(esri.maxZoom).toBe(19)
  })

  it('OSM يحمل بلاطات أصلية حتى ١٩ في الوضعين', () => {
    expect(LIGHT_TILES.maxNativeZoom).toBe(19)
    expect(DARK_TILES.find((p) => p.id === 'osm-filtered')!.maxNativeZoom).toBe(19)
  })

  it('الطبقة تمرّر maxNativeZoom من المزوّد لا من maxZoom', () => {
    // العيب كان: maxNativeZoom={tiles.maxZoom}
    expect(TILES_SRC).toContain('maxNativeZoom={tiles.maxNativeZoom}')
    expect(TILES_SRC).not.toContain('maxNativeZoom={tiles.maxZoom}')
  })

  it('الخريطتان تضبطان maxZoom صراحةً (Leaflet الافتراضي ١٨)', () => {
    expect(IMPORT_PAGE).toContain('maxZoom={MAP_MAX_ZOOM}')
    expect(EDITOR_PAGE).toContain('maxZoom={MAP_MAX_ZOOM}')
  })
})

describe('② حدّ الزون مرئي في الوضعين', () => {
  it('الوضع النهاري يستعيد هوية المنصة', () => {
    expect(zoneBorderColor('light')).toBe('#0b3d6b')
  })

  it('الوضع الليلي لا يستعمل الكحلي الداكن', () => {
    expect(zoneBorderColor('dark')).not.toBe('#0b3d6b')
    expect(MAP_ZONE_BORDER.dark).toBe('#7dd3fc')
  })

  it('تباين الوضع النهاري ≥ 3:1 (WCAG AA للعناصر غير النصية)', () => {
    expect(contrast(zoneBorderColor('light'), DAY_GROUND)).toBeGreaterThanOrEqual(3)
  })

  it('تباين الوضع الليلي ≥ 3:1 — كان 1.77:1', () => {
    const old = contrast('#0b3d6b', NIGHT_GROUND)
    const now = contrast(zoneBorderColor('dark'), NIGHT_GROUND)
    expect(old).toBeLessThan(2) // العيب موثَّق بالرقم
    expect(now).toBeGreaterThanOrEqual(3)
    expect(now).toBeGreaterThan(old * 4)
  })

  it('اللون الليلي لا يُستعمل بالنهاري (تباينه هناك منهار)', () => {
    // تحذير للمنع: لو أُخطئ الوضع لاختفى الحدّ
    expect(contrast(MAP_ZONE_BORDER.dark, DAY_GROUND)).toBeLessThan(3)
  })

  it('الشاشتان تستعملان الدالة لا رقماً ثابتاً', () => {
    expect(IMPORT_PAGE).toContain('zoneBorderColor(theme)')
    expect(EDITOR_PAGE).toContain('zoneBorderColor(theme)')
    expect(IMPORT_PAGE).not.toContain("color: '#0b3d6b'")
    expect(EDITOR_PAGE).not.toContain("color: '#0b3d6b'")
  })
})

describe('③ النص يصدق في الوضعين', () => {
  it('عبارة «نفس ما تراه في overpass-turbo» مشروطة بالنهاري', () => {
    const idx = IMPORT_PAGE.indexOf('نفس ما تراه في overpass-turbo.eu')
    expect(idx).toBeGreaterThan(-1)
    // الشرط `theme === 'light'` قبلها بمسافة معقولة
    const before = IMPORT_PAGE.slice(Math.max(0, idx - 400), idx)
    expect(before).toContain("theme === 'light'")
  })

  it('الوضع الليلي يشرح أنه لا يطابق overpass-turbo', () => {
    expect(IMPORT_PAGE).toContain('لا تطابق overpass-turbo')
    expect(IMPORT_PAGE).toContain('قارِن بالوضع النهاري')
  })

  it('وصف لون الحدّ يتغيّر مع الوضع لا يثبت على «أزرق»', () => {
    expect(IMPORT_PAGE).toContain("theme === 'dark' ? 'السماوي' : 'الأزرق'")
    // العبارة القديمة الثابتة يجب ألا تبقى
    expect(IMPORT_PAGE).not.toContain('الحدّ الأزرق المتقطّع ·')
  })

  it('الشرح يوثّق أن osm-colors يقلب الإضاءة ليلاً', () => {
    const idx = IMPORT_PAGE.indexOf('النص كان مضلّلاً في الوضع الليلي')
    expect(idx).toBeGreaterThan(-1)
    expect(IMPORT_PAGE.slice(idx, idx + 900)).toContain('يقلب الإضاءة')
  })
})

describe('③ لا تكرار للأرقام السحرية', () => {
  it('سقف التكبير مصدره ثابت واحد', () => {
    expect(THEME_SRC).toContain('export const MAP_MAX_ZOOM = 19')
    // الأرقام في المزوّدات مُشتقّة من المفهوم لا مكرّرة في الصفحات
    expect(IMPORT_PAGE.match(/maxZoom=\{19\}/g)).toBeNull()
    expect(EDITOR_PAGE.match(/maxZoom=\{19\}/g)).toBeNull()
  })
})
