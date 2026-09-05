import JSZip from 'npm:jszip@3.10.1'
import { buildPptx, createPptxSmokeSlides } from './index.ts'

const SLIDE_WITH_IMAGE = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture 1"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="2571428"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
const PNG_1PX = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

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

Deno.test('حزمة PPTX تفي بالمتطلبات الإلزامية لمخطط OOXML (تُفتح في PowerPoint)', async () => {
  const slideWithImage = {
    xml: SLIDE_WITH_IMAGE,
    rels: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    images: [{ name: 'image1.png', bytes: PNG_1PX }],
  }
  const bytes = await buildPptx([...createPptxSmokeSlides(), slideWithImage], 'اختبار بنية الحزمة')
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
  const text = async (name: string) => {
    const file = zip.files[name]
    if (!file) throw new Error(`PPTX_MISSING_PART: ${name}`)
    return await file.async('string')
  }
  for (const part of [
    '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels', 'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels', 'ppt/slideLayouts/slideLayout1.xml',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels', 'ppt/theme/theme1.xml',
  ]) await text(part)

  const master = await text('ppt/slideMasters/slideMaster1.xml')
  if (!master.includes('<p:clrMap ')) throw new Error('PPTX_MASTER_CLRMAP_MISSING')
  const layoutId = Number(/<p:sldLayoutId id="(\d+)"/.exec(master)?.[1] ?? 0)
  if (layoutId < 2147483648) throw new Error(`PPTX_LAYOUT_ID_INVALID: ${layoutId}`)

  const theme = await text('ppt/theme/theme1.xml')
  const section = (tag: string) => new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`).exec(theme)?.[1] ?? ''
  const countMatches = (value: string, re: RegExp) => (value.match(re) ?? []).length
  if (countMatches(section('fillStyleLst'), /<(a:solidFill|a:gradFill|a:blipFill|a:pattFill|a:grpFill)[ >]/g) < 3) throw new Error('PPTX_THEME_FILLSTYLES_INVALID')
  if (countMatches(section('lnStyleLst'), /<a:ln[ >]/g) < 3) throw new Error('PPTX_THEME_LINESTYLES_INVALID')
  if (countMatches(section('effectStyleLst'), /<a:effectStyle[ >]/g) < 3) throw new Error('PPTX_THEME_EFFECTSTYLES_INVALID')
  if (countMatches(section('bgFillStyleLst'), /<(a:solidFill|a:gradFill)[ >]/g) < 1) throw new Error('PPTX_THEME_BGFILLSTYLES_INVALID')

  const layout = await text('ppt/slideLayouts/slideLayout1.xml')
  if (!layout.includes('<p:clrMapOvr>')) throw new Error('PPTX_LAYOUT_CLRMAPOVR_MISSING')

  const slideNames = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  if (slideNames.length !== 2) throw new Error(`PPTX_SLIDE_COUNT_INVALID: ${slideNames.length}`)
  for (const name of slideNames) {
    const rels = name.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
    if (!zip.files[rels]) throw new Error(`PPTX_SLIDE_RELS_MISSING: ${rels}`)
    if ((await text(name)).includes('r:embed') && !(await text(rels)).includes('/media/')) {
      throw new Error(`PPTX_IMAGE_RELATION_MISSING: ${name}`)
    }
  }

  const pres = await text('ppt/presentation.xml')
  if ((pres.match(/<p:sldId /g) ?? []).length !== slideNames.length) throw new Error('PPTX_SLIDE_LIST_MISMATCH')
  if (!pres.includes('<p:sldSz')) throw new Error('PPTX_SLDSZ_MISSING')

  for (const name of names.filter((n) => n.endsWith('.xml') || n.endsWith('.rels'))) {
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(await text(name))) throw new Error(`PPTX_XML_UNESCAPED_AMPERSAND: ${name}`)
  }
})
