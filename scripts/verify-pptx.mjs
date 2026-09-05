/** أداة تشخيص PPTX: تبني الحزمة محلياً وتفحص الملفات المخزنة في Supabase مقابل متطلبات OOXML.
 *  لا تطبع أي أسرار — تقرأ المفاتيح من .env.local وتستخدمها في الطلبات فقط. */
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvKeys() {
  const out = {}
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && m[1] && !(m[1] in out)) out[m[1]] = m[2].trim()
      }
    } catch { /* الملف غير موجود — تجاهل */ }
  }
  return out
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const SLIDE_WITH_IMAGE = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture 1"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="2571428"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`

async function loadBuilder() {
  const src = readFileSync(join(ROOT, 'supabase/functions/complaint-generate-report/index.ts'), 'utf8')
  const transformed = src
    .split(/\r?\n/)
    .filter((line) => !/^import \{ (createClient|corsHeaders)/.test(line))
    .map((line) => line.replace("import JSZip from 'npm:jszip@3.10.1'", "import JSZip from 'jszip'"))
    .join('\n')
  const tmp = join(ROOT, '.pptx-verify-tmp')
  mkdirSync(tmp, { recursive: true })
  writeFileSync(join(tmp, 'index.ts'), transformed)
  const esbuildUrl = import.meta.resolve?.('esbuild') ?? undefined
  const esbuildBin = esbuildUrl ? fileURLToPath(esbuildUrl) : join(ROOT, 'node_modules/esbuild/lib/main.js')
  const { build } = require(esbuildBin)
  await build({
    entryPoints: [join(tmp, 'index.ts')],
    bundle: true,
    format: 'esm',
    outfile: join(tmp, 'gen.mjs'),
    external: ['jszip'],
    logLevel: 'silent',
  })
  const gen = await import(`file://${join(tmp, 'gen.mjs').replace(/\\/g, '/')}`)
  return {
    buildPptx: gen.buildPptx,
    createPptxSmokeSlides: gen.createPptxSmokeSlides,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  }
}

function slideWithImage() {
  return {
    xml: SLIDE_WITH_IMAGE,
    rels: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
    images: [{ name: 'image1.png', bytes: new Uint8Array(PNG_1PX) }],
  }
}

const UNESCAPED_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;|#)/

export async function validatePackage(buffer) {
  const results = []
  const check = (name, ok, detail = '') => results.push({ name, ok, detail })
  const magic = [...buffer.slice(0, 2)].map((b) => b).join(',')
  check('بصمة ZIP (PK)', magic === '80,75', `first bytes: ${[...buffer.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`)

  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
    check('سلامة أرشيف ZIP (فك كل الأجزاء)', true, `${Object.keys(zip.files).length} جزءاً`)
  } catch (error) {
    check('سلامة أرشيف ZIP (فك كل الأجزاء)', false, String(error?.message ?? error))
    return { results, allOk: false, zip: null }
  }

  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
  const required = [
    '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml',
    'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels',
    'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    'ppt/theme/theme1.xml',
  ]
  for (const part of required) check(`جزء مطلوب: ${part}`, Boolean(zip.files[part]))

  const texts = {}
  for (const name of names.filter((n) => n.endsWith('.xml') || n.endsWith('.rels'))) {
    texts[name] = await zip.files[name].async('string')
  }
  const badAmpersand = Object.entries(texts).filter(([, t]) => UNESCAPED_AMPERSAND.test(t))
  check('XML: لا رموز & غير مهرّبة', badAmpersand.length === 0, badAmpersand.length ? badAmpersand.join(', ') : 'نظيف')

  const slideNames = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const slideCount = slideNames.length
  check('يوجد شرائح', slideCount > 0, `${slideCount} شريحة`)

  const pres = texts['ppt/presentation.xml'] ?? ''
  const sldIds = (pres.match(/<p:sldId /g) ?? []).length
  check('presentation.xml: قائمة الشرائح مطابقة', slideCount > 0 && sldIds === slideCount, `sldId=${sldIds} مقابل ${slideCount} شريحة`)
  check('presentation.xml: مقاس الشريحة sldSz موجود', pres.includes('<p:sldSz'))

  const presRels = texts['ppt/_rels/presentation.xml.rels'] ?? ''
  const slideRels = (presRels.match(/relationships\/slide"/g) ?? []).length
  check('علاقات العرض تشير لكل الشرائح', slideRels === slideCount, `${slideRels} علاقة`)

  for (const name of slideNames) {
    const relsName = name.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
    check(`علاقات الشريحة موجودة: ${relsName}`, Boolean(zip.files[relsName]))
    if (texts[name]?.includes('r:embed')) {
      check(`صورة الشريحة مرتبطة: ${name}`, Boolean(zip.files[relsName]) && (texts[relsName] ?? '').includes('/media/'))
    }
  }

  const master = texts['ppt/slideMasters/slideMaster1.xml'] ?? ''
  check('الشريحة الأم: خريطة الألوان clrMap موجودة (إلزامي)', master.includes('<p:clrMap '))
  const layoutId = /<p:sldLayoutId id="(\d+)"/.exec(master)?.[1]
  check('الشريحة الأم: معرّف التخطيط ≥ 2147483648 (إلزامي)', layoutId ? Number(layoutId) >= 2147483648 : false, `id=${layoutId ?? 'مفقود'}`)
  check('الشريحة الأم: العلاقات تشير للتخطيط والثيم', (texts['ppt/slideMasters/_rels/slideMaster1.xml.rels'] ?? '').includes('theme1.xml'))

  const layout = texts['ppt/slideLayouts/slideLayout1.xml'] ?? ''
  check('التخطيط: clrMapOvr موجود', layout.includes('<p:clrMapOvr>'))

  const theme = texts['ppt/theme/theme1.xml'] ?? ''
  const section = (tag) => (new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`).exec(theme)?.[1] ?? '')
  const fills = section('fillStyleLst')
  const lines = section('lnStyleLst')
  const effects = section('effectStyleLst')
  const bgFills = section('bgFillStyleLst')
  check('الثيم: fillStyleLst يحوي 3 تعبئات (إلزامي)', (fills.match(/<(a:solidFill|a:gradFill|a:blipFill|a:pattFill|a:grpFill)[ >]/g) ?? []).length >= 3)
  check('الثيم: lnStyleLst يحوي 3 خطوط (إلزامي)', (lines.match(/<a:ln[ >]/g) ?? []).length >= 3)
  check('الثيم: effectStyleLst يحوي 3 تأثيرات (إلزامي)', (effects.match(/<a:effectStyle[ >]/g) ?? []).length >= 3)
  check('الثيم: bgFillStyleLst يحوي تعبئة خلفية (إلزامي)', (bgFills.match(/<(a:solidFill|a:gradFill)[ >]/g) ?? []).length >= 1)

  return { results, allOk: results.every((r) => r.ok), zip, slideCount }
}

function printVerdict(label, { results, allOk }) {
  console.log(`\n=== ${label} ===`)
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'} — ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  console.log(allOk ? `النتيجة: ✅ سليم` : `النتيجة: ❌ غير صالح`)
  return allOk
}

async function verifyLocal() {
  const builder = await loadBuilder()
  try {
    const slides = [...builder.createPptxSmokeSlides(), slideWithImage()]
    const bytes = await builder.buildPptx(slides, 'تحقق بنية PPTX')
    const verdict = await validatePackage(Buffer.from(bytes))
    printVerdict('البناء المحلي — الكود الحالي', verdict)
    return verdict.allOk
  } finally {
    builder.cleanup()
  }
}

async function verifyRemote() {
  const env = readEnvKeys()
  const base = env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) {
    console.log('تخطي الفحص البعيد: مفاتيح البيئة غير متوفرة (.env.local: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    return null
  }
  const headers = { authorization: `Bearer ${key}` }
  const listRes = await fetch(`${base}/storage/v1/object/list/complaint-media`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: 'reports/', limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
  })
  if (!listRes.ok) { console.log(`تعذر جرد الملفات: HTTP ${listRes.status}`); return false }
  const entries = (await listRes.json()).filter((e) => e?.id && String(e.name).endsWith('.pptx'))
  if (!entries.length) { console.log('لا توجد ملفات PPTX مخزنة تحت reports/'); return null }
  let allOk = true
  for (const entry of entries.slice(0, 3)) {
    const res = await fetch(`${base}/storage/v1/object/complaint-media/${encodeURI(entry.name)}`, { headers })
    if (!res.ok) { console.log(`تعذر تنزيل ${entry.name}: HTTP ${res.status}`); allOk = false; continue }
    const buffer = Buffer.from(await res.arrayBuffer())
    const verdict = await validatePackage(buffer)
    if (!printVerdict(entry.name, verdict)) allOk = false
  }
  return allOk
}

const mode = process.argv[2] ?? 'both'
let ok = true
if (mode === 'local' || mode === 'both') ok = (await verifyLocal()) && ok
if (mode === 'remote' || mode === 'both') {
  const remote = await verifyRemote()
  if (remote !== null) ok = remote && ok
}
process.exit(ok ? 0 : 1)