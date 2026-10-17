/** 00282 — محرك توزيع صفحة الصور: كل قالب × كل عدد (١–٤) يغطي الصفحة كاملة بلا تداخل ولا فراغ، وعدد الخلايا = عدد الصور */
import { describe, expect, it } from 'vitest'
import { PHOTOS_PER_PAGE, photoPageCoverage, photoPageSpec, type PhotoLayout } from '@features/media/lib/photo-layouts'
import { PHOTO_LAYOUTS } from '@portals/media/pages/Designs/reportTemplates'

const ALL: PhotoLayout[] = ['classic', 'round', 'polaroid', 'stack', 'film', 'mosaic', 'inverse', 'collage', 'magazine']

describe('photoPageSpec', () => {
  it('قائمة القوالب في اللوحة = القوالب المدعومة في المحرك (٩) والحد الأقصى ٤ للصفحة', () => {
    expect(PHOTO_LAYOUTS.map((l) => l.value).sort()).toEqual([...ALL].sort())
    expect(PHOTOS_PER_PAGE).toBe(4)
  })
  for (const l of ALL) for (const n of [1, 2, 3, 4]) {
    it(`${l} × ${n}: تغطية كاملة، لا تداخل، خلية لكل صورة`, () => {
      const spec = photoPageSpec(l, n)
      expect(spec.cells).toHaveLength(n)
      const cov = photoPageCoverage(spec)
      expect(cov.complete, `فراغ في ${l}×${n}: ${JSON.stringify(cov.occupied)}`).toBe(true)
      expect(cov.overlap, `تداخل في ${l}×${n}`).toBe(false)
    })
  }
  it('٣ صور في الكلاسيكي: اثنتان فوق والثالثة تغطي الأسفل كاملاً (طلب المستخدم)', () => {
    const s = photoPageSpec('classic', 3)
    expect(s.cells[2]).toEqual({ col: '1 / -1', row: '2' })
    expect(photoPageCoverage(s).occupied).toEqual([[1, 2], [3, 3]])
  })
  it('أشكال مميزة: الفسيفساء كبيرة فوق، المعكوسة كبيرة تحت، الكولاج كبيرة جانبياً عبر كل الصفوف، المجلة عريضة في الأسفل', () => {
    expect(photoPageCoverage(photoPageSpec('mosaic', 4)).occupied).toEqual([[1, 1, 1], [2, 3, 4]])
    expect(photoPageCoverage(photoPageSpec('inverse', 4)).occupied).toEqual([[1, 2, 3], [4, 4, 4]])
    expect(photoPageCoverage(photoPageSpec('collage', 4)).occupied).toEqual([[1, 2], [1, 3], [1, 4]])
    expect(photoPageCoverage(photoPageSpec('magazine', 4)).occupied).toEqual([[1, 2], [1, 3], [4, 4]])
    expect(photoPageCoverage(photoPageSpec('film', 4)).occupied).toEqual([[1, 2, 3, 4]])
    expect(photoPageCoverage(photoPageSpec('stack', 3)).occupied).toEqual([[1], [2], [3]])
  })
  it('عدد خارج المدى يُقصّ إلى ١..٤؛ قالب مجهول يعود للكلاسيكي', () => {
    expect(photoPageSpec('classic', 0)).toBe(photoPageSpec('classic', 1))
    expect(photoPageSpec('classic', 9)).toBe(photoPageSpec('classic', 4))
    expect(photoPageSpec('nope' as PhotoLayout, 2)).toBe(photoPageSpec('classic', 2))
  })
})
