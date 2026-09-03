import { buildPptx, createPptxSmokeSlides } from './index.ts'

Deno.test('ينشئ ملف PowerPoint OOXML صالح البنية الأساسية', async () => {
  const bytes = await buildPptx(createPptxSmokeSlides(), 'اختبار تقرير الشكاوى')
  if (bytes.length < 2_000) throw new Error(`PPTX_TOO_SMALL: ${bytes.length}`)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('PPTX_ZIP_SIGNATURE_MISSING')
  const output = await Deno.makeTempFile({ suffix: '.pptx' })
  try {
    await Deno.writeFile(output, bytes)
  } finally {
    await Deno.remove(output)
  }
})
